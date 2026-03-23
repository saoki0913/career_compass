import fs from "node:fs";
import path from "node:path";
import { collectChangedFiles } from "./ui-ci-context.mjs";

const MARKETING_FILE_PATTERNS = [
  /^src\/app\/\(marketing\)\//,
  /^src\/components\/landing\//,
  /^src\/components\/public-surface\//,
  /^src\/lib\/marketing\//,
];

const ACCENT_COLOR_FAMILIES = [
  "blue",
  "sky",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
];

const ACCENT_UTILITY_PATTERN = new RegExp(
  String.raw`\b(?:[a-z-]+:)*(?:bg|text|border|ring|fill|stroke|from|via|to|decoration|accent|caret|divide)-(${ACCENT_COLOR_FAMILIES.join("|")})-[A-Za-z0-9\[\]\/.-]+`,
  "g"
);

export function collectUiGuardrailFindings({ files = [], env = process.env, cwd = process.cwd() } = {}) {
  const changedFiles = files.length > 0 ? files : collectChangedFiles({ env, cwd });
  const findings = [];

  for (const filePath of changedFiles) {
    const normalizedPath = filePath.replaceAll("\\", "/");
    const content = readTextFileIfExists(cwd, normalizedPath);
    if (content === null) {
      continue;
    }

    if (isMarketingUiFile(normalizedPath)) {
      findings.push(...findMarketingAccentFindings(normalizedPath, content));
    }

    if (isLoadingFile(normalizedPath)) {
      findings.push(...findLoadingFindings(normalizedPath, content));
    }
  }

  return findings;
}

export function formatUiGuardrailReport(findings) {
  if (findings.length === 0) {
    return "[ui-guardrails] no issues found";
  }

  const lines = [`[ui-guardrails] ${findings.length} issue(s) found`];
  for (const finding of findings) {
    lines.push(`- ${finding.file}: ${finding.message}`);
  }
  return lines.join("\n");
}

function findMarketingAccentFindings(filePath, content) {
  const findings = [];
  for (const match of content.matchAll(ACCENT_UTILITY_PATTERN)) {
    findings.push({
      file: filePath,
      rule: "marketing-accent-utility",
      message: `hardcoded accent color utility \`${match[0]}\` is not allowed in marketing UI`,
    });
  }
  return findings;
}

function findLoadingFindings(filePath, content) {
  const findings = [];
  const hasSkeleton = /\bSkeleton\b|\bskeleton\b/.test(content);
  const hasSpinnerOnlyPattern =
    /animate-spin|spinner/i.test(content) ||
    /読み込み中/.test(content) ||
    /loading/i.test(content);

  if (!hasSkeleton) {
    findings.push({
      file: filePath,
      rule: "loading-skeleton-required",
      message: "loading.tsx must include a skeleton placeholder instead of a bare loading state",
    });
  }

  if (hasSpinnerOnlyPattern && !hasSkeleton) {
    findings.push({
      file: filePath,
      rule: "loading-spinner-only",
      message: "spinner-only or \u8aad\u307f\u8fbc\u307f\u4e2d... loading states are not allowed",
    });
  }

  return findings;
}

function isMarketingUiFile(filePath) {
  return MARKETING_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}

function isLoadingFile(filePath) {
  return /\/loading\.(?:t|j)sx?$/.test(filePath) || /^src\/app\/loading\.(?:t|j)sx?$/.test(filePath);
}

function readTextFileIfExists(cwd, filePath) {
  const absolutePath = path.join(cwd, filePath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  try {
    return fs.readFileSync(absolutePath, "utf8");
  } catch {
    return null;
  }
}
