import { describe, expect, it } from "vitest";
import { computeStatus, kgToGrams, gramsToKg, parseUserWeightKg, validateEntryWeight } from "./weight";

describe("beregning", () => {
  const trip = { startWeightKg: 1250, maximumWeightKg: 1600 };

  it("egenvægt uden registreringer", () => {
    const status = computeStatus(trip, []);
    expect(status.currentWeightKg).toBe(1250);
    expect(status.availablePayloadKg).toBe(350);
    expect(status.remainingWeightKg).toBe(350);
    expect(status.isOverweight).toBe(false);
  });

  it("positiv registrering", () => {
    const status = computeStatus(trip, [40]);
    expect(status.currentWeightKg).toBe(1290);
    expect(status.remainingWeightKg).toBe(310);
  });

  it("negativ registrering", () => {
    const status = computeStatus(trip, [40, -10]);
    expect(status.currentWeightKg).toBe(1280);
  });

  it("kombinerede ændringer", () => {
    const status = computeStatus(trip, [100, -30, 5.5]);
    expect(status.currentWeightKg).toBeCloseTo(1325.5, 3);
  });

  it("præcis maksimalvægt", () => {
    const status = computeStatus(trip, [350]);
    expect(status.currentWeightKg).toBe(1600);
    expect(status.remainingWeightKg).toBe(0);
    expect(status.isOverweight).toBe(false);
  });

  it("overvægt", () => {
    const status = computeStatus(trip, [375]);
    expect(status.currentWeightKg).toBe(1625);
    expect(status.overweightKg).toBe(25);
    expect(status.isOverweight).toBe(true);
    expect(status.statusLevel).toBe("red");
  });

  it("procentvis udnyttelse", () => {
    const status = computeStatus(trip, [175]);
    expect(status.utilizationPercentage).toBe(50);
  });

  it("beregning i gram undgår flydende-komma-fejl", () => {
    const status = computeStatus({ startWeightKg: 0, maximumWeightKg: 1 }, [0.1, 0.2]);
    expect(status.currentWeightKg).toBe(0.3);
  });

  it("decimalafrunding til tre decimaler", () => {
    expect(gramsToKg(kgToGrams(12.345))).toBe(12.345);
  });
});

describe("input", () => {
  it("accepterer dansk komma", () => {
    expect(parseUserWeightKg("12,5")).toBe(12.5);
  });

  it("accepterer punktum", () => {
    expect(parseUserWeightKg("12.5")).toBe(12.5);
  });

  it("afviser nul", () => {
    expect(() => parseUserWeightKg("0")).toThrow();
  });

  it("afviser negativt input", () => {
    expect(() => parseUserWeightKg("-5")).toThrow();
  });

  it("afviser NaN", () => {
    expect(() => parseUserWeightKg("abc")).toThrow();
  });

  it("afviser Infinity", () => {
    expect(() => parseUserWeightKg("Infinity")).toThrow();
  });

  it("afviser for mange decimaler", () => {
    expect(() => parseUserWeightKg("12,3456")).toThrow();
  });

  it("afviser over MaximumEntryWeight", () => {
    expect(() => validateEntryWeight(60, 50)).toThrow();
  });

  it("accepterer inden for MaximumEntryWeight", () => {
    expect(() => validateEntryWeight(40, 50)).not.toThrow();
  });
});
