#!/usr/bin/env node

import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const APPLY_FLAG = "--apply";
const HELP_FLAGS = new Set(["--help", "-h"]);
const SHOW_IDS_LIMIT = 20;
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/i;

function usage() {
  return [
    "Usage: node scripts/security/backfill-guest-device-token-hashes.mjs [--apply]",
    "",
    "Dry-run by default. With --apply, hashes legacy plaintext UUID v4",
    "guest_users.device_token values with SHA-256. Requires DATABASE_URL.",
    "",
  ].join("\n");
}

export function hashGuestDeviceToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function classifyGuestDeviceToken(value) {
  if (value === null || value === undefined || value === "") {
    return { action: "skip", reason: "empty" };
  }
  if (SHA256_HEX_REGEX.test(value)) {
    return { action: "skip", reason: "already_hashed" };
  }
  if (UUID_V4_REGEX.test(value)) {
    return {
      action: "hash",
      reason: "legacy_plaintext_uuid",
      value: hashGuestDeviceToken(value),
    };
  }
  return { action: "skip", reason: "invalid_non_uuid" };
}

export function planGuestDeviceTokenBackfill(rows) {
  const tokenOwner = new Map();
  const targetOwner = new Map();
  const conflicts = [];
  const candidates = [];
  const stats = {
    scannedRows: rows.length,
    hashCandidates: 0,
    alreadyHashed: 0,
    invalid: 0,
    empty: 0,
    conflicts: 0,
  };

  for (const row of rows) {
    if (row.device_token) {
      tokenOwner.set(row.device_token.toLowerCase(), row.id);
    }
  }

  for (const row of rows) {
    const classification = classifyGuestDeviceToken(row.device_token);
    if (classification.reason === "already_hashed") stats.alreadyHashed += 1;
    if (classification.reason === "invalid_non_uuid") stats.invalid += 1;
    if (classification.reason === "empty") stats.empty += 1;
    if (classification.action !== "hash") continue;

    stats.hashCandidates += 1;
    const target = classification.value;
    const existingTokenOwner = tokenOwner.get(target.toLowerCase());
    const existingTargetOwner = targetOwner.get(target);
    if (
      (existingTokenOwner && existingTokenOwner !== row.id) ||
      (existingTargetOwner && existingTargetOwner !== row.id)
    ) {
      conflicts.push({
        id: row.id,
        targetDeviceToken: target,
        reason: existingTokenOwner ? "target_hash_exists" : "duplicate_target_hash",
      });
      continue;
    }

    targetOwner.set(target, row.id);
    candidates.push({
      id: row.id,
      oldDeviceToken: row.device_token,
      deviceToken: target,
    });
  }

  stats.conflicts = conflicts.length;
  return { candidates, conflicts, stats };
}

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function shouldDisableSsl(databaseUrl) {
  return databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");
}

async function applyGuestDeviceTokenBackfill(sql, candidates) {
  let updated = 0;
  let skippedConcurrent = 0;
  let skippedConflicts = 0;

  for (const candidate of candidates) {
    try {
      const rows = await sql`
        update guest_users
        set
          device_token = ${candidate.deviceToken},
          updated_at = now()
        where id = ${candidate.id}
          and device_token = ${candidate.oldDeviceToken}
        returning id
      `;
      if (rows.length === 1) {
        updated += 1;
      } else {
        skippedConcurrent += 1;
      }
    } catch (error) {
      if (error?.code === "23505") {
        skippedConflicts += 1;
        continue;
      }
      throw error;
    }
  }

  return { updated, skippedConcurrent, skippedConflicts };
}

async function main(argv = process.argv.slice(2)) {
  if (argv.some((arg) => HELP_FLAGS.has(arg))) {
    process.stdout.write(usage());
    return;
  }

  const apply = argv.includes(APPLY_FLAG);
  const databaseUrl = getRequiredEnv("DATABASE_URL");
  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    ssl: shouldDisableSsl(databaseUrl) ? false : "require",
  });

  try {
    const rows = await sql`
      select id, device_token
      from guest_users
      order by created_at asc, id asc
    `;
    const plan = planGuestDeviceTokenBackfill(rows);

    process.stdout.write(`mode=${apply ? "apply" : "dry-run"}\n`);
    process.stdout.write(`scanned_rows=${plan.stats.scannedRows}\n`);
    process.stdout.write(`already_hashed=${plan.stats.alreadyHashed}\n`);
    process.stdout.write(`invalid_non_uuid=${plan.stats.invalid}\n`);
    process.stdout.write(`empty=${plan.stats.empty}\n`);
    process.stdout.write(`hash_candidates=${plan.stats.hashCandidates}\n`);
    process.stdout.write(`conflicts=${plan.stats.conflicts}\n`);
    process.stdout.write(`candidate_rows=${plan.candidates.length}\n`);

    if (plan.candidates.length > 0) {
      process.stdout.write("candidate_ids=\n");
      for (const candidate of plan.candidates.slice(0, SHOW_IDS_LIMIT)) {
        process.stdout.write(`- ${candidate.id}\n`);
      }
      if (plan.candidates.length > SHOW_IDS_LIMIT) {
        process.stdout.write(`- ... (${plan.candidates.length - SHOW_IDS_LIMIT} more)\n`);
      }
    }

    if (plan.conflicts.length > 0) {
      process.stdout.write("conflict_ids=\n");
      for (const conflict of plan.conflicts.slice(0, SHOW_IDS_LIMIT)) {
        process.stdout.write(`- ${conflict.id}: ${conflict.reason}\n`);
      }
      if (plan.conflicts.length > SHOW_IDS_LIMIT) {
        process.stdout.write(`- ... (${plan.conflicts.length - SHOW_IDS_LIMIT} more)\n`);
      }
    }

    if (!apply || plan.candidates.length === 0) {
      return;
    }

    const result = await applyGuestDeviceTokenBackfill(sql, plan.candidates);
    process.stdout.write(`updated_rows=${result.updated}\n`);
    process.stdout.write(`skipped_concurrent_rows=${result.skippedConcurrent}\n`);
    process.stdout.write(`skipped_conflict_rows=${result.skippedConflicts}\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const isCli = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isCli) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
