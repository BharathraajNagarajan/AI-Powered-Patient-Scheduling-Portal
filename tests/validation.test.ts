import { describe, expect, it } from "vitest";
import {
  chatSchema,
  fieldErrors,
  intakeSchema,
  normalizePhone,
  phoneKey,
  sanitizeInput,
  selectSlotSchema,
} from "@/lib/validation";

const valid = {
  patientName: "Jane Doe",
  dob: "1985-06-15",
  phone: "(415) 555-0123",
  email: "jane@example.com",
  chiefComplaint: "knee pain after running",
  smsOptIn: true,
};

describe("intake validation", () => {
  it("accepts a valid intake", () => {
    expect(intakeSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects each bad field with a message", () => {
    const result = intakeSchema.safeParse({
      patientName: "J",
      dob: "2999-01-01",
      phone: "123",
      email: "nope",
      chiefComplaint: "x",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(fieldErrors(result.error)).sort()).toEqual(
        ["chiefComplaint", "dob", "email", "patientName", "phone"].sort()
      );
    }
  });

  it("rejects malformed dates and over-long complaints", () => {
    expect(intakeSchema.safeParse({ ...valid, dob: "15/06/1985" }).success).toBe(false);
    expect(intakeSchema.safeParse({ ...valid, chiefComplaint: "a".repeat(501) }).success).toBe(false);
  });

  it("sanitizes markup and handlers", () => {
    expect(sanitizeInput("  <b>hi</b> javascript:alert(1) onclick=x ")).toBe("bhi/b alert(1) x");
    const parsed = intakeSchema.parse({ ...valid, patientName: "<script>Jane</script>" });
    expect(parsed.patientName).not.toContain("<");
  });

  it("defaults smsOptIn to false", () => {
    const rest: Partial<typeof valid> = { ...valid };
    delete rest.smsOptIn;
    expect(intakeSchema.parse(rest).smsOptIn).toBe(false);
  });
});

describe("phone helpers", () => {
  it("normalizes to E.164", () => {
    expect(normalizePhone("(415) 555-0123")).toBe("+14155550123");
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("keys the same number identically", () => {
    expect(phoneKey("4155550123")).toBe(phoneKey("+1 415 555 0123"));
  });
});

describe("request schemas", () => {
  it("requires a uuid session id", () => {
    expect(chatSchema.safeParse({ sessionId: "abc", message: "hi" }).success).toBe(false);
    expect(
      chatSchema.safeParse({ sessionId: "7d9f6a5e-0b1c-4d2e-8f3a-1b2c3d4e5f60", message: "hi" }).success
    ).toBe(true);
  });

  it("rejects empty and oversized messages", () => {
    const sessionId = "7d9f6a5e-0b1c-4d2e-8f3a-1b2c3d4e5f60";
    expect(chatSchema.safeParse({ sessionId, message: "   " }).success).toBe(false);
    expect(chatSchema.safeParse({ sessionId, message: "a".repeat(1001) }).success).toBe(false);
  });

  it("requires a slot id", () => {
    expect(selectSlotSchema.safeParse({ sessionId: "7d9f6a5e-0b1c-4d2e-8f3a-1b2c3d4e5f60" }).success).toBe(false);
  });
});
