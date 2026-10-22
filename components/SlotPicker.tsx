import type { ReservationView, SlotView } from "@/lib/types";

interface SlotPickerProps {
  slots: SlotView[];
  reservation: ReservationView | null;
  busy: boolean;
  onSelect: (slotId: string) => void;
  onConfirm: () => void;
}

interface DayGroup {
  day: string;
  slots: { id: string; time: string }[];
}

function groupByDay(slots: SlotView[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const slot of slots) {
    const [day, time] = slot.label.split(" at ");
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.slots.push({ id: slot.id, time });
    else groups.push({ day, slots: [{ id: slot.id, time }] });
  }
  return groups;
}

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function SlotPicker({ slots, reservation, busy, onSelect, onConfirm }: SlotPickerProps) {
  const groups = groupByDay(slots);

  return (
    <section aria-label="Available appointment times" className="glass-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-white/80">Choose a time</h2>
      {groups.length === 0 ? (
        <p className="text-sm text-white/60">No times are available right now.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <div key={group.day}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/50">{group.day}</p>
              <div className="flex flex-wrap gap-2">
                {group.slots.map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    className="slot-chip"
                    aria-pressed={reservation?.slotId === slot.id}
                    aria-label={`${group.day} at ${slot.time}`}
                    disabled={busy}
                    onClick={() => onSelect(slot.id)}
                  >
                    {slot.time}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {reservation && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <p className="m-0 text-sm text-white/70">
            Holding <span className="font-semibold text-sky-300">{reservation.label}</span> until{" "}
            {formatExpiry(reservation.expiresAt)}
          </p>
          <button type="button" className="glass-button py-2.5" disabled={busy} onClick={onConfirm}>
            Confirm booking
          </button>
        </div>
      )}
    </section>
  );
}
