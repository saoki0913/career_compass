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
import { NextResponse } from "next/server";

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

export async function parseBody<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<ParseResult<T>> {
  try {
    const raw = await request.json();
    const result = schema.safeParse(raw);
    if (!result.success) {
      const firstError = result.error.issues[0];
      return {
        data: null,
        error: NextResponse.json(
          { error: firstError?.message || "Invalid input" },
          { status: 400 }
        ),
      };
    }
    return { data: result.data, error: null };
  } catch {
    return {
      data: null,
      error: NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      ),
    };
  }
}
