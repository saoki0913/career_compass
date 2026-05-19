#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

// ---------------------------------------------------------------------------
// CI allowlist: vars OK to be missing from CI workflows
// ---------------------------------------------------------------------------
const CI_ALLOWLIST_PATTERNS = [
  /^UPSTASH_REDIS_REST_/,
  /^RESEND_API_KEY$/,
  /^CONTACT_.*_EMAIL$/,
  /^LOGO_DEV_TOKEN$/,
  /^LOGO_DEV_SECRET_KEY$/,
  /^BRANDFETCH_CLIENT_ID$/,
  /^SENTRY_/,
  /^NEXT_PUBLIC_GA_/,
  /^NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION$/,
  /^NEXT_PUBLIC_SENTRY_DSN$/,
  /^CI_E2E_/,
  /^DISABLE_TOKEN_LIMIT$/,
  /^TENANT_KEY_SECRET$/,
  /^DATABASE_POOL_SIZE$/,
  /^STRIPE_PRICE_.*_ANNUAL$/,
  /^CAREER_PRINCIPAL_HMAC_SECRET$/,
];

// CI meta vars that are NOT application env vars (exclude from extraction)
const CI_META_PATTERNS = [
  /^PLAYWRIGHT_/,
  /^SECURITY_SCAN_/,
  /^SKIP_NPM_AUDIT$/,
  /^RUN_LIVE_ES_REVIEW$/,
  /^LIVE_ES_REVIEW_/,
  /^RUN_AI_LIVE_SMOKE$/,
  /^CI_E2E_SCOPE$/,
  /^LIVE_AI_CONVERSATION_/,
  /^PLAYWRIGHT_RETRIES$/,
  /^AI_LIVE_/,
];

function isCiAllowlisted(varName) {
  return CI_ALLOWLIST_PATTERNS.some((pattern) => pattern.test(varName));
}

function isCiMetaVar(varName) {
  return CI_META_PATTERNS.some((pattern) => pattern.test(varName));
}

function shouldScanDirectProcessEnvUsage(filePath) {
  if (!filePath.startsWith("src/")) return false;
  if (filePath.startsWith("src/env/")) return false;
  if (filePath.startsWith("e2e/")) return false;
  if (/\.(test|spec)\.tsx?$/.test(filePath)) return false;
  return /\.(ts|tsx|js|jsx)$/.test(filePath);
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------
function runGit(args, cwd = process.cwd()) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) {
    return "";
  }
  return result.stdout;
}

async function readSource(filePath, staged, cwd = process.cwd()) {
  if (staged) {
    return runGit(["show", `:${filePath}`], cwd);
  }
  try {
    return await readFile(path.join(cwd, filePath), "utf8");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// extractT3EnvVars
// ---------------------------------------------------------------------------
export function extractT3EnvVars(serverSrc, clientSrc) {
  const server = parseT3Block(serverSrc, "server");
  const client = parseT3Block(clientSrc, "client");
  return { server, client };
}

function parseT3Block(src, blockName) {
  const vars = new Map();
  const lines = src.split(/\r?\n/);
  let depth = 0;
  let inBlock = false;
  let inRuntimeEnv = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect experimental__runtimeEnv block and skip it
    if (/experimental__runtimeEnv\s*[:=]/.test(line)) {
      inRuntimeEnv = true;
      // Count braces on this line
      const openCount = (line.match(/{/g) || []).length;
      const closeCount = (line.match(/}/g) || []).length;
      if (openCount > 0) {
        depth = openCount - closeCount;
        if (depth <= 0) {
          inRuntimeEnv = false;
          depth = 0;
        }
      }
      continue;
    }

    if (inRuntimeEnv) {
      const openCount = (line.match(/{/g) || []).length;
      const closeCount = (line.match(/}/g) || []).length;
      depth += openCount - closeCount;
      if (depth <= 0) {
        inRuntimeEnv = false;
        depth = 0;
      }
      continue;
    }

    // Detect block start: `server: {` or `client: {`
    if (!inBlock) {
      const blockStart = new RegExp(`\\b${blockName}\\s*:\\s*\\{`);
      if (blockStart.test(line)) {
        inBlock = true;
        depth = 1;
        // Also check for vars on the opening line itself (unlikely but safe)
        const varMatch = line.match(/^\s+([A-Z][A-Z0-9_]*)\s*:\s*z\./);
        if (varMatch) {
          const required = !isOptionalZodChain(line);
          vars.set(varMatch[1], { required, line: i + 1 });
        }
        continue;
      }
      continue;
    }

    // Count brace depth
    const openCount = (line.match(/{/g) || []).length;
    const closeCount = (line.match(/}/g) || []).length;
    depth += openCount - closeCount;

    if (depth <= 0) {
      // Block ended
      break;
    }

    // Match var declarations: `VAR_NAME: z.` pattern
    const varMatch = line.match(/^\s+([A-Z][A-Z0-9_]*)\s*:\s*z\./);
    if (varMatch) {
      const required = !isOptionalZodChain(line);
      vars.set(varMatch[1], { required, line: i + 1 });
    }
  }

  return vars;
}

function isOptionalZodChain(line) {
  // Detect .optional() or .default(...) anywhere in the chain
  return /\.optional\(\)/.test(line) || /\.default\(/.test(line);
}

// ---------------------------------------------------------------------------
// extractBackendConfigVars
// ---------------------------------------------------------------------------
export function extractBackendConfigVars(configSrc) {
  const vars = new Map();
  const lines = configSrc.split(/\r?\n/);

  // Accumulator for multi-line Field(...) blocks
  let accumLine = "";
  let accumStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (accumLine) {
      accumLine += " " + line.trim();
      // Check if parentheses are balanced
      if (isBalanced(accumLine)) {
        extractAliasChoicesVars(accumLine, accumStartLine, vars);
        accumLine = "";
      }
      continue;
    }

    // Detect AliasChoices on a single line
    if (/validation_alias\s*=\s*AliasChoices\s*\(/.test(line)) {
      if (isBalanced(line)) {
        extractAliasChoicesVars(line, lineNum, vars);
      } else {
        // Multi-line: start accumulating
        accumLine = line.trim();
        accumStartLine = lineNum;
      }
      continue;
    }

    // Tier 2: implicit field_name.upper() for fields without AliasChoices
    // Match: `field_name: type = ...` or `field_name: type` pattern (Pydantic fields)
    const implicitMatch = line.match(/^\s{4}([a-z][a-z0-9_]*)\s*:\s*(?:str|int|float|bool|list)/);
    if (implicitMatch) {
      const fieldName = implicitMatch[1];
      const envName = fieldName.toUpperCase();
      // Only add if no explicit AliasChoices was found for this var
      if (!vars.has(envName)) {
        vars.set(envName, { line: lineNum, tier: 2 });
      }
    }
  }

  return vars;
}

function extractAliasChoicesVars(text, lineNum, vars) {
  const aliasMatch = text.match(/validation_alias\s*=\s*AliasChoices\(\s*([^)]+)\)/);
  if (!aliasMatch) {
    return;
  }
  const namesRaw = aliasMatch[1];
  const nameMatches = namesRaw.matchAll(/"([^"]+)"/g);
  for (const m of nameMatches) {
    const name = m[1];
    if (/^[A-Z][A-Z0-9_]*$/.test(name)) {
      vars.set(name, { line: lineNum, tier: 1 });
    }
  }
}

function isBalanced(text) {
  let depth = 0;
  for (const char of text) {
    if (char === "(") depth++;
    if (char === ")") depth--;
  }
  return depth <= 0;
}

// ---------------------------------------------------------------------------
// Backend alias allowlist: backward-compat aliases that need not appear in
// .env.example.  Explicit Set (not regex) per Codex plan review finding.
// ---------------------------------------------------------------------------
const BACKEND_ALIAS_ALLOWLIST = new Set([
  "ENVIRONMENT",
  "RAILWAY_ENVIRONMENT_NAME",
  "RAILWAY_GIT_COMMIT_SHA",
  "CLAUDE_MODEL",
  "GPT_FAST_MODEL",
  "OPENAI_MODEL",
  "GOOGLE_MODEL",
  "GOOGLE_BASE_URL",
  "RAG_PDF_OCR_MAX_PAGES_FREE",
  "RAG_PDF_OCR_MAX_PAGES_STANDARD",
  "RAG_PDF_OCR_MAX_PAGES_PRO",
]);

// ---------------------------------------------------------------------------
// extractEnvExampleVars
// ---------------------------------------------------------------------------
export function extractEnvExampleVars(exampleSrc) {
  const activeVars = new Set();
  const documentedVars = new Set();
  for (const line of exampleSrc.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("#")) {
      const commentedMatch = trimmed.match(/^#\s*([A-Z_][A-Z0-9_]*)=/);
      if (commentedMatch) {
        documentedVars.add(commentedMatch[1]);
      }
      continue;
    }
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (match) {
      activeVars.add(match[1]);
      documentedVars.add(match[1]);
    }
  }
  return { activeVars, documentedVars };
}

// ---------------------------------------------------------------------------
// extractCiWorkflowEnvVars
// ---------------------------------------------------------------------------
export function extractCiWorkflowEnvVars(workflowSrc) {
  const vars = new Set();

  // Extract from `env:` blocks (indent-based YAML)
  const envBlockPattern = /^\s+env:\s*$/gm;
  const lines = workflowSrc.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Detect `env:` as a YAML key (at any indentation)
    if (/^\s+env:\s*$/.test(line)) {
      const baseIndent = line.search(/\S/);
      // Read vars in the env block
      for (let j = i + 1; j < lines.length; j++) {
        const envLine = lines[j];
        if (!envLine.trim()) continue;
        const indent = envLine.search(/\S/);
        if (indent <= baseIndent) break;
        const varMatch = envLine.match(/^\s+([A-Z][A-Z0-9_]*)\s*:/);
        if (varMatch && !isCiMetaVar(varMatch[1])) {
          vars.add(varMatch[1]);
        }
      }
    }
  }

  // Extract secrets references: ${{ secrets.VAR_NAME }}
  const secretsPattern = /\$\{\{\s*secrets\.(\w+)\s*\}\}/g;
  for (const match of workflowSrc.matchAll(secretsPattern)) {
    if (!isCiMetaVar(match[1])) {
      vars.add(match[1]);
    }
  }

  return vars;
}

// ---------------------------------------------------------------------------
// findDirectProcessEnvUsage
// ---------------------------------------------------------------------------
export function findDirectProcessEnvUsage(srcContent, schemaVars, filePath) {
  const findings = [];
  const lines = srcContent.split(/\r?\n/);
  // Known exceptions: NODE_ENV, VITEST, SKIP_ENV_VALIDATION, NEXT_RUNTIME
  const exceptions = new Set([
    "NODE_ENV",
    "VITEST",
    "SKIP_ENV_VALIDATION",
    "NEXT_RUNTIME",
    "LOCAL_AI_LIVE_PREFLIGHT_ENABLED",
  ]);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matches = line.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g);
    for (const m of matches) {
      const varName = m[1];
      if (exceptions.has(varName)) continue;
      if (schemaVars.has(varName)) {
        findings.push({ file: filePath, line: i + 1, varName });
      }
    }
  }
  return findings;
}

function collectSourceFiles(dirPath, cwd, files = []) {
  let entries;
  try {
    entries = readdirSync(path.join(cwd, dirPath), { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const filePath = path.posix.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(filePath, cwd, files);
      continue;
    }
    if (entry.isFile() && shouldScanDirectProcessEnvUsage(filePath)) {
      files.push(filePath);
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// checkDrift
// ---------------------------------------------------------------------------
export function checkDrift(t3Vars, backendVars, exampleVars, ciVarsMap, opts = {}) {
  const errors = [];
  const warnings = [];

  // Support both old (Set) and new ({ activeVars, documentedVars }) formats
  const activeVars = exampleVars instanceof Set ? exampleVars : exampleVars.activeVars;
  const documentedVars = exampleVars instanceof Set ? exampleVars : exampleVars.documentedVars;

  const allT3 = new Map([...t3Vars.server, ...t3Vars.client]);

  // C1: T3 required -> .env.example (must be ACTIVE, not just commented)
  for (const [name, meta] of allT3) {
    if (!meta.required) continue;
    if (!activeVars.has(name)) {
      const source = t3Vars.server.has(name) ? "server.ts" : "client.ts";
      errors.push({
        id: "C1",
        message: `${name} (${source}:${meta.line} required) missing from .env.example`,
      });
    }
  }

  // C2: T3 optional -> .env.example (commented-out counts as documented)
  for (const [name, meta] of allT3) {
    if (meta.required) continue;
    if (!documentedVars.has(name)) {
      const source = t3Vars.server.has(name) ? "server.ts" : "client.ts";
      warnings.push({
        id: "C2",
        message: `${name} (${source}:${meta.line} optional) not documented in .env.example`,
      });
    }
  }

  // C3: T3 required -> CI workflows
  const allCiVars = new Set();
  for (const vars of ciVarsMap.values()) {
    for (const v of vars) {
      allCiVars.add(v);
    }
  }
  for (const [name, meta] of allT3) {
    if (!meta.required) continue;
    if (isCiAllowlisted(name)) continue;
    if (!allCiVars.has(name)) {
      const source = t3Vars.server.has(name) ? "server.ts" : "client.ts";
      errors.push({
        id: "C3",
        message: `${name} (${source}:${meta.line} required) missing from CI workflows`,
      });
    }
  }

  // C4: Backend AliasChoices -> .env.example (Tier 1 only, skip alias allowlist)
  for (const [name, meta] of backendVars) {
    if (meta.tier !== 1) continue;
    if (BACKEND_ALIAS_ALLOWLIST.has(name)) continue;
    if (!documentedVars.has(name)) {
      warnings.push({
        id: "C4",
        message: `${name} (config.py:${meta.line} backend) not documented in .env.example`,
      });
    }
  }

  // C5: .env.example -> T3/Backend (orphan detection, active vars only)
  for (const name of activeVars) {
    const inT3 = allT3.has(name);
    const inBackend = backendVars.has(name);
    if (!inT3 && !inBackend) {
      warnings.push({
        id: "C5",
        message: `${name} in .env.example is not referenced by any T3 Env or backend config schema`,
      });
    }
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------
async function main() {
  const cwd = process.cwd();
  const staged = process.argv.includes("--staged");

  // Read source files
  const serverSrc = await readSource("src/env/server.ts", staged, cwd);
  const clientSrc = await readSource("src/env/client.ts", staged, cwd);
  const configSrc = await readSource("backend/app/config.py", staged, cwd);
  const exampleSrc = await readSource(".env.example", staged, cwd);

  // Read CI workflows
  const workflowDir = path.join(cwd, ".github", "workflows");
  const ciVarsMap = new Map();
  let workflowFiles;
  try {
    workflowFiles = readdirSync(workflowDir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  } catch {
    workflowFiles = [];
  }
  for (const file of workflowFiles) {
    const workflowSrc = await readSource(`.github/workflows/${file}`, staged, cwd);
    if (workflowSrc) {
      const vars = extractCiWorkflowEnvVars(workflowSrc);
      ciVarsMap.set(file, vars);
    }
  }

  // Extract
  const t3Vars = extractT3EnvVars(serverSrc, clientSrc);
  const backendVars = extractBackendConfigVars(configSrc);
  const exampleResult = extractEnvExampleVars(exampleSrc);
  const exampleVars = exampleResult;

  const serverCount = t3Vars.server.size;
  const clientCount = t3Vars.client.size;
  process.stdout.write(
    `[env-drift] Extracted: ${serverCount + clientCount} T3 Env vars (${serverCount} server + ${clientCount} client), ${backendVars.size} backend config vars\n`,
  );

  // Check drift
  const { errors, warnings } = checkDrift(t3Vars, backendVars, exampleVars, ciVarsMap);
  const directEnvVars = new Set(["APP_ENV", "NEXT_PUBLIC_APP_ENV"]);
  for (const filePath of collectSourceFiles("src", cwd)) {
    const src = await readSource(filePath, staged, cwd);
    for (const finding of findDirectProcessEnvUsage(src, directEnvVars, filePath)) {
      warnings.push({
        id: "C6",
        message: `${finding.varName} direct process.env usage in ${finding.file}:${finding.line} (use src/env/*; warning-only until release B)`,
      });
    }
  }

  for (const err of errors) {
    process.stderr.write(`[env-drift] ERROR: ${err.message}\n`);
  }
  for (const warn of warnings) {
    process.stderr.write(`[env-drift] WARN: ${warn.message}\n`);
  }

  if (errors.length > 0 || warnings.length > 0) {
    process.stdout.write(`[env-drift] ${errors.length} error(s), ${warnings.length} warning(s)\n`);
  } else {
    process.stdout.write("[env-drift] no drift detected\n");
  }

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
