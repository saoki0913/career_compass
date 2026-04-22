#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  formatUiPreflightMarkdown,
  getUiPreflightQuestions,
  parseUiPreflightArgs,
} from "../src/lib/ui-preflight-cli.mjs";

async function main() {
  const config = parseUiPreflightArgs(process.argv.slice(2));
  const outputPath = process.env.UI_PREFLIGHT_OUTPUT_PATH?.trim() || "";

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("UI preflight requires an interactive terminal");
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answers = {};

    console.log("");
    console.log(`[ui-preflight] route=${config.routePath} surface=${config.surface} auth=${config.authMode}`);
    console.log("[ui-preflight] 回答を集めて Markdown の証跡を出力します。");
    console.log("");

    for (const question of getUiPreflightQuestions(config.surface)) {
      const answer = await promptUntilFilled(rl, question.prompt);
      answers[question.key] = answer;
      console.log("");
    }

    const markdown = formatUiPreflightMarkdown({
      ...config,
      answers,
    });

    if (outputPath) {
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${markdown}\n`, "utf8");
    }

    console.log(markdown);
  } finally {
    rl.close();
  }
}

async function promptUntilFilled(rl, prompt) {
  while (true) {
    const answer = (await rl.question(`${prompt}\n> `)).trim();
    if (answer) {
      return answer;
    }

    console.log("この項目は必須です。1 行でよいので入力してください。");
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
