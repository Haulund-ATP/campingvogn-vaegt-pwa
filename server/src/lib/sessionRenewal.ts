// Glidende sessionsfornyelse: alle /api-kald med en session, der er over halvvejs
// gennem sin levetid, får en frisk sessionscookie med i svaret. Aktiv brug holder
// dermed sessionen i live, uden at en ubrugt session lever længere end sin TTL.

import type { RequestHandler } from "express";
import { loadEnv } from "./env.js";
import {
  SESSION_COOKIE_NAME,
  buildSessionCookie,
  parseCookies,
  renewSession,
  shouldRenewSession,
  verifySession,
} from "./session.js";
import { CSRF_COOKIE_NAME, buildCsrfCookie } from "./csrf.js";

// Udveksling og logout udsteder selv cookies — dem må vi ikke røre.
const SKIP_PATHS = new Set(["/session/exchange", "/session/admin/exchange", "/session/logout"]);

export const sessionRenewal: RequestHandler = (req, res, next) => {
  if (SKIP_PATHS.has(req.path)) return next();

  const cookies = parseCookies(req.headers.cookie ?? null);
  const rawSession = cookies[SESSION_COOKIE_NAME];
  if (!rawSession) return next();

  const env = loadEnv();
  const session = verifySession(rawSession, env.sessionSigningSecret);
  if (!session || !shouldRenewSession(session)) return next();

  const { token, payload, ttlSeconds } = renewSession(session, env.sessionSigningSecret);
  res.append("set-cookie", buildSessionCookie(token, ttlSeconds));
  // Ruterne kan læse det nye udløb her, så svar og cookie er enige.
  res.locals.renewedSession = payload;

  // CSRF-cookien beholder sin værdi (double-submit skal fortsat matche headeren),
  // men får samme nye levetid som sessionen.
  const csrfToken = cookies[CSRF_COOKIE_NAME];
  if (csrfToken) res.append("set-cookie", buildCsrfCookie(csrfToken, ttlSeconds));

  next();
};
