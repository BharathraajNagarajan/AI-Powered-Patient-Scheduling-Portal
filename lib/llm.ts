import OpenAI from "openai";
import { z } from "zod";
import { officeInfo } from "./office-info";
import type { ChatMessage, ModelOutput, SlotView } from "./types";

export const CHAT_MODEL = "gpt-4o";
export const HISTORY_LIMIT = 20;
const REQUEST_TIMEOUT_MS = 20_000;

const INTENTS = ["select_slot", "confirm_booking", "change_slot", "ask_info", "refill", "other"] as const;

export const OUTPUT_JSON_SCHEMA = {
  name: "scheduling_reply",
  strict: true,
  schema: {
    type: "object",
    properties: {
      reply: { type: "string" },
      intent: { type: "string", enum: [...INTENTS] },
      slot_index: { type: ["integer", "null"] },
    },
    required: ["reply", "intent", "slot_index"],
    additionalProperties: false,
  },
} as const;

const outputSchema = z.object({
  reply: z.string().min(1),
  intent: z.enum(INTENTS),
  slot_index: z.number().int().nullable(),
});

export function parseModelOutput(raw: string): ModelOutput {
  return outputSchema.parse(JSON.parse(raw));
}

export function isMockLlm(): boolean {
  return process.env.MOCK_LLM === "true";
}

export interface LlmInput {
  systemPrompt: string;
  history: ChatMessage[];
  userMessage: string;
  offered: SlotView[];
  providerName: string | null;
  specialty: string | null;
  hasHeldSlot: boolean;
  isInitial: boolean;
}

function mockIntroduction(input: LlmInput): ModelOutput {
  if (input.providerName && input.offered.length > 0) {
    const first = input.offered
      .slice(0, 4)
      .map((s, i) => `${i + 1}. ${s.label}`)
      .join("\n");
    return {
      reply: `I can see you with ${input.providerName}${input.specialty ? ` (${input.specialty})` : ""} at ${officeInfo.name}. The next available times are:\n${first}\nWhich one works for you?`,
      intent: "ask_info",
      slot_index: null,
    };
  }
  return {
    reply: `Thanks for sharing that. Could you tell me a little more about what brings you in to ${officeInfo.name}?`,
    intent: "other",
    slot_index: null,
  };
}

export function mockModelOutput(input: LlmInput): ModelOutput {
  if (input.isInitial) return mockIntroduction(input);
  const text = input.userMessage.toLowerCase();

  if (/\b(refill|prescription)\b/.test(text)) {
    return {
      reply: "I can help with that. What is the medication name and dosage, and which pharmacy would you like to use?",
      intent: "refill",
      slot_index: null,
    };
  }
  if (/\b(confirm|yes|book it|go ahead)\b/.test(text)) {
    return { reply: "Great, I will book that for you now.", intent: "confirm_booking", slot_index: null };
  }
  const number = /\b(\d{1,2})\b/.exec(text);
  const wantsChange = /\b(change|different|another|other times)\b/.test(text);
  if (number) {
    return {
      reply: "Sounds good, let me hold that time for you.",
      intent: wantsChange ? "change_slot" : "select_slot",
      slot_index: Number(number[1]),
    };
  }
  if (wantsChange) {
    return { reply: "Of course. Which of the available times would you prefer?", intent: "change_slot", slot_index: null };
  }
  return mockIntroduction(input);
}

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 });
  }
  return client;
}

function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  return typeof status === "number" && (status === 429 || status >= 500);
}

export async function withRetry<T>(fn: () => Promise<T>, backoffMs: number = 500): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isRetryable(err)) throw err;
    await new Promise((resolve) => setTimeout(resolve, backoffMs + Math.random() * 250));
    return fn();
  }
}

export async function generateModelOutput(input: LlmInput): Promise<ModelOutput> {
  if (isMockLlm()) return mockModelOutput(input);

  const history = input.history.slice(-HISTORY_LIMIT).map((m) => ({ role: m.role, content: m.content }));
  const completion = await withRetry(() =>
    getClient().chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: input.systemPrompt },
        ...history,
        { role: "user", content: input.userMessage },
      ],
      max_tokens: 600,
      temperature: 0.3,
      response_format: { type: "json_schema", json_schema: OUTPUT_JSON_SCHEMA },
    })
  );

  const message = completion.choices[0]?.message;
  if (!message?.content) throw new Error(message?.refusal ?? "Empty model response");
  return parseModelOutput(message.content);
}
