import type { BookingView } from "@/lib/types";

interface BookingConfirmationCardProps {
  booking: BookingView;
}

export function BookingConfirmationCard({ booking }: BookingConfirmationCardProps) {
  return (
    <section aria-label="Booking confirmation" className="glass-card border-emerald-400/30 p-5">
      <p className="m-0 text-xs font-semibold uppercase tracking-widest text-emerald-300">Appointment confirmed</p>
      <p className="mb-1 mt-2 text-2xl font-bold tracking-wider text-sky-300">{booking.bookingId}</p>
      <p className="m-0 text-[15px] font-semibold text-white">{booking.provider}</p>
      <p className="m-0 text-sm text-white/70">{booking.label}</p>
    </section>
  );
}
