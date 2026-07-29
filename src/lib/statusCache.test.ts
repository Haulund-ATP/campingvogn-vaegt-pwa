import { describe, expect, it } from "vitest";
import { projectStatus } from "./statusCache";
import type { StatusResponse } from "../types";

// Egenvægt 1200 kg, tilladt 1500 kg ⇒ 300 kg lasteevne. 100 kg er registreret.
const base: StatusResponse = {
  tripId: "norge-2026",
  displayName: "Norge 2026",
  startWeightKg: 1200,
  maximumWeightKg: 1500,
  availablePayloadKg: 300,
  currentWeightKg: 1300,
  remainingWeightKg: 200,
  overweightKg: 0,
  utilizationPercentage: 33.33,
  isOverweight: false,
  statusLevel: "green",
  calculatedAt: "2026-07-01T10:00:00.000Z",
  lastEntryAt: "2026-07-01T09:55:00.000Z",
};

describe("projectStatus", () => {
  it("returnerer status uændret uden ventende poster", () => {
    expect(projectStatus(base, [])).toBe(base);
  });

  it("trækker ventende tilføjelser fra den frie vægt", () => {
    const projected = projectStatus(base, [50, 25]);
    expect(projected.currentWeightKg).toBe(1375);
    expect(projected.remainingWeightKg).toBe(125);
    expect(projected.isOverweight).toBe(false);
  });

  it("lægger ventende fjernelser til den frie vægt", () => {
    const projected = projectStatus(base, [-40]);
    expect(projected.currentWeightKg).toBe(1260);
    expect(projected.remainingWeightKg).toBe(240);
  });

  it("markerer overvægt når ventende poster overskrider grænsen", () => {
    const projected = projectStatus(base, [250]);
    expect(projected.isOverweight).toBe(true);
    expect(projected.overweightKg).toBe(50);
    expect(projected.statusLevel).toBe("red");
    expect(projected.remainingWeightKg).toBe(-50);
  });

  it("bevarer tripnavn og id fra grundstatussen", () => {
    const projected = projectStatus(base, [10]);
    expect(projected.tripId).toBe("norge-2026");
    expect(projected.displayName).toBe("Norge 2026");
  });

  it("regner i hele gram, så decimaler ikke driver", () => {
    const projected = projectStatus(base, [0.1, 0.2]);
    expect(projected.currentWeightKg).toBe(1300.3);
    expect(projected.remainingWeightKg).toBe(199.7);
  });
});
