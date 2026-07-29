import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { loadEnv } from "../lib/env.js";
import { verifyTokenAgainstHash } from "../lib/crypto.js";
import { isRateLimited, hashClientIdentifier } from "../lib/rateLimit.js";
import { issuePublicSession, issueAdminSession, buildSessionCookie, buildLogoutCookie, PUBLIC_SESSION_TTL, ADMIN_SESSION_TTL } from "../lib/session.js";
import { buildCsrfCookie, generateCsrfToken } from "../lib/csrf.js";
import { Problems } from "../lib/problemDetails.js";
import { isValidTripId } from "../lib/validation.js";
import { findTripById } from "../lib/repository.js";
import { getSystemRow } from "../lib/repository.js";

function clientIdentifier(request: HttpRequest, pepper: string): string {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "unknown";
  const ip = forwardedFor.split(",")[0]?.trim() ?? "unknown";
  return hashClientIdentifier(ip, pepper);
}

app.http("sessionExchange", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "session/exchange",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const env = loadEnv();
    const clientId = clientIdentifier(request, env.rateLimitPepper);

    if (isRateLimited("publicTokenExchange", clientId)) {
      return Problems.tooManyRequests("For mange forsøg på token-udveksling. Prøv igen senere.");
    }

    let body: { tripId?: string; token?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Problems.badRequest("Ugyldig JSON-body");
    }

    if (!body.tripId || !isValidTripId(body.tripId) || !body.token) {
      return Problems.badRequest("TripId eller token mangler eller er ugyldigt");
    }

    const trip = await findTripById(env, body.tripId);
    if (!trip || !trip.isActive) {
      context.warn(`session/exchange: ukendt eller inaktivt trip`);
      return Problems.unauthorized("Ugyldigt trip eller token");
    }

    if (trip.publicTokenExpires && new Date(trip.publicTokenExpires) < new Date()) {
      return Problems.unauthorized("Token er udløbet");
    }

    if (!verifyTokenAgainstHash(body.token, trip.publicTokenHash, env.tokenHashPepper)) {
      return Problems.unauthorized("Ugyldigt trip eller token");
    }

    const { token: sessionToken } = issuePublicSession(trip.tripId, trip.publicTokenVersion, env.sessionSigningSecret);
    const csrfToken = generateCsrfToken();

    return {
      status: 200,
      jsonBody: { tripId: trip.tripId, displayName: trip.displayName },
      headers: {
        "set-cookie": [buildSessionCookie(sessionToken, PUBLIC_SESSION_TTL), buildCsrfCookie(csrfToken, PUBLIC_SESSION_TTL)].join(", "),
      },
    };
  },
});

app.http("adminSessionExchange", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "session/admin/exchange",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const env = loadEnv();
    const clientId = clientIdentifier(request, env.rateLimitPepper);

    if (isRateLimited("adminTokenExchange", clientId)) {
      return Problems.tooManyRequests("For mange forsøg på administrator-login. Prøv igen senere.");
    }

    let body: { token?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Problems.badRequest("Ugyldig JSON-body");
    }

    if (!body.token) {
      return Problems.badRequest("Token mangler");
    }

    const system = await getSystemRow(env);
    if (!system) {
      context.error("session/admin/exchange: systemrække mangler");
      return Problems.internal("Systemet er ikke provisioneret korrekt");
    }

    if (
      system.fields.GlobalAdminTokenExpires &&
      new Date(system.fields.GlobalAdminTokenExpires) < new Date()
    ) {
      return Problems.unauthorized("Administratortoken er udløbet");
    }

    if (!verifyTokenAgainstHash(body.token, system.fields.GlobalAdminTokenHash, env.tokenHashPepper)) {
      return Problems.unauthorized("Ugyldigt administratortoken");
    }

    const { token: sessionToken } = issueAdminSession(system.fields.GlobalAdminTokenVersion, env.sessionSigningSecret);
    const csrfToken = generateCsrfToken();

    return {
      status: 200,
      jsonBody: { role: "system-admin" },
      headers: {
        "set-cookie": [buildSessionCookie(sessionToken, ADMIN_SESSION_TTL), buildCsrfCookie(csrfToken, ADMIN_SESSION_TTL)].join(", "),
      },
    };
  },
});

app.http("logout", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "session/logout",
  handler: async (): Promise<HttpResponseInit> => {
    return {
      status: 204,
      headers: { "set-cookie": buildLogoutCookie() },
    };
  },
});
