import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const componentPath = path.resolve(__dirname, "CreditWarningBanner.tsx");
const source = fs.readFileSync(componentPath, "utf-8");

describe("CreditWarningBanner", () => {
  it("exports a named CreditWarningBanner component", () => {
    expect(source).toMatch(/export\s+function\s+CreditWarningBanner/);
  });

  it("has 'use client' directive", () => {
    expect(source.trimStart().startsWith('"use client"')).toBe(true);
  });

  it("has balance and requiredCredits props", () => {
    expect(source).toContain("balance");
    expect(source).toContain("requiredCredits");
  });

  it("has optional featureLabel prop", () => {
    expect(source).toMatch(/featureLabel\s*\?\s*:\s*string/);
  });

  it("returns null when balance is sufficient", () => {
    expect(source).toMatch(
      /if\s*\(\s*balance\s*>=\s*requiredCredits\s*\)\s*return\s+null/,
    );
  });

  it("shows upgrade link to /pricing?source=credit-warning", () => {
    expect(source).toContain("/pricing?source=credit-warning");
  });

  it("uses AlertTriangle icon from lucide-react", () => {
    expect(source).toContain("AlertTriangle");
    expect(source).toMatch(/from\s+["']lucide-react["']/);
  });

  it("uses Link from next/link for upgrade navigation", () => {
    expect(source).toMatch(/from\s+["']next\/link["']/);
  });

  it("uses warning design tokens for border and background", () => {
    expect(source).toContain("border-warning");
    expect(source).toContain("bg-warning");
  });

  it("displays credit balance information", () => {
    expect(source).toMatch(/残高/);
    expect(source).toMatch(/クレジット/);
  });

  it("displays insufficient credit message", () => {
    expect(source).toMatch(/クレジットが不足しています/);
  });

  it("shows upgrade call-to-action text", () => {
    expect(source).toMatch(/プランをアップグレード/);
  });

  it("does not contain data fetching logic", () => {
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("useSWR");
    expect(source).not.toContain("useEffect");
  });
});
