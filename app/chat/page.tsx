"use client";

import { BookingConfirmationCard } from "@/components/BookingConfirmationCard";
import { CallHandoffButton } from "@/components/CallHandoffButton";
import { ChatWindow } from "@/components/ChatWindow";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ProviderCard } from "@/components/ProviderCard";
import { SlotPicker } from "@/components/SlotPicker";
import { useCallHandoff } from "@/hooks/useCallHandoff";
import { useChatSession } from "@/hooks/useChatSession";
import { officeInfo, PRODUCT_NAME } from "@/lib/office-info";

const PENDING_LABELS = {
  chat: "AI is thinking...",
  slot: "Holding your time...",
  booking: "Booking your appointment...",
} as const;

export default function ChatPage() {
  const chat = useChatSession();
  const call = useCallHandoff(chat.sessionId);

  if (chat.status === "loading" || !chat.session) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading">
        <div className="spinner" />
      </div>
    );
  }

  const debug =
    process.env.NODE_ENV !== "production" && new URLSearchParams(window.location.search).get("debug") === "true";
  const { session, ui, pending } = chat;
  const firstName = session.patientName.split(" ")[0];
  const busy = pending !== null;
  const error = chat.error ?? call.error;

  return (
    <main className="mx-auto flex min-h-screen max-w-[760px] flex-col px-4">
      <header className="sticky top-[3px] z-[100] py-4 backdrop-blur-xl">
        <div className="glass-card flex items-center justify-between gap-3 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="brand-mark h-9 w-9 text-lg" aria-hidden="true">
              &#9877;
            </div>
            <div>
              <h1 className="m-0 text-[15px] font-bold text-white">{officeInfo.name}</h1>
              <p className="m-0 text-xs text-white/60">{PRODUCT_NAME}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="hidden items-center gap-1.5 sm:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" aria-hidden="true" />
              <span className="text-xs text-white/60">Online</span>
            </div>
            <CallHandoffButton status={call.status} disabled={busy || session.callsRemaining === 0} onClick={call.start} />
          </div>
        </div>
        {ui.provider && (
          <div className="mt-2">
            <ProviderCard name={ui.provider.name} specialty={ui.provider.specialty} matchScore={ui.provider.matchScore} />
          </div>
        )}
        {call.status === "connected" && (
          <p role="status" className="mb-0 mt-2 text-center text-xs text-emerald-300">
            Your phone should ring shortly. Aria will pick up where this chat left off.
          </p>
        )}
      </header>

      <ChatWindow
        messages={chat.messages}
        pending={busy}
        pendingLabel={pending ? PENDING_LABELS[pending] : ""}
        placeholder={`Message Aria, ${firstName}...`}
        onSend={chat.send}
      >
        {error && <ErrorBanner message={error} onDismiss={chat.error ? chat.dismissError : undefined} />}
        {ui.choices && (
          <div className="flex flex-col gap-2">
            {ui.choices.map((choice) => (
              <ProviderCard
                key={choice.id}
                name={choice.name}
                specialty={choice.specialty}
                disabled={busy}
                onChoose={() => chat.selectProvider(choice.id)}
              />
            ))}
          </div>
        )}
        {ui.booking ? (
          <BookingConfirmationCard booking={ui.booking} />
        ) : (
          ui.slots && (
            <SlotPicker
              slots={ui.slots}
              reservation={session.reservation}
              busy={busy}
              onSelect={chat.selectSlot}
              onConfirm={chat.confirmBooking}
            />
          )
        )}
        {debug && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <span className="text-[11px] text-amber-400">DEBUG</span>
            <span className="text-[11px] text-white/60">{session.sessionId}</span>
            <button
              type="button"
              onClick={chat.confirmBooking}
              className="rounded-md border border-amber-500/50 bg-amber-500/30 px-3 py-1 text-xs text-white"
            >
              Book held slot
            </button>
            <button
              type="button"
              onClick={call.start}
              className="rounded-md border border-emerald-500/50 bg-emerald-500/30 px-3 py-1 text-xs text-white"
            >
              Place call
            </button>
          </div>
        )}
      </ChatWindow>
    </main>
  );
}
