import { createHash } from "node:crypto";
import OpenAI from "openai";
import { getDb } from "./db";
import { doctors, getDoctor, isUnsupported, matchDoctor, providerProfile, type Doctor } from "./doctors";
import { log } from "./log";

export const HIGH_THRESHOLD = 0.20;
export const LOW_THRESHOLD = 0.12;
export const MIN_MARGIN = 0.11;
export const EMBEDDING_MODEL = "text-embedding-3-small";

export type MatchPath = "semantic" | "keyword" | "unsupported" | "none";
export type MatchStatus = "matched" | "uncertain" | "none";

export interface ScoredProvider {
  providerId: string;
  score: number;
}

export interface MatchBand {
  high: number;
  low: number;
  margin: number;
}

export const DEFAULT_BAND: MatchBand = { high: HIGH_THRESHOLD, low: LOW_THRESHOLD, margin: MIN_MARGIN };

export interface MatchResult {
  status: MatchStatus;
  doctor: Doctor | null;
  candidates: Doctor[];
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

export function classifyScores(top: ScoredProvider[], band: MatchBand = DEFAULT_BAND): MatchStatus {
  const first = top[0];
  if (!first || first.score < band.low) return "none";
  const second = top[1];
  const margin = second ? first.score - second.score : first.score;
  return first.score >= band.high && margin >= band.margin ? "matched" : "uncertain";
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
    const keep = entries.map((e) => e.hash);
    db.prepare(
      `DELETE FROM provider_embeddings WHERE model = ? AND text_hash NOT IN (${keep.map(() => "?").join(",")})`
    ).run(EMBEDDING_MODEL, ...keep);
  }
  return entries.map((e) => ({ providerId: e.providerId, vector: e.vector as number[] }));
}

export async function scoreAllProviders(complaint: string): Promise<ScoredProvider[]> {
  const providers = await providerVectors();
  const [vector] = await embed([complaint]);
  return rankProviders(vector, providers, providers.length);
}

function toDoctors(top: ScoredProvider[]): Doctor[] {
  return top.map((t) => getDoctor(t.providerId)).filter((d): d is Doctor => d !== null);
}

export async function matchProvider(complaint: string): Promise<MatchResult> {
  if (isUnsupported(complaint)) {
    return { status: "none", doctor: null, candidates: [], score: null, top: [], path: "unsupported" };
  }

  if (semanticEnabled()) {
    try {
      const top = (await scoreAllProviders(complaint)).slice(0, 2);
      const status = classifyScores(top);
      return {
        status,
        doctor: status === "matched" ? getDoctor(top[0].providerId) : null,
        candidates: status === "uncertain" ? toDoctors(top) : [],
        score: status === "matched" ? top[0].score : null,
        top,
        path: "semantic",
      };
    } catch (err) {
      log("warn", "embedding_failed_keyword_fallback", { error: err });
    }
  }

  const doctor = matchDoctor(complaint);
  return {
    status: doctor ? "matched" : "none",
    doctor,
    candidates: [],
    score: null,
    top: [],
    path: doctor ? "keyword" : "none",
  };
}
