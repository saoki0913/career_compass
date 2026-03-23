#!/usr/bin/env node

import postgres from "postgres";
import {
  normalizeQwenReviewMessageContent,
} from "../../src/lib/es-review/qwen-review-meta-normalization.mjs";

const APPLY_FLAG = "--apply";
const SHOW_IDS_LIMIT = 20;

function getDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is not set");
  }
  return value;
}

function shouldDisableSsl(databaseUrl) {
  return databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");
}

async function main() {
  const apply = process.argv.includes(APPLY_FLAG);
  const databaseUrl = getDatabaseUrl();
  const sql = postgres(databaseUrl, {
    prepare: false,
    ssl: shouldDisableSsl(databaseUrl) ? false : "require",
    max: 1,
  });

  try {
    const rows = await sql`
      select id, content
      from ai_messages
      where role = 'assistant'
        and content like '%"type":"es_review_v1"%'
        and (
          content ilike '%qwen%'
          or content like '%"review_variant":"qwen3-beta"%'
        )
      order by created_at asc
    `;

    const candidates = [];
    const skipped = [];

    for (const row of rows) {
      const result = normalizeQwenReviewMessageContent(row.content);
      if (!result.ok) {
        skipped.push({ id: row.id, reason: result.reason });
        continue;
      }
      if (result.updated) {
        candidates.push({ id: row.id, content: result.content });
      }
    }

    console.log(`mode=${apply ? "apply" : "dry-run"}`);
    console.log(`matched_rows=${rows.length}`);
    console.log(`update_candidates=${candidates.length}`);
    console.log(`skipped=${skipped.length}`);

    if (candidates.length > 0) {
      console.log("candidate_ids=");
      for (const candidate of candidates.slice(0, SHOW_IDS_LIMIT)) {
        console.log(`- ${candidate.id}`);
      }
      if (candidates.length > SHOW_IDS_LIMIT) {
        console.log(`- ... (${candidates.length - SHOW_IDS_LIMIT} more)`);
      }
    }

    if (skipped.length > 0) {
      console.log("skipped_ids=");
      for (const item of skipped.slice(0, SHOW_IDS_LIMIT)) {
        console.log(`- ${item.id}: ${item.reason}`);
      }
      if (skipped.length > SHOW_IDS_LIMIT) {
        console.log(`- ... (${skipped.length - SHOW_IDS_LIMIT} more)`);
      }
    }

    if (!apply || candidates.length === 0) {
      return;
    }

    await sql.begin(async (tx) => {
      for (const candidate of candidates) {
        await tx`
          update ai_messages
          set content = ${candidate.content}
          where id = ${candidate.id}
        `;
      }
    });

    console.log(`updated=${candidates.length}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
