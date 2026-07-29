export type EntryCategory =
  | "Campingudstyr"
  | "Mad og drikke"
  | "Vand"
  | "Gas"
  | "Tøj"
  | "Personlige ting"
  | "Køkken"
  | "Elektronik"
  | "Andet";

export type EntryType = "Addition" | "Removal" | "Reversal";
export type EntrySource = "PWA" | "Administration" | "Import";

export interface EntryInput {
  entryId: string;
  action: "add" | "remove";
  description: string;
  weightKg: number;
  category: EntryCategory;
  notes?: string;
  deviceLabel?: string;
  occurredAt: string;
  clientTimeZone: string;
}

export interface EntryRecord {
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
  createdAt: string;
}

export interface TripSummary {
  tripId: string;
  displayName: string;
  isActive: boolean;
  startWeightKg: number;
  maximumWeightKg: number;
  maximumEntryWeightKg: number;
  currentWeightKg: number;
  remainingWeightKg: number;
  overweightKg: number;
  entryCount: number;
  lastEntryAt: string | null;
  configuredAt: string;
  archivedAt: string | null;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  correlationId: string;
}
