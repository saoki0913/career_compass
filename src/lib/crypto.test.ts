/**
 * Tests for src/lib/crypto.ts.
 *
 * Implementation migrated from process.env to serverEnv (T3 Env).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";

const TEST_KEY = randomBytes(32).toString("hex"); // 64 hex chars

describe("encrypt / decrypt", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it("round-trips plaintext through encrypt then decrypt", async () => {
    const { encrypt, decrypt } = await import("./crypto");
    const plaintext = "hello world";
    const ciphertext = encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("returns empty string for empty input", async () => {
    const { encrypt, decrypt } = await import("./crypto");
    expect(encrypt("")).toBe("");
    expect(decrypt("")).toBe("");
  });

  it("generates a valid encryption key", async () => {
    const { generateEncryptionKey } = await import("./crypto");
    const key = generateEncryptionKey();
    expect(key).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(key)).toBe(true);
  });
});
