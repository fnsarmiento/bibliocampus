import crypto from "node:crypto";

const KEY_LENGTH = 64;

export class HashPassword {
  static hash(plain: string): string {
    const salt = crypto.randomBytes(16).toString("hex");
    const derived = crypto.scryptSync(plain, salt, KEY_LENGTH).toString("hex");
    return `${salt}:${derived}`;
  }

  static verify(plain: string, storedHash: string): boolean {
    const parts = storedHash.split(":");
    if (parts.length !== 2) {
      return false;
    }
    const [salt, expectedHex] = parts;
    const expectedBuf = Buffer.from(expectedHex, "hex");
    const actualBuf = crypto.scryptSync(plain, salt, KEY_LENGTH);
    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  }
}
