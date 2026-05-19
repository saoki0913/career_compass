import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyCalendarToken,
  decryptCalendarToken,
  encryptCalendarToken,
  planCalendarTokenBackfill,
  prepareCalendarTokenUpdate,
} from "./backfill-calendar-token-encryption.mjs";

const key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const iv = Buffer.from("00112233445566778899aabb", "hex");

test("calendar token helper encrypts with the app-compatible AES-GCM layout", () => {
  const encrypted = encryptCalendarToken("legacy-access-token", key, iv);

  assert.equal(decryptCalendarToken(encrypted, key), "legacy-access-token");
  assert.equal(Buffer.from(encrypted, "base64").subarray(0, 12).equals(iv), true);
});

test("calendar token helper skips values already decryptable with ENCRYPTION_KEY", () => {
  const encrypted = encryptCalendarToken("already-encrypted", key, iv);

  assert.deepEqual(classifyCalendarToken(encrypted, key), {
    action: "skip",
    reason: "already_encrypted",
  });
  assert.deepEqual(classifyCalendarToken(null, key), {
    action: "skip",
    reason: "empty",
  });
});

test("calendar token helper encrypts legacy plaintext without exposing plaintext in the plan", () => {
  const result = prepareCalendarTokenUpdate("legacy-refresh-token", key);

  assert.equal(result.action, "encrypt");
  assert.equal(result.reason, "legacy_plaintext");
  assert.notEqual(result.value, "legacy-refresh-token");
  assert.equal(decryptCalendarToken(result.value, key), "legacy-refresh-token");
});

test("calendar token planner counts access and refresh token candidates independently", () => {
  const encrypted = encryptCalendarToken("existing", key, iv);
  const plan = planCalendarTokenBackfill([
    {
      id: "settings-1",
      user_id: "user-1",
      google_access_token: "plain-access",
      google_refresh_token: encrypted,
    },
    {
      id: "settings-2",
      user_id: "user-2",
      google_access_token: null,
      google_refresh_token: "",
    },
  ], key);

  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.candidates[0].id, "settings-1");
  assert.equal(plan.candidates[0].encryptedAccessToken, true);
  assert.equal(plan.candidates[0].encryptedRefreshToken, false);
  assert.equal(plan.stats.scannedRows, 2);
  assert.equal(plan.stats.scannedTokens, 4);
  assert.equal(plan.stats.encryptCandidates, 1);
  assert.equal(plan.stats.alreadyEncrypted, 1);
  assert.equal(plan.stats.empty, 2);
});

test("calendar token helper rejects invalid encryption keys", () => {
  assert.throws(
    () => encryptCalendarToken("value", "not-a-key", iv),
    /ENCRYPTION_KEY/,
  );
});
