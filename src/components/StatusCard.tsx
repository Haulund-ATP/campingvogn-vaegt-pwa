import { formatKg } from "../lib/format";
import { WeightSummary } from "./WeightSummary";
import type { StatusResponse } from "../types";

export function StatusCard({
  status,
  pendingCount = 0,
  cachedAt,
}: {
  status: StatusResponse;
  pendingCount?: number;
  cachedAt?: string | null;
}) {
  return (
    <div className={`status-card status-${status.statusLevel}`}>
      <h2>{status.displayName}</h2>
      <p className="current-weight">{formatKg(status.currentWeightKg)} kg</p>
      <WeightSummary figures={status} pendingCount={pendingCount} cachedAt={cachedAt} />
    </div>
  );
}
