#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const project = process.cwd();
const errors = [];

function gitFiles() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: project,
    encoding: "utf8",
  })
    .split("\n")
    .filter((file) => file && existsSync(path.join(project, file)) && statSync(path.join(project, file)).isFile());
}

function parseLinks(markdown) {
  const links = [];
  for (let index = 0; index < markdown.length; index += 1) {
    if (markdown[index] !== "[") continue;
    const close = markdown.indexOf("](", index);
    if (close === -1) continue;
    let cursor = close + 2;
    let depth = 0;
    let destination = "";
    while (cursor < markdown.length) {
      const char = markdown[cursor];
      if (char === "\\" && cursor + 1 < markdown.length) {
        destination += char + markdown[cursor + 1];
        cursor += 2;
        continue;
      }
      if (char === "(") depth += 1;
      if (char === ")") {
        if (depth === 0) break;
        depth -= 1;
      }
      destination += char;
      cursor += 1;
    }
    if (cursor < markdown.length) {
      links.push(destination.trim());
      index = cursor;
    }
  }
  return links;
}

function stripDestination(raw) {
  const withoutAnchor = raw.split("#")[0].trim();
  if (!withoutAnchor) return "";
  const clean = withoutAnchor.startsWith("<") && withoutAnchor.includes(">")
    ? withoutAnchor.slice(1, withoutAnchor.indexOf(">"))
    : withoutAnchor.split(/\s+/)[0].replace(/^['"]|['"]$/g, "");
  if (withoutAnchor.startsWith("<") && withoutAnchor.includes(">")) {
    return decodeURIComponent(clean);
  }
  return decodeURIComponent(clean);
}

function checkLinks(files) {
  for (const file of files) {
    const source = path.join(project, file);
    const markdown = readFileSync(source, "utf8");
    for (const raw of parseLinks(markdown)) {
      const dest = stripDestination(raw);
      if (!dest || /^(https?:|mailto:|tel:)/.test(dest)) continue;
      let resolved;
      if (path.isAbsolute(dest)) {
        resolved = dest.startsWith(project) ? dest : path.join(project, dest);
      } else {
        resolved = path.resolve(path.dirname(source), dest);
      }
      if (!existsSync(resolved)) {
        errors.push(`${file}: broken local link ${raw}`);
      }
    }
  }
}

function checkIndex(docsMdFiles) {
  const index = readFileSync(path.join(project, "docs/INDEX.md"), "utf8");
  for (const file of docsMdFiles) {
    if (file === "docs/INDEX.md") continue;
    const rel = file.replace(/^docs\//, "");
    if (!index.includes(rel)) {
      errors.push(`docs/INDEX.md: missing catalog entry for ${file}`);
    }
  }
}

function checkConventions() {
  const conventions = readFileSync(path.join(project, "docs/CONVENTIONS.md"), "utf8");
  const topDirs = readdirSync(path.join(project, "docs"))
    .filter((entry) => statSync(path.join(project, "docs", entry)).isDirectory());
  for (const dir of topDirs) {
    if (!conventions.includes(`\`${dir}/\``)) {
      errors.push(`docs/CONVENTIONS.md: missing role entry for docs/${dir}/`);
    }
  }
}

function checkRetiredPaths(files) {
  if (existsSync(path.join(project, "docs/ops"))) errors.push("retired directory still exists: docs/ops");
  if (existsSync(path.join(project, "docs/release/ops"))) {
    errors.push("retired directory still exists: docs/release/ops");
  }
  const pattern = /docs\/ops|docs\/release\/ops|release\/ops\//;
  const movedPathPattern = /docs\/release\/EXTERNAL_SERVICES\.md/;
  for (const file of files) {
    if (file === "scripts/docs/check-docs.mjs") continue;
    const content = readFileSync(path.join(project, file), "utf8");
    if (pattern.test(content)) errors.push(`${file}: references retired docs ops path`);
    if (movedPathPattern.test(content)) {
      errors.push(`${file}: references moved path docs/release/EXTERNAL_SERVICES.md`);
    }
  }
}

function checkRuntimeNotices() {
  const prompts = readFileSync(path.join(project, "docs/prompts/README.md"), "utf8");
  const reference = readFileSync(path.join(project, "docs/reference/es-review/README.md"), "utf8");
  const review = readFileSync(path.join(project, "docs/review/REVIEW_POLICY.md"), "utf8");
  if (!prompts.includes("runtime 非連携")) errors.push("docs/prompts/README.md: missing runtime notice");
  if (!reference.includes("runtime 非参照")) {
    errors.push("docs/reference/es-review/README.md: missing runtime notice");
  }
  if (!review.includes("スナップショット")) errors.push("docs/review/REVIEW_POLICY.md: missing snapshot notice");
}

function checkEnvironmentVariableReferences(files) {
  const envPathPattern = /ENVIRONMENT_VARIABLES\.md/;
  const oldSectionPattern = /§\s*\d+(?:\.\d+)?/;
  for (const file of files) {
    const content = readFileSync(path.join(project, file), "utf8");
    if (envPathPattern.test(content) && oldSectionPattern.test(content)) {
      errors.push(`${file}: references ENVIRONMENT_VARIABLES.md with retired numeric section labels`);
    }
  }
}

const files = gitFiles();
const docsMdFiles = files.filter((file) => file.startsWith("docs/") && file.endsWith(".md"));
const markdownFiles = files.filter((file) => file === "README.md" || (file.startsWith("docs/") && file.endsWith(".md")));

checkLinks(markdownFiles);
checkIndex(docsMdFiles);
checkConventions();
checkRetiredPaths(files);
checkRuntimeNotices();
checkEnvironmentVariableReferences(files.filter((file) => file === ".env.example" || file === "README.md" || file.startsWith("docs/") || file.startsWith("scripts/") || file.startsWith(".claude/") || file.startsWith(".codex/") || file.startsWith(".cursor/") || file.startsWith("plugins/") || file.startsWith("private/")));

try {
  execFileSync("node", ["scripts/plan/validate-plan-tasks.mjs"], { cwd: project, stdio: "pipe" });
} catch (error) {
  errors.push(`plan task validation failed:\n${String(error.stderr ?? error.message).trim()}`);
}

if (errors.length > 0) {
  process.stderr.write(`${errors.length} docs check error(s):\n`);
  for (const error of errors) process.stderr.write(`- ${error}\n`);
  process.exit(1);
}

process.stdout.write(`Docs check passed (${markdownFiles.length} markdown files)\n`);
