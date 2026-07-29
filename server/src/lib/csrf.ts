import { randomBytes } from "node:crypto";
import { constantTimeEquals } from "./crypto.js";

export const CSRF_COOKIE_NAME = "cv_csrf";
export const CSRF_HEADER_NAME = "x-cv-csrf";

export function generateCsrfToken(): string {
  return randomBytes(24).toString("base64url");
}

export function buildCsrfCookie(token: string, maxAgeSeconds: number): string {
  // Ikke HttpOnly: frontend skal kunne læse den og sende den som header (double-submit).
  return `${CSRF_COOKIE_NAME}=${token}; Path=/; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

export function verifyCsrf(cookieValue: string | undefined, headerValue: string | null): boolean {
  if (!cookieValue || !headerValue) return false;
  return constantTimeEquals(cookieValue, headerValue);
}
