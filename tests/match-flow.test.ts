import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/matching", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/matching")>()),
  matchProvider: vi.fn(),
}));

import { handleChat, handleSelectProvider } from "@/lib/chat";
import { getDoctor } from "@/lib/doctors";
import { ERROR_MESSAGES } from "@/lib/errors";
import { matchProvider, type MatchResult } from "@/lib/matching";
import { getSession } from "@/lib/sessions";
import { dropTempDb, newSession, useTempDb } from "./helpers";

const ortho = getDoctor("doc-001")!;
const cardio = getDoctor("doc-002")!;

const matched = (doctor: typeof ortho): MatchResult => ({
  status: "matched",
  doctor,
  candidates: [],
  score: 0.4,
  top: [],
  path: "semantic",
});
const uncertain: MatchResult = {
  status: "uncertain",
  doctor: null,
  candidates: [ortho, cardio],
  score: null,
  top: [],
  path: "semantic",
};
const none: MatchResult = { status: "none", doctor: null, candidates: [], score: null, top: [], path: "semantic" };

const mocked = vi.mocked(matchProvider);

beforeEach(() => {
  useTempDb();
  mocked.mockReset();
});
afterEach(dropTempDb);

describe("matched path", () => {
  it("sets the provider and returns slots", async () => {
    mocked.mockResolvedValue(matched(ortho));
    const id = newSession(null);
    const result = await handleChat(id, undefined, true);
    expect(result.ok && result.response.ui.provider?.specialty).toBe("Orthopedics");
    expect(result.ok && (result.response.ui.slots?.length ?? 0)).toBeGreaterThan(0);
    expect(getSession(id)?.matchedProviderId).toBe("doc-001");
    expect(getSession(id)?.matchStage).toBeNull();
  });
});

describe("uncertain path", () => {
  it("asks one clarifying question without picking a doctor", async () => {
    mocked.mockResolvedValue(uncertain);
    const id = newSession(null);
    const result = await handleChat(id, undefined, true);
    expect(result.ok && result.response.reply).toContain(ortho.focus);
    expect(result.ok && result.response.reply).toContain(cardio.focus);
    expect(result.ok && result.response.ui.provider).toBeUndefined();
    expect(result.ok && result.response.ui.slots).toBeUndefined();
    expect(result.ok && result.response.ui.choices).toBeUndefined();
    expect(getSession(id)?.matchedProviderId).toBeNull();
    expect(getSession(id)?.matchStage).toBe("clarifying");
  });

  it("matches the original complaint plus the answer combined", async () => {
    mocked.mockResolvedValueOnce(uncertain).mockResolvedValueOnce(matched(cardio));
    const id = newSession(null);
    await handleChat(id, undefined, true);
    const result = await handleChat(id, "it is my chest", false);
    expect(mocked).toHaveBeenLastCalledWith("knee pain it is my chest");
    expect(result.ok && result.response.ui.provider?.specialty).toBe("Cardiology");
    expect(getSession(id)?.matchStage).toBeNull();
  });

  it("offers clickable choices when still uncertain after the answer", async () => {
    mocked.mockResolvedValue(uncertain);
    const id = newSession(null);
    await handleChat(id, undefined, true);
    const second = await handleChat(id, "not sure", false);
    expect(second.ok && second.response.ui.choices?.map((c) => c.id)).toEqual(["doc-001", "doc-002"]);
    expect(getSession(id)?.matchStage).toBe("choosing");

    const chosen = handleSelectProvider(id, "doc-002");
    expect(chosen.ok && chosen.response.ui.provider?.specialty).toBe("Cardiology");
    expect(chosen.ok && (chosen.response.ui.slots?.length ?? 0)).toBeGreaterThan(0);
    expect(chosen.ok && chosen.response.ui.choices).toBeUndefined();
    expect(getSession(id)?.matchedProviderId).toBe("doc-002");
  });

  it("rejects a choice that is not a candidate or not in choosing stage", async () => {
    mocked.mockResolvedValue(uncertain);
    const id = newSession(null);
    expect(handleSelectProvider(id, "doc-001").ok).toBe(false);
    await handleChat(id, undefined, true);
    expect(handleSelectProvider(id, "doc-001").ok).toBe(false);
    await handleChat(id, "not sure", false);
    expect(handleSelectProvider(id, "doc-003").ok).toBe(false);
    expect(getSession(id)?.matchedProviderId).toBeNull();
  });

  it("ends with the unsupported message if the answer matches nothing", async () => {
    mocked.mockResolvedValueOnce(uncertain).mockResolvedValueOnce(none);
    const id = newSession(null);
    await handleChat(id, undefined, true);
    const result = await handleChat(id, "something else", false);
    expect(result.ok && result.response.reply).toBe(ERROR_MESSAGES.noSpecialist);
    expect(getSession(id)?.matchStage).toBeNull();
  });
});

describe("none path", () => {
  it("replies politely and suggests calling the office", async () => {
    mocked.mockResolvedValue(none);
    const id = newSession(null);
    const result = await handleChat(id, undefined, true);
    expect(result.ok && result.response.reply).toBe(ERROR_MESSAGES.noSpecialist);
    expect(result.ok && result.response.reply).toContain("(401) 738-2294");
    expect(getSession(id)?.matchedProviderId).toBeNull();
  });

  it("keeps chatting when a later message is not a medical complaint", async () => {
    mocked.mockResolvedValueOnce(none).mockResolvedValueOnce(none);
    const id = newSession(null);
    await handleChat(id, undefined, true);
    const result = await handleChat(id, "hello there", false);
    expect(result.ok && result.response.reply).not.toBe(ERROR_MESSAGES.noSpecialist);
  });
});
