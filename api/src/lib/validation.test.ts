import { describe, expect, it } from "vitest";
import { isValidTripId, slugifyTripName, isValidEntryId, isValidCategory } from "./validation.js";

describe("TripId", () => {
  it("accepterer gyldige TripId'er", () => {
    for (const id of ["norge-2026", "sverige-2027", "grundvejning", "sommerferie"]) {
      expect(isValidTripId(id)).toBe(true);
    }
  });

  it("afviser ugyldige TripId'er", () => {
    for (const id of ["Norge 2026", "../../admin", "norge/2026", "-norge", "norge-", "admin", ""]) {
      expect(isValidTripId(id)).toBe(false);
    }
  });

  it("slugifyTripName laver et URL-sikkert forslag", () => {
    expect(slugifyTripName("Norgesturen 2026!")).toBe("norgesturen-2026");
  });
});

describe("EntryId", () => {
  it("accepterer et gyldigt GUID", () => {
    expect(isValidEntryId("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
  });

  it("afviser et ugyldigt EntryId", () => {
    expect(isValidEntryId("ikke-et-guid")).toBe(false);
  });
});

describe("Kategori", () => {
  it("accepterer en kendt kategori", () => {
    expect(isValidCategory("Mad og drikke")).toBe(true);
  });

  it("afviser en ukendt kategori", () => {
    expect(isValidCategory("Ukendt")).toBe(false);
  });
});
