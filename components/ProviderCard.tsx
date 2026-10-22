interface ProviderCardProps {
  name: string;
  specialty: string;
  matchScore?: number | null;
  disabled?: boolean;
  onChoose?: () => void;
}

export function ProviderCard({ name, specialty, matchScore = null, disabled, onChoose }: ProviderCardProps) {
  return (
    <section
      aria-label={onChoose ? `Specialist option ${specialty}` : "Matched specialist"}
      className="glass-card flex items-center justify-between gap-4 px-5 py-3.5"
    >
      <div className="flex items-center gap-3">
        <div className="brand-mark h-10 w-10 text-lg" aria-hidden="true">
          &#9877;
        </div>
        <div>
          <p className="m-0 text-[15px] font-bold text-white">{name}</p>
          <p className="m-0 text-xs text-sky-300">{specialty}</p>
        </div>
      </div>
      {onChoose ? (
        <button type="button" className="glass-button py-2.5" disabled={disabled} onClick={onChoose}>
          Choose {specialty}
        </button>
      ) : (
        matchScore !== null && (
          <p className="m-0 text-right text-xs text-white/50">
            Match score
            <span className="block text-sm font-semibold text-white/80">{Math.round(matchScore * 100)}%</span>
          </p>
        )
      )}
    </section>
  );
}
