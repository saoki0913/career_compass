import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  extractT3EnvVars,
  extractBackendConfigVars,
  extractEnvExampleVars,
  extractCiWorkflowEnvVars,
  findDirectProcessEnvUsage,
  checkDrift,
  checkSecretsExamplesDrift,
} from "./check-env-var-drift.mjs";

// ---------------------------------------------------------------------------
// extractT3EnvVars
// ---------------------------------------------------------------------------

test("extractT3EnvVars: extracts required and optional vars from server block", () => {
  const serverSrc = `
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const serverEnv = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    DIRECT_URL: z.string().url().optional(),
    DATABASE_POOL_SIZE: z.coerce.number().int().positive().optional(),
    ENCRYPTION_KEY: z.string().length(64).regex(/^[0-9a-fA-F]+$/),
    FASTAPI_URL: z.string().url().optional(),
  },

  experimental__runtimeEnv: process.env,
});
`;
  const { server, client } = extractT3EnvVars(serverSrc, "");
  assert.equal(server.size, 5);
  assert.equal(server.get("DATABASE_URL").required, true);
  assert.equal(server.get("DIRECT_URL").required, false);
  assert.equal(server.get("DATABASE_POOL_SIZE").required, false);
  assert.equal(server.get("ENCRYPTION_KEY").required, true);
  assert.equal(server.get("FASTAPI_URL").required, false);
  assert.equal(client.size, 0);
});

test("extractT3EnvVars: extracts client vars", () => {
  const clientSrc = `
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const clientEnv = createEnv({
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_GA_MEASUREMENT_ID: z.string().optional(),
  },

  experimental__runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
  },
});
`;
  const { server, client } = extractT3EnvVars("", clientSrc);
  assert.equal(server.size, 0);
  assert.equal(client.size, 2);
  assert.equal(client.get("NEXT_PUBLIC_APP_URL").required, true);
  assert.equal(client.get("NEXT_PUBLIC_GA_MEASUREMENT_ID").required, false);
});

test("extractT3EnvVars: handles z.preprocess and z.coerce patterns", () => {
  const src = `
export const serverEnv = createEnv({
  server: {
    COERCED_NUM: z.coerce.number().int(),
    PREPROCESSED: z.preprocess((v) => v, z.string()),
    WITH_DEFAULT: z.string().default("hello"),
    WITH_TRANSFORM: z.string().transform((v) => parseInt(v, 10)),
  },
  experimental__runtimeEnv: {},
});
`;
  const { server } = extractT3EnvVars(src, "");
  assert.equal(server.size, 4);
  assert.equal(server.get("COERCED_NUM").required, true);
  assert.equal(server.get("PREPROCESSED").required, true);
  assert.equal(server.get("WITH_DEFAULT").required, false);
  assert.equal(server.get("WITH_TRANSFORM").required, true);
});

test("extractT3EnvVars: excludes experimental__runtimeEnv block entries", () => {
  const src = `
export const clientEnv = createEnv({
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});
`;
  const { client } = extractT3EnvVars("", src);
  assert.equal(client.size, 1);
  assert.equal(client.has("NEXT_PUBLIC_APP_URL"), true);
});

// ---------------------------------------------------------------------------
// extractBackendConfigVars
// ---------------------------------------------------------------------------

test("extractBackendConfigVars: extracts AliasChoices vars", () => {
  const configSrc = `
class Settings(BaseSettings):
    web_search_debug: bool = Field(
        default=False,
        validation_alias=AliasChoices("WEB_SEARCH_DEBUG"),
    )
    cors_origins: list[str] = Field(
        default=["http://localhost:3000"],
        validation_alias=AliasChoices("CORS_ORIGINS"),
    )
`;
  const vars = extractBackendConfigVars(configSrc);
  assert.equal(vars.has("WEB_SEARCH_DEBUG"), true);
  assert.equal(vars.get("WEB_SEARCH_DEBUG").tier, 1);
  assert.equal(vars.has("CORS_ORIGINS"), true);
  assert.equal(vars.get("CORS_ORIGINS").tier, 1);
});

test("extractBackendConfigVars: handles multi-line Field blocks", () => {
  const configSrc = `
class Settings(BaseSettings):
    frontend_url: str = Field(
        default="http://localhost:3000",
        validation_alias=AliasChoices(
            "FRONTEND_URL", "NEXT_PUBLIC_APP_URL"
        ),
    )
`;
  const vars = extractBackendConfigVars(configSrc);
  assert.equal(vars.has("FRONTEND_URL"), true);
  assert.equal(vars.has("NEXT_PUBLIC_APP_URL"), true);
  assert.equal(vars.get("FRONTEND_URL").tier, 1);
});

test("extractBackendConfigVars: extracts multiple aliases from single AliasChoices", () => {
  const configSrc = `
class Settings(BaseSettings):
    sentry_environment: str = Field(
        default="",
        validation_alias=AliasChoices("SENTRY_DSN", "SENTRY_FASTAPI_DSN", "BACKEND_SENTRY_DSN"),
    )
`;
  const vars = extractBackendConfigVars(configSrc);
  assert.equal(vars.has("SENTRY_DSN"), true);
  assert.equal(vars.has("SENTRY_FASTAPI_DSN"), true);
  assert.equal(vars.has("BACKEND_SENTRY_DSN"), true);
});

test("extractBackendConfigVars: collects Tier 2 implicit field_name.upper()", () => {
  const configSrc = `
class Settings(BaseSettings):
    openai_api_key: str = ""
    debug: bool = False
    redis_url: str = ""
`;
  const vars = extractBackendConfigVars(configSrc);
  assert.equal(vars.has("OPENAI_API_KEY"), true);
  assert.equal(vars.get("OPENAI_API_KEY").tier, 2);
  assert.equal(vars.has("DEBUG"), true);
  assert.equal(vars.get("DEBUG").tier, 2);
  assert.equal(vars.has("REDIS_URL"), true);
});

test("extractBackendConfigVars: AliasChoices Tier 1 overrides Tier 2", () => {
  const configSrc = `
class Settings(BaseSettings):
    web_search_debug: bool = Field(
        default=False,
        validation_alias=AliasChoices("WEB_SEARCH_DEBUG"),
    )
`;
  const vars = extractBackendConfigVars(configSrc);
  // WEB_SEARCH_DEBUG is Tier 1 from AliasChoices
  assert.equal(vars.get("WEB_SEARCH_DEBUG").tier, 1);
  // web_search_debug.upper() = WEB_SEARCH_DEBUG should not create a Tier 2 duplicate
  let tier2Count = 0;
  for (const [, meta] of vars) {
    if (meta.tier === 2) tier2Count++;
  }
  // Should not have WEB_SEARCH_DEBUG as tier 2
  assert.equal(vars.get("WEB_SEARCH_DEBUG").tier, 1);
});

test("extractBackendConfigVars: skips comments and empty lines", () => {
  const configSrc = `
class Settings(BaseSettings):
    # ===== API keys =====
    # This is a comment

    openai_api_key: str = ""
`;
  const vars = extractBackendConfigVars(configSrc);
  assert.equal(vars.has("OPENAI_API_KEY"), true);
});

// ---------------------------------------------------------------------------
// extractEnvExampleVars
// ---------------------------------------------------------------------------

test("extractEnvExampleVars: extracts active and documented vars", () => {
  const src = `
# Database
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Auth
BETTER_AUTH_SECRET=your-secret-here
# optional
LOGO_DEV_TOKEN=
`;
  const { activeVars, documentedVars } = extractEnvExampleVars(src);
  assert.equal(activeVars.size, 4);
  assert.ok(activeVars.has("DATABASE_URL"));
  assert.ok(activeVars.has("DIRECT_URL"));
  assert.ok(activeVars.has("BETTER_AUTH_SECRET"));
  assert.ok(activeVars.has("LOGO_DEV_TOKEN"));
  assert.equal(documentedVars.size, 4);
});

test("extractEnvExampleVars: recognizes commented-out vars as documented but not active", () => {
  const src = `
VAR_ONE=value
# VAR_TWO=value
VAR_THREE=
# VAR_FOUR="some-default"
`;
  const { activeVars, documentedVars } = extractEnvExampleVars(src);
  assert.equal(activeVars.size, 2);
  assert.ok(activeVars.has("VAR_ONE"));
  assert.ok(activeVars.has("VAR_THREE"));
  assert.ok(!activeVars.has("VAR_TWO"));
  assert.ok(!activeVars.has("VAR_FOUR"));

  assert.equal(documentedVars.size, 4);
  assert.ok(documentedVars.has("VAR_ONE"));
  assert.ok(documentedVars.has("VAR_TWO"));
  assert.ok(documentedVars.has("VAR_THREE"));
  assert.ok(documentedVars.has("VAR_FOUR"));
});

test("extractEnvExampleVars: skips plain comment lines and empty lines", () => {
  const src = `
# This is a plain comment
  # indented comment

VAR_ONE=value
`;
  const { activeVars, documentedVars } = extractEnvExampleVars(src);
  assert.equal(activeVars.size, 1);
  assert.equal(documentedVars.size, 1);
  assert.ok(activeVars.has("VAR_ONE"));
});

// ---------------------------------------------------------------------------
// extractCiWorkflowEnvVars
// ---------------------------------------------------------------------------

test("extractCiWorkflowEnvVars: extracts env block vars", () => {
  const src = `
jobs:
  frontend:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: postgresql://localhost
      BETTER_AUTH_SECRET: ci-secret
    steps:
      - uses: actions/checkout@v4
`;
  const vars = extractCiWorkflowEnvVars(src);
  assert.ok(vars.has("DATABASE_URL"));
  assert.ok(vars.has("BETTER_AUTH_SECRET"));
});

test("extractCiWorkflowEnvVars: extracts secrets references", () => {
  const src = `
jobs:
  test:
    env:
      OPENAI_API_KEY: \${{ secrets.OPENAI_API_KEY }}
      ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
`;
  const vars = extractCiWorkflowEnvVars(src);
  assert.ok(vars.has("OPENAI_API_KEY"));
  assert.ok(vars.has("ANTHROPIC_API_KEY"));
});

test("extractCiWorkflowEnvVars: excludes CI meta vars", () => {
  const src = `
jobs:
  test:
    env:
      PLAYWRIGHT_BASE_URL: https://stg.example.com
      PLAYWRIGHT_SKIP_WEBSERVER: "1"
      SECURITY_SCAN_INCLUDE_AUDIT: "1"
      DATABASE_URL: postgresql://localhost
`;
  const vars = extractCiWorkflowEnvVars(src);
  assert.ok(!vars.has("PLAYWRIGHT_BASE_URL"));
  assert.ok(!vars.has("PLAYWRIGHT_SKIP_WEBSERVER"));
  assert.ok(!vars.has("SECURITY_SCAN_INCLUDE_AUDIT"));
  assert.ok(vars.has("DATABASE_URL"));
});

// ---------------------------------------------------------------------------
// findDirectProcessEnvUsage
// ---------------------------------------------------------------------------

test("findDirectProcessEnvUsage: finds direct process.env references for schema vars", () => {
  const src = `
const url = process.env.DATABASE_URL;
if (process.env.NODE_ENV === "production") {}
const key = process.env.STRIPE_SECRET_KEY;
`;
  const schemaVars = new Set(["DATABASE_URL", "STRIPE_SECRET_KEY"]);
  const findings = findDirectProcessEnvUsage(src, schemaVars, "src/lib/db.ts");
  assert.equal(findings.length, 2);
  assert.equal(findings[0].varName, "DATABASE_URL");
  assert.equal(findings[1].varName, "STRIPE_SECRET_KEY");
});

test("findDirectProcessEnvUsage: skips known exceptions", () => {
  const src = `
const env = process.env.NODE_ENV;
const runtime = process.env.NEXT_RUNTIME;
const skip = process.env.SKIP_ENV_VALIDATION;
`;
  const schemaVars = new Set(["NODE_ENV", "NEXT_RUNTIME", "SKIP_ENV_VALIDATION"]);
  const findings = findDirectProcessEnvUsage(src, schemaVars, "src/lib/env.ts");
  assert.equal(findings.length, 0);
});

// ---------------------------------------------------------------------------
// checkDrift
// ---------------------------------------------------------------------------

// Helper to build exampleVars in new format
function makeExampleVars(active = [], commented = []) {
  const activeVars = new Set(active);
  const documentedVars = new Set([...active, ...commented]);
  return { activeVars, documentedVars };
}

test("checkDrift: C1 detects required T3 vars missing from .env.example", () => {
  const t3Vars = {
    server: new Map([["DATABASE_URL", { required: true, line: 10 }]]),
    client: new Map(),
  };
  const backendVars = new Map();
  const exampleVars = makeExampleVars();
  const ciVarsMap = new Map([["ci.yml", new Set(["DATABASE_URL"])]]);

  const { errors } = checkDrift(t3Vars, backendVars, exampleVars, ciVarsMap);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].id, "C1");
  assert.match(errors[0].message, /DATABASE_URL/);
});

test("checkDrift: C1 still errors when required var is only commented out", () => {
  const t3Vars = {
    server: new Map([["DATABASE_URL", { required: true, line: 10 }]]),
    client: new Map(),
  };
  const backendVars = new Map();
  const exampleVars = makeExampleVars([], ["DATABASE_URL"]);
  const ciVarsMap = new Map([["ci.yml", new Set(["DATABASE_URL"])]]);

  const { errors } = checkDrift(t3Vars, backendVars, exampleVars, ciVarsMap);
  const c1Errors = errors.filter((e) => e.id === "C1");
  assert.equal(c1Errors.length, 1, "Required var that is only commented should still be C1 error");
});

test("checkDrift: C2 detects optional T3 vars missing from .env.example", () => {
  const t3Vars = {
    server: new Map([["OPTIONAL_VAR", { required: false, line: 20 }]]),
    client: new Map(),
  };
  const backendVars = new Map();
  const exampleVars = makeExampleVars();
  const ciVarsMap = new Map();

  const { warnings } = checkDrift(t3Vars, backendVars, exampleVars, ciVarsMap);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].id, "C2");
  assert.match(warnings[0].message, /OPTIONAL_VAR/);
});

test("checkDrift: C2 accepts commented-out optional vars as documented", () => {
  const t3Vars = {
    server: new Map([["OPTIONAL_VAR", { required: false, line: 20 }]]),
    client: new Map(),
  };
  const backendVars = new Map();
  const exampleVars = makeExampleVars([], ["OPTIONAL_VAR"]);
  const ciVarsMap = new Map();

  const { warnings } = checkDrift(t3Vars, backendVars, exampleVars, ciVarsMap);
  const c2Warnings = warnings.filter((w) => w.id === "C2");
  assert.equal(c2Warnings.length, 0, "Commented-out optional var should not trigger C2");
});

test("checkDrift: C3 detects required T3 vars missing from CI", () => {
  const t3Vars = {
    server: new Map([["ENCRYPTION_KEY", { required: true, line: 40 }]]),
    client: new Map(),
  };
  const backendVars = new Map();
  const exampleVars = makeExampleVars(["ENCRYPTION_KEY"]);
  const ciVarsMap = new Map([["ci.yml", new Set()]]);

  const { errors } = checkDrift(t3Vars, backendVars, exampleVars, ciVarsMap);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].id, "C3");
  assert.match(errors[0].message, /ENCRYPTION_KEY/);
});

test("checkDrift: C3 respects CI allowlist", () => {
  const t3Vars = {
    server: new Map([
      ["UPSTASH_REDIS_REST_URL", { required: true, line: 50 }],
      ["SENTRY_ORG", { required: true, line: 60 }],
      ["TENANT_KEY_SECRET", { required: true, line: 70 }],
    ]),
    client: new Map(),
  };
  const backendVars = new Map();
  const exampleVars = makeExampleVars(["UPSTASH_REDIS_REST_URL", "SENTRY_ORG", "TENANT_KEY_SECRET"]);
  const ciVarsMap = new Map([["ci.yml", new Set()]]);

  const { errors } = checkDrift(t3Vars, backendVars, exampleVars, ciVarsMap);
  const c3Errors = errors.filter((e) => e.id === "C3");
  assert.equal(c3Errors.length, 0);
});

test("checkDrift: C4 detects backend AliasChoices vars missing from .env.example", () => {
  const t3Vars = { server: new Map(), client: new Map() };
  const backendVars = new Map([["CORS_ORIGINS", { line: 40, tier: 1 }]]);
  const exampleVars = makeExampleVars();
  const ciVarsMap = new Map();

  const { warnings } = checkDrift(t3Vars, backendVars, exampleVars, ciVarsMap);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].id, "C4");
  assert.match(warnings[0].message, /CORS_ORIGINS/);
});

test("checkDrift: C4 accepts commented-out backend vars as documented", () => {
  const t3Vars = { server: new Map(), client: new Map() };
  const backendVars = new Map([["CORS_ORIGINS", { line: 40, tier: 1 }]]);
  const exampleVars = makeExampleVars([], ["CORS_ORIGINS"]);
  const ciVarsMap = new Map();

  const { warnings } = checkDrift(t3Vars, backendVars, exampleVars, ciVarsMap);
  const c4Warnings = warnings.filter((w) => w.id === "C4");
  assert.equal(c4Warnings.length, 0, "Commented-out backend var should not trigger C4");
});

test("checkDrift: C4 only checks Tier 1 (AliasChoices) not Tier 2 (implicit)", () => {
  const t3Vars = { server: new Map(), client: new Map() };
  const backendVars = new Map([
    ["EXPLICIT_VAR", { line: 10, tier: 1 }],
    ["IMPLICIT_VAR", { line: 20, tier: 2 }],
  ]);
  const exampleVars = makeExampleVars();
  const ciVarsMap = new Map();

  const { warnings } = checkDrift(t3Vars, backendVars, exampleVars, ciVarsMap);
  const c4Warnings = warnings.filter((w) => w.id === "C4");
  assert.equal(c4Warnings.length, 1);
  assert.match(c4Warnings[0].message, /EXPLICIT_VAR/);
});

test("checkDrift: C4 skips backend alias allowlist vars", () => {
  const t3Vars = { server: new Map(), client: new Map() };
  const backendVars = new Map([
    ["RAILWAY_GIT_COMMIT_SHA", { line: 10, tier: 1 }],
    ["CLAUDE_MODEL", { line: 20, tier: 1 }],
    ["CORS_ORIGINS", { line: 30, tier: 1 }],
  ]);
  const exampleVars = makeExampleVars();
  const ciVarsMap = new Map();

  const { warnings } = checkDrift(t3Vars, backendVars, exampleVars, ciVarsMap);
  const c4Warnings = warnings.filter((w) => w.id === "C4");
  assert.equal(c4Warnings.length, 1, "Only CORS_ORIGINS should warn; aliases are allowlisted");
  assert.match(c4Warnings[0].message, /CORS_ORIGINS/);
});

test("checkDrift: C5 detects orphans in .env.example (active vars only)", () => {
  const t3Vars = {
    server: new Map([["DATABASE_URL", { required: true, line: 10 }]]),
    client: new Map(),
  };
  const backendVars = new Map([["OPENAI_API_KEY", { line: 100, tier: 2 }]]);
  const exampleVars = makeExampleVars(["DATABASE_URL", "OPENAI_API_KEY", "ORPHAN_VAR"]);
  const ciVarsMap = new Map([["ci.yml", new Set(["DATABASE_URL"])]]);

  const { warnings } = checkDrift(t3Vars, backendVars, exampleVars, ciVarsMap);
  const c5Warnings = warnings.filter((w) => w.id === "C5");
  assert.equal(c5Warnings.length, 1);
  assert.match(c5Warnings[0].message, /ORPHAN_VAR/);
});

test("checkDrift: C5 does not flag commented-out orphans", () => {
  const t3Vars = { server: new Map(), client: new Map() };
  const backendVars = new Map();
  const exampleVars = makeExampleVars([], ["COMMENTED_ORPHAN"]);
  const ciVarsMap = new Map();

  const { warnings } = checkDrift(t3Vars, backendVars, exampleVars, ciVarsMap);
  const c5Warnings = warnings.filter((w) => w.id === "C5");
  assert.equal(c5Warnings.length, 0, "Commented-out vars should not trigger C5 orphan detection");
});

test("checkDrift: no drift when everything is aligned", () => {
  const t3Vars = {
    server: new Map([
      ["DATABASE_URL", { required: true, line: 10 }],
      ["OPTIONAL_VAR", { required: false, line: 20 }],
    ]),
    client: new Map([["NEXT_PUBLIC_APP_URL", { required: true, line: 5 }]]),
  };
  const backendVars = new Map([["CORS_ORIGINS", { line: 40, tier: 1 }]]);
  const exampleVars = makeExampleVars(
    ["DATABASE_URL", "OPTIONAL_VAR", "NEXT_PUBLIC_APP_URL", "CORS_ORIGINS"],
  );
  const ciVarsMap = new Map([["ci.yml", new Set(["DATABASE_URL", "NEXT_PUBLIC_APP_URL"])]]);

  const { errors, warnings } = checkDrift(t3Vars, backendVars, exampleVars, ciVarsMap);
  assert.equal(errors.length, 0);
  assert.equal(warnings.length, 0);
});

test("checkDrift: backward compat - accepts plain Set as exampleVars", () => {
  const t3Vars = {
    server: new Map([["DATABASE_URL", { required: true, line: 10 }]]),
    client: new Map(),
  };
  const backendVars = new Map();
  const exampleVars = new Set(["DATABASE_URL"]);
  const ciVarsMap = new Map([["ci.yml", new Set(["DATABASE_URL"])]]);

  const { errors, warnings } = checkDrift(t3Vars, backendVars, exampleVars, ciVarsMap);
  assert.equal(errors.length, 0);
  assert.equal(warnings.length, 0);
});

// ---------------------------------------------------------------------------
// checkSecretsExamplesDrift
// ---------------------------------------------------------------------------

function makeSecretsExampleMap(entries) {
  return new Map(
    entries.map(([filePath, active, commented = []]) => [
      filePath,
      makeExampleVars(active, commented),
    ]),
  );
}

test("checkSecretsExamplesDrift: detects missing required deployed Redis keys", () => {
  const filePath = "scripts/release/secrets-examples/staging/fastapi.env.example";
  const secretExamples = makeSecretsExampleMap([
    [
      filePath,
      ["APP_ENV", "CORS_ORIGINS", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "BACKEND_TRUSTED_HOSTS"],
    ],
  ]);
  const knownRuntimeVars = new Set([
    "APP_ENV",
    "CORS_ORIGINS",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "REDIS_URL",
    "REDIS_NAMESPACE",
    "BACKEND_TRUSTED_HOSTS",
  ]);

  const { errors } = checkSecretsExamplesDrift(secretExamples, knownRuntimeVars);

  assert.ok(errors.some((error) => error.id === "S1" && error.message.includes("REDIS_URL")));
});

test("checkSecretsExamplesDrift: rejects retired active keys", () => {
  const filePath = "scripts/release/secrets-examples/staging/fastapi.env.example";
  const secretExamples = makeSecretsExampleMap([
    [
      filePath,
      [
        "APP_ENV",
        "ENVIRONMENT",
        "CORS_ORIGINS",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "REDIS_URL",
        "REDIS_NAMESPACE",
        "BACKEND_TRUSTED_HOSTS",
      ],
    ],
  ]);
  const knownRuntimeVars = new Set([
    "APP_ENV",
    "CORS_ORIGINS",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "REDIS_URL",
    "REDIS_NAMESPACE",
    "BACKEND_TRUSTED_HOSTS",
  ]);

  const { errors } = checkSecretsExamplesDrift(secretExamples, knownRuntimeVars);

  assert.ok(errors.some((error) => error.id === "S2" && error.message.includes("ENVIRONMENT")));
});

test("checkSecretsExamplesDrift: detects missing staging CI overlay keys", () => {
  const filePath = "scripts/release/secrets-examples/ci/github-actions.env.example";
  const secretExamples = makeSecretsExampleMap([
    [filePath, ["CI_E2E_AUTH_SECRET", "PLAYWRIGHT_BASE_URL"]],
  ]);
  const knownRuntimeVars = new Set();

  const { errors } = checkSecretsExamplesDrift(secretExamples, knownRuntimeVars);

  assert.ok(errors.some((error) => error.id === "S1" && error.message.includes("CI_E2E_AUTH_ENABLED")));
});

test("checkSecretsExamplesDrift: rejects shared secrets in Supabase examples", () => {
  const filePath = "scripts/release/secrets-examples/staging/supabase.env.example";
  const secretExamples = makeSecretsExampleMap([
    [filePath, ["SUPABASE_STAGING_PROJECT_REF", "INTERNAL_API_JWT_SECRET"]],
  ]);
  const knownRuntimeVars = new Set(["INTERNAL_API_JWT_SECRET"]);

  const { errors } = checkSecretsExamplesDrift(secretExamples, knownRuntimeVars);

  assert.ok(errors.some((error) => error.id === "S4" && error.message.includes("INTERNAL_API_JWT_SECRET")));
});

// ---------------------------------------------------------------------------
// Integration test: run against real repo files
// ---------------------------------------------------------------------------

test("integration: real repo files produce 0 errors", async () => {
  const repoRoot = path.resolve(import.meta.dirname, "../..");

  let serverSrc, clientSrc, configSrc, exampleSrc;
  try {
    serverSrc = await readFile(path.join(repoRoot, "src/env/server.ts"), "utf8");
    clientSrc = await readFile(path.join(repoRoot, "src/env/client.ts"), "utf8");
    configSrc = await readFile(path.join(repoRoot, "backend/app/config.py"), "utf8");
  } catch {
    // If source files are not available, skip
    return;
  }
  try {
    exampleSrc = await readFile(path.join(repoRoot, ".env.example"), "utf8");
  } catch {
    // .env.example may not exist yet; skip integration check
    return;
  }

  const t3Vars = extractT3EnvVars(serverSrc, clientSrc);
  const backendVars = extractBackendConfigVars(configSrc);
  const exampleResult = extractEnvExampleVars(exampleSrc);
  const exampleVars = exampleResult;

  // Read CI workflows
  const { readdirSync } = await import("node:fs");
  const workflowDir = path.join(repoRoot, ".github", "workflows");
  const ciVarsMap = new Map();
  let workflowFiles;
  try {
    workflowFiles = readdirSync(workflowDir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  } catch {
    workflowFiles = [];
  }
  for (const file of workflowFiles) {
    try {
      const workflowSrc = await readFile(path.join(workflowDir, file), "utf8");
      const vars = extractCiWorkflowEnvVars(workflowSrc);
      ciVarsMap.set(file, vars);
    } catch {
      // skip unreadable workflows
    }
  }

  const { errors } = checkDrift(t3Vars, backendVars, exampleVars, ciVarsMap);
  assert.equal(errors.length, 0, `Expected 0 errors but got: ${errors.map((e) => e.message).join("; ")}`);
});
