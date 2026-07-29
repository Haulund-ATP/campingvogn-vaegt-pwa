import { Router } from "express";
import { loadEnv } from "../lib/env.js";
import { getSessionFromRequest, isPublicSession, isAdminSession, isPublicSessionStillValid, requireCsrf } from "../lib/auth.js";
import { Problems } from "../lib/problemDetails.js";
import { createEntry, findEntryByEntryId, findTripById, getAllDeltasForTrip, listEntriesForTrip } from "../lib/repository.js";
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
import { send } from "../lib/send.js";

const MAX_PAGE_SIZE = 100;

export const entriesRouter = Router();

entriesRouter.get("/entries", async (req, res) => {
  const env = loadEnv();
  const session = getSessionFromRequest(req, env.sessionSigningSecret);

  let tripId: string;
  if (isPublicSession(session)) {
    if (!(await isPublicSessionStillValid(env, session))) return send(res, Problems.unauthorized("Session ugyldig"));
    tripId = session.tripId;
  } else if (isAdminSession(session)) {
    const requested = req.query.tripId;
    if (typeof requested !== "string" || !isValidTripId(requested)) return send(res, Problems.badRequest("tripId mangler"));
    tripId = requested;
  } else {
    return send(res, Problems.unauthorized("Gyldig session kræves"));
  }

  const requestedTop = Number(req.query.top ?? "50");
  const top = Number.isFinite(requestedTop) ? Math.min(Math.max(requestedTop, 1), MAX_PAGE_SIZE) : 50;

  const category = req.query.category;
  if (category && (typeof category !== "string" || !isValidCategory(category))) {
    return send(res, Problems.badRequest("Ugyldig kategori"));
  }

  let entries = await listEntriesForTrip(env, tripId, { top });
  if (typeof category === "string") entries = entries.filter((e) => e.category === category);

  const entryType = req.query.entryType;
  if (typeof entryType === "string") entries = entries.filter((e) => e.entryType === entryType);

  send(res, { status: 200, jsonBody: { entries } });
});

entriesRouter.post("/entries", async (req, res) => {
  const env = loadEnv();
  const session = getSessionFromRequest(req, env.sessionSigningSecret);

  if (!requireCsrf(req)) return send(res, Problems.forbidden("Manglende eller ugyldig CSRF-beskyttelse"));

  let tripId: string;
  let source: "PWA" | "Administration";
  if (isPublicSession(session)) {
    if (!(await isPublicSessionStillValid(env, session))) return send(res, Problems.unauthorized("Session ugyldig"));
    tripId = session.tripId;
    source = "PWA";
  } else if (isAdminSession(session)) {
    const requested = req.query.tripId;
    if (typeof requested !== "string" || !isValidTripId(requested)) return send(res, Problems.badRequest("tripId mangler"));
    tripId = requested;
    source = "Administration";
  } else {
    return send(res, Problems.unauthorized("Gyldig session kræves"));
  }

  if (isRateLimited("entriesPerTrip", tripId)) {
    return send(res, Problems.tooManyRequests("For mange registreringer for dette trip. Prøv igen senere."));
  }

  const body = req.body as {
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

  if (!body.entryId || !isValidEntryId(body.entryId)) return send(res, Problems.badRequest("Ugyldigt EntryId"));
  if (body.action !== "add" && body.action !== "remove") {
    return send(res, Problems.badRequest("action skal være add eller remove"));
  }
  if (typeof body.weightKg !== "number" || !isValidWeightValue(body.weightKg)) {
    return send(res, Problems.badRequest("Ugyldig vægt"));
  }
  if (!body.category || !isValidCategory(body.category)) return send(res, Problems.badRequest("Ugyldig kategori"));
  if (!body.description || !isReasonableLength(body.description, MAX_TEXT_LENGTH.description)) {
    return send(res, Problems.badRequest("Ugyldig beskrivelse"));
  }
  if (!isReasonableLength(body.notes, MAX_TEXT_LENGTH.notes)) return send(res, Problems.badRequest("Note er for lang"));
  if (!isReasonableLength(body.deviceLabel, MAX_TEXT_LENGTH.deviceLabel)) {
    return send(res, Problems.badRequest("Enhedsnavn er for langt"));
  }
  if (!body.occurredAt || !isValidIsoTimestamp(body.occurredAt)) return send(res, Problems.badRequest("Ugyldigt tidspunkt"));
  if (!body.clientTimeZone) return send(res, Problems.badRequest("Tidszone mangler"));

  const trip = await findTripById(env, tripId);
  if (!trip || !trip.isActive) return send(res, Problems.notFound("Trip findes ikke eller er arkiveret"));

  try {
    validateEntryWeight(body.weightKg, trip.maximumEntryWeightKg);
  } catch (err) {
    return send(res, Problems.badRequest((err as Error).message));
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
      return send(res, Problems.conflict("EntryId findes allerede med et andet indhold"));
    }
    const deltas = await getAllDeltasForTrip(env, tripId);
    const status = computeStatus(trip, deltas);
    return send(res, { status: 200, jsonBody: buildEntryResponse(trip, existing, status) });
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

  send(res, { status: 201, jsonBody: buildEntryResponse(trip, entry, status) });
});

entriesRouter.post("/entries/reverse", async (req, res) => {
  const env = loadEnv();
  const session = getSessionFromRequest(req, env.sessionSigningSecret);
  if (!requireCsrf(req)) return send(res, Problems.forbidden("Manglende eller ugyldig CSRF-beskyttelse"));

  let tripId: string;
  let source: "PWA" | "Administration";
  if (isPublicSession(session)) {
    if (!(await isPublicSessionStillValid(env, session))) return send(res, Problems.unauthorized("Session ugyldig"));
    tripId = session.tripId;
    source = "PWA";
  } else if (isAdminSession(session)) {
    const requested = req.query.tripId;
    if (typeof requested !== "string" || !isValidTripId(requested)) return send(res, Problems.badRequest("tripId mangler"));
    tripId = requested;
    source = "Administration";
  } else {
    return send(res, Problems.unauthorized("Gyldig session kræves"));
  }

  const body = req.body as { entryId?: string };
  if (!body.entryId || !isValidEntryId(body.entryId)) return send(res, Problems.badRequest("Ugyldigt EntryId"));

  const original = await findEntryByEntryId(env, body.entryId);
  if (!original) return send(res, Problems.notFound("Original registrering findes ikke"));
  if (original.tripId !== tripId) return send(res, Problems.forbidden("Registreringen tilhører et andet trip"));
  if (original.entryType === "Reversal") return send(res, Problems.conflict("En reversering kan ikke reverseres"));

  const alreadyReversedId = `reversal-of:${original.entryId}`;
  const existingReversal = await findEntryByEntryId(env, alreadyReversedId);
  if (existingReversal) return send(res, Problems.conflict("Registreringen er allerede reverseret"));

  const trip = await findTripById(env, tripId);
  if (!trip) return send(res, Problems.notFound("Trip findes ikke"));

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

  send(res, { status: 201, jsonBody: buildEntryResponse(trip, reversal, status) });
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
