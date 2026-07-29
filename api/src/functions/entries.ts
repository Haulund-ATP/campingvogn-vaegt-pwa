import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { loadEnv } from "../lib/env.js";
import {
  getSessionFromRequest,
  isPublicSession,
  isAdminSession,
  isPublicSessionStillValid,
  requireCsrf,
} from "../lib/auth.js";
import { Problems } from "../lib/problemDetails.js";
import {
  createEntry,
  findEntryByEntryId,
  findTripById,
  getAllDeltasForTrip,
  listEntriesForTrip,
} from "../lib/repository.js";
import { computeStatus, validateEntryWeight } from "../shared/weight.js";
import {
  isValidCategory,
  isValidEntryId,
  isValidIsoTimestamp,
  isValidTripId,
  isValidWeightValue,
  isReasonableLength,
  MAX_TEXT_LENGTH,
} from "../lib/validation.js";
import { isRateLimited } from "../lib/rateLimit.js";

const MAX_PAGE_SIZE = 100;

app.http("entriesList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "entries",
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const env = loadEnv();
    const session = getSessionFromRequest(request, env.sessionSigningSecret);

    let tripId: string;
    if (isPublicSession(session)) {
      if (!(await isPublicSessionStillValid(env, session))) return Problems.unauthorized("Session ugyldig");
      tripId = session.tripId;
    } else if (isAdminSession(session)) {
      const requested = request.query.get("tripId");
      if (!requested || !isValidTripId(requested)) return Problems.badRequest("tripId mangler");
      tripId = requested;
    } else {
      return Problems.unauthorized("Gyldig session kræves");
    }

    const requestedTop = Number(request.query.get("top") ?? "50");
    const top = Number.isFinite(requestedTop) ? Math.min(Math.max(requestedTop, 1), MAX_PAGE_SIZE) : 50;

    const category = request.query.get("category");
    if (category && !isValidCategory(category)) return Problems.badRequest("Ugyldig kategori");

    let entries = await listEntriesForTrip(env, tripId, { top });
    if (category) entries = entries.filter((e) => e.category === category);

    const entryType = request.query.get("entryType");
    if (entryType) entries = entries.filter((e) => e.entryType === entryType);

    return { status: 200, jsonBody: { entries } };
  },
});

app.http("entriesCreate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "entries",
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const env = loadEnv();
    const session = getSessionFromRequest(request, env.sessionSigningSecret);

    if (!requireCsrf(request)) return Problems.forbidden("Manglende eller ugyldig CSRF-beskyttelse");

    let tripId: string;
    let source: "PWA" | "Administration";
    if (isPublicSession(session)) {
      if (!(await isPublicSessionStillValid(env, session))) return Problems.unauthorized("Session ugyldig");
      tripId = session.tripId;
      source = "PWA";
    } else if (isAdminSession(session)) {
      const requested = request.query.get("tripId");
      if (!requested || !isValidTripId(requested)) return Problems.badRequest("tripId mangler");
      tripId = requested;
      source = "Administration";
    } else {
      return Problems.unauthorized("Gyldig session kræves");
    }

    if (isRateLimited("entriesPerTrip", tripId)) {
      return Problems.tooManyRequests("For mange registreringer for dette trip. Prøv igen senere.");
    }

    let body: {
      entryId?: string;
      action?: "add" | "remove";
      description?: string;
      weightKg?: number;
      category?: string;
      notes?: string;
      deviceLabel?: string;
      occurredAt?: string;
      clientTimeZone?: string;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Problems.badRequest("Ugyldig JSON-body");
    }

    if (!body.entryId || !isValidEntryId(body.entryId)) return Problems.badRequest("Ugyldigt EntryId");
    if (body.action !== "add" && body.action !== "remove") return Problems.badRequest("action skal være add eller remove");
    if (typeof body.weightKg !== "number" || !isValidWeightValue(body.weightKg)) {
      return Problems.badRequest("Ugyldig vægt");
    }
    if (!body.category || !isValidCategory(body.category)) return Problems.badRequest("Ugyldig kategori");
    if (!body.description || !isReasonableLength(body.description, MAX_TEXT_LENGTH.description)) {
      return Problems.badRequest("Ugyldig beskrivelse");
    }
    if (!isReasonableLength(body.notes, MAX_TEXT_LENGTH.notes)) return Problems.badRequest("Note er for lang");
    if (!isReasonableLength(body.deviceLabel, MAX_TEXT_LENGTH.deviceLabel)) {
      return Problems.badRequest("Enhedsnavn er for langt");
    }
    if (!body.occurredAt || !isValidIsoTimestamp(body.occurredAt)) return Problems.badRequest("Ugyldigt tidspunkt");
    if (!body.clientTimeZone) return Problems.badRequest("Tidszone mangler");

    const trip = await findTripById(env, tripId);
    if (!trip || !trip.isActive) return Problems.notFound("Trip findes ikke eller er arkiveret");

    try {
      validateEntryWeight(body.weightKg, trip.maximumEntryWeightKg);
    } catch (err) {
      return Problems.badRequest((err as Error).message);
    }

    const existing = await findEntryByEntryId(env, body.entryId);
    const signedWeightKg = body.action === "add" ? body.weightKg : -body.weightKg;

    if (existing) {
      const samePayload =
        existing.tripId === tripId &&
        existing.weightDeltaKg === signedWeightKg &&
        existing.description === body.description &&
        existing.category === body.category;
      if (!samePayload) {
        return Problems.conflict("EntryId findes allerede med et andet indhold");
      }
      const deltas = await getAllDeltasForTrip(env, tripId);
      const status = computeStatus(trip, deltas);
      return { status: 200, jsonBody: buildEntryResponse(trip, existing, status) };
    }

    const entry = await createEntry(env, {
      entryId: body.entryId,
      tripId,
      entryType: "Addition",
      weightDeltaKg: signedWeightKg,
      description: body.description,
      category: body.category as EntryCategoryLiteral,
      notes: body.notes,
      deviceLabel: body.deviceLabel,
      occurredAt: body.occurredAt,
      clientTimeZone: body.clientTimeZone,
      source,
    });

    const deltas = await getAllDeltasForTrip(env, tripId);
    const status = computeStatus(trip, deltas);

    return { status: 201, jsonBody: buildEntryResponse(trip, entry, status) };
  },
});

app.http("entriesReverse", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "entries/reverse",
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const env = loadEnv();
    const session = getSessionFromRequest(request, env.sessionSigningSecret);
    if (!requireCsrf(request)) return Problems.forbidden("Manglende eller ugyldig CSRF-beskyttelse");

    let tripId: string;
    let source: "PWA" | "Administration";
    if (isPublicSession(session)) {
      if (!(await isPublicSessionStillValid(env, session))) return Problems.unauthorized("Session ugyldig");
      tripId = session.tripId;
      source = "PWA";
    } else if (isAdminSession(session)) {
      const requested = request.query.get("tripId");
      if (!requested || !isValidTripId(requested)) return Problems.badRequest("tripId mangler");
      tripId = requested;
      source = "Administration";
    } else {
      return Problems.unauthorized("Gyldig session kræves");
    }

    let body: { entryId?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Problems.badRequest("Ugyldig JSON-body");
    }
    if (!body.entryId || !isValidEntryId(body.entryId)) return Problems.badRequest("Ugyldigt EntryId");

    const original = await findEntryByEntryId(env, body.entryId);
    if (!original) return Problems.notFound("Original registrering findes ikke");
    if (original.tripId !== tripId) return Problems.forbidden("Registreringen tilhører et andet trip");
    if (original.entryType === "Reversal") return Problems.conflict("En reversering kan ikke reverseres");

    const alreadyReversedId = `reversal-of:${original.entryId}`;
    const existingReversal = await findEntryByEntryId(env, alreadyReversedId);
    if (existingReversal) return Problems.conflict("Registreringen er allerede reverseret");

    const trip = await findTripById(env, tripId);
    if (!trip) return Problems.notFound("Trip findes ikke");

    const reversal = await createEntry(env, {
      entryId: alreadyReversedId,
      tripId,
      entryType: "Reversal",
      weightDeltaKg: -original.weightDeltaKg,
      description: `Reversering af: ${original.description}`,
      category: original.category,
      occurredAt: new Date().toISOString(),
      clientTimeZone: original.clientTimeZone,
      source,
      reversesEntryId: original.entryId,
    });

    const deltas = await getAllDeltasForTrip(env, tripId);
    const status = computeStatus(trip, deltas);

    return { status: 201, jsonBody: buildEntryResponse(trip, reversal, status) };
  },
});

type EntryCategoryLiteral = Parameters<typeof createEntry>[1]["category"];

function buildEntryResponse(
  trip: Awaited<ReturnType<typeof findTripById>>,
  entry: Awaited<ReturnType<typeof createEntry>>,
  status: ReturnType<typeof computeStatus>
) {
  return {
    trip: { tripId: trip!.tripId, displayName: trip!.displayName },
    entry: {
      entryId: entry.entryId,
      entryType: entry.entryType,
      weightDeltaKg: entry.weightDeltaKg,
      occurredAt: entry.occurredAt,
    },
    status,
  };
}
