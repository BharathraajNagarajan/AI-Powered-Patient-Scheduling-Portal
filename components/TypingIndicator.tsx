interface TypingIndicatorProps {
  label: string;
}

export function TypingIndicator({ label }: TypingIndicatorProps) {
  return (
    <div className="flex items-end gap-2" role="status">
      <div className="brand-mark h-7 w-7 rounded-lg text-sm" aria-hidden="true">
        &#9877;
      </div>
      <div className="chat-bubble-ai">
        <div className="flex items-center gap-2">
          <div className="typing-indicator" aria-hidden="true">
            <div className="typing-dot" />
            <div className="typing-dot" />
            <div className="typing-dot" />
          </div>
          <span className="text-xs text-white/50">{label}</span>
        </div>
      </div>
    </div>
  );
}
