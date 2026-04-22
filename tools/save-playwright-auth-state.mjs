#!/usr/bin/env node

import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import os from "node:os";
import { getPlaywrightAuthStatePath } from "../src/lib/verification-harness.mjs";

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_ROUTE = "/dashboard";
const COOKIE_FILE_CANDIDATES = [
  "Network/Cookies",
  "Network/Cookies-journal",
  "Cookies",
  "Cookies-journal",
  "Preferences",
  "Secure Preferences",
];

function parseArgs(argv) {
  let baseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim() || DEFAULT_BASE_URL;
  let routePath = process.env.PLAYWRIGHT_AUTH_CAPTURE_ROUTE?.trim() || DEFAULT_ROUTE;
  let outputPath = getPlaywrightAuthStatePath(process.cwd(), process.env);
  let headed = process.env.PLAYWRIGHT_AUTH_CAPTURE_HEADED === "1";
  let forceRefresh = false;

  for (const arg of argv) {
    if (arg.startsWith("--base-url=")) {
      baseUrl = arg.slice("--base-url=".length).trim();
      continue;
    }
    if (arg.startsWith("--route=")) {
      routePath = arg.slice("--route=".length).trim();
      continue;
    }
    if (arg.startsWith("--output=")) {
      outputPath = path.resolve(process.cwd(), arg.slice("--output=".length).trim());
      continue;
    }
    if (arg === "--headed") {
      headed = true;
      continue;
    }
    if (arg === "--refresh") {
      forceRefresh = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return { baseUrl, routePath, outputPath, headed, forceRefresh };
}

function createTimeoutError(step, timeoutMs) {
  return new Error(`${step} timed out after ${timeoutMs}ms`);
}

async function withTimeout(promise, timeoutMs, step) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(createTimeoutError(step, timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function getChromeUserDataDir() {
  return (
    process.env.CODEX_CHROME_USER_DATA_DIR?.trim() ||
    path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome")
  );
}

async function parseLocalState(chromeUserDataDir) {
  const localStatePath = path.join(chromeUserDataDir, "Local State");
  const raw = await fs.readFile(localStatePath, "utf8");
  const localState = JSON.parse(raw);
  const infoCache = localState?.profile?.info_cache ?? {};
  const availableProfiles = Object.keys(infoCache);
  const lastUsed = localState?.profile?.last_used || "Default";
  return { localStatePath, availableProfiles, lastUsed };
}

function getProfileCandidates(localState) {
  const explicit = process.env.CODEX_CHROME_PROFILE?.trim();
  if (explicit) {
    return [explicit];
  }

  const ordered = [localState.lastUsed || "Default", ...localState.availableProfiles];
  return [...new Set(ordered.filter(Boolean))];
}

async function probeBaseUrl(baseUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(baseUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function getCookieCandidates(baseUrl) {
  const secure = new URL(baseUrl).protocol === "https:";
  return secure
    ? ["__Secure-better-auth.session_token", "better-auth.session_token"]
    : ["better-auth.session_token"];
}

async function readStorageState(outputPath) {
  const raw = await fs.readFile(outputPath, "utf8");
  return JSON.parse(raw);
}

async function isUsableStorageState(outputPath) {
  if (!(await pathExists(outputPath))) {
    return false;
  }

  try {
    const parsed = await readStorageState(outputPath);
    return Array.isArray(parsed.cookies) && parsed.cookies.length > 0;
  } catch {
    return false;
  }
}

async function copyFileIfExists(sourcePath, destinationPath) {
  if (!(await pathExists(sourcePath))) {
    return false;
  }
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
  return true;
}

async function mirrorCookieStoreVariants(chromeUserDataDir, profileName, tempProfileDir, copiedPaths) {
  const cookieVariants = [
    {
      source: path.join(chromeUserDataDir, profileName, "Cookies"),
      mirrors: [
        path.join(tempProfileDir, "Network", "Cookies"),
      ],
      label: "Network/Cookies<=Cookies",
    },
    {
      source: path.join(chromeUserDataDir, profileName, "Cookies-journal"),
      mirrors: [
        path.join(tempProfileDir, "Network", "Cookies-journal"),
      ],
      label: "Network/Cookies-journal<=Cookies-journal",
    },
    {
      source: path.join(chromeUserDataDir, profileName, "Network", "Cookies"),
      mirrors: [
        path.join(tempProfileDir, "Cookies"),
      ],
      label: "Cookies<=Network/Cookies",
    },
    {
      source: path.join(chromeUserDataDir, profileName, "Network", "Cookies-journal"),
      mirrors: [
        path.join(tempProfileDir, "Cookies-journal"),
      ],
      label: "Cookies-journal<=Network/Cookies-journal",
    },
  ];

  for (const variant of cookieVariants) {
    if (!(await pathExists(variant.source))) {
      continue;
    }

    for (const destination of variant.mirrors) {
      if (await pathExists(destination)) {
        continue;
      }
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(variant.source, destination);
      copiedPaths.push(variant.label);
    }
  }
}

async function createSlimChromeCopy({ chromeUserDataDir, localStatePath, profileName }) {
  const tempUserDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "career-compass-chrome-"));
  const tempProfileDir = path.join(tempUserDataDir, profileName);
  const copiedPaths = [];

  await fs.mkdir(tempProfileDir, { recursive: true });
  await fs.copyFile(localStatePath, path.join(tempUserDataDir, "Local State"));
  copiedPaths.push("Local State");

  for (const relativePath of COOKIE_FILE_CANDIDATES) {
    const copied = await copyFileIfExists(
      path.join(chromeUserDataDir, profileName, relativePath),
      path.join(tempProfileDir, relativePath),
    );
    if (copied) {
      copiedPaths.push(relativePath);
    }
  }

  await mirrorCookieStoreVariants(chromeUserDataDir, profileName, tempProfileDir, copiedPaths);

  return { tempUserDataDir, copiedPaths };
}

async function createFullChromeCopy({ chromeUserDataDir, localStatePath, profileName }) {
  const tempUserDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "career-compass-chrome-full-"));
  const tempProfileDir = path.join(tempUserDataDir, profileName);
  const copiedPaths = [];

  await fs.copyFile(localStatePath, path.join(tempUserDataDir, "Local State"));
  copiedPaths.push("Local State");
  await fs.cp(path.join(chromeUserDataDir, profileName), tempProfileDir, { recursive: true });
  copiedPaths.push(`${profileName}/**`);

  for (const lockName of [
    "SingletonLock",
    "SingletonCookie",
    "SingletonSocket",
    "DevToolsActivePort",
    path.join(profileName, "Lockfile"),
    path.join(profileName, "DevToolsActivePort"),
  ]) {
    await fs.rm(path.join(tempUserDataDir, lockName), { force: true }).catch(() => {});
  }

  return { tempUserDataDir, copiedPaths };
}

function querySqliteRows(databasePath, query) {
  const result = spawnSync("sqlite3", [databasePath, query], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return "";
  }
  return result.stdout.trim();
}

function profileLikelyHasAuthCookie(chromeUserDataDir, profileName) {
  const query =
    "select name from cookies where host_key in ('localhost','127.0.0.1') and name like '%better-auth.session_token%' limit 1;";
  const databaseCandidates = [
    path.join(chromeUserDataDir, profileName, "Cookies"),
    path.join(chromeUserDataDir, profileName, "Network", "Cookies"),
  ];

  for (const databasePath of databaseCandidates) {
    const rows = querySqliteRows(databasePath, query);
    if (rows.includes("better-auth.session_token")) {
      return true;
    }
  }

  return false;
}

async function captureAuthState({ baseUrl, routePath, outputPath, headed, tempUserDataDir, profileName }) {
  const cookieCandidates = getCookieCandidates(baseUrl);
  let context;
  try {
    context = await withTimeout(
      chromium.launchPersistentContext(tempUserDataDir, {
        channel: "chrome",
        headless: !headed,
        args: [`--profile-directory=${profileName}`],
      }),
      20000,
      "launchPersistentContext",
    );

    const page = context.pages()[0] ?? (await context.newPage());
    const targetUrl = new URL(routePath, baseUrl).toString();
    await withTimeout(page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 15000 }), 20000, "goto");
    await page.waitForTimeout(1200);

    const cookies = await context.cookies(baseUrl);
    const matchedCookies = cookies.filter((cookie) => cookieCandidates.includes(cookie.name));
    const sessionResponse = await context.request.get(`${baseUrl.replace(/\/$/, "")}/api/auth/get-session`);
    const sessionBody = await sessionResponse.json().catch(() => null);
    const userId = sessionBody?.user?.id || "";

    if (!userId || matchedCookies.length === 0) {
      const presentCookies = cookies.map((cookie) => cookie.name).join(", ") || "(none)";
      throw new Error(
        [
          "Authenticated localhost session was not found in the copied Chrome profile.",
          `expectedCookies=${cookieCandidates.join(", ")}`,
          `presentCookies=${presentCookies}`,
          `sessionStatus=${sessionResponse.status()}`,
          userId ? `sessionUserId=${userId}` : "sessionUserId=(none)",
        ].join(" | "),
      );
    }

    await context.storageState({ path: outputPath });
  } finally {
    await context?.close().catch(() => {});
  }
}

function formatDiagnostics({
  baseUrl,
  chromeUserDataDir,
  profileCandidates,
  attemptedProfiles,
  availableProfiles,
  outputPath,
  error,
  baseUrlReachable,
}) {
  const lines = [
    "Failed to capture Playwright auth state.",
    "",
    "症状:",
    `- ${error instanceof Error ? error.message : String(error)}`,
    "",
    "確認した内容:",
    `- baseUrl: ${baseUrl}`,
    `- baseUrl reachable: ${baseUrlReachable ? "yes" : "no"}`,
    `- chrome user data dir: ${chromeUserDataDir}`,
    `- requested profiles: ${profileCandidates.join(", ") || "(none)"}`,
    `- available profiles: ${availableProfiles.join(", ") || "(none)"}`,
    `- attempted profiles: ${attemptedProfiles.join(", ") || "(none)"}`,
    `- target auth state: ${outputPath}`,
    "",
    "必要なら設定する値:",
    `- PLAYWRIGHT_BASE_URL=${baseUrl}`,
    `- CODEX_CHROME_USER_DATA_DIR="${chromeUserDataDir}"`,
    availableProfiles.length > 0
      ? `- CODEX_CHROME_PROFILE=<${availableProfiles.join(" | ")}>`
      : "- CODEX_CHROME_PROFILE=<Chrome profile name>",
    `- PLAYWRIGHT_AUTH_STATE=${outputPath}`,
    "",
    "次の確認:",
    "- Chrome で localhost にログインしたままになっているか",
    "- 対象 profile が正しいか",
    "- localhost app が実際に起動しているか",
  ];
  return lines.join("\n");
}

async function main() {
  const { baseUrl, routePath, outputPath, headed, forceRefresh } = parseArgs(process.argv.slice(2));

  if (!forceRefresh && (await isUsableStorageState(outputPath))) {
    process.stdout.write(`${outputPath}\n`);
    return;
  }

  const chromeUserDataDir = getChromeUserDataDir();
  const baseUrlReachable = await probeBaseUrl(baseUrl);
  if (!baseUrlReachable) {
    throw new Error(
      [
        `localhost app is not reachable: ${baseUrl}`,
        `Set PLAYWRIGHT_BASE_URL if you use another origin.`,
      ].join(" "),
    );
  }

  const localState = await parseLocalState(chromeUserDataDir);
  const profileCandidates = getProfileCandidates(localState);
  const missingProfiles = [];

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const attemptedProfiles = [];
  const profileErrors = [];
  try {
    for (const profileName of profileCandidates) {
      const profileDir = path.join(chromeUserDataDir, profileName);
      if (!(await pathExists(profileDir))) {
        missingProfiles.push(profileName);
        continue;
      }

      attemptedProfiles.push(profileName);
      const shouldTryFullCopy = profileLikelyHasAuthCookie(chromeUserDataDir, profileName);
      let tempUserDataDir = "";
      try {
        const captureStrategies = [
          { label: "slim-copy", createCopy: createSlimChromeCopy },
          ...(shouldTryFullCopy ? [{ label: "full-copy", createCopy: createFullChromeCopy }] : []),
        ];

        let lastError = null;
        for (const strategy of captureStrategies) {
          try {
            const copy = await strategy.createCopy({
              chromeUserDataDir,
              localStatePath: localState.localStatePath,
              profileName,
            });
            tempUserDataDir = copy.tempUserDataDir;

            await captureAuthState({
              baseUrl,
              routePath,
              outputPath,
              headed,
              tempUserDataDir,
              profileName,
            });

            if (!(await isUsableStorageState(outputPath))) {
              throw new Error(`Generated auth state is empty or invalid: ${outputPath}`);
            }

            process.stdout.write(`${outputPath}\n`);
            return;
          } catch (error) {
            lastError = `${strategy.label}: ${error instanceof Error ? error.message : String(error)}`;
          } finally {
            if (tempUserDataDir) {
              await fs.rm(tempUserDataDir, { recursive: true, force: true }).catch(() => {});
              tempUserDataDir = "";
            }
          }
        }

        throw new Error(lastError || "capture failed");
      } catch (error) {
        profileErrors.push(
          `${profileName}: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        if (tempUserDataDir) {
          await fs.rm(tempUserDataDir, { recursive: true, force: true }).catch(() => {});
        }
      }
    }

    if (missingProfiles.length > 0) {
      profileErrors.push(`missing: ${missingProfiles.join(", ")}`);
    }
    throw new Error(profileErrors.join("\n"));
  } catch (error) {
    throw new Error(
      formatDiagnostics({
        baseUrl,
        chromeUserDataDir,
        profileCandidates,
        attemptedProfiles,
        availableProfiles: localState.availableProfiles,
        outputPath,
        error,
        baseUrlReachable,
      }),
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
