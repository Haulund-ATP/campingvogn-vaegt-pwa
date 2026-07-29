import type { HttpRequest } from "@azure/functions";
import { parseCookies, verifySession, SESSION_COOKIE_NAME, type AdminSessionPayload, type PublicSessionPayload } from "./session.js";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, verifyCsrf } from "./csrf.js";
import { getSystemRow } from "./repository.js";
import type { Env } from "./env.js";

export function getSessionFromRequest(request: HttpRequest, secret: string) {
  const cookies = parseCookies(request.headers.get("cookie"));
  return verifySession(cookies[SESSION_COOKIE_NAME], secret);
}

export function requireCsrf(request: HttpRequest): boolean {
  const cookies = parseCookies(request.headers.get("cookie"));
  return verifyCsrf(cookies[CSRF_COOKIE_NAME], request.headers.get(CSRF_HEADER_NAME));
}

export function isPublicSession(payload: ReturnType<typeof verifySession>): payload is PublicSessionPayload {
  return !!payload && payload.role === "public";
}

export function isAdminSession(payload: ReturnType<typeof verifySession>): payload is AdminSessionPayload {
  return !!payload && payload.role === "system-admin";
}

export async function isAdminSessionStillValid(env: Env, payload: AdminSessionPayload): Promise<boolean> {
  const system = await getSystemRow(env);
  if (!system) return false;
  return system.fields.GlobalAdminTokenVersion === payload.globalAdminTokenVersion;
}

export async function isPublicSessionStillValid(
  env: Env,
  payload: PublicSessionPayload
): Promise<boolean> {
  const { findTripById } = await import("./repository.js");
  const trip = await findTripById(env, payload.tripId);
  if (!trip || !trip.isActive) return false;
  return trip.publicTokenVersion === payload.publicTokenVersion;
}
