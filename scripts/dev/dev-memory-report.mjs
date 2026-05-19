#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function section(title) {
  process.stdout.write(`\n== ${title} ==\n`);
}

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

function printCommand(title, command, args, options) {
  section(title);
  const output = run(command, args, options);
  process.stdout.write(`${output || "(no output)"}\n`);
}

function printPathSize(targetPath) {
  const absolutePath = path.join(repoRoot, targetPath);
  if (!fs.existsSync(absolutePath)) {
    process.stdout.write(`${targetPath}: not found\n`);
    return;
  }
  const output = run("du", ["-sh", targetPath]);
  process.stdout.write(`${output || `${targetPath}: size unavailable`}\n`);
}

function printTopProcesses() {
  section("Top RSS processes");
  const output = run("ps", ["-axo", "pid=,ppid=,rss=,pmem=,comm="]);
  if (output.startsWith("[unavailable]")) {
    process.stdout.write(`${output}\n`);
    return;
  }

  const rows = output
    .split("\n")
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(.+)$/);
      if (!match) return null;
      const [, pid, ppid, rssKb, pmem, command] = match;
      return {
        pid,
        ppid,
        rssKb: Number(rssKb),
        pmem,
        command,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.rssKb - a.rssKb)
    .slice(0, 30);

  process.stdout.write("PID    PPID   RSS      %MEM  COMMAND\n");
  for (const row of rows) {
    const rssMb = `${(row.rssKb / 1024).toFixed(1)}MB`;
    process.stdout.write(
      `${row.pid.padEnd(6)} ${row.ppid.padEnd(6)} ${rssMb.padEnd(8)} ${row.pmem.padEnd(5)} ${row.command}\n`,
    );
  }
}

function printNextDevRouteDiagnostics() {
  section("Next.js dev route diagnostics");
  const manifestPath = path.join(repoRoot, ".next/dev/server/app-paths-manifest.json");
  const routeKey = "/api/documents/[id]/review/stream/route";
  const compiledRouteDir = path.join(
    repoRoot,
    ".next/dev/server/app/api/documents/[id]/review/stream/route",
  );

  if (!fs.existsSync(manifestPath)) {
    process.stdout.write(".next/dev app-paths manifest: not found\n");
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    const detail =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : String(error);
    process.stdout.write(`.next/dev app-paths manifest: unreadable (${detail})\n`);
    return;
  }

  const routeRegistered = Object.prototype.hasOwnProperty.call(manifest, routeKey);
  const compiledRouteExists = fs.existsSync(compiledRouteDir);
  process.stdout.write(`ES review stream route registered: ${routeRegistered ? "yes" : "no"}\n`);
  process.stdout.write(`ES review stream compiled artifact exists: ${compiledRouteExists ? "yes" : "no"}\n`);
  if (!routeRegistered && compiledRouteExists) {
    process.stdout.write(
      "warning: compiled route exists but dev manifest omits it; stop next dev and run npm run dev:reset-next-cache\n",
    );
  }
}

section("Local dev memory report");
process.stdout.write(`time: ${new Date().toISOString()}\n`);
process.stdout.write(`cwd: ${repoRoot}\n`);

printCommand("Swap", "sysctl", ["vm.swapusage"]);
printCommand("Memory pressure", "memory_pressure", []);
printCommand("VM stats", "vm_stat", []);
printTopProcesses();

section("Next.js disk usage");
for (const targetPath of [
  ".next",
  ".next/dev",
  ".next/dev/cache",
  ".next/dev/cache/turbopack",
  ".next/dev/trace",
]) {
  printPathSize(targetPath);
}

printCommand("Docker containers", "docker", ["stats", "--no-stream"], { timeout: 15000 });
printCommand("Docker disk usage", "docker", ["system", "df"], { timeout: 15000 });
printNextDevRouteDiagnostics();
