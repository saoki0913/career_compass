import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = "/Users/saoki/work/career_compass";
const scriptPath = path.join(repoRoot, "scripts/release/sync-career-compass-secrets.sh");
const secretPlanPath = path.join(repoRoot, "scripts/release/lib/secret-plan.sh");

function writeGithubActionsOverlay(secretDir) {
  writeFileSync(
    path.join(secretDir, "github-actions.env"),
    [
      "CI_E2E_AUTH_SECRET=ci-secret-value-that-is-long-enough",
      "CI_E2E_AUTH_ENABLED=1",
      "PLAYWRIGHT_BASE_URL=https://stg.shupass.jp",
      "OPENAI_API_KEY=",
      "ANTHROPIC_API_KEY=",
      "",
    ].join("\n"),
    "utf8",
  );
}

test("checks env files with spaces and emails without sourcing them", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));

  try {
    writeFileSync(
      path.join(secretDir, "vercel-staging.env"),
      [
        "VERCEL_PROJECT_ID=prj_test123",
        "VERCEL_TEAM_ID=team_test123",
        "APP_ENV=staging",
        "NEXT_PUBLIC_APP_ENV=staging",
        "UPSTASH_REDIS_REST_URL=https://upstash-staging.example.com",
        "UPSTASH_REDIS_REST_TOKEN=upstash-staging-token",
        "UPSTASH_REDIS_NAMESPACE=staging",
        "STRIPE_SECRET_KEY=sk_test_staging_secret",
        "CONTACT_TO_EMAIL=support@shupass.jp",
        "CONTACT_FROM_EMAIL=support@shupass.jp",
        "LEGAL_SUPPORT_EMAIL=support@shupass.jp",
        "LEGAL_DISCLOSURE_REQUEST_EMAIL=support@shupass.jp",
        "LEGAL_DISCLOSURE_REQUEST_NOTICE=販売事業者、運営責任者、所在地、電話番号は、請求があった場合に遅滞なく開示いたします。開示をご希望の方は support@shupass.jp までご連絡ください。",
        "",
      ].join("\n"),
      "utf8",
    );
    writeGithubActionsOverlay(secretDir);

    const result = spawnSync(
      "zsh",
      [scriptPath, "--check", "--target", "vercel-staging", "--secret-dir", secretDir, "--skip-provider-drift"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /Checked Vercel staging env/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
  }
});

test("check fails on provider missing keys without printing secret values", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));
  const binDir = mkdtempSync(path.join(tmpdir(), "career-compass-bin-"));

  try {
    writeFileSync(
      path.join(secretDir, "vercel-staging.env"),
      [
        "VERCEL_PROJECT_ID=prj_test123",
        "VERCEL_TEAM_ID=team_test123",
        "APP_ENV=staging",
        "NEXT_PUBLIC_APP_ENV=staging",
        "UPSTASH_REDIS_REST_URL=https://upstash-staging.example.com",
        "UPSTASH_REDIS_REST_TOKEN=upstash-staging-token",
        "UPSTASH_REDIS_NAMESPACE=staging",
        "STRIPE_SECRET_KEY=sk_test_staging_secret",
        "PUBLIC_SETTING=expected-public",
        "INTERNAL_API_JWT_SECRET=super-secret-value-that-must-not-leak",
        "",
      ].join("\n"),
      "utf8",
    );
    writeGithubActionsOverlay(secretDir);

    const fakeVercelPath = path.join(binDir, "vercel");
    writeFileSync(
      fakeVercelPath,
      `#!/bin/zsh
set -euo pipefail
if [[ "$1" == "env" && "$2" == "pull" ]]; then
  cat > "$3" <<'EOF'
PUBLIC_SETTING=expected-public
APP_ENV=staging
NEXT_PUBLIC_APP_ENV=staging
UPSTASH_REDIS_REST_URL=https://upstash-staging.example.com
UPSTASH_REDIS_REST_TOKEN=upstash-staging-token
UPSTASH_REDIS_NAMESPACE=staging
STRIPE_SECRET_KEY=sk_test_staging_secret
CI_E2E_AUTH_SECRET=provider-secret
CI_E2E_AUTH_ENABLED=1
PLAYWRIGHT_BASE_URL=https://example.test
EOF
  exit 0
fi
exit 1
`,
      "utf8",
    );
    writeGithubActionsOverlay(secretDir);
    chmodSync(fakeVercelPath, 0o755);

    const result = spawnSync(
      "zsh",
      [scriptPath, "--check", "--target", "vercel-staging", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
        },
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.status, 0, output);
    assert.match(output, /missing provider keys: INTERNAL_API_JWT_SECRET/);
    assert.doesNotMatch(output, /super-secret-value-that-must-not-leak/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("check accepts Vercel staging overlay keys and only warns on extra keys", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));
  const binDir = mkdtempSync(path.join(tmpdir(), "career-compass-bin-"));

  try {
    writeFileSync(
      path.join(secretDir, "vercel-staging.env"),
      [
        "VERCEL_PROJECT_ID=prj_test123",
        "VERCEL_TEAM_ID=team_test123",
        "APP_ENV=staging",
        "NEXT_PUBLIC_APP_ENV=staging",
        "UPSTASH_REDIS_REST_URL=https://upstash-staging.example.com",
        "UPSTASH_REDIS_REST_TOKEN=upstash-staging-token",
        "UPSTASH_REDIS_NAMESPACE=staging",
        "STRIPE_SECRET_KEY=sk_test_staging_secret",
        "PUBLIC_SETTING=expected-public",
        "",
      ].join("\n"),
      "utf8",
    );
    writeGithubActionsOverlay(secretDir);

    const fakeVercelPath = path.join(binDir, "vercel");
    writeFileSync(
      fakeVercelPath,
      `#!/bin/zsh
set -euo pipefail
if [[ "$1" == "env" && "$2" == "pull" ]]; then
  cat > "$3" <<'EOF'
PUBLIC_SETTING=expected-public
APP_ENV=staging
NEXT_PUBLIC_APP_ENV=staging
UPSTASH_REDIS_REST_URL=https://upstash-staging.example.com
UPSTASH_REDIS_REST_TOKEN=upstash-staging-token
UPSTASH_REDIS_NAMESPACE=staging
STRIPE_SECRET_KEY=sk_test_staging_secret
CI_E2E_AUTH_SECRET=provider-secret
CI_E2E_AUTH_ENABLED=1
PLAYWRIGHT_BASE_URL=https://example.test
TEMP_PROVIDER_ONLY_KEY=extra
EOF
  exit 0
fi
exit 1
`,
      "utf8",
    );
    chmodSync(fakeVercelPath, 0o755);

    const result = spawnSync(
      "zsh",
      [scriptPath, "--check", "--target", "vercel-staging", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
        },
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.status, 0, output);
    assert.match(output, /unexpected provider keys: TEMP_PROVIDER_ONLY_KEY/);
    assert.doesNotMatch(output, /missing provider keys: CI_E2E_AUTH_SECRET/);
    assert.doesNotMatch(output, /service-role-secret-that-must-not-leak/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("json check treats Vercel staging overlay keys as expected", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));
  const binDir = mkdtempSync(path.join(tmpdir(), "career-compass-bin-"));

  try {
    writeFileSync(
      path.join(secretDir, "vercel-staging.env"),
      [
        "VERCEL_PROJECT_ID=prj_test123",
        "VERCEL_TEAM_ID=team_test123",
        "APP_ENV=staging",
        "NEXT_PUBLIC_APP_ENV=staging",
        "UPSTASH_REDIS_REST_URL=https://upstash-staging.example.com",
        "UPSTASH_REDIS_REST_TOKEN=upstash-staging-token",
        "UPSTASH_REDIS_NAMESPACE=staging",
        "STRIPE_SECRET_KEY=sk_test_staging_secret",
        "PUBLIC_SETTING=expected-public",
        "",
      ].join("\n"),
      "utf8",
    );
    writeGithubActionsOverlay(secretDir);

    const fakeVercelPath = path.join(binDir, "vercel");
    writeFileSync(
      fakeVercelPath,
      `#!/bin/zsh
set -euo pipefail
if [[ "$1" == "env" && "$2" == "pull" ]]; then
  cat > "$3" <<'EOF'
PUBLIC_SETTING=expected-public
APP_ENV=staging
NEXT_PUBLIC_APP_ENV=staging
UPSTASH_REDIS_REST_URL=https://upstash-staging.example.com
UPSTASH_REDIS_REST_TOKEN=upstash-staging-token
UPSTASH_REDIS_NAMESPACE=staging
STRIPE_SECRET_KEY=sk_test_staging_secret
CI_E2E_AUTH_SECRET=provider-secret
CI_E2E_AUTH_ENABLED=1
PLAYWRIGHT_BASE_URL=https://example.test
EOF
  exit 0
fi
exit 1
`,
      "utf8",
    );
    chmodSync(fakeVercelPath, 0o755);

    const result = spawnSync(
      "zsh",
      [scriptPath, "--check", "--json", "--target", "vercel-staging", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
        },
      },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.deepEqual(payload.removed, []);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("subdir layout rejects shared keys duplicated in service env files", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));

  try {
    mkdirSync(path.join(secretDir, "staging"), { recursive: true });
    writeFileSync(
      path.join(secretDir, "staging", "shared.env"),
      ["INTERNAL_API_JWT_SECRET=shared-secret-value-that-is-long-enough", ""].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(secretDir, "staging", "nextjs.env"),
      [
        "VERCEL_PROJECT_ID=prj_test123",
        "VERCEL_TEAM_ID=team_test123",
        "INTERNAL_API_JWT_SECRET=shared-secret-value-that-is-long-enough",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(path.join(secretDir, "staging", "fastapi.env"), "", "utf8");

    const result = spawnSync(
      "zsh",
      [scriptPath, "--check", "--target", "vercel-staging", "--secret-dir", secretDir, "--skip-provider-drift"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /shared\.env だけに定義/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
  }
});

test("subdir layout requires shared runtime keys in shared env", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));

  try {
    mkdirSync(path.join(secretDir, "staging"), { recursive: true });
    writeFileSync(
      path.join(secretDir, "staging", "shared.env"),
      ["INTERNAL_API_JWT_SECRET=shared-secret-value-that-is-long-enough", ""].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(secretDir, "staging", "nextjs.env"),
      ["VERCEL_PROJECT_ID=prj_test123", "VERCEL_TEAM_ID=team_test123", ""].join("\n"),
      "utf8",
    );
    writeFileSync(path.join(secretDir, "staging", "fastapi.env"), "", "utf8");

    const result = spawnSync(
      "zsh",
      [scriptPath, "--check", "--target", "vercel-staging", "--secret-dir", secretDir, "--skip-provider-drift"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /CAREER_PRINCIPAL_HMAC_SECRET は shared\.env に定義/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
  }
});

test("json check rejects shared keys duplicated in service env files", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));

  try {
    mkdirSync(path.join(secretDir, "staging"), { recursive: true });
    writeFileSync(
      path.join(secretDir, "staging", "shared.env"),
      ["INTERNAL_API_JWT_SECRET=shared-secret-value-that-is-long-enough", ""].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(secretDir, "staging", "nextjs.env"),
      [
        "VERCEL_PROJECT_ID=prj_test123",
        "VERCEL_TEAM_ID=team_test123",
        "INTERNAL_API_JWT_SECRET=shared-secret-value-that-is-long-enough",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(path.join(secretDir, "staging", "fastapi.env"), "", "utf8");

    const result = spawnSync(
      "zsh",
      [scriptPath, "--check", "--json", "--target", "vercel-staging", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /shared\.env だけに定義/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
  }
});

test("apply requires Vercel staging test-auth overlay keys", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));
  const binDir = mkdtempSync(path.join(tmpdir(), "career-compass-bin-"));

  try {
    mkdirSync(path.join(secretDir, "staging"), { recursive: true });
    writeFileSync(
      path.join(secretDir, "staging", "shared.env"),
      [
        "INTERNAL_API_JWT_SECRET=internal-secret-value-that-is-long-enough",
        "CAREER_PRINCIPAL_HMAC_SECRET=principal-secret-value-that-is-long-enough",
        "TENANT_KEY_SECRET=tenant-secret-value-that-is-long-enough",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(secretDir, "staging", "nextjs.env"),
      [
        "VERCEL_PROJECT_ID=prj_test123",
        "VERCEL_TEAM_ID=team_test123",
        "APP_ENV=staging",
        "NEXT_PUBLIC_APP_ENV=staging",
        "UPSTASH_REDIS_REST_URL=https://upstash-staging.example.com",
        "UPSTASH_REDIS_REST_TOKEN=upstash-staging-token",
        "UPSTASH_REDIS_NAMESPACE=staging",
        "PUBLIC_SETTING=expected-public",
        "",
      ].join("\n"),
      "utf8",
    );

    const fakeVercelPath = path.join(binDir, "vercel");
    writeFileSync(
      fakeVercelPath,
      `#!/bin/zsh
set -euo pipefail
if [[ "$1" == "env" && "$2" == "add" ]]; then
  cat >/dev/null || true
fi
exit 0
`,
      "utf8",
    );
    chmodSync(fakeVercelPath, 0o755);

    const result = spawnSync(
      "zsh",
      [scriptPath, "--apply", "--target", "vercel-staging", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
        },
      },
    );

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /CI_E2E_AUTH_SECRET missing/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("flat layout apply requires Vercel staging test-auth overlay file", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));
  const binDir = mkdtempSync(path.join(tmpdir(), "career-compass-bin-"));

  try {
    writeFileSync(
      path.join(secretDir, "vercel-staging.env"),
      [
        "VERCEL_PROJECT_ID=prj_test123",
        "VERCEL_TEAM_ID=team_test123",
        "APP_ENV=staging",
        "NEXT_PUBLIC_APP_ENV=staging",
        "UPSTASH_REDIS_REST_URL=https://upstash-staging.example.com",
        "UPSTASH_REDIS_REST_TOKEN=upstash-staging-token",
        "UPSTASH_REDIS_NAMESPACE=staging",
        "PUBLIC_SETTING=expected-public",
        "",
      ].join("\n"),
      "utf8",
    );

    const fakeVercelPath = path.join(binDir, "vercel");
    writeFileSync(
      fakeVercelPath,
      `#!/bin/zsh
set -euo pipefail
if [[ "$1" == "env" && "$2" == "add" ]]; then
  cat >/dev/null || true
fi
exit 0
`,
      "utf8",
    );
    chmodSync(fakeVercelPath, 0o755);

    const result = spawnSync(
      "zsh",
      [scriptPath, "--apply", "--target", "vercel-staging", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
        },
      },
    );

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /Missing required file: .*github-actions\.env/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("railway check requires APP_ENV in bundle", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));

  try {
    writeFileSync(
      path.join(secretDir, "railway-staging.env"),
      [
        "RAILWAY_PROJECT_ID=project_test123",
        "RAILWAY_SERVICE_NAME=career-compass-backend-staging",
        "RAILWAY_ENVIRONMENT_NAME=production",
        "PUBLIC_SETTING=expected-public",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = spawnSync(
      "zsh",
      [scriptPath, "--check", "--target", "railway-staging", "--secret-dir", secretDir, "--skip-provider-drift"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /APP_ENV missing/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
  }
});

test("railway staging check accepts split project production environment name", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));

  try {
    writeFileSync(
      path.join(secretDir, "railway-staging.env"),
      [
        "RAILWAY_PROJECT_ID=project_test123",
        "RAILWAY_SERVICE_NAME=career-compass-backend-staging",
        "RAILWAY_ENVIRONMENT_NAME=production",
        "APP_ENV=staging",
        "REDIS_URL=redis://localhost:6379",
        "REDIS_NAMESPACE=staging",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = spawnSync(
      "zsh",
      [scriptPath, "--check", "--target", "railway-staging", "--secret-dir", secretDir, "--skip-provider-drift"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /Checked Railway staging env/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
  }
});

test("vercel staging check rejects placeholder CI overlay secret", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));

  try {
    writeFileSync(
      path.join(secretDir, "vercel-staging.env"),
      [
        "VERCEL_PROJECT_ID=prj_test123",
        "VERCEL_TEAM_ID=team_test123",
        "APP_ENV=staging",
        "NEXT_PUBLIC_APP_ENV=staging",
        "UPSTASH_REDIS_REST_URL=https://upstash-staging.example.com",
        "UPSTASH_REDIS_REST_TOKEN=upstash-staging-token",
        "UPSTASH_REDIS_NAMESPACE=staging",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(secretDir, "github-actions.env"),
      [
        "CI_E2E_AUTH_SECRET=change-me",
        "CI_E2E_AUTH_ENABLED=1",
        "PLAYWRIGHT_BASE_URL=https://stg.shupass.jp",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = spawnSync(
      "zsh",
      [scriptPath, "--check", "--target", "vercel-staging", "--secret-dir", secretDir, "--skip-provider-drift"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /CI_E2E_AUTH_SECRET missing or placeholder value/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
  }
});

test("json check requires deployed Redis keys", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));

  try {
    writeFileSync(
      path.join(secretDir, "railway-staging.env"),
      [
        "RAILWAY_PROJECT_ID=project_test123",
        "RAILWAY_SERVICE_NAME=career-compass-backend-staging",
        "RAILWAY_ENVIRONMENT_NAME=production",
        "APP_ENV=staging",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = spawnSync(
      "zsh",
      [scriptPath, "--check", "--json", "--target", "railway-staging", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /REDIS_URL missing/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
  }
});

test("secret-plan direct check accepts split project railway staging target", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));
  const binDir = mkdtempSync(path.join(tmpdir(), "career-compass-bin-"));

  try {
    writeFileSync(
      path.join(secretDir, "railway-staging.env"),
      [
        "RAILWAY_PROJECT_ID=project_test123",
        "RAILWAY_SERVICE_NAME=career-compass-backend-staging",
        "RAILWAY_ENVIRONMENT_NAME=production",
        "APP_ENV=staging",
        "REDIS_URL=redis://localhost:6379",
        "REDIS_NAMESPACE=staging",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(binDir, "railway"),
      `#!/bin/zsh
set -euo pipefail
if [[ "$1" == "link" ]]; then exit 0; fi
if [[ "$1" == "variables" ]]; then
  print -r -- '{}'
  exit 0
fi
exit 1
`,
      "utf8",
    );
    chmodSync(path.join(binDir, "railway"), 0o755);

    const result = spawnSync(
      "zsh",
      [secretPlanPath, "--target", "railway-staging", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
        },
      },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.target, "railway-staging");
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("secret-plan direct check rejects placeholder Vercel staging overlay", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));

  try {
    writeFileSync(
      path.join(secretDir, "vercel-staging.env"),
      [
        "VERCEL_PROJECT_ID=prj_test123",
        "VERCEL_TEAM_ID=team_test123",
        "APP_ENV=staging",
        "NEXT_PUBLIC_APP_ENV=staging",
        "UPSTASH_REDIS_REST_URL=https://upstash-staging.example.com",
        "UPSTASH_REDIS_REST_TOKEN=upstash-staging-token",
        "UPSTASH_REDIS_NAMESPACE=staging",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(secretDir, "github-actions.env"),
      [
        "CI_E2E_AUTH_SECRET=change-me",
        "CI_E2E_AUTH_ENABLED=1",
        "PLAYWRIGHT_BASE_URL=https://stg.shupass.jp",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = spawnSync(
      "zsh",
      [secretPlanPath, "--target", "vercel-staging", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /CI_E2E_AUTH_SECRET missing or placeholder value/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
  }
});

test("secret-plan direct check rejects shared keys duplicated in service env files", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));

  try {
    mkdirSync(path.join(secretDir, "staging"), { recursive: true });
    mkdirSync(path.join(secretDir, "ci"), { recursive: true });
    writeFileSync(
      path.join(secretDir, "staging", "shared.env"),
      [
        "INTERNAL_API_JWT_SECRET=internal-secret-value-that-is-long-enough",
        "CAREER_PRINCIPAL_HMAC_SECRET=principal-secret-value-that-is-long-enough",
        "TENANT_KEY_SECRET=tenant-secret-value-that-is-long-enough",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(secretDir, "staging", "nextjs.env"),
      [
        "VERCEL_PROJECT_ID=prj_test123",
        "VERCEL_TEAM_ID=team_test123",
        "APP_ENV=staging",
        "NEXT_PUBLIC_APP_ENV=staging",
        "UPSTASH_REDIS_REST_URL=https://upstash-staging.example.com",
        "UPSTASH_REDIS_REST_TOKEN=upstash-staging-token",
        "UPSTASH_REDIS_NAMESPACE=staging",
        "INTERNAL_API_JWT_SECRET=duplicated-secret-value-that-is-long-enough",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(path.join(secretDir, "staging", "fastapi.env"), "", "utf8");
    writeFileSync(
      path.join(secretDir, "ci", "github-actions.env"),
      [
        "CI_E2E_AUTH_SECRET=ci-secret-value-that-is-long-enough",
        "CI_E2E_AUTH_ENABLED=1",
        "PLAYWRIGHT_BASE_URL=https://stg.shupass.jp",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = spawnSync(
      "zsh",
      [secretPlanPath, "--target", "vercel-staging", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /shared\.env だけに定義/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
  }
});

test("json check rejects placeholder GitHub bundle values", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));

  try {
    writeFileSync(
      path.join(secretDir, "github-actions.env"),
      [
        "CI_E2E_AUTH_SECRET=ci-secret-value-that-is-long-enough",
        "CI_E2E_AUTH_ENABLED=1",
        "PLAYWRIGHT_BASE_URL=https://stg.shupass.jp",
        "OPENAI_API_KEY=change-me",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = spawnSync(
      "zsh",
      [scriptPath, "--check", "--json", "--target", "github", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /OPENAI_API_KEY missing or placeholder value/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
  }
});

test("json check rejects placeholder Supabase bundle values", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));

  try {
    writeFileSync(
      path.join(secretDir, "supabase-staging.env"),
      [
        "SUPABASE_STAGING_PROJECT_REF=supabase_stg_ref",
        "PUBLIC_SETTING=change-me",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = spawnSync(
      "zsh",
      [scriptPath, "--check", "--json", "--target", "supabase-staging", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /PUBLIC_SETTING missing or placeholder value/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
  }
});

test("json check rejects placeholder Google OAuth bundle values", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));
  const secretsRoot = mkdtempSync(path.join(tmpdir(), "career-compass-root-secrets-"));

  try {
    mkdirSync(path.join(secretsRoot, "google-oauth"), { recursive: true });
    writeFileSync(
      path.join(secretsRoot, "google-oauth", "career_compass.env"),
      ["GOOGLE_CLIENT_ID=change-me", ""].join("\n"),
      "utf8",
    );

    const result = spawnSync(
      "zsh",
      [scriptPath, "--check", "--json", "--target", "google-oauth", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          CODEX_COMPANY_SECRETS_ROOT: secretsRoot,
        },
      },
    );

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /GOOGLE_CLIENT_ID missing or placeholder value/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
    rmSync(secretsRoot, { recursive: true, force: true });
  }
});

test("json check rejects prefixed xxxx placeholder values", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));
  const secretsRoot = mkdtempSync(path.join(tmpdir(), "career-compass-root-secrets-"));

  try {
    mkdirSync(path.join(secretsRoot, "google-oauth"), { recursive: true });
    writeFileSync(
      path.join(secretsRoot, "google-oauth", "career_compass.env"),
      ["GOOGLE_CLIENT_SECRET=GOCSPX-xxxx", ""].join("\n"),
      "utf8",
    );

    const result = spawnSync(
      "zsh",
      [scriptPath, "--check", "--json", "--target", "google-oauth", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          CODEX_COMPANY_SECRETS_ROOT: secretsRoot,
        },
      },
    );

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /GOOGLE_CLIENT_SECRET missing or placeholder value/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
    rmSync(secretsRoot, { recursive: true, force: true });
  }
});

test("json check requires APP_ENV in Vercel and Railway bundles", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));

  try {
    writeFileSync(
      path.join(secretDir, "vercel-staging.env"),
      [
        "VERCEL_PROJECT_ID=prj_test123",
        "VERCEL_TEAM_ID=team_test123",
        "NEXT_PUBLIC_APP_ENV=staging",
        "UPSTASH_REDIS_REST_URL=https://upstash-staging.example.com",
        "UPSTASH_REDIS_REST_TOKEN=upstash-staging-token",
        "UPSTASH_REDIS_NAMESPACE=staging",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(secretDir, "github-actions.env"),
      [
        "CI_E2E_AUTH_SECRET=ci-secret-value-that-is-long-enough",
        "CI_E2E_AUTH_ENABLED=1",
        "PLAYWRIGHT_BASE_URL=https://stg.shupass.jp",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = spawnSync(
      "zsh",
      [scriptPath, "--check", "--json", "--target", "vercel-staging", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /APP_ENV missing/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
  }
});

test("vercel staging apply validates overlay before provider changes", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));
  const binDir = mkdtempSync(path.join(tmpdir(), "career-compass-bin-"));
  const keysLog = path.join(secretDir, "vercel-keys.log");

  try {
    writeFileSync(
      path.join(secretDir, "vercel-staging.env"),
      [
        "VERCEL_PROJECT_ID=prj_test123",
        "VERCEL_TEAM_ID=team_test123",
        "APP_ENV=staging",
        "NEXT_PUBLIC_APP_ENV=staging",
        "UPSTASH_REDIS_REST_URL=https://upstash-staging.example.com",
        "UPSTASH_REDIS_REST_TOKEN=upstash-staging-token",
        "UPSTASH_REDIS_NAMESPACE=staging",
        "PUBLIC_SETTING=expected-public",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(secretDir, "github-actions.env"),
      [
        "CI_E2E_AUTH_ENABLED=1",
        "PLAYWRIGHT_BASE_URL=https://stg.shupass.jp",
        "",
      ].join("\n"),
      "utf8",
    );

    const fakeVercelPath = path.join(binDir, "vercel");
    writeFileSync(
      fakeVercelPath,
      `#!/bin/zsh
set -euo pipefail
if [[ "$1" == "env" && "$2" == "add" ]]; then
  print -r -- "$3" >> "$VERCEL_KEYS_LOG"
  cat >/dev/null || true
fi
exit 0
`,
      "utf8",
    );
    chmodSync(fakeVercelPath, 0o755);

    const result = spawnSync(
      "zsh",
      [scriptPath, "--apply", "--target", "vercel-staging", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
          VERCEL_KEYS_LOG: keysLog,
        },
      },
    );

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /CI_E2E_AUTH_SECRET missing/);
    assert.throws(() => readFileSync(keysLog, "utf8"), /ENOENT/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("supabase subdir bundle does not include shared runtime keys", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));
  const binDir = mkdtempSync(path.join(tmpdir(), "career-compass-bin-"));

  try {
    mkdirSync(path.join(secretDir, "staging"), { recursive: true });
    writeFileSync(
      path.join(secretDir, "staging", "shared.env"),
      [
        "INTERNAL_API_JWT_SECRET=internal-secret-value-that-is-long-enough",
        "CAREER_PRINCIPAL_HMAC_SECRET=principal-secret-value-that-is-long-enough",
        "TENANT_KEY_SECRET=tenant-secret-value-that-is-long-enough",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(secretDir, "staging", "supabase.env"),
      [
        "SUPABASE_STAGING_PROJECT_REF=supabase_stg_ref",
        "PUBLIC_SETTING=value",
        "",
      ].join("\n"),
      "utf8",
    );

    const fakeSupabasePath = path.join(binDir, "supabase");
    writeFileSync(
      fakeSupabasePath,
      `#!/bin/zsh
set -euo pipefail
if [[ "$1" == "secrets" && "$2" == "list" ]]; then
  print -r -- 'PUBLIC_SETTING value'
  exit 0
fi
exit 1
`,
      "utf8",
    );
    chmodSync(fakeSupabasePath, 0o755);

    const result = spawnSync(
      "zsh",
      [scriptPath, "--check", "--json", "--target", "supabase-staging", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
        },
      },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.deepEqual(payload.added, []);
    assert.deepEqual(payload.removed, []);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("supabase check rejects shared secrets in supabase env file", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));

  try {
    writeFileSync(
      path.join(secretDir, "supabase-staging.env"),
      [
        "SUPABASE_STAGING_PROJECT_REF=supabase_stg_ref",
        "INTERNAL_API_JWT_SECRET=internal-secret-value-that-is-long-enough",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = spawnSync(
      "zsh",
      [scriptPath, "--check", "--target", "supabase-staging", "--secret-dir", secretDir, "--skip-provider-drift"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /Supabase staging bundle must not contain INTERNAL_API_JWT_SECRET/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
  }
});

test("supabase legacy production alias is rejected for apply", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));

  try {
    const result = spawnSync(
      "zsh",
      [scriptPath, "--apply", "--target", "supabase", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /Use --target supabase-production or --target supabase-staging/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
  }
});

test("supabase apply passes secret values through env file instead of argv", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));
  const binDir = mkdtempSync(path.join(tmpdir(), "career-compass-bin-"));
  const argsLog = path.join(secretDir, "supabase-args.log");
  const envFileLog = path.join(secretDir, "supabase-env-file.log");

  try {
    writeFileSync(
      path.join(secretDir, "supabase-staging.env"),
      [
        "SUPABASE_STAGING_PROJECT_REF=supabase_stg_ref",
        "PUBLIC_SETTING=public-value",
        "PRIVATE_SETTING=secret-value-that-must-not-be-in-argv",
        "",
      ].join("\n"),
      "utf8",
    );

    const fakeSupabasePath = path.join(binDir, "supabase");
    writeFileSync(
      fakeSupabasePath,
      `#!/bin/zsh
set -euo pipefail
print -r -- "$*" >> "$SUPABASE_ARGS_LOG"
if [[ "$1" == "secrets" && "$2" == "set" ]]; then
  env_file=""
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == "--env-file" ]]; then
      shift
      env_file="$1"
      break
    fi
    shift
  done
  cat "$env_file" > "$SUPABASE_ENV_FILE_LOG"
  exit 0
fi
exit 1
`,
      "utf8",
    );
    chmodSync(fakeSupabasePath, 0o755);

    const result = spawnSync(
      "zsh",
      [scriptPath, "--apply", "--target", "supabase-staging", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
          SUPABASE_ARGS_LOG: argsLog,
          SUPABASE_ENV_FILE_LOG: envFileLog,
        },
      },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const args = readFileSync(argsLog, "utf8");
    assert.match(args, /secrets set --project-ref supabase_stg_ref --env-file/);
    assert.doesNotMatch(args, /secret-value-that-must-not-be-in-argv/);
    assert.match(readFileSync(envFileLog, "utf8"), /PRIVATE_SETTING=secret-value-that-must-not-be-in-argv/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("supabase json check rejects shared secrets already present in provider", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));
  const binDir = mkdtempSync(path.join(tmpdir(), "career-compass-bin-"));

  try {
    writeFileSync(
      path.join(secretDir, "supabase-staging.env"),
      [
        "SUPABASE_STAGING_PROJECT_REF=supabase_stg_ref",
        "PUBLIC_SETTING=value",
        "",
      ].join("\n"),
      "utf8",
    );

    const fakeSupabasePath = path.join(binDir, "supabase");
    writeFileSync(
      fakeSupabasePath,
      `#!/bin/zsh
set -euo pipefail
if [[ "$1" == "secrets" && "$2" == "list" ]]; then
  print -r -- 'PUBLIC_SETTING value'
  print -r -- 'INTERNAL_API_JWT_SECRET value'
  exit 0
fi
exit 1
`,
      "utf8",
    );
    chmodSync(fakeSupabasePath, 0o755);

    const result = spawnSync(
      "zsh",
      [scriptPath, "--check", "--json", "--target", "supabase-staging", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
        },
      },
    );

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /Supabase provider secrets must not contain INTERNAL_API_JWT_SECRET/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("applies every Vercel key even when CLI reads stdin", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));
  const binDir = mkdtempSync(path.join(tmpdir(), "career-compass-bin-"));
  const keysLog = path.join(secretDir, "vercel-keys.log");

  try {
    writeFileSync(
      path.join(secretDir, "vercel-production.env"),
      [
        "VERCEL_PROJECT_ID=prj_test123",
        "VERCEL_TEAM_ID=team_test123",
        "APP_ENV=production",
        "NEXT_PUBLIC_APP_ENV=production",
        "UPSTASH_REDIS_REST_URL=https://upstash-production.example.com",
        "UPSTASH_REDIS_REST_TOKEN=upstash-production-token",
        "UPSTASH_REDIS_NAMESPACE=production",
        "STRIPE_SECRET_KEY=sk_live_production_secret",
        "FIRST_SETTING=first-value",
        "SECOND_SETTING=second-value",
      ].join("\n"),
      "utf8",
    );

    const fakeVercelPath = path.join(binDir, "vercel");
    writeFileSync(
      fakeVercelPath,
      `#!/bin/zsh
set -euo pipefail
if [[ "$1" == "env" && "$2" == "add" ]]; then
  print -r -- "$3" >> "$VERCEL_KEYS_LOG"
  cat >/dev/null || true
  exit 0
fi
if [[ "$1" == "env" && "$2" == "rm" ]]; then
  exit 0
fi
exit 1
`,
      "utf8",
    );
    chmodSync(fakeVercelPath, 0o755);

    const result = spawnSync(
      "zsh",
      [scriptPath, "--apply", "--target", "vercel-production", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
          VERCEL_KEYS_LOG: keysLog,
        },
      },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const keys = readFileSync(keysLog, "utf8").trim().split("\n").sort();
    assert.equal(keys.length, 8);
    assert.deepEqual([...new Set(keys)], [
      "APP_ENV",
      "FIRST_SETTING",
      "NEXT_PUBLIC_APP_ENV",
      "SECOND_SETTING",
      "STRIPE_SECRET_KEY",
      "UPSTASH_REDIS_NAMESPACE",
      "UPSTASH_REDIS_REST_TOKEN",
      "UPSTASH_REDIS_REST_URL",
    ]);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("can apply only Vercel production env", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));
  const binDir = mkdtempSync(path.join(tmpdir(), "career-compass-bin-"));
  const argsLog = path.join(secretDir, "vercel-args.log");

  try {
    writeFileSync(
      path.join(secretDir, "vercel-production.env"),
      [
        "VERCEL_PROJECT_ID=prj_test123",
        "VERCEL_TEAM_ID=team_test123",
        "APP_ENV=production",
        "NEXT_PUBLIC_APP_ENV=production",
        "UPSTASH_REDIS_REST_URL=https://upstash-production.example.com",
        "UPSTASH_REDIS_REST_TOKEN=upstash-production-token",
        "UPSTASH_REDIS_NAMESPACE=production",
        "STRIPE_SECRET_KEY=sk_live_production_secret",
        "STRIPE_WEBHOOK_SECRET=whsec_test",
      ].join("\n"),
      "utf8",
    );

    const fakeVercelPath = path.join(binDir, "vercel");
    writeFileSync(
      fakeVercelPath,
      `#!/bin/zsh
set -euo pipefail
print -r -- "$*" >> "$VERCEL_ARGS_LOG"
if [[ "$1" == "env" && "$2" == "add" ]]; then
  cat >/dev/null || true
fi
exit 0
`,
      "utf8",
    );
    chmodSync(fakeVercelPath, 0o755);

    const result = spawnSync(
      "zsh",
      [scriptPath, "--apply", "--target", "vercel-production", "--vercel-env", "production", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
          VERCEL_ARGS_LOG: argsLog,
        },
      },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const args = readFileSync(argsLog, "utf8");
    assert.match(args, /env add STRIPE_WEBHOOK_SECRET production/);
    assert.doesNotMatch(args, /preview develop/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("rejects Vercel preview env scope", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));

  try {
    writeFileSync(
      path.join(secretDir, "vercel-production.env"),
      [
        "VERCEL_PROJECT_ID=prj_test123",
        "VERCEL_TEAM_ID=team_test123",
        "APP_ENV=production",
        "NEXT_PUBLIC_APP_ENV=production",
        "UPSTASH_REDIS_REST_URL=https://upstash-production.example.com",
        "UPSTASH_REDIS_REST_TOKEN=upstash-production-token",
        "UPSTASH_REDIS_NAMESPACE=production",
        "STRIPE_WEBHOOK_SECRET=whsec_test",
      ].join("\n"),
      "utf8",
    );

    const result = spawnSync(
      "zsh",
      [scriptPath, "--apply", "--target", "vercel-production", "--vercel-env", "preview", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /Invalid --vercel-env: preview\. Expected production/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
  }
});

test("rejects invalid Vercel env scope", () => {
  const result = spawnSync(
    "zsh",
    [scriptPath, "--check", "--target", "vercel-production", "--vercel-env", "staging"],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /Invalid --vercel-env: staging\. Expected production/);
});

test("checks Vercel production without preview branch argument", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));
  const binDir = mkdtempSync(path.join(tmpdir(), "career-compass-bin-"));

  try {
    writeFileSync(
      path.join(secretDir, "vercel-production.env"),
      [
        "VERCEL_PROJECT_ID=prj_test123",
        "VERCEL_TEAM_ID=team_test123",
        "APP_ENV=production",
        "NEXT_PUBLIC_APP_ENV=production",
        "UPSTASH_REDIS_REST_URL=https://upstash-production.example.com",
        "UPSTASH_REDIS_REST_TOKEN=upstash-production-token",
        "UPSTASH_REDIS_NAMESPACE=production",
        "STRIPE_SECRET_KEY=sk_live_production_secret",
        "PUBLIC_SETTING=expected-public",
        "",
      ].join("\n"),
      "utf8",
    );

    const fakeVercelPath = path.join(binDir, "vercel");
    writeFileSync(
      fakeVercelPath,
      `#!/bin/zsh
set -euo pipefail
if [[ "$1" == "env" && "$2" == "pull" ]]; then
  cat > "$3" <<'EOF'
PUBLIC_SETTING=expected-public
APP_ENV=production
NEXT_PUBLIC_APP_ENV=production
UPSTASH_REDIS_REST_URL=https://upstash-production.example.com
UPSTASH_REDIS_REST_TOKEN=upstash-production-token
UPSTASH_REDIS_NAMESPACE=production
STRIPE_SECRET_KEY=sk_live_production_secret
EOF
  exit 0
fi
exit 1
`,
      "utf8",
    );
    chmodSync(fakeVercelPath, 0o755);

    const result = spawnSync(
      "zsh",
      [scriptPath, "--check", "--target", "vercel-production", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
        },
      },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /Checked Vercel production provider key drift/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("json check supports target all", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));
  const binDir = mkdtempSync(path.join(tmpdir(), "career-compass-bin-"));

  try {
    for (const [fileName, lines] of [
      ["vercel-staging.env", ["VERCEL_PROJECT_ID=prj_stg", "VERCEL_TEAM_ID=team_test", "APP_ENV=staging", "NEXT_PUBLIC_APP_ENV=staging",
        "UPSTASH_REDIS_REST_URL=https://upstash-staging.example.com",
        "UPSTASH_REDIS_REST_TOKEN=upstash-staging-token",
        "UPSTASH_REDIS_NAMESPACE=staging", "STRIPE_SECRET_KEY=sk_test_staging_secret", "PUBLIC_SETTING=value"]],
      ["vercel-production.env", ["VERCEL_PROJECT_ID=prj_prod", "VERCEL_TEAM_ID=team_test", "APP_ENV=production", "NEXT_PUBLIC_APP_ENV=production",
        "UPSTASH_REDIS_REST_URL=https://upstash-production.example.com",
        "UPSTASH_REDIS_REST_TOKEN=upstash-production-token",
        "UPSTASH_REDIS_NAMESPACE=production", "STRIPE_SECRET_KEY=sk_live_production_secret", "PUBLIC_SETTING=value"]],
      ["railway-staging.env", ["RAILWAY_PROJECT_ID=rail_proj_stg", "RAILWAY_SERVICE_NAME=svc_stg", "RAILWAY_ENVIRONMENT_NAME=production", "APP_ENV=staging", "REDIS_URL=redis://localhost:6379", "REDIS_NAMESPACE=staging", "PUBLIC_SETTING=value"]],
      ["railway-production.env", ["RAILWAY_PROJECT_ID=rail_proj_prod", "RAILWAY_SERVICE_NAME=svc_prod", "RAILWAY_ENVIRONMENT_NAME=production", "APP_ENV=production", "REDIS_URL=redis://localhost:6379", "REDIS_NAMESPACE=production", "PUBLIC_SETTING=value"]],
      ["github-actions.env", ["CI_E2E_AUTH_SECRET=ci-secret-value-that-is-long-enough", "CI_E2E_AUTH_ENABLED=1", "PLAYWRIGHT_BASE_URL=https://stg.shupass.jp", "PUBLIC_SETTING=value"]],
      ["supabase-staging.env", ["SUPABASE_STAGING_PROJECT_REF=supabase_stg_ref", "PUBLIC_SETTING=value"]],
      ["supabase.env", ["SUPABASE_PRODUCTION_PROJECT_REF=supabase_ref", "PUBLIC_SETTING=value"]],
    ]) {
      writeFileSync(path.join(secretDir, fileName), `${lines.join("\n")}\n`, "utf8");
    }

    writeFileSync(
      path.join(binDir, "vercel"),
      `#!/bin/zsh
set -euo pipefail
if [[ "$1" == "env" && "$2" == "pull" ]]; then
  cat > "$3" <<'EOF'
PUBLIC_SETTING=value
APP_ENV=staging
NEXT_PUBLIC_APP_ENV=staging
UPSTASH_REDIS_REST_URL=https://upstash-staging.example.com
UPSTASH_REDIS_REST_TOKEN=upstash-staging-token
UPSTASH_REDIS_NAMESPACE=staging
STRIPE_SECRET_KEY=sk_test_staging_secret
EOF
  exit 0
fi
exit 1
`,
      "utf8",
    );
    writeFileSync(
      path.join(binDir, "railway"),
      `#!/bin/zsh
set -euo pipefail
if [[ "$1" == "link" ]]; then exit 0; fi
if [[ "$1" == "variables" ]]; then
  print -r -- '{"PUBLIC_SETTING":"value"}'
  exit 0
fi
exit 1
`,
      "utf8",
    );
    writeFileSync(
      path.join(binDir, "gh"),
      `#!/bin/zsh
set -euo pipefail
if [[ "$1" == "secret" && "$2" == "list" ]]; then
  print -r -- 'PUBLIC_SETTING'
  exit 0
fi
exit 1
`,
      "utf8",
    );
    writeFileSync(
      path.join(binDir, "supabase"),
      `#!/bin/zsh
set -euo pipefail
if [[ "$1" == "secrets" && "$2" == "list" ]]; then
  print -r -- 'PUBLIC_SETTING value'
  exit 0
fi
exit 1
`,
      "utf8",
    );
    for (const name of ["vercel", "railway", "gh", "supabase"]) {
      chmodSync(path.join(binDir, name), 0o755);
    }

    const result = spawnSync(
      "zsh",
      [scriptPath, "--check", "--json", "--target", "all", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
        },
      },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.length, 7);
    assert.deepEqual(payload.map((item) => item.target), [
      "vercel-staging",
      "railway-staging",
      "supabase-staging",
      "github",
      "vercel-production",
      "railway-production",
      "supabase-production",
    ]);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("applies Railway variables via stdin so JSON values keep their quotes", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));
  const binDir = mkdtempSync(path.join(tmpdir(), "career-compass-bin-"));
  const argsLog = path.join(secretDir, "railway-args.log");
  const stdinLog = path.join(secretDir, "railway-stdin.log");

  try {
    writeFileSync(
      path.join(secretDir, "railway-staging.env"),
      [
        "RAILWAY_PROJECT_ID=project_test123",
        "RAILWAY_SERVICE_NAME=career-compass-backend-staging",
        "RAILWAY_ENVIRONMENT_NAME=production",
        "APP_ENV=staging",
        "REDIS_URL=redis://localhost:6379",
        "REDIS_NAMESPACE=staging",
        'BACKEND_TRUSTED_HOSTS=["stg-api.shupass.jp","localhost"]',
        "INTERNAL_API_JWT_SECRET=test-secret",
        "",
      ].join("\n"),
      "utf8",
    );

    const fakeRailwayPath = path.join(binDir, "railway");
    writeFileSync(
      fakeRailwayPath,
      `#!/bin/zsh
set -euo pipefail

print -r -- "$*" >> "$RAILWAY_ARGS_LOG"

if [[ "$1" == "variable" && "$2" == "set" && "$*" == *"BACKEND_TRUSTED_HOSTS"* && "$*" == *"--stdin"* ]]; then
  cat > "$RAILWAY_STDIN_LOG"
fi
`,
      "utf8",
    );
    chmodSync(fakeRailwayPath, 0o755);

    const result = spawnSync(
      "zsh",
      [scriptPath, "--apply", "--target", "railway-staging", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
          RAILWAY_ARGS_LOG: argsLog,
          RAILWAY_STDIN_LOG: stdinLog,
        },
      },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const args = readFileSync(argsLog, "utf8");
    assert.match(args, /link --project project_test123 --service career-compass-backend-staging --environment production --json/);
    assert.match(args, /variable set BACKEND_TRUSTED_HOSTS .*--stdin/);

    const stdinValue = readFileSync(stdinLog, "utf8").trim();
    assert.equal(stdinValue, '["stg-api.shupass.jp","localhost"]');
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});
