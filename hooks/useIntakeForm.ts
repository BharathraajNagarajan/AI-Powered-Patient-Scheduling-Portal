"use client";

import { useReducer } from "react";
import type { ZodType } from "zod";
import { useRouter } from "next/navigation";
import { api, ApiError, storeSessionId } from "@/lib/client";
import type { IntakeValues } from "@/lib/types";
import {
  complaintSchema,
  dobSchema,
  emailSchema,
  intakeSteps,
  nameSchema,
  phoneSchema,
} from "@/lib/validation";

type Errors = Partial<Record<keyof IntakeValues, string>>;

interface State {
  step: number;
  values: IntakeValues;
  errors: Errors;
  submitting: boolean;
  serverError: string | null;
}

type Action =
  | { type: "CHANGE"; name: keyof IntakeValues; value: string | boolean }
  | { type: "GO"; step: number }
  | { type: "ERRORS"; errors: Errors }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_FAIL"; message: string; errors: Errors; step?: number };

const initial: State = {
  step: 0,
  values: { patientName: "", dob: "", phone: "", email: "", chiefComplaint: "", smsOptIn: false },
  errors: {},
  submitting: false,
  serverError: null,
};

const fieldSchemas: Partial<Record<keyof IntakeValues, ZodType>> = {
  patientName: nameSchema,
  dob: dobSchema,
  phone: phoneSchema,
  email: emailSchema,
  chiefComplaint: complaintSchema,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "CHANGE":
      return {
        ...state,
        values: { ...state.values, [action.name]: action.value },
        errors: { ...state.errors, [action.name]: undefined },
      };
    case "GO":
      return { ...state, step: action.step, errors: {}, serverError: null };
    case "ERRORS":
      return { ...state, errors: action.errors };
    case "SUBMIT_START":
      return { ...state, submitting: true, serverError: null };
    case "SUBMIT_FAIL":
      return {
        ...state,
        submitting: false,
        serverError: action.message,
        errors: action.errors,
        step: action.step ?? state.step,
      };
  }
}

export function validateStep(step: number, values: IntakeValues): Errors {
  const errors: Errors = {};
  for (const field of intakeSteps[step]) {
    const schema = fieldSchemas[field];
    if (!schema) continue;
    const result = schema.safeParse(values[field]);
    if (!result.success) errors[field] = result.error.issues[0]?.message;
  }
  return errors;
}

export const STEP_TITLES = ["About you", "Contact", "Reason for visit"] as const;

export function useIntakeForm() {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, initial);
  const lastStep = STEP_TITLES.length - 1;

  function change(name: keyof IntakeValues, value: string | boolean) {
    dispatch({ type: "CHANGE", name, value });
  }

  function back() {
    if (state.step > 0) dispatch({ type: "GO", step: state.step - 1 });
  }

  async function submit() {
    dispatch({ type: "SUBMIT_START" });
    try {
      const data = await api<{ sessionId: string }>("/api/session", { method: "POST", body: state.values });
      storeSessionId(data.sessionId);
      router.push("/chat");
    } catch (err) {
      const fields = err instanceof ApiError ? (err.fields as Errors | undefined) : undefined;
      const stepWithError = fields
        ? intakeSteps.findIndex((names) => names.some((name) => fields[name]))
        : -1;
      dispatch({
        type: "SUBMIT_FAIL",
        message: err instanceof Error ? err.message : "Something went wrong. Please try again.",
        errors: fields ?? {},
        step: stepWithError >= 0 ? stepWithError : undefined,
      });
    }
  }

  async function next() {
    const errors = validateStep(state.step, state.values);
    if (Object.keys(errors).length > 0) {
      dispatch({ type: "ERRORS", errors });
      return;
    }
    if (state.step < lastStep) {
      dispatch({ type: "GO", step: state.step + 1 });
      return;
    }
    await submit();
  }

  return { ...state, lastStep, change, next, back };
}
