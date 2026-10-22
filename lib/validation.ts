import { z } from "zod";

export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+=/gi, "");
}

const clean = (min: number, max: number, tooShort: string, tooLong: string) =>
  z
    .string({ error: tooShort })
    .transform(sanitizeInput)
    .pipe(z.string().min(min, tooShort).max(max, tooLong));

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export function phoneKey(phone: string): string {
  return normalizePhone(phone).replace(/\D/g, "");
}

export const nameSchema = clean(2, 100, "Please enter your full name", "Name is too long");

export const dobSchema = z
  .string({ error: "Date of birth is required" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Please enter a valid date of birth")
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Please enter a valid date of birth")
  .refine((value) => new Date(value) < new Date(), "Date of birth must be in the past")
  .refine((value) => {
    const age = new Date().getFullYear() - new Date(value).getFullYear();
    return age <= 120;
  }, "Please enter a valid date of birth");

export const phoneSchema = z
  .string({ error: "Phone number is required" })
  .transform(sanitizeInput)
  .pipe(
    z
      .string()
      .min(1, "Phone number is required")
      .refine((value) => value.replace(/\D/g, "").length >= 10, "Please enter a valid phone number")
      .refine((value) => value.replace(/\D/g, "").length <= 15, "Phone number is too long")
  );

export const emailSchema = clean(1, 254, "Email address is required", "Email address is too long").pipe(
  z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please enter a valid email address")
);

export const complaintSchema = clean(
  3,
  500,
  "Please describe your reason for visit",
  "Description is too long, please keep it under 500 characters"
);

export const intakeSchema = z.object({
  patientName: nameSchema,
  dob: dobSchema,
  phone: phoneSchema,
  email: emailSchema,
  chiefComplaint: complaintSchema,
  smsOptIn: z.boolean().default(false),
});

export const intakeSteps = [
  ["patientName", "dob"],
  ["phone", "email", "smsOptIn"],
  ["chiefComplaint"],
] as const;

export const sessionIdSchema = z.string().uuid();

export const chatSchema = z.object({
  sessionId: sessionIdSchema,
  message: z.string().trim().min(1).max(1000).optional(),
  initial: z.boolean().optional(),
});

export const bookSchema = z.object({ sessionId: sessionIdSchema });

export const selectSlotSchema = z.object({
  sessionId: sessionIdSchema,
  slotId: z.string().min(1).max(64),
});

export const selectProviderSchema = z.object({
  sessionId: sessionIdSchema,
  providerId: z.string().min(1).max(32),
});

export const initiateCallSchema = z.object({ sessionId: sessionIdSchema });

export const recallSchema = z.object({ phone: z.string().min(7).max(32) });

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
