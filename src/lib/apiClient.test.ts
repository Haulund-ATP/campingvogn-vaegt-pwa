import { describe, expect, it } from "vitest";
import { ApiError, OfflineError } from "./apiClient";

describe("ApiError-klassificering", () => {
  it("behandler opstartsfejl som forbigående", () => {
    for (const status of [408, 425, 500, 502, 503, 504]) {
      expect(new ApiError(status, "Fejl").isTransient, `status ${status}`).toBe(true);
    }
  });

  it("gentager ikke 429 med det samme", () => {
    expect(new ApiError(429, "For mange forsøg").isTransient).toBe(false);
  });

  it("bevarer 429 til et senere forsøg, så en registrering ikke kasseres", () => {
    expect(new ApiError(429, "For mange forsøg").isRetryableLater).toBe(true);
  });

  it("regner permanente afvisninger som endelige", () => {
    for (const status of [400, 404, 409]) {
      const err = new ApiError(status, "Fejl");
      expect(err.isTransient, `status ${status}`).toBe(false);
      expect(err.isRetryableLater, `status ${status}`).toBe(false);
    }
  });

  it("kender tabt session", () => {
    expect(new ApiError(401, "Ikke godkendt").isSessionLost).toBe(true);
    expect(new ApiError(403, "Adgang nægtet").isSessionLost).toBe(true);
    expect(new ApiError(409, "Konflikt").isSessionLost).toBe(false);
  });
});

describe("OfflineError", () => {
  it("skelner timeout fra manglende forbindelse", () => {
    expect(new OfflineError(true).timedOut).toBe(true);
    expect(new OfflineError(false).message).toBe("Ingen forbindelse");
  });
});
