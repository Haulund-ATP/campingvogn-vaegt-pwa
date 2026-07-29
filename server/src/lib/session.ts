import { createHmac, randomUUID } from "node:crypto";
import { constantTimeEquals } from "./crypto.js";

export interface PublicSessionPayload {
  role: "public";
  tripId: string;
  publicTokenVersion: number;
  sessionId: string;
  expiresAt: number;
}

export interface AdminSessionPayload {
  role: "system-admin";
  globalAdminTokenVersion: number;
  sessionId: string;
  expiresAt: number;
}

export type SessionPayload = PublicSessionPayload | AdminSessionPayload;

const PUBLIC_SESSION_TTL_SECONDS = 60 * 60 * 4; // 4 timer
const ADMIN_SESSION_TTL_SECONDS = 60 * 30; // 30 minutter

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64, "utf8").digest("base64url");
}

export function issuePublicSession(
  tripId: string,
  publicTokenVersion: number,
  secret: string
): { token: string; payload: PublicSessionPayload } {
  const payload: PublicSessionPayload = {
    role: "public",
    tripId,
    publicTokenVersion,
    sessionId: randomUUID(),
    expiresAt: Date.now() + PUBLIC_SESSION_TTL_SECONDS * 1000,
  };
  return { token: encode(payload, secret), payload };
}

export function issueAdminSession(
  globalAdminTokenVersion: number,
  secret: string
): { token: string; payload: AdminSessionPayload } {
  const payload: AdminSessionPayload = {
    role: "system-admin",
    globalAdminTokenVersion,
    sessionId: randomUUID(),
    expiresAt: Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000,
  };
  return { token: encode(payload, secret), payload };
}

function encode(payload: SessionPayload, secret: string): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

export function verifySession(token: string | undefined, secret: string): SessionPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  const expectedSignature = sign(payloadB64, secret);
  if (!constantTimeEquals(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.expiresAt !== "number" || payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = "cv_session";

export function buildSessionCookie(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

export function buildLogoutCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export function parseCookies(cookieHeader: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    result[key] = decodeURIComponent(value);
  }
  return result;
}

export const PUBLIC_SESSION_TTL = PUBLIC_SESSION_TTL_SECONDS;
export const ADMIN_SESSION_TTL = ADMIN_SESSION_TTL_SECONDS;
