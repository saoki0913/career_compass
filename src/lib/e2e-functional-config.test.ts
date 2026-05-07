import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("E2E functional config", () => {
  it("adds package scripts for regression and functional feature runs", () => {
    const pkg = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts["test:e2e:functional"]).toBe("bash scripts/ci/run-e2e-functional.sh --features all");
    expect(pkg.scripts["test:e2e:functional:es"]).toBe("bash scripts/ci/run-e2e-functional.sh --features es-review");
    expect(pkg.scripts["test:e2e:functional:gakuchika"]).toBe("bash scripts/ci/run-e2e-functional.sh --features gakuchika");
    expect(pkg.scripts["test:e2e:functional:motivation"]).toBe("bash scripts/ci/run-e2e-functional.sh --features motivation");
    expect(pkg.scripts["test:e2e:functional:interview"]).toBe("bash scripts/ci/run-e2e-functional.sh --features interview");
    expect(pkg.scripts["test:e2e:functional:company-info-search"]).toBe(
      "bash scripts/ci/run-e2e-functional.sh --features company-info-search",
    );
    expect(pkg.scripts["test:e2e:functional:rag-ingest"]).toBe(
      "bash scripts/ci/run-e2e-functional.sh --features rag-ingest",
    );
    expect(pkg.scripts["test:e2e:functional:selection-schedule"]).toBe(
      "bash scripts/ci/run-e2e-functional.sh --features selection-schedule",
    );
    expect(pkg.scripts["test:e2e:functional:local"]).toBe("bash scripts/dev/run-ai-live-local.sh");
    expect(pkg.scripts["test:e2e:functional:local:company-info-search"]).toBe(
      "AI_LIVE_LOCAL_FEATURES=company-info-search bash scripts/dev/run-ai-live-local.sh",
    );
    expect(pkg.scripts["test:e2e:functional:local:selection-schedule"]).toBe(
      "AI_LIVE_LOCAL_FEATURES=selection-schedule bash scripts/dev/run-ai-live-local.sh",
    );
    expect(pkg.scripts["test:e2e:functional:local:rag-ingest"]).toBe(
      "AI_LIVE_LOCAL_FEATURES=rag-ingest bash scripts/dev/run-ai-live-local.sh",
    );
    expect(pkg.scripts["test:e2e:functional:local:gakuchika"]).toBe(
      "AI_LIVE_LOCAL_FEATURES=gakuchika bash scripts/dev/run-ai-live-local.sh",
    );
    expect(pkg.scripts["test:e2e:functional:local:motivation"]).toBe(
      "AI_LIVE_LOCAL_FEATURES=motivation bash scripts/dev/run-ai-live-local.sh",
    );
    expect(pkg.scripts["test:e2e:functional:local:interview"]).toBe(
      "AI_LIVE_LOCAL_FEATURES=interview bash scripts/dev/run-ai-live-local.sh",
    );
    expect(pkg.scripts["test:e2e:functional:local:es"]).toBe(
      "AI_LIVE_LOCAL_FEATURES=es-review AI_LIVE_LOCAL_SKIP_ES_REVIEW_PLAYWRIGHT=0 bash scripts/dev/run-ai-live-local.sh",
    );
  });

  it("adds Makefile targets for regression and functional feature runs", () => {
    const makefile = read("Makefile");

    expect(makefile).toMatch(/^test-e2e-regression:/m);
    expect(makefile).toMatch(/^test-e2e-functional:/m);
    expect(makefile).toMatch(/^test-e2e-functional-local:/m);
    expect(makefile).toMatch(/^test-e2e-functional-local-company-info-search:/m);
    expect(makefile).toMatch(/^test-e2e-functional-local-selection-schedule:/m);
    expect(makefile).toMatch(/^test-e2e-functional-local-rag-ingest:/m);
    expect(makefile).toMatch(/^test-e2e-functional-local-gakuchika:/m);
    expect(makefile).toMatch(/^test-e2e-functional-local-motivation:/m);
    expect(makefile).toMatch(/^test-e2e-functional-local-interview:/m);
    expect(makefile).toMatch(/^test-e2e-functional-local-es:/m);
    expect(makefile).toMatch(/^test-e2e-functional-es:/m);
    expect(makefile).toMatch(/^test-e2e-functional-gakuchika:/m);
    expect(makefile).toMatch(/^test-e2e-functional-motivation:/m);
    expect(makefile).toMatch(/^test-e2e-functional-interview:/m);
    expect(makefile).toMatch(/^test-e2e-functional-company-info-search:/m);
    expect(makefile).toMatch(/^test-e2e-functional-rag-ingest:/m);
    expect(makefile).toMatch(/^test-e2e-functional-selection-schedule:/m);
  });

  it("exposes first-class quality, static, and security test categories", () => {
    const pkg = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    const makefile = read("Makefile");

    expect(pkg.scripts["test:quality:all"]).toContain("AI_LIVE_TEST_CATEGORY=quality");
    expect(pkg.scripts["test:static"]).toContain("npx tsc --noEmit");
    expect(pkg.scripts["test:security:light"]).toContain("run-lightweight-scan.sh");
    expect(makefile).toMatch(/^test-quality-all:/m);
    expect(makefile).toMatch(/^test-static:/m);
    expect(makefile).toMatch(/^security-scan:/m);
  });
});
