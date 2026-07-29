import { describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_TTL,
  PUBLIC_SESSION_TTL,
  issuePublicSession,
  issueAdminSession,
  renewSession,
  shouldRenewSession,
  verifySession,
} from "./session.js";

const SECRET = "session-secret";

describe("public session", () => {
  it("udsteder og verificerer en gyldig session", () => {
    const { token } = issuePublicSession("norge-2026", 1, SECRET);
    const payload = verifySession(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload?.role).toBe("public");
  });

  it("afviser forkert signatur", () => {
    const { token } = issuePublicSession("norge-2026", 1, SECRET);
    const tampered = token.slice(0, -2) + "xx";
    expect(verifySession(tampered, SECRET)).toBeNull();
  });

  it("afviser med forkert secret", () => {
    const { token } = issuePublicSession("norge-2026", 1, SECRET);
    expect(verifySession(token, "andet-secret")).toBeNull();
  });

  it("afviser manglende token", () => {
    expect(verifySession(undefined, SECRET)).toBeNull();
  });
});

describe("admin session", () => {
  it("udsteder og verificerer en gyldig administratorsession", () => {
    const { token } = issueAdminSession(1, SECRET);
    const payload = verifySession(token, SECRET);
    expect(payload?.role).toBe("system-admin");
  });
});

describe("glidende fornyelse", () => {
  it("fornyer ikke en frisk session", () => {
    const { payload } = issuePublicSession("norge-2026", 1, SECRET);
    expect(shouldRenewSession(payload)).toBe(false);
  });

  it("fornyer når over halvdelen af levetiden er brugt", () => {
    const { payload } = issuePublicSession("norge-2026", 1, SECRET);
    const past = Date.now() + PUBLIC_SESSION_TTL * 1000 * 0.6;
    expect(shouldRenewSession(payload, past)).toBe(true);
  });

  it("fornyer ikke en allerede udløbet session", () => {
    const { payload } = issuePublicSession("norge-2026", 1, SECRET);
    const afterExpiry = payload.expiresAt + 1000;
    expect(shouldRenewSession(payload, afterExpiry)).toBe(false);
  });

  it("bevarer sessionId, trip og tokenversion ved fornyelse", () => {
    const { payload } = issuePublicSession("norge-2026", 3, SECRET);
    const { token, ttlSeconds } = renewSession(payload, SECRET, payload.expiresAt - 1000);
    const renewed = verifySession(token, SECRET);

    expect(ttlSeconds).toBe(PUBLIC_SESSION_TTL);
    expect(renewed).toMatchObject({
      role: "public",
      tripId: "norge-2026",
      publicTokenVersion: 3,
      sessionId: payload.sessionId,
    });
    expect(renewed!.expiresAt).toBeGreaterThan(payload.expiresAt);
  });

  it("bruger administratorens kortere levetid ved fornyelse", () => {
    const { payload } = issueAdminSession(1, SECRET);
    expect(renewSession(payload, SECRET).ttlSeconds).toBe(ADMIN_SESSION_TTL);
  });
});
