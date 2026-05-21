import { describe, expect, it } from "vitest";

import { roleGroupSchema } from "@/shared/contracts/interview/role-options";

import {
  buildRoleGroups,
  flattenRoleCandidates,
  resolveMotivationRoleContext,
} from "./es-review-role-catalog";

describe("buildRoleGroups", () => {
  it("(1) returns industry-specific groups with isFallback=false and fallbackReason=null for a known industry", () => {
    const { groups, isFallback, fallbackReason } = buildRoleGroups({ industry: "銀行" });

    expect(isFallback).toBe(false);
    expect(fallbackReason).toBeNull();
    expect(groups.length).toBeGreaterThan(0);

    const courseGroup = groups.find((group) => group.id === "course");
    expect(courseGroup).toBeDefined();
    expect(courseGroup?.options.some((option) => option.value === "総合職")).toBe(true);
    expect(
      courseGroup?.options.every((option) => option.source === "industry_default"),
    ).toBe(true);
  });

  it("(2) falls back to INDUSTRY_ROLE_SEEDS[\"その他\"] generic groups when industry is null", () => {
    const { groups, isFallback, fallbackReason } = buildRoleGroups({ industry: null });

    expect(isFallback).toBe(true);
    expect(fallbackReason).toBe("industry_unresolved");
    expect(groups.length).toBeGreaterThan(0);

    const candidates = flattenRoleCandidates(groups);
    // "その他" seed options should be present in the generic fallback.
    expect(candidates).toContain("総合職");
    expect(candidates).toContain("エンジニア");
    expect(candidates).toContain("データ / AI");
  });

  it("(3) merges company override options for a known major company name", () => {
    const { groups } = buildRoleGroups({ industry: "銀行", companyName: "三菱UFJ銀行" });
    const candidates = flattenRoleCandidates(groups);

    // company_override seed for 三菱UFJ銀行.
    expect(candidates).toContain("グローバル");
    expect(candidates).toContain("ウェルスマネジメント");

    const roleGroup = groups.find((group) => group.id === "role");
    expect(
      roleGroup?.options.some(
        (option) => option.value === "グローバル" && option.source === "company_override",
      ),
    ).toBe(true);
  });

  it("(4) merges applicationRoles into the \"応募中の職種\" group", () => {
    const { groups } = buildRoleGroups({
      industry: "銀行",
      applicationRoles: ["カスタム職種A", "カスタム職種B"],
    });

    const applicationGroup = groups.find((group) => group.id === "application");
    expect(applicationGroup).toBeDefined();
    expect(applicationGroup?.label).toBe("応募中の職種");
    expect(applicationGroup?.options.map((option) => option.value)).toEqual([
      "カスタム職種A",
      "カスタム職種B",
    ]);
    expect(
      applicationGroup?.options.every((option) => option.source === "application_job_type"),
    ).toBe(true);
  });

  it("(5) merges documentRole into the \"このESに紐づく職種\" group", () => {
    const { groups } = buildRoleGroups({
      industry: "銀行",
      documentRole: "ESに紐づく職種X",
    });

    const documentGroup = groups.find((group) => group.id === "document");
    expect(documentGroup).toBeDefined();
    expect(documentGroup?.label).toBe("このESに紐づく職種");
    expect(documentGroup?.options).toHaveLength(1);
    expect(documentGroup?.options[0]).toMatchObject({
      value: "ESに紐づく職種X",
      source: "document_job_type",
    });
  });

  it("(6) trims surrounding whitespace, collapses internal whitespace runs, and dedupes equal labels", () => {
    const { groups } = buildRoleGroups({
      industry: "銀行",
      applicationRoles: ["  重複職種  ", "重複職種", "応募 職種", "応募   職種"],
    });

    const applicationGroup = groups.find((group) => group.id === "application");
    // Surrounding whitespace is trimmed so "  重複職種  " collapses onto "重複職種".
    // Internal whitespace runs collapse to a single space so "応募   職種" === "応募 職種".
    expect(applicationGroup?.options.map((option) => option.value)).toEqual([
      "重複職種",
      "応募 職種",
    ]);
  });

  it("(7) merges applicationRoles and documentRole into the generic set when industry is null", () => {
    const { groups, isFallback } = buildRoleGroups({
      industry: null,
      applicationRoles: ["フォールバック応募職種"],
      documentRole: "フォールバックES職種",
    });

    expect(isFallback).toBe(true);

    const applicationGroup = groups.find((group) => group.id === "application");
    const documentGroup = groups.find((group) => group.id === "document");
    expect(applicationGroup?.options.map((option) => option.value)).toContain(
      "フォールバック応募職種",
    );
    expect(documentGroup?.options.map((option) => option.value)).toContain(
      "フォールバックES職種",
    );

    // Generic industry seeds remain present alongside the merged custom roles.
    const candidates = flattenRoleCandidates(groups);
    expect(candidates).toContain("総合職");
  });

  it("(8) returns groups that pass the SSOT roleGroupSchema", () => {
    const { groups } = buildRoleGroups({
      industry: "銀行",
      companyName: "三菱UFJ銀行",
      applicationRoles: ["応募職種"],
      documentRole: "ES職種",
    });

    for (const group of groups) {
      expect(roleGroupSchema.safeParse(group).success).toBe(true);
    }

    const fallback = buildRoleGroups({ industry: null });
    for (const group of fallback.groups) {
      expect(roleGroupSchema.safeParse(group).success).toBe(true);
    }
  });
});

describe("resolveMotivationRoleContext", () => {
  it("returns non-empty roleGroups and roleCandidates even when industry is unresolved", () => {
    const result = resolveMotivationRoleContext({
      companyName: "未知の企業",
      companyIndustry: null,
    });

    expect(result.resolvedIndustry).toBeNull();
    expect(result.requiresIndustrySelection).toBe(true);
    expect(result.roleGroups.length).toBeGreaterThan(0);
    expect(result.roleCandidates.length).toBeGreaterThan(0);
    expect(result.roleCandidates).toContain("総合職");
  });

  it("resolves a known industry and exposes industry-specific candidates", () => {
    const result = resolveMotivationRoleContext({
      companyName: "三菱UFJ銀行",
      companyIndustry: "銀行",
    });

    expect(result.resolvedIndustry).toBe("銀行");
    expect(result.requiresIndustrySelection).toBe(false);
    expect(result.roleCandidates).toContain("法人営業");
  });
});
