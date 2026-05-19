#!/usr/bin/env node

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const APPLY_FLAG = "--apply";
const HELP_FLAGS = new Set(["--help", "-h"]);
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTION_KEY_HEX_LENGTH = 64;
const SHOW_IDS_LIMIT = 20;

function usage() {
  return [
    "Usage: node scripts/security/backfill-calendar-token-encryption.mjs [--apply]",
    "",
    "Dry-run by default. With --apply, encrypts legacy plaintext",
    "calendar_settings.google_access_token and google_refresh_token values",
    "using ENCRYPTION_KEY. Requires DATABASE_URL and ENCRYPTION_KEY.",
    "",
  ].join("\n");
}

function normalizeHexKey(keyHex) {
  const value = String(keyHex ?? "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string");
  }
  return Buffer.from(value, "hex");
}

export function encryptCalendarToken(plaintext, keyHex, iv = randomBytes(IV_LENGTH)) {
  if (!plaintext) return "";
  const key = normalizeHexKey(keyHex);
  if (!Buffer.isBuffer(iv) || iv.length !== IV_LENGTH) {
    throw new Error(`iv must be a ${IV_LENGTH}-byte Buffer`);
  }

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptCalendarToken(ciphertext, keyHex) {
  if (!ciphertext) return "";
  const key = normalizeHexKey(keyHex);
  const combined = Buffer.from(ciphertext, "base64");
  if (combined.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("ciphertext payload is too short");
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}

export function classifyCalendarToken(value, keyHex) {
  if (value === null || value === undefined || value === "") {
    return { action: "skip", reason: "empty" };
  }

  try {
    decryptCalendarToken(value, keyHex);
    return { action: "skip", reason: "already_encrypted" };
  } catch {
    return { action: "encrypt", reason: "legacy_plaintext" };
  }
}

export function prepareCalendarTokenUpdate(value, keyHex) {
  const classification = classifyCalendarToken(value, keyHex);
  if (classification.action !== "encrypt") {
    return { ...classification, value };
  }

  return {
    ...classification,
    value: encryptCalendarToken(value, keyHex),
  };
}

export function planCalendarTokenBackfill(rows, keyHex) {
  const candidates = [];
  const stats = {
    scannedRows: rows.length,
    scannedTokens: 0,
    encryptCandidates: 0,
    alreadyEncrypted: 0,
    empty: 0,
  };

  for (const row of rows) {
    const access = prepareCalendarTokenUpdate(row.google_access_token, keyHex);
    const refresh = prepareCalendarTokenUpdate(row.google_refresh_token, keyHex);
    const changed =
      access.action === "encrypt" || refresh.action === "encrypt";

    for (const item of [access, refresh]) {
      stats.scannedTokens += 1;
      if (item.action === "encrypt") stats.encryptCandidates += 1;
      if (item.reason === "already_encrypted") stats.alreadyEncrypted += 1;
      if (item.reason === "empty") stats.empty += 1;
    }

    if (changed) {
      candidates.push({
        id: row.id,
        userId: row.user_id,
        oldGoogleAccessToken: row.google_access_token,
        oldGoogleRefreshToken: row.google_refresh_token,
        googleAccessToken: access.value,
        googleRefreshToken: refresh.value,
        encryptedAccessToken: access.action === "encrypt",
        encryptedRefreshToken: refresh.action === "encrypt",
      });
    }
  }

  return { candidates, stats };
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

async function applyCalendarBackfill(sql, candidates) {
  let updated = 0;
  let skippedConcurrent = 0;

  await sql.begin(async (tx) => {
    for (const candidate of candidates) {
      const rows = await tx`
        update calendar_settings
        set
          google_access_token = ${candidate.googleAccessToken},
          google_refresh_token = ${candidate.googleRefreshToken},
          updated_at = now()
        where id = ${candidate.id}
          and google_access_token is not distinct from ${candidate.oldGoogleAccessToken}
          and google_refresh_token is not distinct from ${candidate.oldGoogleRefreshToken}
        returning id
      `;
      if (rows.length === 1) {
        updated += 1;
      } else {
        skippedConcurrent += 1;
      }
    }
  });

  return { updated, skippedConcurrent };
}

async function main(argv = process.argv.slice(2)) {
  if (argv.some((arg) => HELP_FLAGS.has(arg))) {
    process.stdout.write(usage());
    return;
  }

  const apply = argv.includes(APPLY_FLAG);
  const databaseUrl = getRequiredEnv("DATABASE_URL");
  const encryptionKey = getRequiredEnv("ENCRYPTION_KEY");
  normalizeHexKey(encryptionKey);

  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    ssl: shouldDisableSsl(databaseUrl) ? false : "require",
  });

  try {
    const rows = await sql`
      select
        id,
        user_id,
        google_access_token,
        google_refresh_token
      from calendar_settings
      where google_access_token is not null
         or google_refresh_token is not null
      order by updated_at asc, id asc
    `;
    const plan = planCalendarTokenBackfill(rows, encryptionKey);

    process.stdout.write(`mode=${apply ? "apply" : "dry-run"}\n`);
    process.stdout.write(`scanned_rows=${plan.stats.scannedRows}\n`);
    process.stdout.write(`scanned_tokens=${plan.stats.scannedTokens}\n`);
    process.stdout.write(`already_encrypted=${plan.stats.alreadyEncrypted}\n`);
    process.stdout.write(`empty=${plan.stats.empty}\n`);
    process.stdout.write(`encrypt_candidates=${plan.stats.encryptCandidates}\n`);
    process.stdout.write(`candidate_rows=${plan.candidates.length}\n`);

    if (plan.candidates.length > 0) {
      process.stdout.write("candidate_ids=\n");
      for (const candidate of plan.candidates.slice(0, SHOW_IDS_LIMIT)) {
        const fields = [
          candidate.encryptedAccessToken ? "google_access_token" : null,
          candidate.encryptedRefreshToken ? "google_refresh_token" : null,
        ].filter(Boolean).join(",");
        process.stdout.write(`- ${candidate.id} (${fields})\n`);
      }
      if (plan.candidates.length > SHOW_IDS_LIMIT) {
        process.stdout.write(`- ... (${plan.candidates.length - SHOW_IDS_LIMIT} more)\n`);
      }
    }

    if (!apply || plan.candidates.length === 0) {
      return;
    }

    const result = await applyCalendarBackfill(sql, plan.candidates);
    process.stdout.write(`updated_rows=${result.updated}\n`);
    process.stdout.write(`skipped_concurrent_rows=${result.skippedConcurrent}\n`);
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
