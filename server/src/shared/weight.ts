// Autoritativ vægtberegning. Alle beregninger sker i heltal gram for at undgå
// flydende-komma-fejl; kg vises kun i input/output.

export interface TripConfig {
  startWeightKg: number;
  maximumWeightKg: number;
}

export interface WeightStatus {
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

export function kgToGrams(kg: number): number {
  return Math.round(kg * 1000);
}

export function gramsToKg(grams: number): number {
  return Math.round(grams) / 1000;
}

export function sumDeltaGrams(weightDeltaKgList: number[]): number {
  return weightDeltaKgList.reduce((sum, kg) => sum + kgToGrams(kg), 0);
}

export function computeStatus(trip: TripConfig, weightDeltaKgList: number[]): WeightStatus {
  const startGrams = kgToGrams(trip.startWeightKg);
  const maxGrams = kgToGrams(trip.maximumWeightKg);
  const deltaGrams = sumDeltaGrams(weightDeltaKgList);

  const currentGrams = startGrams + deltaGrams;
  const availablePayloadGrams = maxGrams - startGrams;
  const remainingGrams = maxGrams - currentGrams;
  const isOverweight = remainingGrams < 0;
  const overweightGrams = isOverweight ? Math.abs(remainingGrams) : 0;

  const utilizationPercentage =
    availablePayloadGrams > 0
      ? Math.round(((currentGrams - startGrams) / availablePayloadGrams) * 10000) / 100
      : 0;

  let statusLevel: WeightStatus["statusLevel"] = "green";
  if (isOverweight) {
    statusLevel = "red";
  } else if (utilizationPercentage >= 90) {
    statusLevel = "yellow";
  }

  return {
    startWeightKg: gramsToKg(startGrams),
    maximumWeightKg: gramsToKg(maxGrams),
    availablePayloadKg: gramsToKg(availablePayloadGrams),
    currentWeightKg: gramsToKg(currentGrams),
    remainingWeightKg: gramsToKg(remainingGrams),
    overweightKg: gramsToKg(overweightGrams),
    utilizationPercentage,
    isOverweight,
    statusLevel,
  };
}

// Understøtter dansk komma og punktum, afviser NaN/Infinity/negative/for mange decimaler.
export function parseUserWeightKg(input: string): number {
  const normalized = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(normalized)) {
    throw new Error("Ugyldigt vægtformat");
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Vægten skal være et positivt tal");
  }
  if (value < 0.01) {
    throw new Error("Vægten skal være mindst 0,01 kg");
  }
  return value;
}

export function validateEntryWeight(kg: number, maximumEntryWeightKg: number): void {
  if (kg > maximumEntryWeightKg) {
    throw new Error(`Vægten overstiger det tilladte maksimum på ${maximumEntryWeightKg} kg pr. registrering`);
  }
}
