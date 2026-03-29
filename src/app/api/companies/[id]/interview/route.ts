import { NextRequest, NextResponse } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { DEFAULT_INTERVIEW_SESSION_CREDIT_COST } from "@/lib/credits";
import { getInterviewStageStatus } from "@/lib/interview/session";

import { buildInterviewContext } from "./shared";

export async function GET(
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

  return NextResponse.json({
    company: {
      id: context.company.id,
      name: context.company.name,
      industry: context.company.industry,
    },
    model: "GPT-5.4 mini",
    creditCost: DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
    materials: context.materials,
    stageStatus: getInterviewStageStatus(1, false),
  });
}
