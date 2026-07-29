import { describe, expect, it } from "vitest";
import { issuePublicSession, issueAdminSession, verifySession } from "./session.js";

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
