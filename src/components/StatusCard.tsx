import type { StatusResponse } from "../types";

export function StatusCard({ status }: { status: StatusResponse }) {
  return (
    <div className={`status-card status-${status.statusLevel}`} role="status">
      <h2>{status.displayName}</h2>
      <p className="current-weight">{formatKg(status.currentWeightKg)} kg</p>
      <p>Tilladt totalvægt: {formatKg(status.maximumWeightKg)} kg</p>
      {status.isOverweight ? (
        <p className="overweight-warning">
          <span aria-hidden="true">⚠️</span> Campingvognen er {formatKg(status.overweightKg)} kg for tung
        </p>
      ) : (
        <p>Du kan tilføje yderligere {formatKg(status.remainingWeightKg)} kg</p>
      )}
      <p className="utilization">{status.utilizationPercentage.toFixed(1)}% udnyttet</p>
    </div>
  );
}

export function formatKg(value: number): string {
  return value.toLocaleString("da-DK", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}
