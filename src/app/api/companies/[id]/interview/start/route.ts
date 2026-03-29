import { NextRequest } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";

import { buildInterviewContext } from "../shared";
import { createInterviewProxyStream } from "../stream-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const identity = await getRequestIdentity(request);
  if (!identity?.userId) {
    return createApiErrorResponse(request, {
      status: 401,
      code: "INTERVIEW_AUTH_REQUIRED",
      userMessage: "面接対策はログイン後に利用できます。",
      action: "ログイン後に、もう一度お試しください。",
    });
  }

  const { id: companyId } = await params;
  const context = await buildInterviewContext(companyId, identity.userId);
  if (!context) {
    return createApiErrorResponse(request, {
      status: 404,
      code: "INTERVIEW_COMPANY_NOT_FOUND",
      userMessage: "企業が見つかりません。",
      action: "企業一覧から対象の企業を開き直してください。",
    });
  }

  return createInterviewProxyStream({
    request,
    context,
    initialMessages: [],
    upstreamPath: "/api/interview/start",
    upstreamPayload: {
      company_name: context.company.name,
      company_summary: context.companySummary,
      motivation_summary: context.motivationSummary,
      gakuchika_summary: context.gakuchikaSummary,
      es_summary: context.esSummary,
    },
    userId: identity.userId,
    companyId,
    isCompleted: false,
  });
}
