import type { ProviderView } from "@/lib/types";

interface ProviderCardProps {
  provider: ProviderView;
}

export function ProviderCard({ provider }: ProviderCardProps) {
  return (
    <section aria-label="Matched specialist" className="glass-card flex items-center justify-between gap-4 px-5 py-3.5">
      <div className="flex items-center gap-3">
        <div className="brand-mark h-10 w-10 text-lg" aria-hidden="true">
          &#9877;
        </div>
        <div>
          <p className="m-0 text-[15px] font-bold text-white">{provider.name}</p>
          <p className="m-0 text-xs text-sky-300">{provider.specialty}</p>
        </div>
      </div>
      {provider.matchScore !== null && (
        <p className="m-0 text-right text-xs text-white/50">
          Match score
          <span className="block text-sm font-semibold text-white/80">{Math.round(provider.matchScore * 100)}%</span>
        </p>
      )}
    </section>
  );
}
