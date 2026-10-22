import { createHash } from "node:crypto";
import OpenAI from "openai";
import { getDb } from "./db";
import { doctors, getDoctor, isUnsupported, matchDoctor, providerProfile, type Doctor } from "./doctors";
import { log } from "./log";

export const MATCH_THRESHOLD = 0.35;
export const EMBEDDING_MODEL = "text-embedding-3-small";

export type MatchPath = "semantic" | "keyword" | "unsupported" | "none";

export interface ScoredProvider {
  providerId: string;
  score: number;
}

export interface MatchResult {
  doctor: Doctor | null;
  score: number | null;
  top: ScoredProvider[];
  path: MatchPath;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function rankProviders(
  complaint: number[],
  providers: { providerId: string; vector: number[] }[],
  take = 2
): ScoredProvider[] {
  return providers
    .map((p) => ({ providerId: p.providerId, score: cosine(complaint, p.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, take);
}

export function pickMatch(top: ScoredProvider[], threshold: number = MATCH_THRESHOLD): ScoredProvider | null {
  const best = top[0];
  return best && best.score >= threshold ? best : null;
}

function semanticEnabled(): boolean {
  return process.env.MOCK_LLM !== "true" && Boolean(process.env.OPENAI_API_KEY);
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function embed(inputs: string[]): Promise<number[][]> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 10_000, maxRetries: 0 });
  const response = await client.embeddings.create({ model: EMBEDDING_MODEL, input: inputs });
  return response.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

async function providerVectors(): Promise<{ providerId: string; vector: number[] }[]> {
  const db = getDb();
  const lookup = db.prepare("SELECT vector FROM provider_embeddings WHERE model = ? AND text_hash = ?");
  const store = db.prepare("INSERT OR REPLACE INTO provider_embeddings (model, text_hash, vector) VALUES (?, ?, ?)");

  const entries = doctors.map((d) => {
    const text = providerProfile(d);
    const hash = hashText(text);
    const cached = lookup.get(EMBEDDING_MODEL, hash) as { vector: string } | undefined;
    return { providerId: d.id, text, hash, vector: cached ? (JSON.parse(cached.vector) as number[]) : null };
  });

  const missing = entries.filter((e) => e.vector === null);
  if (missing.length > 0) {
    const vectors = await embed(missing.map((m) => m.text));
    missing.forEach((m, i) => {
      m.vector = vectors[i];
      store.run(EMBEDDING_MODEL, m.hash, JSON.stringify(vectors[i]));
    });
  }
  return entries.map((e) => ({ providerId: e.providerId, vector: e.vector as number[] }));
}

export async function scoreAllProviders(complaint: string): Promise<ScoredProvider[]> {
  const providers = await providerVectors();
  const [vector] = await embed([complaint]);
  return rankProviders(vector, providers, providers.length);
}

export async function matchProvider(complaint: string): Promise<MatchResult> {
  if (isUnsupported(complaint)) {
    return { doctor: null, score: null, top: [], path: "unsupported" };
  }

  if (semanticEnabled()) {
    try {
      const top = (await scoreAllProviders(complaint)).slice(0, 2);
      const best = pickMatch(top);
      return {
        doctor: best ? getDoctor(best.providerId) : null,
        score: best ? best.score : null,
        top,
        path: "semantic",
      };
    } catch (err) {
      log("warn", "embedding_failed_keyword_fallback", { error: err });
    }
  }

  const doctor = matchDoctor(complaint);
  return { doctor, score: null, top: [], path: doctor ? "keyword" : "none" };
}
