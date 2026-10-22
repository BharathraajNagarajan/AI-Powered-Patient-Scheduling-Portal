"use client";

import { STEP_TITLES, useIntakeForm } from "@/hooks/useIntakeForm";
import { ErrorBanner } from "./ErrorBanner";
import { FormField } from "./FormField";

export function IntakeStepper() {
  const form = useIntakeForm();
  const { step, values, errors, submitting, serverError, lastStep } = form;
  const isLast = step === lastStep;
  const percent = Math.round(((step + 1) / STEP_TITLES.length) * 100);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.next();
      }}
    >
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-xs text-white/60">
          <span>
            Step {step + 1} of {STEP_TITLES.length}
          </span>
          <span className="font-semibold text-white/80">{STEP_TITLES[step]}</span>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="Intake progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
      </div>

      {step === 0 && (
        <>
          <FormField id="patientName" label="Full name" error={errors.patientName}>
            {(a11y) => (
              <input
                {...a11y}
                type="text"
                name="patientName"
                autoComplete="name"
                placeholder="Enter your full name"
                value={values.patientName}
                onChange={(e) => form.change("patientName", e.target.value)}
                className={`glass-input ${errors.patientName ? "error" : ""}`}
              />
            )}
          </FormField>
          <FormField id="dob" label="Date of birth" error={errors.dob}>
            {(a11y) => (
              <input
                {...a11y}
                type="date"
                name="dob"
                autoComplete="bday"
                value={values.dob}
                onChange={(e) => form.change("dob", e.target.value)}
                className={`glass-input scheme-dark ${errors.dob ? "error" : ""}`}
              />
            )}
          </FormField>
        </>
      )}

      {step === 1 && (
        <>
          <FormField id="phone" label="Phone number" error={errors.phone}>
            {(a11y) => (
              <input
                {...a11y}
                type="tel"
                name="phone"
                autoComplete="tel"
                placeholder="+1 (555) 000-0000"
                value={values.phone}
                onChange={(e) => form.change("phone", e.target.value)}
                className={`glass-input ${errors.phone ? "error" : ""}`}
              />
            )}
          </FormField>
          <FormField id="email" label="Email address" error={errors.email}>
            {(a11y) => (
              <input
                {...a11y}
                type="email"
                name="email"
                autoComplete="email"
                placeholder="your@email.com"
                value={values.email}
                onChange={(e) => form.change("email", e.target.value)}
                className={`glass-input ${errors.email ? "error" : ""}`}
              />
            )}
          </FormField>
          <div className="mb-5 flex items-start gap-3 rounded-[10px] border border-white/10 bg-white/[0.04] p-3.5">
            <input
              type="checkbox"
              id="smsOptIn"
              name="smsOptIn"
              checked={values.smsOptIn}
              onChange={(e) => form.change("smsOptIn", e.target.checked)}
              className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer accent-cyan-600"
            />
            <label htmlFor="smsOptIn" className="cursor-pointer text-[13px] leading-normal text-white/70">
              Send me a text confirmation when my appointment is booked
              <span className="mt-0.5 block text-xs text-white/50">
                Standard message rates may apply. Reply STOP to opt out.
              </span>
            </label>
          </div>
        </>
      )}

      {step === 2 && (
        <FormField id="chiefComplaint" label="Reason for visit" error={errors.chiefComplaint}>
          {(a11y) => (
            <textarea
              {...a11y}
              name="chiefComplaint"
              rows={4}
              maxLength={500}
              placeholder="Briefly describe what brings you in today..."
              value={values.chiefComplaint}
              onChange={(e) => form.change("chiefComplaint", e.target.value)}
              className={`glass-input resize-none leading-normal ${errors.chiefComplaint ? "error" : ""}`}
            />
          )}
        </FormField>
      )}

      {serverError && (
        <div className="mb-5">
          <ErrorBanner message={serverError} />
        </div>
      )}

      <div className="flex gap-3">
        {step > 0 && (
          <button type="button" onClick={form.back} disabled={submitting} className="ghost-button">
            Back
          </button>
        )}
        <button type="submit" disabled={submitting} className="glass-button flex-1 py-3.5">
          {submitting ? (
            <span className="flex items-center justify-center gap-2.5">
              <span className="spinner" aria-hidden="true" />
              Setting up your consultation...
            </span>
          ) : isLast ? (
            "Begin consultation"
          ) : (
            "Next"
          )}
        </button>
      </div>
    </form>
  );
}
