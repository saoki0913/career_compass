#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
  "/login?redirect=/dashboard",
  "/pricing?checkout=canceled&source=standard",
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
  "marketing.pricingCanceled",
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
  "auth.loginRedirect",
]);
const authFreeGroups = new Set(["marketing", "checklists"]);

function needsAuthCapture(config) {
  if (config.filters.length === 0) {
    if (config.groups.length > 0) {
      return config.groups.some((group) => !authFreeGroups.has(group));
    }
    return true;
  }
  return config.filters.some((filter) => !authFreeFilters.has(filter));
}

function getBetterAuthSessionCookieCandidates(baseUrl) {
  const parsed = new URL(baseUrl);
  const defaultCookieName = "better-auth.session_token";
  const secureCookieName = "__Secure-better-auth.session_token";
  return parsed.protocol === "https:"
    ? [secureCookieName, defaultCookieName]
    : [defaultCookieName];
}

function parseSetCookieHeader(setCookieValue, baseUrl) {
  const [nameValue, ...attributeParts] = setCookieValue.split(";").map((part) => part.trim());
  const separatorIndex = nameValue.indexOf("=");
  if (separatorIndex <= 0) {
    return null;
  }

  let domain = baseUrl.hostname;
  let cookiePath = "/";
  let httpOnly = false;
  let secure = baseUrl.protocol === "https:";
  let sameSite = "Lax";
  let expires;

  for (const attribute of attributeParts) {
    const [rawKey, ...rawValueParts] = attribute.split("=");
    const key = rawKey.trim().toLowerCase();
    const rawValue = rawValueParts.join("=").trim();
    if (key === "domain" && rawValue) {
      domain = rawValue.replace(/^\./u, "");
    } else if (key === "path" && rawValue) {
      cookiePath = rawValue;
    } else if (key === "httponly") {
      httpOnly = true;
    } else if (key === "secure") {
      secure = true;
    } else if (key === "samesite" && rawValue) {
      const normalized = rawValue.toLowerCase();
      sameSite = normalized === "strict" ? "Strict" : normalized === "none" ? "None" : "Lax";
    } else if (key === "max-age" && rawValue) {
      const maxAge = Number(rawValue);
      if (Number.isFinite(maxAge)) {
        expires = Math.floor(Date.now() / 1000) + maxAge;
      }
    } else if (key === "expires" && rawValue) {
      const parsed = Date.parse(rawValue);
      if (!Number.isNaN(parsed)) {
        expires = Math.floor(parsed / 1000);
      }
    }
  }

  return {
    name: nameValue.slice(0, separatorIndex),
    value: nameValue.slice(separatorIndex + 1),
    domain,
    path: cookiePath,
    httpOnly,
    secure,
    sameSite,
    ...(expires ? { expires } : {}),
  };
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const combinedHeader = headers.get("set-cookie");
  if (!combinedHeader) {
    return [];
  }

  return combinedHeader.split(/,(?=\s*[^;,=]+=[^;,]+)/u).map((value) => value.trim());
}

function normalizeResponseSnippet(text) {
  const normalized = String(text || "").replace(/\s+/gu, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
}

async function createCiE2EAuthState(authStatePath, config) {
  const ciE2EAuthSecret = process.env.CI_E2E_AUTH_SECRET?.trim();
  if (!ciE2EAuthSecret || config.authInteractive) {
    return false;
  }

  const baseUrl = config.baseUrl.replace(/\/$/u, "");
  const parsedBaseUrl = new URL(baseUrl);
  const loginResponse = await fetch(`${baseUrl}/api/internal/test-auth/login`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ciE2EAuthSecret}`,
      ...(process.env.CI_E2E_SCOPE?.trim() ? { "x-ci-e2e-scope": process.env.CI_E2E_SCOPE.trim() } : {}),
    },
  });

  const loginBody = await loginResponse.text().catch(() => "");
  if (!loginResponse.ok) {
    throw new Error(
      [
        "Failed to create CI E2E screenshot auth state.",
        `status=${loginResponse.status}`,
        normalizeResponseSnippet(loginBody) ? `response=${normalizeResponseSnippet(loginBody)}` : "",
      ].filter(Boolean).join(" | "),
    );
  }

  const cookieCandidates = getBetterAuthSessionCookieCandidates(baseUrl);
  const cookies = getSetCookieHeaders(loginResponse.headers)
    .map((header) => parseSetCookieHeader(header, parsedBaseUrl))
    .filter((cookie) => cookie && cookieCandidates.includes(cookie.name));

  if (cookies.length === 0) {
    throw new Error(
      `Failed to create CI E2E screenshot auth state: expected cookie ${cookieCandidates.join(", ")}`,
    );
  }

  const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  const sessionResponse = await fetch(`${baseUrl}/api/auth/get-session`, {
    headers: {
      Cookie: cookieHeader,
    },
  });
  const sessionBody = await sessionResponse.text().catch(() => "");
  let sessionUserId = "";
  try {
    const parsed = JSON.parse(sessionBody);
    sessionUserId = parsed?.user?.id || "";
  } catch {
    sessionUserId = "";
  }

  if (!sessionResponse.ok || !sessionUserId) {
    throw new Error(
      [
        "Created CI E2E screenshot auth state is invalid.",
        `status=${sessionResponse.status}`,
        normalizeResponseSnippet(sessionBody) ? `session=${normalizeResponseSnippet(sessionBody)}` : "",
      ].filter(Boolean).join(" | "),
    );
  }

  await fs.mkdir(path.dirname(authStatePath), { recursive: true });
  await fs.writeFile(authStatePath, `${JSON.stringify({ cookies, origins: [] }, null, 2)}\n`, "utf8");
  process.stdout.write(`[screenshots:capture] CI E2E auth state saved to ${authStatePath}\n`);
  return true;
}

function runAuthCapture(authStatePath, config) {
  void (async () => {
    if (await createCiE2EAuthState(authStatePath, config)) {
      launchScreenshotCapture(authStatePath, config);
      return;
    }

    runProfileAuthCapture(authStatePath, config);
  })().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[screenshots:capture] failed to capture auth state: ${message}\n`);
    process.exit(1);
  });
}

function runProfileAuthCapture(authStatePath, config) {
  const authArgs = ["run", "auth:save-playwright-state", "--", `--output=${authStatePath}`];
  if (config.authInteractive) {
    authArgs.push("--interactive");
  }
  const capture = spawn(
    npmCommand,
    authArgs,
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PLAYWRIGHT_BASE_URL: config.baseUrl,
      },
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

function buildRuntimeConfig(config) {
  if (!config.atomic) {
    return config;
  }
  const atomicOutputDir = path.join(
    os.tmpdir(),
    `shupass-screenshot-capture-${process.pid}-${Date.now()}`,
  );
  return {
    ...config,
    atomicOutputDir,
    finalOutputDir: config.outputDir,
    outputDir: atomicOutputDir,
  };
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function rewriteEntryOutputPath({ entry, sourceDir, targetDir }) {
  if (!entry.outputPath) {
    return entry;
  }
  const originalOutputPath = path.resolve(process.cwd(), entry.outputPath);
  const relativeScreenshotPath = path.relative(sourceDir, originalOutputPath);
  if (relativeScreenshotPath.startsWith("..") || path.isAbsolute(relativeScreenshotPath)) {
    return entry;
  }
  return {
    ...entry,
    outputPath: path.relative(process.cwd(), path.join(targetDir, relativeScreenshotPath)),
  };
}

async function rewriteAtomicManifestPaths({ sourceDir, stagingDir, targetDir }) {
  const manifestPath = path.join(stagingDir, "_manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.outputDir = path.relative(process.cwd(), targetDir);
  manifest.entries = manifest.entries.map((entry) =>
    rewriteEntryOutputPath({ entry, sourceDir, targetDir }),
  );
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function manifestEntryKey(entry) {
  return `${entry.routeId}\0${entry.stateId}\0${entry.viewport}`;
}

function manifestEntryGroup(entry) {
  return String(entry.routeId || "").split(".")[0];
}

async function buildMergedGroupManifest({ sourceDir, targetDir, groups }) {
  const sourceManifest = JSON.parse(await fs.readFile(path.join(sourceDir, "_manifest.json"), "utf8"));
  const replacementEntries = sourceManifest.entries.map((entry) =>
    rewriteEntryOutputPath({ entry, sourceDir, targetDir }),
  );
  const replacementByKey = new Map(replacementEntries.map((entry) => [manifestEntryKey(entry), entry]));
  const selectedGroups = new Set(groups);
  const targetManifestPath = path.join(targetDir, "_manifest.json");
  const hasTargetManifest = await pathExists(targetManifestPath);
  const existingManifest = hasTargetManifest
    ? JSON.parse(await fs.readFile(targetManifestPath, "utf8"))
    : { entries: [] };

  const mergedEntries = existingManifest.entries
    .map((entry) => {
      if (!selectedGroups.has(manifestEntryGroup(entry))) {
        return entry;
      }
      const replacement = replacementByKey.get(manifestEntryKey(entry));
      if (replacement) {
        replacementByKey.delete(manifestEntryKey(entry));
        return replacement;
      }
      return null;
    })
    .filter(Boolean);

  mergedEntries.push(...replacementByKey.values());

  return {
    ...existingManifest,
    capturedAt: sourceManifest.capturedAt,
    outputDir: path.relative(process.cwd(), targetDir),
    entries: mergedEntries,
  };
}

async function finalizeAtomicGroupOutput(config) {
  const sourceDir = path.resolve(process.cwd(), config.atomicOutputDir);
  const targetDir = path.resolve(process.cwd(), config.finalOutputDir);
  const targetParent = path.dirname(targetDir);
  const targetName = path.basename(targetDir);
  const manifestPath = path.join(targetDir, "_manifest.json");
  const manifestNextPath = path.join(targetDir, `._manifest.next-${process.pid}-${Date.now()}.json`);
  const manifestBackupPath = path.join(targetDir, `._manifest.backup-${process.pid}-${Date.now()}.json`);
  const groupBackups = [];

  await fs.mkdir(targetDir, { recursive: true });

  try {
    for (const group of config.groups) {
      const sourceGroupDir = path.join(sourceDir, group);
      const targetGroupDir = path.join(targetDir, group);
      const stagingGroupDir = path.join(targetParent, `.${targetName}.${group}.next-${process.pid}-${Date.now()}`);
      const backupGroupDir = path.join(targetParent, `.${targetName}.${group}.backup-${process.pid}-${Date.now()}`);

      if (!(await pathExists(sourceGroupDir))) {
        throw new Error(`Captured group output is missing: ${path.relative(process.cwd(), sourceGroupDir)}`);
      }

      await fs.rm(stagingGroupDir, { force: true, recursive: true });
      await fs.cp(sourceGroupDir, stagingGroupDir, { recursive: true });

      const targetExists = await pathExists(targetGroupDir);
      if (targetExists) {
        await fs.rename(targetGroupDir, backupGroupDir);
      }
      await fs.rename(stagingGroupDir, targetGroupDir);
      groupBackups.push({ backupGroupDir, targetExists, targetGroupDir });
    }

    const mergedManifest = await buildMergedGroupManifest({
      sourceDir,
      targetDir,
      groups: config.groups,
    });
    await fs.writeFile(manifestNextPath, `${JSON.stringify(mergedManifest, null, 2)}\n`, "utf8");

    const manifestExists = await pathExists(manifestPath);
    if (manifestExists) {
      await fs.rename(manifestPath, manifestBackupPath);
    }
    await fs.rename(manifestNextPath, manifestPath);

    await fs.rm(manifestBackupPath, { force: true });
    for (const backup of groupBackups) {
      await fs.rm(backup.backupGroupDir, { force: true, recursive: true });
    }
    await fs.rm(sourceDir, { force: true, recursive: true });
    process.stdout.write(
      `[screenshots:capture] atomic groups promoted to ${config.groups.join(", ")} under ${path.relative(process.cwd(), targetDir)}\n`,
    );
  } catch (error) {
    await fs.rm(manifestNextPath, { force: true });
    if (await pathExists(manifestBackupPath)) {
      await fs.rm(manifestPath, { force: true });
      await fs.rename(manifestBackupPath, manifestPath).catch(() => {});
    }
    for (const backup of groupBackups.reverse()) {
      await fs.rm(backup.targetGroupDir, { force: true, recursive: true });
      if (backup.targetExists) {
        await fs.rename(backup.backupGroupDir, backup.targetGroupDir).catch(() => {});
      }
    }
    throw error;
  }
}

async function finalizeAtomicOutput(config) {
  if (!config.atomicOutputDir || !config.finalOutputDir) {
    return;
  }
  if (config.groups.length > 0) {
    await finalizeAtomicGroupOutput(config);
    return;
  }

  const sourceDir = path.resolve(process.cwd(), config.atomicOutputDir);
  const targetDir = path.resolve(process.cwd(), config.finalOutputDir);
  const targetParent = path.dirname(targetDir);
  const targetName = path.basename(targetDir);
  const stagingDir = path.join(targetParent, `.${targetName}.next-${process.pid}-${Date.now()}`);
  const backupDir = path.join(targetParent, `.${targetName}.backup-${process.pid}-${Date.now()}`);

  await fs.mkdir(targetParent, { recursive: true });
  await fs.rm(stagingDir, { force: true, recursive: true });
  await fs.cp(sourceDir, stagingDir, { recursive: true });
  await rewriteAtomicManifestPaths({ sourceDir, stagingDir, targetDir });

  const targetExists = await pathExists(targetDir);
  if (targetExists) {
    await fs.rename(targetDir, backupDir);
  }

  try {
    await fs.rename(stagingDir, targetDir);
  } catch (error) {
    if (targetExists) {
      await fs.rename(backupDir, targetDir).catch(() => {});
    }
    throw error;
  }

  await fs.rm(backupDir, { force: true, recursive: true });
  await fs.rm(sourceDir, { force: true, recursive: true });
  process.stdout.write(
    `[screenshots:capture] atomic output promoted to ${path.relative(process.cwd(), targetDir)}\n`,
  );
}

function launchScreenshotCapture(authStatePath, config) {
  const runtimeConfig = buildRuntimeConfig(config);
  const hasStoredAuthState = hasPlaywrightAuthState(process.cwd(), process.env);
  const args = [
    "playwright",
    "test",
    "-c",
    "playwright.screenshot.config.ts",
    "e2e/tooling/screenshot-capture.spec.ts",
  ];
  if (config.headed) {
    args.push("--headed");
  }
  const childEnv = {
    ...process.env,
    ...buildScreenshotCaptureEnv(runtimeConfig),
  };
  if (hasStoredAuthState || needsAuthCapture(runtimeConfig)) {
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
    void (async () => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      const exitCode = code ?? 1;
      if (exitCode !== 0) {
        if (runtimeConfig.atomicOutputDir) {
          process.stderr.write(
            `[screenshots:capture] atomic output was not promoted: ${runtimeConfig.atomicOutputDir}\n`,
          );
        }
        process.exit(exitCode);
      }
      try {
        await finalizeAtomicOutput(runtimeConfig);
        process.exit(0);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`[screenshots:capture] failed to promote atomic output: ${message}\n`);
        process.exit(1);
      }
    })();
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
