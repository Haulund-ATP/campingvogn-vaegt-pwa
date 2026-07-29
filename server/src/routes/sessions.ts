import { Router, type Request } from "express";
import { loadEnv } from "../lib/env.js";
import { verifyTokenAgainstHash } from "../lib/crypto.js";
import { isBlocked, recordFailedAttempt, hashClientIdentifier } from "../lib/rateLimit.js";
import {
  issuePublicSession,
  issueAdminSession,
  buildSessionCookie,
  buildLogoutCookie,
  PUBLIC_SESSION_TTL,
  ADMIN_SESSION_TTL,
  type SessionPayload,
} from "../lib/session.js";
import { getSessionFromRequest, isPublicSession } from "../lib/auth.js";
import { buildCsrfCookie, generateCsrfToken } from "../lib/csrf.js";
import { Problems } from "../lib/problemDetails.js";
import { isValidTripId } from "../lib/validation.js";
import { findTripById, getSystemRow } from "../lib/repository.js";
import { send } from "../lib/send.js";

function clientIdentifier(request: Request, pepper: string): string {
  const forwardedFor = (request.headers["x-forwarded-for"] as string | undefined) ?? request.ip ?? "unknown";
  const ip = forwardedFor.split(",")[0]?.trim() ?? "unknown";
  return hashClientIdentifier(ip, pepper);
}

export const sessionsRouter = Router();

sessionsRouter.post("/session/exchange", async (req, res) => {
  const env = loadEnv();
  const clientId = clientIdentifier(req, env.rateLimitPepper);

  if (isBlocked("publicTokenExchange", clientId)) {
    return send(res, Problems.tooManyRequests("For mange forsøg på token-udveksling. Prøv igen senere."));
  }

  const body = req.body as { tripId?: string; token?: string };
  if (!body.tripId || !isValidTripId(body.tripId) || !body.token) {
    recordFailedAttempt("publicTokenExchange", clientId);
    return send(res, Problems.badRequest("TripId eller token mangler eller er ugyldigt"));
  }

  const trip = await findTripById(env, body.tripId);
  if (!trip || !trip.isActive) {
    recordFailedAttempt("publicTokenExchange", clientId);
    return send(res, Problems.unauthorized("Ugyldigt trip eller token"));
  }

  if (trip.publicTokenExpires && new Date(trip.publicTokenExpires) < new Date()) {
    recordFailedAttempt("publicTokenExchange", clientId);
    return send(res, Problems.unauthorized("Token er udløbet"));
  }

  if (!verifyTokenAgainstHash(body.token, trip.publicTokenHash, env.tokenHashPepper)) {
    recordFailedAttempt("publicTokenExchange", clientId);
    return send(res, Problems.unauthorized("Ugyldigt trip eller token"));
  }

  const { token: sessionToken } = issuePublicSession(trip.tripId, trip.publicTokenVersion, env.sessionSigningSecret);
  const csrfToken = generateCsrfToken();

  send(res, {
    status: 200,
    jsonBody: { tripId: trip.tripId, displayName: trip.displayName },
    headers: {
      "set-cookie": [buildSessionCookie(sessionToken, PUBLIC_SESSION_TTL), buildCsrfCookie(csrfToken, PUBLIC_SESSION_TTL)],
    },
  });
});

sessionsRouter.post("/session/admin/exchange", async (req, res) => {
  const env = loadEnv();
  const clientId = clientIdentifier(req, env.rateLimitPepper);

  if (isBlocked("adminTokenExchange", clientId)) {
    return send(res, Problems.tooManyRequests("For mange forsøg på administrator-login. Prøv igen senere."));
  }

  const body = req.body as { token?: string };
  if (!body.token) {
    recordFailedAttempt("adminTokenExchange", clientId);
    return send(res, Problems.badRequest("Token mangler"));
  }

  const system = await getSystemRow(env);
  if (!system) {
    return send(res, Problems.internal("Systemet er ikke provisioneret korrekt"));
  }

  if (system.fields.GlobalAdminTokenExpires && new Date(system.fields.GlobalAdminTokenExpires) < new Date()) {
    recordFailedAttempt("adminTokenExchange", clientId);
    return send(res, Problems.unauthorized("Administratortoken er udløbet"));
  }

  if (!verifyTokenAgainstHash(body.token, system.fields.GlobalAdminTokenHash, env.tokenHashPepper)) {
    recordFailedAttempt("adminTokenExchange", clientId);
    return send(res, Problems.unauthorized("Ugyldigt administratortoken"));
  }

  const { token: sessionToken } = issueAdminSession(system.fields.GlobalAdminTokenVersion, env.sessionSigningSecret);
  const csrfToken = generateCsrfToken();

  send(res, {
    status: 200,
    jsonBody: { role: "system-admin" },
    headers: {
      "set-cookie": [buildSessionCookie(sessionToken, ADMIN_SESSION_TTL), buildCsrfCookie(csrfToken, ADMIN_SESSION_TTL)],
    },
  });
});

// Heartbeat: appen kalder denne med jævne mellemrum, mens den er åben. Svaret
// får en fornyet sessionscookie med af sessionRenewal-middlewaren, så aktiv brug
// holder sessionen i live. Verifikationen er ren HMAC uden Graph-kald, så pinget
// er billigt — tilbagekaldelse via tokenversion håndhæves fortsat på datakald.
sessionsRouter.post("/session/heartbeat", (req, res) => {
  const env = loadEnv();
  const session = getSessionFromRequest(req, env.sessionSigningSecret);
  if (!session) return send(res, Problems.unauthorized("Ingen gyldig session"));

  // Er sessionen netop blevet fornyet, er det det nye udløb der gælder.
  const effective = (res.locals.renewedSession as SessionPayload | undefined) ?? session;

  send(res, {
    status: 200,
    jsonBody: {
      role: effective.role,
      tripId: isPublicSession(effective) ? effective.tripId : null,
      expiresAt: new Date(effective.expiresAt).toISOString(),
    },
  });
});

sessionsRouter.post("/session/logout", (_req, res) => {
  send(res, { status: 204, jsonBody: undefined, headers: { "set-cookie": [buildLogoutCookie()] } });
});
