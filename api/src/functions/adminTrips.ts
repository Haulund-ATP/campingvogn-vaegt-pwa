import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { loadEnv } from "../lib/env.js";
import { getSessionFromRequest, isAdminSession, isAdminSessionStillValid, requireCsrf } from "../lib/auth.js";
import { Problems } from "../lib/problemDetails.js";
import { createTrip, findTripById, getAllDeltasForTrip, listAllTrips, listEntriesForTrip, updateTrip } from "../lib/repository.js";
import { computeStatus } from "../shared/weight.js";
import { generateToken, hmacHex } from "../lib/crypto.js";
import { isValidTripId, isReasonableLength, MAX_TEXT_LENGTH } from "../lib/validation.js";

async function requireAdmin(request: HttpRequest, env: ReturnType<typeof loadEnv>) {
  const session = getSessionFromRequest(request, env.sessionSigningSecret);
  if (!isAdminSession(session)) return { ok: false as const, response: Problems.unauthorized("Administratorsession kræves") };
  if (!(await isAdminSessionStillValid(env, session))) {
    return { ok: false as const, response: Problems.unauthorized("Administratorsessionen er ikke længere gyldig") };
  }
  return { ok: true as const, session };
}

function buildQrUrls(publicAppUrl: string, tripId: string, publicToken: string) {
  return {
    addWeightUrl: `${publicAppUrl}/#action=add&trip=${encodeURIComponent(tripId)}&token=${publicToken}`,
    removeWeightUrl: `${publicAppUrl}/#action=remove&trip=${encodeURIComponent(tripId)}&token=${publicToken}`,
  };
}

app.http("adminTripsList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "admin/trips",
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const env = loadEnv();
    const auth = await requireAdmin(request, env);
    if (!auth.ok) return auth.response;

    const trips = await listAllTrips(env);
    const summaries = await Promise.all(
      trips.map(async (trip) => {
        const deltas = await getAllDeltasForTrip(env, trip.tripId);
        const status = computeStatus(trip, deltas);
        const entries = await listEntriesForTrip(env, trip.tripId, { top: 1 });
        return {
          tripId: trip.tripId,
          displayName: trip.displayName,
          isActive: trip.isActive,
          maximumEntryWeightKg: trip.maximumEntryWeightKg,
          configuredAt: trip.configuredAt,
          archivedAt: trip.archivedAt ?? null,
          ...status,
          entryCount: entries.length,
          lastEntryAt: entries[0]?.occurredAt ?? null,
        };
      })
    );

    return { status: 200, jsonBody: { trips: summaries } };
  },
});

app.http("adminTripsCreate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "admin/trips",
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const env = loadEnv();
    const auth = await requireAdmin(request, env);
    if (!auth.ok) return auth.response;
    if (!requireCsrf(request)) return Problems.forbidden("Manglende eller ugyldig CSRF-beskyttelse");

    let body: {
      tripId?: string;
      displayName?: string;
      startWeightKg?: number;
      maximumWeightKg?: number;
      maximumEntryWeightKg?: number;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Problems.badRequest("Ugyldig JSON-body");
    }

    if (!body.tripId || !isValidTripId(body.tripId)) return Problems.badRequest("Ugyldigt TripId");
    if (!body.displayName || !isReasonableLength(body.displayName, MAX_TEXT_LENGTH.displayName)) {
      return Problems.badRequest("Ugyldigt visningsnavn");
    }
    if (
      typeof body.startWeightKg !== "number" ||
      typeof body.maximumWeightKg !== "number" ||
      typeof body.maximumEntryWeightKg !== "number" ||
      body.startWeightKg < 0 ||
      body.maximumWeightKg <= body.startWeightKg ||
      body.maximumEntryWeightKg <= 0
    ) {
      return Problems.badRequest("Ugyldige vægtværdier");
    }

    const existing = await findTripById(env, body.tripId);
    if (existing) return Problems.conflict("TripId findes allerede");

    const publicToken = generateToken();
    const publicTokenHash = hmacHex(publicToken, env.tokenHashPepper);

    const trip = await createTrip(env, {
      tripId: body.tripId,
      displayName: body.displayName,
      startWeightKg: body.startWeightKg,
      maximumWeightKg: body.maximumWeightKg,
      maximumEntryWeightKg: body.maximumEntryWeightKg,
      publicTokenHash,
      adminSessionId: auth.session.sessionId,
    });

    return {
      status: 201,
      jsonBody: {
        tripId: trip.tripId,
        displayName: trip.displayName,
        publicToken,
        ...buildQrUrls(env.publicAppUrl, trip.tripId, publicToken),
        status: computeStatus(trip, []),
      },
    };
  },
});

app.http("adminTripGet", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "admin/trips/{tripId}",
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const env = loadEnv();
    const auth = await requireAdmin(request, env);
    if (!auth.ok) return auth.response;

    const tripId = request.params.tripId;
    if (!tripId || !isValidTripId(tripId)) return Problems.badRequest("Ugyldigt TripId");

    const trip = await findTripById(env, tripId);
    if (!trip) return Problems.notFound("Trip findes ikke");

    const deltas = await getAllDeltasForTrip(env, tripId);
    return {
      status: 200,
      jsonBody: {
        tripId: trip.tripId,
        displayName: trip.displayName,
        isActive: trip.isActive,
        startWeightKg: trip.startWeightKg,
        maximumWeightKg: trip.maximumWeightKg,
        maximumEntryWeightKg: trip.maximumEntryWeightKg,
        configuredAt: trip.configuredAt,
        archivedAt: trip.archivedAt ?? null,
        status: computeStatus(trip, deltas),
      },
    };
  },
});

app.http("adminTripUpdate", {
  methods: ["PUT"],
  authLevel: "anonymous",
  route: "admin/trips/{tripId}",
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const env = loadEnv();
    const auth = await requireAdmin(request, env);
    if (!auth.ok) return auth.response;
    if (!requireCsrf(request)) return Problems.forbidden("Manglende eller ugyldig CSRF-beskyttelse");

    const tripId = request.params.tripId;
    if (!tripId || !isValidTripId(tripId)) return Problems.badRequest("Ugyldigt TripId");

    const trip = await findTripById(env, tripId);
    if (!trip) return Problems.notFound("Trip findes ikke");

    let body: {
      displayName?: string;
      startWeightKg?: number;
      maximumWeightKg?: number;
      maximumEntryWeightKg?: number;
      isActive?: boolean;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Problems.badRequest("Ugyldig JSON-body");
    }

    const deltasBefore = await getAllDeltasForTrip(env, tripId);
    const statusBefore = computeStatus(trip, deltasBefore);

    const nextStartWeightKg = body.startWeightKg ?? trip.startWeightKg;
    const nextMaximumWeightKg = body.maximumWeightKg ?? trip.maximumWeightKg;
    const nextMaximumEntryWeightKg = body.maximumEntryWeightKg ?? trip.maximumEntryWeightKg;

    if (nextMaximumWeightKg <= nextStartWeightKg || nextMaximumEntryWeightKg <= 0) {
      return Problems.badRequest("Ugyldige vægtværdier");
    }

    await updateTrip(env, trip.itemId, {
      DisplayName: body.displayName ?? trip.displayName,
      StartWeight: nextStartWeightKg,
      MaximumWeight: nextMaximumWeightKg,
      MaximumEntryWeight: nextMaximumEntryWeightKg,
      IsActive: body.isActive ?? trip.isActive,
    });

    const updatedTrip = { ...trip, startWeightKg: nextStartWeightKg, maximumWeightKg: nextMaximumWeightKg };
    const statusAfter = computeStatus(updatedTrip, deltasBefore);

    return { status: 200, jsonBody: { before: statusBefore, after: statusAfter } };
  },
});

app.http("adminTripArchive", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "admin/trips/{tripId}/archive",
  handler: (request) => setTripActiveState(request, false),
});

app.http("adminTripActivate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "admin/trips/{tripId}/activate",
  handler: (request) => setTripActiveState(request, true),
});

async function setTripActiveState(request: HttpRequest, isActive: boolean): Promise<HttpResponseInit> {
  const env = loadEnv();
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  if (!requireCsrf(request)) return Problems.forbidden("Manglende eller ugyldig CSRF-beskyttelse");

  const tripId = request.params.tripId;
  if (!tripId || !isValidTripId(tripId)) return Problems.badRequest("Ugyldigt TripId");

  const trip = await findTripById(env, tripId);
  if (!trip) return Problems.notFound("Trip findes ikke");

  await updateTrip(env, trip.itemId, {
    IsActive: isActive,
    ArchivedAt: isActive ? undefined : new Date().toISOString(),
  });

  return { status: 200, jsonBody: { tripId: trip.tripId, isActive } };
}

app.http("adminTripTokenRotate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "admin/trips/{tripId}/public-token/rotate",
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const env = loadEnv();
    const auth = await requireAdmin(request, env);
    if (!auth.ok) return auth.response;
    if (!requireCsrf(request)) return Problems.forbidden("Manglende eller ugyldig CSRF-beskyttelse");

    const tripId = request.params.tripId;
    if (!tripId || !isValidTripId(tripId)) return Problems.badRequest("Ugyldigt TripId");

    const trip = await findTripById(env, tripId);
    if (!trip) return Problems.notFound("Trip findes ikke");

    const publicToken = generateToken();
    const publicTokenHash = hmacHex(publicToken, env.tokenHashPepper);
    const nextVersion = trip.publicTokenVersion + 1;

    await updateTrip(env, trip.itemId, {
      PublicTokenHash: publicTokenHash,
      PublicTokenVersion: nextVersion,
    });

    return {
      status: 200,
      jsonBody: {
        tripId: trip.tripId,
        publicToken,
        publicTokenVersion: nextVersion,
        ...buildQrUrls(env.publicAppUrl, trip.tripId, publicToken),
      },
    };
  },
});
