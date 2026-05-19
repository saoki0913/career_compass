import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const componentPath = path.resolve(__dirname, "BillingSection.tsx");
const source = fs.readFileSync(componentPath, "utf-8");

describe("BillingSection", () => {
  it("exports a named BillingSection component", () => {
    expect(source).toMatch(/export\s+function\s+BillingSection/);
  });

  it("has 'use client' directive", () => {
    expect(source.trimStart().startsWith('"use client"')).toBe(true);
  });

  it("declares BillingSectionProps type", () => {
    expect(source).toContain("BillingSectionProps");
  });

  it("uses Card from shadcn/ui", () => {
    expect(source).toMatch(/@\/components\/ui\/card/);
    expect(source).toContain("<Card");
  });

  it("uses SubscriptionStatusBadge", () => {
    expect(source).toContain("SubscriptionStatusBadge");
  });

  it("uses getSubscriptionStatusMessage for status messages", () => {
    expect(source).toContain("getSubscriptionStatusMessage");
  });

  it("uses portal eligibility for portal button visibility", () => {
    expect(source).toContain("canManageSubscriptionInPortal");
  });

  it("renders upgrade link for free users pointing to /pricing?source=settings", () => {
    expect(source).toContain("/pricing?source=settings");
  });

  it("does not send free-profile payment recovery users away from portal", () => {
    expect(source).toContain("{isFreeUser && !canOpenPortal &&");
  });

  it("renders portal button for paid users with active subscription", () => {
    expect(source).toContain("onOpenBillingPortal");
    expect(source).toMatch(/請求管理/);
  });

  it("shows credit balance", () => {
    expect(source).toContain("creditsBalance");
    expect(source).toMatch(/クレジット残高/);
  });

  it("shows cancel-at-period-end info message", () => {
    expect(source).toContain("cancelAtPeriodEnd");
  });

  it("shows past_due warning message", () => {
    expect(source).toContain("past_due");
  });

  it("does not contain data fetching logic", () => {
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("useEffect");
    expect(source).not.toContain("useState");
  });

  it("uses Loader2 from lucide-react for loading state", () => {
    expect(source).toContain("Loader2");
  });

  it("uses Link from next/link for upgrade navigation", () => {
    expect(source).toMatch(/from\s+["']next\/link["']/);
  });
});
