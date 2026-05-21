import { z } from "zod";

/**
 * 職種候補（role options）の Single Source of Truth。
 *
 * `/api/companies/[id]/es-role-options` は ES添削・志望動機・面接の 3 機能で共有される。
 * 以前は同型 (`RoleOption(Item)` / `RoleGroup` / `RoleOptionSource` / `RoleOptionsResponse`)
 * が catalog・interview/ui・motivation/ui の 3 ファイルで重複定義されていたため、
 * ここに集約し各所から re-export する。ランタイム検証は Zod で行う。
 */

/** 職種候補の出所。UI ではバッジ表示や source 追跡に使う。 */
export const ROLE_OPTION_SOURCES = [
  "industry_default",
  "company_override",
  "application_job_type",
  "document_job_type",
] as const;

export const roleOptionSourceSchema = z.enum(ROLE_OPTION_SOURCES);
export type RoleOptionSource = z.infer<typeof roleOptionSourceSchema>;

/**
 * UI 上の選択 source。候補 source に加えて、ユーザーが手入力した場合の `"custom"` を含む。
 * 注意: 志望動機の永続層 (`MotivationConversationContext["selectedRoleSource"]`) は
 * `profile` / `company_doc` / `user_free_text` を含む別セマンティクスで、この型とは無関係。
 */
export const roleSelectionSourceSchema = z.enum([
  "industry_default",
  "company_override",
  "application_job_type",
  "document_job_type",
  "custom",
]);
export type RoleSelectionSource = z.infer<typeof roleSelectionSourceSchema>;

// roleSelectionSource は RoleOptionSource | "custom" と一致していなければならない（追加漏れ検知）。
type AssertSelectionSourceShape =
  RoleSelectionSource extends RoleOptionSource | "custom"
    ? RoleOptionSource | "custom" extends RoleSelectionSource
      ? true
      : never
    : never;
const _assertSelectionSourceShape: AssertSelectionSourceShape = true;
void _assertSelectionSourceShape;

/** 個々の職種候補。 */
export const roleOptionSchema = z
  .object({
    value: z.string(),
    label: z.string(),
    source: roleOptionSourceSchema,
  })
  .strict();
export type RoleOption = z.infer<typeof roleOptionSchema>;

/** 採用コース / 具体業務などのグループ単位。 */
export const roleGroupSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    options: z.array(roleOptionSchema),
  })
  .strict();
export type RoleGroup = z.infer<typeof roleGroupSchema>;

/**
 * 職種候補が業界別セットで構築できず、汎用セットに退避した理由。
 * 退避が発生していない通常時は `null`。
 */
export const ROLE_OPTIONS_FALLBACK_REASONS = ["industry_unresolved"] as const;

export const roleOptionsFallbackReasonSchema = z.enum(ROLE_OPTIONS_FALLBACK_REASONS);
export type RoleOptionsFallbackReason = z.infer<typeof roleOptionsFallbackReasonSchema>;

/**
 * `/api/companies/[id]/es-role-options` のレスポンス契約。
 *
 * `isFallback` / `fallbackReason` は後方互換のため optional。
 * 既存の消費者（志望動機・ES添削）は未指定でも従来どおり動作する。
 */
export const roleOptionsResponseSchema = z
  .object({
    companyId: z.string(),
    companyName: z.string(),
    industry: z.string().nullable(),
    requiresIndustrySelection: z.boolean(),
    industryOptions: z.array(z.string()),
    roleGroups: z.array(roleGroupSchema),
    isFallback: z.boolean().optional(),
    fallbackReason: roleOptionsFallbackReasonSchema.nullable().optional(),
  })
  .strict();
export type RoleOptionsResponse = z.infer<typeof roleOptionsResponseSchema>;
