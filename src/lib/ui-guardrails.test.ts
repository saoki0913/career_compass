import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectUiGuardrailFindings } from "./ui-guardrails.mjs";

describe("collectUiGuardrailFindings", () => {
  it("allows compliant marketing UI and skeleton loading states", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ui-guardrails-ok-"));
    try {
      fs.mkdirSync(path.join(cwd, "src/components/landing"), { recursive: true });
      fs.mkdirSync(path.join(cwd, "src/app/(marketing)/pricing"), { recursive: true });

      fs.writeFileSync(
        path.join(cwd, "src/components/landing/HeroSection.tsx"),
        `export function HeroSection() {
  return <div className="text-slate-900 bg-white border-slate-200">ok</div>;
}`
      );
      fs.writeFileSync(
        path.join(cwd, "src/app/(marketing)/pricing/loading.tsx"),
        `import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <Skeleton className="h-8 w-full" />;
}`
      );

      const findings = collectUiGuardrailFindings({
        files: [
          "src/components/landing/HeroSection.tsx",
          "src/app/(marketing)/pricing/loading.tsx",
        ],
        cwd,
      });

      expect(findings).toEqual([]);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("flags marketing accent utilities and spinner-only loading states", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ui-guardrails-bad-"));
    try {
      fs.mkdirSync(path.join(cwd, "src/components/landing"), { recursive: true });
      fs.mkdirSync(path.join(cwd, "src/app/(marketing)/pricing"), { recursive: true });

      fs.writeFileSync(
        path.join(cwd, "src/components/landing/HeroSection.tsx"),
        `export function HeroSection() {
  return <div className="text-sky-700 bg-emerald-50">bad</div>;
}`
      );
      fs.writeFileSync(
        path.join(cwd, "src/app/(marketing)/pricing/loading.tsx"),
        `export default function Loading() {
  return <div className="flex items-center gap-2"><span className="animate-spin" /> 読み込み中...</div>;
}`
      );

      const findings = collectUiGuardrailFindings({
        files: [
          "src/components/landing/HeroSection.tsx",
          "src/app/(marketing)/pricing/loading.tsx",
        ],
        cwd,
      });

      expect(findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            file: "src/components/landing/HeroSection.tsx",
            rule: "marketing-accent-utility",
          }),
          expect.objectContaining({
            file: "src/app/(marketing)/pricing/loading.tsx",
            rule: "loading-skeleton-required",
          }),
        ])
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
