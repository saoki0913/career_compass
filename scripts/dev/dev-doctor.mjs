#!/usr/bin/env node
/**
 * 0=逼迫なし / 1=逼迫検出。dev 専用のため CI ブロックには使わない。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { triageMemory } from "./dev-doctor-rules.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch (error) {
    const detail =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : String(error);
    return `[unavailable] ${command} ${args.join(" ")}: ${detail}`;
  }
}

function isUnavailable(output) {
  return output.startsWith("[unavailable]");
}

function toGb(value, unit) {
  const normalizedUnit = unit.toUpperCase();
  if (normalizedUnit === "G") return value;
  if (normalizedUnit === "M") return value / 1024;
  if (normalizedUnit === "K") return value / 1024 / 1024;
  return value / 1024 / 1024 / 1024;
}

function roundGb(value) {
  return Math.round(value * 100) / 100;
}

function collectSwap() {
  const output = run("sysctl", ["vm.swapusage"]);
  if (isUnavailable(output)) return null;

  const match = output.match(/total\s*=\s*([\d.]+)([KMG])\s+used\s*=\s*([\d.]+)([KMG])/i);
  if (!match) return null;

  const [, totalRaw, totalUnit, usedRaw, usedUnit] = match;
  return {
    usedGb: roundGb(toGb(Number(usedRaw), usedUnit)),
    totalGb: roundGb(toGb(Number(totalRaw), totalUnit)),
  };
}

function collectMemoryFreePct() {
  const output = run("memory_pressure", []);
  if (isUnavailable(output)) return null;

  const match = output.match(/System-wide memory free percentage:\s*(\d+)%/);
  return match ? Number(match[1]) : null;
}

function collectNextServer() {
  const output = run("ps", ["-axo", "pid=,ppid=,rss=,comm="]);
  if (isUnavailable(output) || !output) return null;

  let maxRssGb = 0;
  let count = 0;
  for (const line of output.split("\n")) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
    if (!match) continue;

    const [, , , rssKb, command] = match;
    if (!/\bnext-server\b/.test(command)) continue;

    count += 1;
    maxRssGb = Math.max(maxRssGb, Number(rssKb) / 1024 / 1024);
  }

  // `next dev` の親シェルと `next-server` の子プロセスを二重カウントしないため、
  // count は実メモリを持つ `next-server` プロセス数だけにする。
  return { maxRssGb: roundGb(maxRssGb), count };
}

function collectSupabaseAnalyticsRunning() {
  const output = run("docker", ["ps", "--filter", "name=supabase_analytics", "--format", "{{.Names}}"], {
    timeout: 15000,
  });
  if (isUnavailable(output)) return null;
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length > 0;
}

function collectNextDevDirGb() {
  const relativePath = path.join(".next", "dev");
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) return 0;

  const output = run("du", ["-sk", relativePath]);
  if (isUnavailable(output)) return null;

  const match = output.match(/^(\d+)\s+/);
  return match ? roundGb(Number(match[1]) / 1024 / 1024) : null;
}

function collectSamples() {
  return {
    swap: collectSwap(),
    memoryFreePct: collectMemoryFreePct(),
    nextServer: collectNextServer(),
    supabaseAnalyticsRunning: collectSupabaseAnalyticsRunning(),
    nextDevDirGb: collectNextDevDirGb(),
  };
}

function formatGb(value) {
  return value === null || value === undefined ? "測定不能" : `${value}GB`;
}

function formatPct(value) {
  return value === null || value === undefined ? "測定不能" : `${value}%`;
}

function formatBool(value) {
  if (value === null || value === undefined) return "測定不能";
  return value ? "running" : "stopped";
}

function renderHuman(samples, result) {
  const lines = [
    "=== Dev Memory Doctor ===",
    `time: ${new Date().toISOString()}`,
    `repoRoot: ${repoRoot}`,
    "",
    "== Samples ==",
    `swap: ${samples.swap ? `${samples.swap.usedGb}GB / ${samples.swap.totalGb}GB` : "測定不能"}`,
    `memory free: ${formatPct(samples.memoryFreePct)}`,
    `next-server: ${
      samples.nextServer
        ? `max RSS ${samples.nextServer.maxRssGb}GB, count ${samples.nextServer.count}`
        : "測定不能"
    }`,
    `supabase analytics: ${formatBool(samples.supabaseAnalyticsRunning)}`,
    `.next/dev: ${formatGb(samples.nextDevDirGb)}`,
    "",
    "== Issues ==",
  ];

  if (result.summary.total === 0) {
    lines.push("逼迫なし");
  } else {
    if (result.ok) {
      lines.push("逼迫なし");
    }
    for (const issue of result.issues) {
      lines.push(`[${issue.severity}] [${issue.source}] ${issue.description}`);
      lines.push(`  -> 対処: ${issue.suggestedAction}`);
    }
  }

  lines.push("");
  process.stdout.write(`${lines.join("\n")}\n`);
}

function main() {
  const json = process.argv.slice(2).includes("--json");
  const samples = collectSamples();
  const result = triageMemory(samples);

  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          samples,
          issues: result.issues,
          summary: result.summary,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    renderHuman(samples, result);
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
