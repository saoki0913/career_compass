import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyGuestDeviceToken,
  hashGuestDeviceToken,
  planGuestDeviceTokenBackfill,
} from "./backfill-guest-device-token-hashes.mjs";

const uuid = "550e8400-e29b-41d4-a716-446655440000";
const uuidHash = "a3a9e1ed9732cab28868127be00f1ce921acaefdd5c3b23a6e9e0072bd9c1a34";

test("guest device token helper hashes UUID v4 tokens with SHA-256 hex", () => {
  assert.equal(hashGuestDeviceToken(uuid), uuidHash);
  assert.deepEqual(classifyGuestDeviceToken(uuid), {
    action: "hash",
    reason: "legacy_plaintext_uuid",
    value: uuidHash,
  });
});

test("guest device token helper skips already-hashed, empty, and invalid tokens", () => {
  assert.deepEqual(classifyGuestDeviceToken(uuidHash), {
    action: "skip",
    reason: "already_hashed",
  });
  assert.deepEqual(classifyGuestDeviceToken(""), {
    action: "skip",
    reason: "empty",
  });
  assert.deepEqual(classifyGuestDeviceToken("not-a-uuid"), {
    action: "skip",
    reason: "invalid_non_uuid",
  });
});

test("guest device token planner skips candidates that would violate unique hash storage", () => {
  const plan = planGuestDeviceTokenBackfill([
    { id: "guest-1", device_token: uuid },
    { id: "guest-2", device_token: uuidHash },
    { id: "guest-3", device_token: "11111111-1111-4111-8111-111111111111" },
    { id: "guest-4", device_token: "invalid" },
  ]);

  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.candidates[0].id, "guest-3");
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].id, "guest-1");
  assert.equal(plan.conflicts[0].reason, "target_hash_exists");
  assert.equal(plan.stats.scannedRows, 4);
  assert.equal(plan.stats.hashCandidates, 2);
  assert.equal(plan.stats.alreadyHashed, 1);
  assert.equal(plan.stats.invalid, 1);
  assert.equal(plan.stats.conflicts, 1);
});
