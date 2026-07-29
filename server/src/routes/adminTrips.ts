import { Router, type Request, type Response } from "express";
import { loadEnv } from "../lib/env.js";
import { getSessionFromRequest, isAdminSession, isAdminSessionStillValid, requireCsrf } from "../lib/auth.js";
import { Problems, type ApiResult } from "../lib/problemDetails.js";
import { createTrip, findTripById, getAllDeltasForTrip, listAllTrips, listEntriesForTrip, updateTrip } from "../lib/repository.js";
import { computeStatus } from "../shared/weight.js";
import { generateToken, hmacHex } from "../lib/crypto.js";
import { isValidTripId, isReasonableLength, MAX_TEXT_LENGTH } from "../lib/validation.js";
import { send } from "../lib/send.js";

async function requireAdmin(request: Request, env: ReturnType<typeof loadEnv>) {
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

export const adminTripsRouter = Router();

adminTripsRouter.get("/admin/trips", async (req, res) => {
  const env = loadEnv();
  const auth = await requireAdmin(req, env);
  if (!auth.ok) return send(res, auth.response);

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

  send(res, { status: 200, jsonBody: { trips: summaries } });
});

adminTripsRouter.post("/admin/trips", async (req, res) => {
  const env = loadEnv();
  const auth = await requireAdmin(req, env);
  if (!auth.ok) return send(res, auth.response);
  if (!requireCsrf(req)) return send(res, Problems.forbidden("Manglende eller ugyldig CSRF-beskyttelse"));

  const body = req.body as {
    tripId?: string;
    displayName?: string;
    startWeightKg?: number;
    maximumWeightKg?: number;
    maximumEntryWeightKg?: number;
  };

  if (!body.tripId || !isValidTripId(body.tripId)) return send(res, Problems.badRequest("Ugyldigt TripId"));
  if (!body.displayName || !isReasonableLength(body.displayName, MAX_TEXT_LENGTH.displayName)) {
    return send(res, Problems.badRequest("Ugyldigt visningsnavn"));
  }
  if (
    typeof body.startWeightKg !== "number" ||
    typeof body.maximumWeightKg !== "number" ||
    typeof body.maximumEntryWeightKg !== "number" ||
    body.startWeightKg < 0 ||
    body.maximumWeightKg <= body.startWeightKg ||
    body.maximumEntryWeightKg <= 0
  ) {
    return send(res, Problems.badRequest("Ugyldige vægtværdier"));
  }

  const existing = await findTripById(env, body.tripId);
  if (existing) return send(res, Problems.conflict("TripId findes allerede"));

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

  send(res, {
    status: 201,
    jsonBody: {
      tripId: trip.tripId,
      displayName: trip.displayName,
      publicToken,
      ...buildQrUrls(env.publicAppUrl, trip.tripId, publicToken),
      status: computeStatus(trip, []),
    },
  });
});

adminTripsRouter.get("/admin/trips/:tripId", async (req, res) => {
  const env = loadEnv();
  const auth = await requireAdmin(req, env);
  if (!auth.ok) return send(res, auth.response);

  const tripId = req.params.tripId;
  if (!isValidTripId(tripId)) return send(res, Problems.badRequest("Ugyldigt TripId"));

  const trip = await findTripById(env, tripId);
  if (!trip) return send(res, Problems.notFound("Trip findes ikke"));

  const deltas = await getAllDeltasForTrip(env, tripId);
  send(res, {
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
  });
});

adminTripsRouter.put("/admin/trips/:tripId", async (req, res) => {
  const env = loadEnv();
  const auth = await requireAdmin(req, env);
  if (!auth.ok) return send(res, auth.response);
  if (!requireCsrf(req)) return send(res, Problems.forbidden("Manglende eller ugyldig CSRF-beskyttelse"));

  const tripId = req.params.tripId;
  if (!isValidTripId(tripId)) return send(res, Problems.badRequest("Ugyldigt TripId"));

  const trip = await findTripById(env, tripId);
  if (!trip) return send(res, Problems.notFound("Trip findes ikke"));

  const body = req.body as {
    displayName?: string;
    startWeightKg?: number;
    maximumWeightKg?: number;
    maximumEntryWeightKg?: number;
    isActive?: boolean;
  };

  const deltasBefore = await getAllDeltasForTrip(env, tripId);
  const statusBefore = computeStatus(trip, deltasBefore);

  const nextStartWeightKg = body.startWeightKg ?? trip.startWeightKg;
  const nextMaximumWeightKg = body.maximumWeightKg ?? trip.maximumWeightKg;
  const nextMaximumEntryWeightKg = body.maximumEntryWeightKg ?? trip.maximumEntryWeightKg;

  if (nextMaximumWeightKg <= nextStartWeightKg || nextMaximumEntryWeightKg <= 0) {
    return send(res, Problems.badRequest("Ugyldige vægtværdier"));
  }

  await updateTrip(env, trip.itemId, {
    TripDisplayName: body.displayName ?? trip.displayName,
    StartWeight: nextStartWeightKg,
    MaximumWeight: nextMaximumWeightKg,
    MaximumEntryWeight: nextMaximumEntryWeightKg,
    IsActive: body.isActive ?? trip.isActive,
  });

  const updatedTrip = { ...trip, startWeightKg: nextStartWeightKg, maximumWeightKg: nextMaximumWeightKg };
  const statusAfter = computeStatus(updatedTrip, deltasBefore);

  send(res, { status: 200, jsonBody: { before: statusBefore, after: statusAfter } });
});

adminTripsRouter.post("/admin/trips/:tripId/archive", (req, res) => setTripActiveState(req, res, false));
adminTripsRouter.post("/admin/trips/:tripId/activate", (req, res) => setTripActiveState(req, res, true));

async function setTripActiveState(req: Request, res: Response, isActive: boolean) {
  const env = loadEnv();
  const auth = await requireAdmin(req, env);
  if (!auth.ok) return send(res, auth.response);
  if (!requireCsrf(req)) return send(res, Problems.forbidden("Manglende eller ugyldig CSRF-beskyttelse"));

  const tripId = req.params.tripId;
  if (!isValidTripId(tripId)) return send(res, Problems.badRequest("Ugyldigt TripId"));

  const trip = await findTripById(env, tripId);
  if (!trip) return send(res, Problems.notFound("Trip findes ikke"));

  await updateTrip(env, trip.itemId, {
    IsActive: isActive,
    ArchivedAt: isActive ? undefined : new Date().toISOString(),
  });

  const result: ApiResult = { status: 200, jsonBody: { tripId: trip.tripId, isActive } };
  send(res, result);
}

adminTripsRouter.post("/admin/trips/:tripId/public-token/rotate", async (req, res) => {
  const env = loadEnv();
  const auth = await requireAdmin(req, env);
  if (!auth.ok) return send(res, auth.response);
  if (!requireCsrf(req)) return send(res, Problems.forbidden("Manglende eller ugyldig CSRF-beskyttelse"));

  const tripId = req.params.tripId;
  if (!isValidTripId(tripId)) return send(res, Problems.badRequest("Ugyldigt TripId"));

  const trip = await findTripById(env, tripId);
  if (!trip) return send(res, Problems.notFound("Trip findes ikke"));

  const publicToken = generateToken();
  const publicTokenHash = hmacHex(publicToken, env.tokenHashPepper);
  const nextVersion = trip.publicTokenVersion + 1;

  await updateTrip(env, trip.itemId, {
    PublicTokenHash: publicTokenHash,
    PublicTokenVersion: nextVersion,
  });

  send(res, {
    status: 200,
    jsonBody: {
      tripId: trip.tripId,
      publicToken,
      publicTokenVersion: nextVersion,
      ...buildQrUrls(env.publicAppUrl, trip.tripId, publicToken),
    },
  });
});
