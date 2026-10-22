import type { ChatMessage } from "@/lib/types";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const time = new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="brand-mark h-7 w-7 rounded-lg text-sm" aria-hidden="true">
          &#9877;
        </div>
      )}
      <div className={isUser ? "chat-bubble-user" : "chat-bubble-ai"}>
        <p className="m-0 whitespace-pre-wrap text-[15px] leading-relaxed text-white/90">
          <span className="sr-only">{isUser ? "You: " : "Aria: "}</span>
          {message.content}
        </p>
        <p className="mb-0 mt-1 text-[11px] text-white/45">{time}</p>
      </div>
    </div>
  );
}
