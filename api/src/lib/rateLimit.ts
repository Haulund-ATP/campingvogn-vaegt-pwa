// Bounded in-memory rate limiting pr. Function-instans.
// Ikke en absolut distribueret beskyttelse i serverless drift (flere instanser
// har hver deres tælling) — dokumenteret i docs/security.md.

import { createHmac } from "node:crypto";

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5000;

function checkAndIncrement(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart > windowMs) {
    if (buckets.size >= MAX_BUCKETS) {
      pruneExpired(windowMs);
    }
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (existing.count >= maxAttempts) {
    return false;
  }

  existing.count += 1;
  return true;
}

function pruneExpired(windowMs: number): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > windowMs) {
      buckets.delete(key);
    }
  }
}

export const RATE_LIMITS = {
  publicTokenExchange: { maxAttempts: 5, windowMs: 5 * 60 * 1000 },
  adminTokenExchange: { maxAttempts: 3, windowMs: 10 * 60 * 1000 },
  entriesPerTrip: { maxAttempts: 20, windowMs: 10 * 60 * 1000 },
} as const;

export function isRateLimited(
  scope: keyof typeof RATE_LIMITS,
  identifier: string
): boolean {
  const { maxAttempts, windowMs } = RATE_LIMITS[scope];
  return !checkAndIncrement(`${scope}:${identifier}`, maxAttempts, windowMs);
}

export function hashClientIdentifier(ip: string, pepper: string): string {
  const dateSalt = new Date().toISOString().slice(0, 10);
  return createHmac("sha256", pepper).update(`${ip}:${dateSalt}`).digest("hex");
}
