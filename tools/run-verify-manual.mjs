#!/usr/bin/env node

import { chromium } from "@playwright/test";
import { createInterface } from "node:readline/promises";
import process from "node:process";
import {
  appendVerificationRun,
  getPlaywrightAuthStatePath,
  recordCheckResult,
} from "../src/lib/verification-harness.mjs";
import { normalizeReviewRoute } from "../src/lib/ui-review-routing.mjs";

const CHECKLIST = [
  "対象 route が正しく開いた",
  "console error がない",
  "主要 CTA / 入力 / 送信が動いた",
  "成功時の UI が出た",
  "今回変更した分岐が動いた",
];

function parseArgs(argv) {
  let route = "";
  let authMode = "none";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--route") {
      route = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--route=")) {
      route = arg.slice("--route=".length);
      continue;
    }
    if (arg.startsWith("--auth=")) {
      authMode = arg.slice("--auth=".length).trim();
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  if (!route) {
    throw new Error("Usage: npm run verify:manual -- --route /path [--auth=none|guest|mock|real]");
  }

  return { route: normalizeReviewRoute(route), authMode };
}

async function askChecklist(route, authMode) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answers = [];

  try {
    console.log("");
    console.log(`[verify:manual] route=${route} auth=${authMode}`);
    console.log("[verify:manual] 専用ブラウザで画面を確認し、各項目へ yes/no で回答してください。");
    console.log("");

    for (const item of CHECKLIST) {
      const answer = (await rl.question(`${item} (yes/no)\n> `)).trim().toLowerCase();
      answers.push({
        item,
        passed: answer === "yes" || answer === "y",
      });
    }

    const note = (await rl.question("メモを 1 行で残してください\n> ")).trim();
    return { answers, note };
  } finally {
    rl.close();
  }
}

async function openDedicatedBrowser(route, authMode) {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000";
  if (authMode === "mock") {
    console.log("");
    console.log("[verify:manual] auth=mock のため dedicated browser は自動起動しません。");
    console.log(`[verify:manual] 先に \`npm run test:ui:review -- ${route} --auth=mock --headed\` で表示を確認してください。`);
    console.log("");
    return { browser: null, context: null };
  }

  const contextOptions = {};
  if (authMode === "real") {
    contextOptions.storageState = getPlaywrightAuthStatePath(process.cwd(), process.env);
  }

  const browser = await chromium.launch({ headless: false, channel: "chrome" });
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await page.goto(new URL(route, baseURL).toString(), { waitUntil: "networkidle", timeout: 90_000 });
  return { browser, context };
}

async function main() {
  const { route, authMode } = parseArgs(process.argv.slice(2));
  const { browser } = await openDedicatedBrowser(route, authMode);

  try {
    const { answers, note } = await askChecklist(route, authMode);
    const passed = answers.every((answer) => answer.passed);
    const checkId = `manual:review:${route}`;
    const evidencePath = await appendVerificationRun(
      {
        id: checkId,
        kind: "manual:review",
        route,
        authMode,
        checklist: answers,
        note,
        exitCode: passed ? 0 : 1,
      },
      process.cwd(),
      process.env,
    );
    await recordCheckResult(
      {
        id: checkId,
        status: passed ? "passed" : "failed",
        exitCode: passed ? 0 : 1,
        evidencePath,
        message: note,
      },
      process.cwd(),
      process.env,
    );

    if (!passed) {
      process.exit(1);
    }
  } finally {
    await browser?.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
