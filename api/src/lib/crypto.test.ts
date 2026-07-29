import { describe, expect, it } from "vitest";
import { generateToken, hmacHex, verifyTokenAgainstHash, constantTimeEquals } from "./crypto.js";

describe("token-hashing", () => {
  it("genererer unikke tokens", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(30);
  });

  it("verificerer korrekt token mod hash", () => {
    const token = generateToken();
    const hash = hmacHex(token, "pepper");
    expect(verifyTokenAgainstHash(token, hash, "pepper")).toBe(true);
  });

  it("afviser forkert token", () => {
    const token = generateToken();
    const hash = hmacHex(token, "pepper");
    expect(verifyTokenAgainstHash("forkert-token", hash, "pepper")).toBe(false);
  });

  it("afviser korrekt token med forkert pepper", () => {
    const token = generateToken();
    const hash = hmacHex(token, "pepper");
    expect(verifyTokenAgainstHash(token, hash, "anden-pepper")).toBe(false);
  });

  it("constantTimeEquals sammenligner korrekt", () => {
    expect(constantTimeEquals("abc", "abc")).toBe(true);
    expect(constantTimeEquals("abc", "abd")).toBe(false);
    expect(constantTimeEquals("abc", "ab")).toBe(false);
  });
});
