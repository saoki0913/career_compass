import { NextRequest } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";

import { buildInterviewContext, validateInterviewMessages } from "../shared";
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

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 400,
      code: "INTERVIEW_INVALID_JSON",
      userMessage: "送信内容を読み取れませんでした。",
      action: "画面を更新してから、もう一度お試しください。",
      error,
    });
  }

  const messages = validateInterviewMessages((body as { messages?: unknown }).messages ?? []);
  if (!messages || messages.filter((message) => message.role === "user").length === 0) {
    return createApiErrorResponse(request, {
      status: 400,
      code: "INTERVIEW_INVALID_MESSAGES",
      userMessage: "会話履歴の形式が正しくありません。",
      action: "画面を更新してから、もう一度お試しください。",
    });
  }

  return createInterviewProxyStream({
    request,
    context,
    initialMessages: messages,
    upstreamPath: "/api/interview/feedback",
    upstreamPayload: {
      company_name: context.company.name,
      company_summary: context.companySummary,
      motivation_summary: context.motivationSummary,
      gakuchika_summary: context.gakuchikaSummary,
      es_summary: context.esSummary,
      conversation_history: messages,
    },
    userId: identity.userId,
    companyId,
    isCompleted: true,
  });
}
