import { api, ApiError } from "./apiClient";
import { listAllQueued, removeFromQueue, updateAttempt, type QueuedEntry } from "./offlineQueue";

export interface SyncResult {
  synced: string[];
  failed: string[];
}

export async function syncQueueForTrip(tripId: string): Promise<SyncResult> {
  const all = await listAllQueued();
  const forTrip = all.filter((e) => e.tripId === tripId);
  const synced: string[] = [];
  const failed: string[] = [];

  for (const entry of forTrip) {
    try {
      await postEntry(entry);
      await removeFromQueue(entry.entryId);
      synced.push(entry.entryId);
    } catch (err) {
      const message = err instanceof ApiError ? err.detail ?? err.title : "Netværksfejl";
      await updateAttempt(entry.entryId, message);
      failed.push(entry.entryId);
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        // Session udløbet: stop synkronisering, behold køen til ny gyldig session.
        break;
      }
    }
  }

  return { synced, failed };
}

async function postEntry(entry: QueuedEntry): Promise<void> {
  await api.post("/entries", {
    entryId: entry.entryId,
    action: entry.action,
    description: entry.description,
    weightKg: entry.weightKg,
    category: entry.category,
    notes: entry.notes,
    deviceLabel: entry.deviceLabel,
    occurredAt: entry.occurredAt,
    clientTimeZone: entry.clientTimeZone,
  });
}
