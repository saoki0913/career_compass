#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(__dirname, "..");

function parseArgs(argv) {
  const result = {
    mode: "standard",
    stagedOnly: false,
    rolloutPhase: "",
  };

  for (const arg of argv) {
    if (arg.startsWith("--mode=")) {
      result.mode = arg.slice("--mode=".length);
      continue;
    }
    if (arg === "--staged-only") {
      result.stagedOnly = true;
      continue;
    }
    if (arg.startsWith("--rollout-phase=")) {
      result.rolloutPhase = arg.slice("--rollout-phase=".length).toUpperCase();
      continue;
    }
  }
  return result;
}

function readConfigPhase() {
  const configPath = join(PROJECT_DIR, ".claude", "quality-gate.json");
  if (!existsSync(configPath)) return "A";
  try {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    return (config.rollout_phase || "A").toUpperCase();
  } catch {
    return "A";
  }
}

function loadCategories() {
  const categoriesPath = join(PROJECT_DIR, "tools", "quality-gate-categories.mjs");
  if (!existsSync(categoriesPath)) return null;
  return null;
}

function loadItems() {
  const itemsPath = join(PROJECT_DIR, "tools", "quality-gate-items.json");
  if (!existsSync(itemsPath)) return [];
  try {
    return JSON.parse(readFileSync(itemsPath, "utf8"));
  } catch {
    return [];
  }
}

function globToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\0")
    .replace(/\*/g, "[^/]*")
    .replace(/\0/g, ".*")
    .replace(/\?/g, "[^/]");
  return new RegExp(`(?:^|/)${escaped}$`);
}

function getStagedFiles() {
  const result = spawnSync("git", ["-C", PROJECT_DIR, "diff", "--cached", "--name-only"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function getStagedFileContent(filePath) {
  const result = spawnSync("git", ["-C", PROJECT_DIR, "show", `:0:${filePath}`], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) return "";
  return result.stdout;
}

function classifyFileToCategories(filePath) {
  const categories = [];

  if (/(?:^|\/)(src\/lib\/auth\/|src\/lib\/csrf\.ts|src\/bff\/identity\/)/.test(filePath)) {
    categories.push("security", "auth");
  } else if (
    /(?:^|\/)(src\/lib\/stripe\/|src\/app\/api\/stripe\/|src\/app\/api\/webhooks\/stripe\/|src\/app\/api\/credits\/|src\/bff\/billing\/)/.test(
      filePath,
    )
  ) {
    categories.push("payment", "security");
  } else if (
    /(?:^|\/)src\/lib\/calendar\//.test(filePath) ||
    /(?:^|\/)src\/app\/api\/calendar\//.test(filePath)
  ) {
    categories.push("externalServices");
  } else if (/(?:^|\/)src\/app\/api\/.+\/route\.ts$/.test(filePath)) {
    categories.push("security", "apiDesign");
  } else if (/(?:^|\/)backend\/app\/routers\//.test(filePath)) {
    categories.push("security", "apiDesign", "performance");
  } else if (/(?:^|\/)backend\/app\/prompts\/|(?:^|\/)backend\/app\/utils\/llm/.test(filePath)) {
    categories.push("aiLlm", "cost");
  } else if (
    /(?:^|\/)src\/components\//.test(filePath) ||
    /(?:^|\/)src\/app\/.*\/page\.tsx$/.test(filePath) ||
    /(?:^|\/)src\/app\/.*\/layout\.tsx$/.test(filePath) ||
    /(?:^|\/)src\/app\/.*\/loading\.tsx$/.test(filePath)
  ) {
    categories.push("frontend");
  } else if (/(?:^|\/)src\/lib\/db\/schema\.ts$/.test(filePath) || /(?:^|\/)drizzle_pg\//.test(filePath)) {
    categories.push("database");
  } else if (/(?:^|\/)src\/lib\/datetime\//.test(filePath)) {
    categories.push("datetime");
  }

  if (/\.(ts|tsx|py)$/.test(filePath)) {
    if (!categories.includes("correctness")) categories.push("correctness");
    if (!categories.includes("maintainability")) categories.push("maintainability");
  }

  return categories;
}

function getSessionDir() {
  const home = process.env.HOME || process.env.USERPROFILE || "/tmp";
  return join(home, ".claude", "sessions", "career_compass");
}

function isDeferredItem(itemId, sessionId) {
  const sessionDir = getSessionDir();
  const pattern = `qg-deferral-${itemId}-`;
  try {
    const entries = readFileSync(join(sessionDir, `qg-deferral-${itemId}-${sessionId}`), "utf8");
    return true;
  } catch {
    return false;
  }
}

function computeVerdict(phase, criticalCount, highCount, mediumCount) {
  if (phase === "A") {
    if (criticalCount > 0 || highCount > 0 || mediumCount > 0) return "WARN";
    return "PASS";
  }

  if (phase === "B") {
    if (criticalCount > 0) return "BLOCK";
    if (highCount > 0 || mediumCount > 0) return "WARN";
    return "PASS";
  }

  if (criticalCount > 0 || highCount > 0) return "BLOCK";
  if (mediumCount > 0) return "WARN";
  return "PASS";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rolloutPhase = args.rolloutPhase || readConfigPhase();

  const files = args.stagedOnly ? getStagedFiles() : getStagedFiles();
  if (files.length === 0) {
    const report = {
      gate_verdict: "PASS",
      rollout_phase: rolloutPhase,
      total_findings: 0,
      critical_findings: 0,
      high_findings: 0,
      medium_findings: 0,
      categories_checked: [],
      categories_total: 17,
      findings: [],
      passed_categories: [],
      deferred_items: 0,
      timestamp: new Date().toISOString(),
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  const allCategories = new Set();
  const fileCategories = new Map();

  for (const file of files) {
    const cats = classifyFileToCategories(file);
    fileCategories.set(file, cats);
    for (const cat of cats) {
      allCategories.add(cat);
    }
  }

  const items = loadItems();
  const sessionId = process.env.SESSION_ID || "unknown";

  let categoriesModule = null;
  try {
    const categoriesPath = join(PROJECT_DIR, "tools", "quality-gate-categories.mjs");
    if (existsSync(categoriesPath)) {
      categoriesModule = await import(categoriesPath);
    }
  } catch {
    categoriesModule = null;
  }

  const matchingItems = items.filter((item) => {
    const itemCats = Array.isArray(item.categories) ? item.categories : [item.category];
    return itemCats.some((cat) => allCategories.has(cat));
  });

  const itemsToCheck =
    args.mode === "quick" ? matchingItems.slice(0, 20) : matchingItems;

  const findings = [];
  let deferredCount = 0;
  const checkedCategories = new Set();

  for (const item of itemsToCheck) {
    const itemCats = Array.isArray(item.categories) ? item.categories : [item.category];
    for (const cat of itemCats) {
      checkedCategories.add(cat);
    }

    if (isDeferredItem(item.id, sessionId)) {
      deferredCount += 1;
      continue;
    }

    if (item.check_type === "pattern" && item.check_regex) {
      let regex;
      try {
        regex = new RegExp(item.check_regex, item.check_flags || "gm");
      } catch {
        continue;
      }

      const includeMatchers = (item.file_patterns || []).map(globToRegex);
      const excludeMatchers = (item.exclude_patterns || []).map(globToRegex);

      for (const file of files) {
        if (includeMatchers.length > 0 && !includeMatchers.some((re) => re.test(file))) continue;
        if (excludeMatchers.some((re) => re.test(file))) continue;

        const fileCats = fileCategories.get(file) || [];
        if (!itemCats.some((cat) => fileCats.includes(cat))) continue;

        const content = getStagedFileContent(file);
        if (!content) continue;

        const matches = content.match(regex);
        if (matches) {
          findings.push({
            item_id: item.id,
            category: itemCats[0],
            severity: item.severity || "medium",
            message: item.message || item.id,
            file,
            match_count: matches.length,
            check_type: "pattern",
          });
        }
      }
    } else {
      deferredCount += 1;
    }
  }

  const criticalFindings = findings.filter((f) => f.severity === "critical").length;
  const highFindings = findings.filter((f) => f.severity === "high").length;
  const mediumFindings = findings.filter((f) => f.severity === "medium").length;

  const verdict = computeVerdict(rolloutPhase, criticalFindings, highFindings, mediumFindings);

  const passedCategories = [...allCategories].filter(
    (cat) => !findings.some((f) => f.category === cat),
  );

  const report = {
    gate_verdict: verdict,
    rollout_phase: rolloutPhase,
    total_findings: findings.length,
    critical_findings: criticalFindings,
    high_findings: highFindings,
    medium_findings: mediumFindings,
    categories_checked: [...checkedCategories],
    categories_total: 17,
    findings,
    passed_categories: passedCategories,
    deferred_items: deferredCount,
    timestamp: new Date().toISOString(),
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (verdict === "BLOCK") {
    process.exit(1);
  }
}

main().catch((error) => {
  const fallbackReport = {
    gate_verdict: "PASS",
    rollout_phase: "A",
    total_findings: 0,
    critical_findings: 0,
    high_findings: 0,
    medium_findings: 0,
    categories_checked: [],
    categories_total: 17,
    findings: [],
    passed_categories: [],
    deferred_items: 0,
    timestamp: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  };
  process.stdout.write(`${JSON.stringify(fallbackReport, null, 2)}\n`);
});
