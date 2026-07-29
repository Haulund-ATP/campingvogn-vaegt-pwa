import { randomUUID } from "node:crypto";
import type { Env } from "./env.js";
import {
  createListItem,
  findSingleItem,
  getListItemById,
  queryListItems,
  updateListItem,
} from "./sharepoint.js";
import type { EntryCategory, EntryRecord, EntrySource, EntryType } from "../shared/types.js";

// --- Trips ---

export interface TripFields {
  Title: string; // TripId
  TripDisplayName: string;
  StartWeight: number;
  MaximumWeight: number;
  MaximumEntryWeight: number;
  IsActive: boolean;
  PublicTokenHash: string;
  PublicTokenVersion: number;
  PublicTokenExpires?: string;
  ConfiguredAt: string;
  ArchivedAt?: string;
  CreatedByAdminSessionId?: string;
}

export interface Trip {
  itemId: string;
  tripId: string;
  displayName: string;
  startWeightKg: number;
  maximumWeightKg: number;
  maximumEntryWeightKg: number;
  isActive: boolean;
  publicTokenHash: string;
  publicTokenVersion: number;
  publicTokenExpires?: string;
  configuredAt: string;
  archivedAt?: string;
}

function toTrip(itemId: string, fields: TripFields): Trip {
  return {
    itemId,
    tripId: fields.Title,
    displayName: fields.TripDisplayName,
    startWeightKg: fields.StartWeight,
    maximumWeightKg: fields.MaximumWeight,
    maximumEntryWeightKg: fields.MaximumEntryWeight,
    isActive: fields.IsActive,
    publicTokenHash: fields.PublicTokenHash,
    publicTokenVersion: fields.PublicTokenVersion,
    publicTokenExpires: fields.PublicTokenExpires,
    configuredAt: fields.ConfiguredAt,
    archivedAt: fields.ArchivedAt,
  };
}

export async function findTripById(env: Env, tripId: string): Promise<Trip | null> {
  const item = await findSingleItem<TripFields>(env, env.tripsListId, `fields/Title eq '${escapeOData(tripId)}'`);
  return item ? toTrip(item.id, item.fields) : null;
}

export async function listAllTrips(env: Env): Promise<Trip[]> {
  const items = await queryListItems<TripFields>(env, env.tripsListId, { orderby: "fields/ConfiguredAt desc" });
  return items.map((item) => toTrip(item.id, item.fields));
}

export async function createTrip(
  env: Env,
  input: {
    tripId: string;
    displayName: string;
    startWeightKg: number;
    maximumWeightKg: number;
    maximumEntryWeightKg: number;
    publicTokenHash: string;
    adminSessionId?: string;
  }
): Promise<Trip> {
  const fields: TripFields = {
    Title: input.tripId,
    TripDisplayName: input.displayName,
    StartWeight: input.startWeightKg,
    MaximumWeight: input.maximumWeightKg,
    MaximumEntryWeight: input.maximumEntryWeightKg,
    IsActive: true,
    PublicTokenHash: input.publicTokenHash,
    PublicTokenVersion: 1,
    ConfiguredAt: new Date().toISOString(),
    CreatedByAdminSessionId: input.adminSessionId,
  };
  const item = await createListItem<TripFields>(env, env.tripsListId, fields);
  return toTrip(item.id, item.fields);
}

export async function updateTrip(
  env: Env,
  itemId: string,
  fields: Partial<TripFields>
): Promise<void> {
  await updateListItem<TripFields>(env, env.tripsListId, itemId, fields);
}

// --- Entries ---

interface EntryFields {
  Title: string;
  WeightDelta: number;
  Category: EntryCategory;
  Notes?: string;
  EntryId: string;
  TripId: string;
  Source: EntrySource;
  DeviceLabel?: string;
  OccurredAt: string;
  ClientTimeZone: string;
  EntryType: EntryType;
  ReversesEntryId?: string;
  SyncedOffline: boolean;
}

function toEntry(fields: EntryFields): EntryRecord {
  return {
    entryId: fields.EntryId,
    tripId: fields.TripId,
    entryType: fields.EntryType,
    weightDeltaKg: fields.WeightDelta,
    description: fields.Title,
    category: fields.Category,
    notes: fields.Notes,
    deviceLabel: fields.DeviceLabel,
    occurredAt: fields.OccurredAt,
    clientTimeZone: fields.ClientTimeZone,
    source: fields.Source,
    reversesEntryId: fields.ReversesEntryId,
    createdAt: fields.OccurredAt,
  };
}

export async function findEntryByEntryId(env: Env, entryId: string): Promise<EntryRecord | null> {
  const item = await findSingleItem<EntryFields>(
    env,
    env.entriesListId,
    `fields/EntryId eq '${escapeOData(entryId)}'`
  );
  return item ? toEntry(item.fields) : null;
}

export async function listEntriesForTrip(
  env: Env,
  tripId: string,
  options: { top?: number } = {}
): Promise<EntryRecord[]> {
  const items = await queryListItems<EntryFields>(env, env.entriesListId, {
    filter: `fields/TripId eq '${escapeOData(tripId)}'`,
    orderby: "fields/OccurredAt desc",
    top: options.top ?? 100,
  });
  return items.map((item) => toEntry(item.fields));
}

export async function getAllDeltasForTrip(env: Env, tripId: string): Promise<number[]> {
  const items = await queryListItems<EntryFields>(env, env.entriesListId, {
    filter: `fields/TripId eq '${escapeOData(tripId)}'`,
    top: 2000,
  });
  return items.map((item) => item.fields.WeightDelta);
}

export async function createEntry(
  env: Env,
  input: {
    entryId: string;
    tripId: string;
    entryType: EntryType;
    weightDeltaKg: number;
    description: string;
    category: EntryCategory;
    notes?: string;
    deviceLabel?: string;
    occurredAt: string;
    clientTimeZone: string;
    source: EntrySource;
    reversesEntryId?: string;
  }
): Promise<EntryRecord> {
  const fields: EntryFields = {
    Title: input.description,
    WeightDelta: input.weightDeltaKg,
    Category: input.category,
    Notes: input.notes,
    EntryId: input.entryId,
    TripId: input.tripId,
    Source: input.source,
    DeviceLabel: input.deviceLabel,
    OccurredAt: input.occurredAt,
    ClientTimeZone: input.clientTimeZone,
    EntryType: input.entryType,
    ReversesEntryId: input.reversesEntryId,
    SyncedOffline: false,
  };
  const item = await createListItem<EntryFields>(env, env.entriesListId, fields);
  return toEntry(item.fields);
}

// --- System row ---

export interface SystemFields {
  Title: string;
  SchemaVersion: string;
  GlobalAdminTokenHash: string;
  GlobalAdminTokenVersion: number;
  GlobalAdminTokenExpires?: string;
  InstallationId: string;
  CreatedAt: string;
  UpdatedAt: string;
  PublicBaseUrl: string;
}

export interface SystemRow {
  itemId: string;
  fields: SystemFields;
}

export async function getSystemRow(env: Env): Promise<SystemRow | null> {
  const item = await findSingleItem<SystemFields>(env, env.systemListId, `fields/Title eq 'system'`);
  return item ? { itemId: item.id, fields: item.fields } : null;
}

export async function updateSystemRow(env: Env, itemId: string, fields: Partial<SystemFields>): Promise<void> {
  await updateListItem<SystemFields>(env, env.systemListId, itemId, { ...fields, UpdatedAt: new Date().toISOString() });
}

export function newInstallationId(): string {
  return randomUUID();
}

function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

// re-export for API layer convenience
export { getListItemById };
