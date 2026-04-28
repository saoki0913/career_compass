import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { fetchFastApiWithPrincipal } from "@/lib/fastapi/client";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

function isLocalOnlyRequest(request: NextRequest) {
  return LOCAL_HOSTS.has(request.nextUrl.hostname);
}

async function parseUpstreamResponse(response: Response) {
  const rawText = await response.text();
  if (!rawText) {
    return { body: null, rawText: "" };
  }

  try {
    return {
      body: JSON.parse(rawText) as Record<string, unknown>,
      rawText,
    };
  } catch {
    return {
      body: null,
      rawText,
    };
  }
}

async function runPrincipalProbe(scope: "ai-stream" | "company") {
  const response = await fetchFastApiWithPrincipal(`/internal/local-ai-live/principal-preflight/${scope}`, {
    method: "GET",
    cache: "no-store",
    principal: {
      scope,
      actor: { kind: "guest", id: "local-ai-live-preflight" },
      plan: "guest",
      ...(scope === "company" ? { companyId: "local-ai-live-company" } : {}),
    },
  });

  const parsed = await parseUpstreamResponse(response);
  return {
    status: response.status,
    ok: response.ok,
    body: parsed.body,
    rawText: parsed.rawText,
  };
}

export async function GET(request: NextRequest) {
  if (!isLocalOnlyRequest(request)) {
    return createApiErrorResponse(request, {
      status: 404,
      code: "LOCAL_AI_LIVE_ONLY",
      userMessage: "このエンドポイントは localhost 開発環境専用です。",
      action: "localhost から実行してください。",
    });
  }

  try {
    const aiStream = await runPrincipalProbe("ai-stream");
    if (!aiStream.ok) {
      return createApiErrorResponse(request, {
        status: aiStream.status >= 500 ? 503 : aiStream.status,
        code: "LOCAL_AI_LIVE_PRINCIPAL_PREFLIGHT_FAILED",
        userMessage: "local principal preflight に失敗しました。",
        action: "CAREER_PRINCIPAL_HMAC_SECRET を Next/FastAPI で揃えて再起動してください。",
        developerMessage: "ai-stream principal probe failed",
        details: aiStream.rawText,
        extra: {
          scope: "ai-stream",
          upstreamStatus: aiStream.status,
        },
      });
    }

    const company = await runPrincipalProbe("company");
    if (!company.ok) {
      return createApiErrorResponse(request, {
        status: company.status >= 500 ? 503 : company.status,
        code: "LOCAL_AI_LIVE_PRINCIPAL_PREFLIGHT_FAILED",
        userMessage: "local principal preflight に失敗しました。",
        action: "CAREER_PRINCIPAL_HMAC_SECRET と TENANT_KEY_SECRET を Next/FastAPI で揃えて再起動してください。",
        developerMessage: "company principal probe failed",
        details: company.rawText,
        extra: {
          scope: "company",
          upstreamStatus: company.status,
        },
      });
    }

    return NextResponse.json({
      success: true,
      aiStream: aiStream.body,
      company: company.body,
    });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 503,
      code: "LOCAL_AI_LIVE_PRINCIPAL_PREFLIGHT_FAILED",
      userMessage: "local principal preflight に失敗しました。",
      action: "CAREER_PRINCIPAL_HMAC_SECRET、TENANT_KEY_SECRET、FastAPI 接続を確認して再起動してください。",
      error,
      logContext: "local-ai-live-principal-preflight",
    });
  }
}
