// Seneste kendte vægtstatus pr. trip gemmes lokalt, så den frie vægt kan vises
// uden netværk. Kun beregnede vægttal og tripnavn gemmes — aldrig tokens,
// sessioner eller registreringshistorik.

import { getDb, STATUS_STORE } from "./offlineQueue";
import { computeStatus } from "../shared/weight";
import type { StatusResponse } from "../types";

export interface CachedStatus extends StatusResponse {
  /** Hvornår snapshottet blev hentet fra serveren. */
  cachedAt: string;
}

export async function saveStatusSnapshot(status: StatusResponse): Promise<void> {
  const db = await getDb();
  const snapshot: CachedStatus = { ...status, cachedAt: new Date().toISOString() };
  await db.put(STATUS_STORE, snapshot);
}

export async function loadStatusSnapshot(tripId: string): Promise<CachedStatus | undefined> {
  const db = await getDb();
  return (await db.get(STATUS_STORE, tripId)) as CachedStatus | undefined;
}

/** Det senest hentede snapshot uanset trip — bruges når appen åbnes uden QR-scan. */
export async function loadLatestStatusSnapshot(): Promise<CachedStatus | undefined> {
  const db = await getDb();
  const all = (await db.getAll(STATUS_STORE)) as CachedStatus[];
  return all.sort((a, b) => b.cachedAt.localeCompare(a.cachedAt))[0];
}

/**
 * Fremskriver en status med de ændringer der endnu ikke er sendt til serveren.
 * Genbruger den autoritative beregning, så lokale og serverberegnede tal følger
 * samme regler (heltal gram, samme grænser for gul/rød).
 */
export function projectStatus(base: StatusResponse, pendingDeltasKg: number[]): StatusResponse {
  if (pendingDeltasKg.length === 0) return base;

  const registeredDeltaKg = base.currentWeightKg - base.startWeightKg;
  const projected = computeStatus(
    { startWeightKg: base.startWeightKg, maximumWeightKg: base.maximumWeightKg },
    [registeredDeltaKg, ...pendingDeltasKg]
  );

  return {
    ...base,
    ...projected,
  };
}
