const TRIP_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RESERVED_TRIP_IDS = new Set(["admin", "api", "system", "assets", "static", "app"]);
const MAX_TRIP_ID_LENGTH = 60;

export function isValidTripId(tripId: string): boolean {
  if (typeof tripId !== "string") return false;
  if (tripId.length === 0 || tripId.length > MAX_TRIP_ID_LENGTH) return false;
  if (tripId.includes("..") || tripId.includes("/")) return false;
  if (!TRIP_ID_PATTERN.test(tripId)) return false;
  if (RESERVED_TRIP_IDS.has(tripId)) return false;
  return true;
}

export function slugifyTripName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_TRIP_ID_LENGTH);
}

const ENTRY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidEntryId(entryId: string): boolean {
  return typeof entryId === "string" && ENTRY_ID_PATTERN.test(entryId);
}

const VALID_CATEGORIES = new Set([
  "Campingudstyr",
  "Mad og drikke",
  "Vand",
  "Gas",
  "Tøj",
  "Personlige ting",
  "Køkken",
  "Elektronik",
  "Andet",
]);

export function isValidCategory(category: string): boolean {
  return VALID_CATEGORIES.has(category);
}

export function isValidWeightValue(kg: number): boolean {
  return Number.isFinite(kg) && kg >= 0.01;
}

export function isValidIsoTimestamp(value: string): boolean {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

export const MAX_TEXT_LENGTH = {
  description: 200,
  notes: 1000,
  deviceLabel: 60,
  displayName: 100,
} as const;

export function isReasonableLength(value: string | undefined, max: number): boolean {
  if (value === undefined) return true;
  return value.length <= max;
}
