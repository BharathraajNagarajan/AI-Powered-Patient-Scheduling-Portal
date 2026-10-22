"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatMessage } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";

interface ChatWindowProps {
  messages: ChatMessage[];
  pending: boolean;
  pendingLabel: string;
  placeholder: string;
  onSend: (text: string) => void;
  children?: ReactNode;
}

export function ChatWindow({ messages, pending, pendingLabel, placeholder, onSend, children }: ChatWindowProps) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  function submit() {
    const text = input.trim();
    if (!text || pending) return;
    setInput("");
    onSend(text);
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-3 py-4">
        <div role="log" aria-live="polite" aria-label="Conversation" className="flex flex-col gap-3">
          {messages.map((message, index) => (
            <MessageBubble key={`${message.timestamp}-${index}`} message={message} />
          ))}
        </div>
        {pending && <TypingIndicator label={pendingLabel} />}
        {children}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 pb-6 pt-4 backdrop-blur-xl">
        <div className="glass-card p-3">
          <form
            className="flex items-center gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label htmlFor="chat-input" className="sr-only">
              Message Aria
            </label>
            <input
              id="chat-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={placeholder}
              disabled={pending}
              maxLength={1000}
              autoComplete="off"
              className="glass-input m-0 flex-1"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              aria-label="Send message"
              className="glass-button shrink-0 px-5 py-3"
            >
              {pending ? <span className="spinner h-4 w-4" aria-hidden="true" /> : "Send"}
            </button>
          </form>
          <p className="mb-0 mt-2 text-center text-[11px] text-white/45">
            Press Enter to send. Aria does not provide medical advice. Call 911 for emergencies.
          </p>
        </div>
      </div>
    </>
  );
}
