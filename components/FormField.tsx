import type { ReactNode } from "react";

export interface FieldControlProps {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
}

interface FormFieldProps {
  id: string;
  label: string;
  error?: string;
  children: (props: FieldControlProps) => ReactNode;
}

export function FormField({ id, label, error, children }: FormFieldProps) {
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="mb-5">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": errorId })}
      {error && (
        <p id={errorId} className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}
