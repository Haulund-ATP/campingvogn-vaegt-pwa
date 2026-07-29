import { Router } from "express";
import { loadEnv } from "../lib/env.js";
import { getSessionFromRequest, isPublicSession, isAdminSession, isPublicSessionStillValid } from "../lib/auth.js";
import { Problems } from "../lib/problemDetails.js";
import { findTripById, getAllDeltasForTrip, listEntriesForTrip } from "../lib/repository.js";
import { computeStatus } from "../shared/weight.js";
import { isValidTripId } from "../lib/validation.js";
import { send } from "../lib/send.js";

export const statusRouter = Router();

statusRouter.get("/status", async (req, res) => {
  const env = loadEnv();
  const session = getSessionFromRequest(req, env.sessionSigningSecret);

  let tripId: string;

  if (isPublicSession(session)) {
    if (!(await isPublicSessionStillValid(env, session))) {
      return send(res, Problems.unauthorized("Sessionen er ikke længere gyldig"));
    }
    tripId = session.tripId;
  } else if (isAdminSession(session)) {
    const requested = req.query.tripId;
    if (typeof requested !== "string" || !isValidTripId(requested)) {
      return send(res, Problems.badRequest("tripId query-parameter mangler eller er ugyldig for administrator"));
    }
    tripId = requested;
  } else {
    return send(res, Problems.unauthorized("Gyldig session kræves"));
  }

  const trip = await findTripById(env, tripId);
  if (!trip) return send(res, Problems.notFound("Trip findes ikke"));

  const deltas = await getAllDeltasForTrip(env, tripId);
  const status = computeStatus(trip, deltas);
  const entries = await listEntriesForTrip(env, tripId, { top: 1 });

  send(res, {
    status: 200,
    jsonBody: {
      tripId: trip.tripId,
      displayName: trip.displayName,
      ...status,
      calculatedAt: new Date().toISOString(),
      lastEntryAt: entries[0]?.occurredAt ?? null,
    },
  });
});
