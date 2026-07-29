import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hmacHex(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Stadig konstant tid ift. den forventede længde, for at undgå længde-oracle.
    createHmac("sha256", "noop").update(bufA).digest();
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function verifyTokenAgainstHash(token: string, expectedHash: string, pepper: string): boolean {
  const actualHash = hmacHex(token, pepper);
  return constantTimeEquals(actualHash, expectedHash);
}
