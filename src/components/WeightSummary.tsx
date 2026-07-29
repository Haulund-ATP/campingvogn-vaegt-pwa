import { formatKg, formatSince } from "../lib/format";
import type { WeightStatus } from "../types";

/** Alt hvad visningen har brug for — både StatusResponse og TripSummaryResponse passer. */
export type WeightFigures = Pick<
  WeightStatus,
  | "currentWeightKg"
  | "maximumWeightKg"
  | "remainingWeightKg"
  | "overweightKg"
  | "utilizationPercentage"
  | "isOverweight"
  | "statusLevel"
>;

interface Props {
  figures: WeightFigures;
  /** Antal registreringer der endnu ikke er sendt til serveren. */
  pendingCount?: number;
  /** Sat når tallene kommer fra det lokale snapshot i stedet for serveren. */
  cachedAt?: string | null;
  /** Kompakt udgave til lister (fx administratorens tripoversigt). */
  compact?: boolean;
}

/**
 * Den frie vægt — eller overvægten. Vises på alle tripsider, så man aldrig skal
 * regne selv for at se, hvor meget der er tilbage at laste.
 */
export function WeightSummary({ figures, pendingCount = 0, cachedAt, compact = false }: Props) {
  const { isOverweight, statusLevel } = figures;
  const headlineKg = isOverweight ? figures.overweightKg : figures.remainingWeightKg;
  const barPercentage = Math.min(Math.max(figures.utilizationPercentage, 0), 100);

  return (
    <div className={`weight-summary status-${statusLevel} ${compact ? "compact" : ""}`} role="status">
      <p className="weight-summary-headline">
        <span className="weight-summary-value">
          {isOverweight && <span aria-hidden="true">⚠️ </span>}
          {formatKg(headlineKg)} kg
        </span>
        <span className="weight-summary-label">{isOverweight ? "for tung" : "fri vægt tilbage"}</span>
      </p>

      <div className="weight-bar" aria-hidden="true">
        <div className={`weight-bar-fill status-${statusLevel}`} style={{ width: `${barPercentage}%` }} />
      </div>

      <p className="muted weight-summary-detail">
        {formatKg(figures.currentWeightKg)} af {formatKg(figures.maximumWeightKg)} kg brugt ·{" "}
        {figures.utilizationPercentage.toFixed(0)}% af lasteevnen
      </p>

      {pendingCount > 0 && (
        <p className="weight-summary-note">
          Inkluderer {pendingCount} {pendingCount === 1 ? "registrering" : "registreringer"}, der venter på at blive
          sendt.
        </p>
      )}

      {cachedAt && (
        <p className="weight-summary-note">
          Offline — seneste kendte tal, hentet {formatSince(cachedAt)}. Andre telefoner kan have registreret siden.
        </p>
      )}
    </div>
  );
}
