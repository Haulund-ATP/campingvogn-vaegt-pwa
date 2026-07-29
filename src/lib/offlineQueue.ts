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
}

const DB_NAME = "campingvogn-vaegt";
const STORE_NAME = "queue";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE_NAME, { keyPath: "entryId" });
      },
    });
  }
  return dbPromise;
}

export async function enqueue(entry: QueuedEntry): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, entry);
}

export async function listQueued(tripId: string): Promise<QueuedEntry[]> {
  const db = await getDb();
  const all = (await db.getAll(STORE_NAME)) as QueuedEntry[];
  return all.filter((e) => e.tripId === tripId);
}

export async function removeFromQueue(entryId: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, entryId);
}

export async function updateAttempt(entryId: string, error: string): Promise<void> {
  const db = await getDb();
  const entry = (await db.get(STORE_NAME, entryId)) as QueuedEntry | undefined;
  if (!entry) return;
  entry.attempts += 1;
  entry.lastError = error;
  await db.put(STORE_NAME, entry);
}

export async function listAllQueued(): Promise<QueuedEntry[]> {
  const db = await getDb();
  return (await db.getAll(STORE_NAME)) as QueuedEntry[];
}
