/**
 * Shared Zod schemas and validation helpers for API routes.
 *
 * Usage in a route handler:
 *   import { parseBody, companyCreateSchema } from "@/lib/validation";
 *   const parsed = await parseBody(request, companyCreateSchema);
 *   if (parsed.error) return parsed.error;
 *   const { name, industry } = parsed.data;
 */

import { z } from "zod";
import { NextResponse, type NextRequest } from "next/server";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

export const companyCreateSchema = z.object({
  name: z.string().trim().min(1, "企業名は必須です").max(200, "企業名が長すぎます"),
  industry: z.string().trim().max(100).optional().nullable(),
  recruitmentUrl: z.string().url().max(2048).optional().nullable(),
  corporateUrl: z.string().url().max(2048).optional().nullable(),
  mypageUrl: z.string().url().max(2048).optional().nullable(),
  mypageLoginId: z.string().max(200).optional().nullable(),
  mypagePassword: z.string().max(200).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  status: z.string().max(50).optional().nullable(),
});

export const companyUpdateSchema = companyCreateSchema.partial();

export const contactSchema = z.object({
  email: z.string().email("正しいメールアドレスを入力してください").max(254),
  subject: z.string().trim().max(200, "件名が長すぎます（最大200文字）").optional().nullable(),
  message: z.string().trim().min(10, "お問い合わせ内容は10文字以上で入力してください").max(5000, "お問い合わせ内容が長すぎます（最大5000文字）"),
});

export const documentCreateSchema = z.object({
  companyId: z.string().min(1).optional().nullable(),
  applicationId: z.string().min(1).optional().nullable(),
  jobTypeId: z.string().min(1).optional().nullable(),
  type: z.enum(["es", "tips", "company_analysis"]),
  title: z.string().trim().min(1, "タイトルは必須です").max(200),
  content: z.string().max(50000).optional().nullable(),
});

export const taskCreateSchema = z.object({
  companyId: z.string().min(1).optional().nullable(),
  applicationId: z.string().min(1).optional().nullable(),
  deadlineId: z.string().min(1).optional().nullable(),
  title: z.string().trim().min(1, "タスク名は必須です").max(200),
  description: z.string().max(5000).optional().nullable(),
  type: z.enum(["es", "web_test", "self_analysis", "gakuchika", "video", "other"]),
  dueDate: z.string().datetime().optional().nullable(),
});

export const submissionItemTypeSchema = z.enum([
  "resume",
  "es",
  "photo",
  "transcript",
  "certificate",
  "portfolio",
  "other",
]);

export const submissionItemStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "completed",
]);

function optionalTrimmedString(maxLength: number, emptyMessage?: string) {
  const base = z.string().trim();
  const withMin = emptyMessage ? base.min(1, emptyMessage) : base;
  return withMin.max(maxLength).optional().nullable();
}

const optionalHttpUrlSchema = z
  .string()
  .trim()
  .max(2048, "URLが長すぎます")
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, "URLは http または https で指定してください")
  .optional()
  .nullable();

export const submissionCreateSchema = z.object({
  type: submissionItemTypeSchema,
  name: z.string().trim().min(1, "種類と名前は必須です").max(200, "名前が長すぎます"),
  isRequired: z.boolean().optional(),
  notes: optionalTrimmedString(5000),
});

export const submissionUpdateSchema = z.object({
  type: submissionItemTypeSchema.optional(),
  name: z.string().trim().min(1, "名前を入力してください").max(200, "名前が長すぎます").optional(),
  isRequired: z.boolean().optional(),
  status: submissionItemStatusSchema.optional(),
  notes: optionalTrimmedString(5000),
  fileUrl: z.union([optionalHttpUrlSchema, z.literal("")]).optional(),
});

// ---------------------------------------------------------------------------
// Body parser helper
// ---------------------------------------------------------------------------

interface ParseSuccess<T> {
  data: T;
  error: null;
}

interface ParseFailure {
  data: null;
  error: NextResponse;
}

type ParseResult<T> = ParseSuccess<T> | ParseFailure;

type ParseBodyOptions = {
  request?: NextRequest;
  code?: string;
  action?: string;
  logContext?: string;
};

export async function parseBody<T>(
  request: Request,
  schema: z.ZodSchema<T>,
  options?: ParseBodyOptions
): Promise<ParseResult<T>> {
  try {
    const raw = await request.json();
    const result = schema.safeParse(raw);
    if (!result.success) {
      const firstError = result.error.issues[0];
      return {
        data: null,
        error: createApiErrorResponse(options?.request, {
          status: 400,
          code: options?.code ?? "INVALID_REQUEST_BODY",
          userMessage: firstError?.message || "入力内容を確認してください。",
          action: options?.action ?? "入力内容を見直して、もう一度お試しください。",
          developerMessage: firstError?.message || "Invalid input",
          logContext: options?.logContext,
        }),
      };
    }
    return { data: result.data, error: null };
  } catch {
    return {
      data: null,
      error: createApiErrorResponse(options?.request, {
        status: 400,
        code: options?.code ?? "INVALID_JSON_BODY",
        userMessage: "リクエスト形式が正しくありません。",
        action: options?.action ?? "ページを更新して、もう一度お試しください。",
        developerMessage: "Invalid JSON body",
        logContext: options?.logContext,
      }),
    };
  }
}
