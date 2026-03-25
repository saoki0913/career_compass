import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getGuestUser } from "@/lib/auth/guest";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { filterAllowedPublicSourceUrls } from "@/lib/company-info/source-compliance";
import { COMPANY_COMPLIANCE_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";

async function resolveCompany(
  request: NextRequest,
  companyId: string,
): Promise<typeof companies.$inferSelect | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user?.id) {
    return (
      (await db
        .select()
        .from(companies)
        .where(and(eq(companies.id, companyId), eq(companies.userId, session.user.id)))
        .limit(1))[0] ?? null
    );
  }

  const deviceToken = request.headers.get("x-device-token");
  if (!deviceToken) {
    return null;
  }
  const guest = await getGuestUser(deviceToken);
  if (!guest) {
    return null;
  }
  return (
    (await db
      .select()
      .from(companies)
      .where(and(eq(companies.id, companyId), eq(companies.guestId, guest.id)))
      .limit(1))[0] ?? null
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: companyId } = await params;
    const company = await resolveCompany(request, companyId);
    if (!company) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "COMPANY_NOT_FOUND",
        userMessage: "企業が見つかりません。",
        action: "ページを再読み込みして、もう一度お試しください。",
      });
    }

    const session = await auth.api.getSession({ headers: await headers() });
    const rateLimited = await enforceRateLimitLayers(
      request,
      [...COMPANY_COMPLIANCE_RATE_LAYERS],
      session?.user?.id ?? null,
      session?.user?.id ? null : request.headers.get("x-device-token"),
      "companies_source_compliance_check"
    );
    if (rateLimited) {
      return rateLimited;
    }

    const body = await request.json().catch(() => ({}));
    const urls = Array.isArray(body.urls)
      ? body.urls.map((url: unknown) => String(url).trim()).filter(Boolean)
      : [];
    if (urls.length === 0) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "SOURCE_URL_REQUIRED",
        userMessage: "確認するURLを指定してください。",
        action: "公開ページURLを入力してください。",
      });
    }
    if (urls.length > 10) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "SOURCE_URL_BATCH_TOO_LARGE",
        userMessage: "一度に確認できるURLは10件までです。",
        action: "URL数を減らして、もう一度お試しください。",
      });
    }

    const compliance = await filterAllowedPublicSourceUrls(urls);
    return NextResponse.json(compliance);
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "SOURCE_COMPLIANCE_CHECK_FAILED",
      userMessage: "公開ページ判定に失敗しました。",
      action: "しばらく待ってから、もう一度お試しください。",
      error,
    });
  }
}
