export type { EntryCategory, EntryType, EntrySource } from "./shared/types";
export type { WeightStatus } from "./shared/weight";

export interface StatusResponse {
  tripId: string;
  displayName: string;
  startWeightKg: number;
  maximumWeightKg: number;
  availablePayloadKg: number;
  currentWeightKg: number;
  remainingWeightKg: number;
  overweightKg: number;
  utilizationPercentage: number;
  isOverweight: boolean;
  statusLevel: "green" | "yellow" | "red";
  calculatedAt: string;
  lastEntryAt: string | null;
}

export interface TripSummaryResponse {
  tripId: string;
  displayName: string;
  isActive: boolean;
  maximumEntryWeightKg: number;
  configuredAt: string;
  archivedAt: string | null;
  entryCount: number;
  lastEntryAt: string | null;
  startWeightKg: number;
  maximumWeightKg: number;
  availablePayloadKg: number;
  currentWeightKg: number;
  remainingWeightKg: number;
  overweightKg: number;
  utilizationPercentage: number;
  isOverweight: boolean;
  statusLevel: "green" | "yellow" | "red";
}
