import type { CallStatus } from "@/hooks/useCallHandoff";

interface CallHandoffButtonProps {
  status: CallStatus;
  disabled?: boolean;
  onClick: () => void;
}

export function CallHandoffButton({ status, disabled, onClick }: CallHandoffButtonProps) {
  const stateClass = status === "calling" ? "calling" : status === "connected" ? "connected" : "";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || status === "calling"}
      aria-busy={status === "calling"}
      className={`call-button ${stateClass}`}
    >
      {status === "idle" && "Call me instead"}
      {status === "calling" && (
        <>
          <span className="spinner h-3.5 w-3.5" aria-hidden="true" /> Connecting...
        </>
      )}
      {status === "connected" && "Call placed"}
      {status === "failed" && "Try again"}
    </button>
  );
}
