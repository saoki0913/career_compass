#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";
import {
  getPlaywrightAuthStatePath,
  hasPlaywrightAuthState,
} from "../src/lib/verification-harness.mjs";
import {
  buildScreenshotCaptureEnv,
  parseScreenshotCaptureArgs,
} from "../src/lib/screenshot-capture-cli.mjs";

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const authFreeFilters = new Set([
  "/",
  "/ai-mensetsu",
  "/contact",
  "/data-source-policy",
  "/entry-sheet-ai",
  "/es-ai-guide",
  "/es-tensaku-ai",
  "/gakuchika-ai",
  "/legal",
  "/pricing",
  "/pricing/checkout",
  "/privacy",
  "/shiboudouki-ai",
  "/shukatsu-ai",
  "/shukatsu-kanri",
  "/templates",
  "/templates/gakuchika-star",
  "/templates/shiboudouki",
  "/terms",
  "/tools",
  "/tools/es-counter",
  "/waitlist",
  "/checklists",
  "/checklists/deadline-management",
  "/login",
  "marketing.home",
  "marketing.aiMensetsu",
  "marketing.contact",
  "marketing.dataSourcePolicy",
  "marketing.entrySheetAi",
  "marketing.esAiGuide",
  "marketing.esTensakuAi",
  "marketing.gakuchikaAi",
  "marketing.legal",
  "marketing.pricing",
  "marketing.pricingCheckout",
  "marketing.privacy",
  "marketing.shiboudoukiAi",
  "marketing.shukatsuAi",
  "marketing.shukatsuKanri",
  "marketing.templates",
  "marketing.templatesGakuchikaStar",
  "marketing.templatesShiboudouki",
  "marketing.terms",
  "marketing.tools",
  "marketing.toolsEsCounter",
  "marketing.waitlist",
  "checklists.index",
  "checklists.deadlineManagement",
  "auth.login",
]);

function needsAuthCapture(config) {
  if (process.env.CI_E2E_AUTH_SECRET?.trim()) {
    return false;
  }
  if (config.filters.length === 0) {
    return true;
  }
  return config.filters.some((filter) => !authFreeFilters.has(filter));
}

function runAuthCapture(authStatePath, config) {
  const authArgs = ["run", "auth:save-playwright-state", "--", `--output=${authStatePath}`];
  if (config.authInteractive) {
    authArgs.push("--interactive");
  }
  const capture = spawn(
    npmCommand,
    authArgs,
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    },
  );

  capture.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    if ((code ?? 1) !== 0) {
      process.exit(code ?? 1);
    }
    launchScreenshotCapture(authStatePath, config);
  });

  capture.on("error", (error) => {
    process.stderr.write(`[screenshots:capture] failed to capture auth state: ${error.message}\n`);
    process.exit(1);
  });
}

function launchScreenshotCapture(authStatePath, config) {
  const args = ["playwright", "test", "e2e/tooling/screenshot-capture.spec.ts"];
  if (config.headed) {
    args.push("--headed");
  }
  const childEnv = {
    ...process.env,
    ...buildScreenshotCaptureEnv(config),
  };
  if (needsAuthCapture(config)) {
    childEnv.PLAYWRIGHT_AUTH_STATE = authStatePath;
  } else {
    delete childEnv.PLAYWRIGHT_AUTH_STATE;
  }

  const child = spawn(npxCommand, args, {
    cwd: process.cwd(),
    env: childEnv,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });

  child.on("error", (error) => {
    process.stderr.write(`[screenshots:capture] failed to launch Playwright: ${error.message}\n`);
    process.exit(1);
  });
}

try {
  const config = parseScreenshotCaptureArgs(process.argv.slice(2));
  const authStatePath = getPlaywrightAuthStatePath(process.cwd(), process.env);
  if (needsAuthCapture(config) && !hasPlaywrightAuthState(process.cwd(), process.env)) {
    runAuthCapture(authStatePath, config);
  } else {
    launchScreenshotCapture(authStatePath, config);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
