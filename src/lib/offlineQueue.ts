import { openDB, type IDBPDatabase } from "idb";
import type { EntryCategory } from "../shared/types";

export interface QueuedEntry {
  entryId: string;
  tripId: string;
  action: "add" | "remove";
  description: string;
  weightKg: number;
  category: EntryCategory;
  notes?: string;
  deviceLabel?: string;
  occurredAt: string;
  clientTimeZone: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
  /** Sat når serveren har afvist posten permanent (4xx). Sendes ikke igen. */
  rejectedAt?: string;
}

const DB_NAME = "campingvogn-vaegt";
const DB_VERSION = 2;

export const QUEUE_STORE = "queue";
/** Nøgle/værdi til småting service workeren også skal kunne læse (fx CSRF-token). */
export const META_STORE = "meta";
/**
 * CSRF-tokenet spejles hertil, fordi service workeren ikke kan læse cookies på
 * alle platforme. Værdien er ikke en hemmelighed ud over cookien selv, som
 * bevidst er læsbar for JavaScript (double-submit-mønsteret).
 */
export const CSRF_META_KEY = "csrfToken";
/** Seneste kendte vægtstatus pr. trip, så fri vægt kan vises offline. */
export const STATUS_STORE = "status";

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          db.createObjectStore(QUEUE_STORE, { keyPath: "entryId" });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE);
        }
        if (!db.objectStoreNames.contains(STATUS_STORE)) {
          db.createObjectStore(STATUS_STORE, { keyPath: "tripId" });
        }
      },
    });
  }
  return dbPromise;
}

export async function enqueue(entry: QueuedEntry): Promise<void> {
  const db = await getDb();
  await db.put(QUEUE_STORE, entry);
}

export async function listQueued(tripId: string): Promise<QueuedEntry[]> {
  const all = await listAllQueued();
  return all.filter((e) => e.tripId === tripId);
}

export async function removeFromQueue(entryId: string): Promise<void> {
  const db = await getDb();
  await db.delete(QUEUE_STORE, entryId);
}

export async function updateAttempt(entryId: string, error: string, rejected = false): Promise<void> {
  const db = await getDb();
  const entry = (await db.get(QUEUE_STORE, entryId)) as QueuedEntry | undefined;
  if (!entry) return;
  entry.attempts += 1;
  entry.lastError = error;
  if (rejected) entry.rejectedAt = new Date().toISOString();
  await db.put(QUEUE_STORE, entry);
}

/** Alle poster der stadig skal sendes — afviste poster er ikke med. */
export async function listAllQueued(): Promise<QueuedEntry[]> {
  const db = await getDb();
  const all = (await db.getAll(QUEUE_STORE)) as QueuedEntry[];
  return all.filter((e) => !e.rejectedAt);
}

export async function listRejected(tripId: string): Promise<QueuedEntry[]> {
  const db = await getDb();
  const all = (await db.getAll(QUEUE_STORE)) as QueuedEntry[];
  return all.filter((e) => e.rejectedAt && e.tripId === tripId);
}

/** Summen af ventende ændringer i kg for et trip (fjern-poster tæller negativt). */
export async function pendingDeltaKg(tripId: string): Promise<number[]> {
  const queued = await listQueued(tripId);
  return queued.map((e) => (e.action === "add" ? e.weightKg : -e.weightKg));
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put(META_STORE, value, key);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  return (await db.get(META_STORE, key)) as T | undefined;
}
