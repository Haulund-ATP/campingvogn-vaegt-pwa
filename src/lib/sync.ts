import { ApiError, OfflineError, api } from "./apiClient";
import { listAllQueued, removeFromQueue, updateAttempt, type QueuedEntry } from "./offlineQueue";
import { saveStatusSnapshot } from "./statusCache";
import type { StatusResponse } from "../types";

export interface SyncResult {
  synced: string[];
  failed: string[];
  /** Poster serveren afviste permanent (fx arkiveret trip eller for tung post). */
  rejected: string[];
  /** Sat hvis synkroniseringen stoppede, fordi sessionen ikke længere er gyldig. */
  sessionLost: boolean;
}

const EMPTY: SyncResult = { synced: [], failed: [], rejected: [], sessionLost: false };

type Listener = (result: SyncResult) => void;
const listeners = new Set<Listener>();

export function onSynced(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Bruges når service workeren har sendt køen i baggrunden. */
export function emitSynced(result: SyncResult): void {
  for (const listener of listeners) listener(result);
}

// Kun én synkronisering ad gangen: både appen, service workeren og
// online-hændelser kan udløse den, og dubletter ville tælle mod rate limit.
let inFlight: Promise<SyncResult> | null = null;

export function syncQueue(tripId?: string): Promise<SyncResult> {
  if (!inFlight) {
    inFlight = runSync(tripId).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/** Bagudkompatibelt navn brugt af registreringssiden. */
export const syncQueueForTrip = syncQueue;

async function runSync(tripId?: string): Promise<SyncResult> {
  const all = await listAllQueued();
  const pending = tripId ? all.filter((e) => e.tripId === tripId) : all;
  if (pending.length === 0) return EMPTY;

  const result: SyncResult = { synced: [], failed: [], rejected: [], sessionLost: false };
  // Ældste først, så vægthistorikken kommer i den rækkefølge den blev registreret.
  pending.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const entry of pending) {
    try {
      const status = await postEntry(entry);
      await removeFromQueue(entry.entryId);
      result.synced.push(entry.entryId);
      if (status) await saveStatusSnapshot(status);
    } catch (err) {
      if (err instanceof OfflineError) {
        // Stadig offline: behold køen urørt og prøv igen senere.
        await updateAttempt(entry.entryId, err.message);
        result.failed.push(entry.entryId);
        break;
      }

      if (err instanceof ApiError && err.isSessionLost) {
        // Sessionen er udløbet eller tilbagekaldt: stop, men bevar hele køen,
        // så den kan sendes efter et nyt QR-scan.
        await updateAttempt(entry.entryId, err.message);
        result.failed.push(entry.entryId);
        result.sessionLost = true;
        break;
      }

      if (err instanceof ApiError && err.status === 429) {
        // Rate limit: køen er intakt, men der skal ventes. Stop nu, så de øvrige
        // poster ikke også bliver afvist.
        await updateAttempt(entry.entryId, err.message);
        result.failed.push(entry.entryId);
        break;
      }

      if (err instanceof ApiError && !err.isRetryableLater) {
        // Permanent afvisning (fx 400/404/409): marker posten, så den ikke
        // blokerer resten af køen i det uendelige.
        await updateAttempt(entry.entryId, err.message, true);
        result.rejected.push(entry.entryId);
        continue;
      }

      await updateAttempt(entry.entryId, (err as Error).message);
      result.failed.push(entry.entryId);
    }
  }

  if (result.synced.length || result.rejected.length) emitSynced(result);

  return result;
}

async function postEntry(entry: QueuedEntry): Promise<StatusResponse | null> {
  const response = await api.post<{ status: StatusResponse }>(
    "/entries",
    {
      entryId: entry.entryId,
      action: entry.action,
      description: entry.description,
      weightKg: entry.weightKg,
      category: entry.category,
      notes: entry.notes,
      deviceLabel: entry.deviceLabel,
      occurredAt: entry.occurredAt,
      clientTimeZone: entry.clientTimeZone,
    },
    // Idempotent via EntryId, så gentagelse er sikker.
    { retry: true }
  );
  return response?.status ?? null;
}
