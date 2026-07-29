import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { loadEnv } from "../lib/env.js";
import { getSessionFromRequest, isPublicSession, isAdminSession, isPublicSessionStillValid } from "../lib/auth.js";
import { Problems } from "../lib/problemDetails.js";
import { findTripById, getAllDeltasForTrip, listEntriesForTrip } from "../lib/repository.js";
import { computeStatus } from "../shared/weight.js";
import { isValidTripId } from "../lib/validation.js";

app.http("status", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "status",
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const env = loadEnv();
    const session = getSessionFromRequest(request, env.sessionSigningSecret);

    let tripId: string;

    if (isPublicSession(session)) {
      if (!(await isPublicSessionStillValid(env, session))) {
        return Problems.unauthorized("Sessionen er ikke længere gyldig");
      }
      tripId = session.tripId;
    } else if (isAdminSession(session)) {
      const requested = request.query.get("tripId");
      if (!requested || !isValidTripId(requested)) {
        return Problems.badRequest("tripId query-parameter mangler eller er ugyldig for administrator");
      }
      tripId = requested;
    } else {
      return Problems.unauthorized("Gyldig session kræves");
    }

    const trip = await findTripById(env, tripId);
    if (!trip) return Problems.notFound("Trip findes ikke");

    const deltas = await getAllDeltasForTrip(env, tripId);
    const status = computeStatus(trip, deltas);
    const entries = await listEntriesForTrip(env, tripId, { top: 1 });

    return {
      status: 200,
      jsonBody: {
        tripId: trip.tripId,
        displayName: trip.displayName,
        ...status,
        calculatedAt: new Date().toISOString(),
        lastEntryAt: entries[0]?.occurredAt ?? null,
      },
    };
  },
});
