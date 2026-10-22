import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notify", () => ({
  sendBookingEmail: vi.fn().mockResolvedValue(undefined),
  sendBookingSms: vi.fn().mockResolvedValue(undefined),
}));

import { applyModelOutput, handleChat, handleSelectSlot } from "@/lib/chat";
import { ERROR_MESSAGES } from "@/lib/errors";
import { mockModelOutput, parseModelOutput, withRetry } from "@/lib/llm";
import { listOfferedSlots } from "@/lib/slots";
import { getSession, appendMessages } from "@/lib/sessions";
import { greetingFor } from "@/lib/chat";
import type { ModelOutput } from "@/lib/types";
import { dropTempDb, newSession, useTempDb } from "./helpers";

beforeEach(useTempDb);
afterEach(dropTempDb);

const out = (intent: ModelOutput["intent"], slot_index: number | null = null): ModelOutput => ({
  reply: "model reply",
  intent,
  slot_index,
});

describe("structured output to state mapping", () => {
  it("rejects out-of-range and missing slot indexes without changing state", () => {
    const id = newSession();
    const offered = listOfferedSlots("doc-001", id);
    for (const index of [0, -1, offered.length + 1, 999, null]) {
      const result = applyModelOutput(id, out("select_slot", index), offered);
      expect(result.reply).toBe(ERROR_MESSAGES.unknownSlot);
    }
    expect(getSession(id)?.selectedSlotId).toBeNull();
  });

  it("rejects non-integer indexes", () => {
    const id = newSession();
    const offered = listOfferedSlots("doc-001", id);
    expect(applyModelOutput(id, out("select_slot", 1.5), offered).reply).toBe(ERROR_MESSAGES.unknownSlot);
  });

  it("reserves the slot mapped from a valid index", () => {
    const id = newSession();
    const offered = listOfferedSlots("doc-001", id);
    applyModelOutput(id, out("select_slot", 2), offered);
    expect(getSession(id)?.selectedSlotId).toBe(offered[1].id);
  });

  it("rejects confirm_booking without a reservation", () => {
    const id = newSession();
    const result = applyModelOutput(id, out("confirm_booking"), listOfferedSlots("doc-001", id));
    expect(result.reply).toBe(ERROR_MESSAGES.pickTimeFirst);
    expect(getSession(id)?.bookingStatus).toBe("pending");
  });

  it("books on confirm_booking only after a reservation", () => {
    const id = newSession();
    const offered = listOfferedSlots("doc-001", id);
    applyModelOutput(id, out("select_slot", 1), offered);
    const result = applyModelOutput(id, out("confirm_booking"), offered);
    expect(result.reply).toContain("is confirmed");
    expect(getSession(id)?.bookingStatus).toBe("confirmed");
  });

  it("does not let informational intents change state", () => {
    const id = newSession();
    const offered = listOfferedSlots("doc-001", id);
    for (const intent of ["ask_info", "refill", "other"] as const) {
      expect(applyModelOutput(id, out(intent, 1), offered).reply).toBe("model reply");
    }
    expect(getSession(id)?.selectedSlotId).toBeNull();
  });

  it("keeps the model reply for change_slot without an index", () => {
    const id = newSession();
    expect(applyModelOutput(id, out("change_slot"), listOfferedSlots("doc-001", id)).reply).toBe("model reply");
  });
});

describe("model output parsing", () => {
  it("accepts valid JSON and rejects bad intents", () => {
    expect(parseModelOutput('{"reply":"hi","intent":"other","slot_index":null}').intent).toBe("other");
    expect(() => parseModelOutput('{"reply":"hi","intent":"book_now","slot_index":null}')).toThrow();
    expect(() => parseModelOutput('{"reply":"hi","intent":"other","slot_index":1.5}')).toThrow();
    expect(() => parseModelOutput("not json")).toThrow();
  });
});

describe("retry", () => {
  it("retries once on 429 and 5xx", async () => {
    const fn = vi.fn().mockRejectedValueOnce({ status: 429 }).mockResolvedValueOnce("ok");
    await expect(withRetry(fn, 1)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry client errors and gives up after one retry", async () => {
    const bad = vi.fn().mockRejectedValue({ status: 400 });
    await expect(withRetry(bad, 1)).rejects.toEqual({ status: 400 });
    expect(bad).toHaveBeenCalledTimes(1);
    const down = vi.fn().mockRejectedValue({ status: 503 });
    await expect(withRetry(down, 1)).rejects.toEqual({ status: 503 });
    expect(down).toHaveBeenCalledTimes(2);
  });
});

describe("mock llm and chat flow", () => {
  it("does not treat words containing 'ok' as confirmation", () => {
    const base = { systemPrompt: "", history: [], offered: [], providerName: null, specialty: null, hasHeldSlot: false, isInitial: false };
    expect(mockModelOutput({ ...base, userMessage: "can I look at the book of times" }).intent).not.toBe("confirm_booking");
  });

  it("runs initial match, slot pick via chat, and confirm", async () => {
    const id = newSession(null);
    appendMessages(id, [{ role: "assistant", content: greetingFor(getSession(id)!), timestamp: new Date().toISOString() }]);
    const first = await handleChat(id, undefined, true);
    expect(first.ok && first.response.ui.provider?.specialty).toBe("Orthopedics");
    expect(first.ok && (first.response.ui.slots?.length ?? 0)).toBeGreaterThan(0);

    const again = await handleChat(id, undefined, true);
    expect(again.ok).toBe(true);
    expect(getSession(id)?.transcript.length).toBe(2);

    const pick = await handleChat(id, "2", false);
    expect(pick.ok && pick.response.session.reservation).not.toBeNull();

    const confirm = await handleChat(id, "yes confirm", false);
    expect(confirm.ok && confirm.response.ui.booking?.bookingId).toMatch(/^BKG-/);
  });

  it("answers an unsupported complaint without a match", async () => {
    const id = newSession(null);
    getSession(id);
    const { getDb } = await import("@/lib/db");
    getDb().prepare("UPDATE sessions SET chief_complaint = 'eye infection' WHERE id = ?").run(id);
    const result = await handleChat(id, undefined, true);
    expect(result.ok && result.response.reply).toBe(ERROR_MESSAGES.noSpecialist);
    expect(getSession(id)?.matchedProviderId).toBeNull();
  });

  it("selects a clicked slot without the model", () => {
    const id = newSession();
    const offered = listOfferedSlots("doc-001", id);
    const result = handleSelectSlot(id, offered[0].id);
    expect(result.ok && result.response.session.reservation?.slotId).toBe(offered[0].id);
  });

  it("rejects a clicked slot from another provider", () => {
    const id = newSession();
    const other = listOfferedSlots("doc-002", id)[0].id;
    const result = handleSelectSlot(id, other);
    expect(result.ok).toBe(false);
  });
});
