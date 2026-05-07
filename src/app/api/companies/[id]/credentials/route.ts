/**
 * Company Credentials API
 *
 * GET: Retrieve decrypted mypage credentials for a company
 *
 * This endpoint exists to serve credentials on-demand,
 * preventing them from being exposed in general company list/detail responses.
 */

import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/crypto";
import { logError } from "@/lib/logger";
import { getRequestIdentity } from "@/bff/identity/request-identity";
import { getOwnedCompanyRecord } from "@/bff/identity/owner-access";
import { createApiErrorResponse } from "@/bff/api/error-response";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    // Authenticate
    const identity = await getRequestIdentity(request);
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "COMPANY_CREDENTIALS_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "company-credentials-auth",
      });
    }

    const company = await getOwnedCompanyRecord(id, identity);
    if (!company) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "COMPANY_CREDENTIALS_NOT_FOUND",
        userMessage: "企業が見つかりませんでした。",
        action: "一覧に戻って、対象の企業を選び直してください。",
        developerMessage: "Company not found",
        logContext: "company-credentials-not-found",
      });
    }

    // Decrypt password and return credentials
    let decryptedPassword: string | null = null;
    if (company.mypagePassword) {
      try {
        decryptedPassword = decrypt(company.mypagePassword);
      } catch {
        logError("decrypt-credential", new Error("Failed to decrypt password, possibly stored as plaintext"));
        decryptedPassword = null;
      }
    }

    return NextResponse.json({
      mypageLoginId: company.mypageLoginId || null,
      mypagePassword: decryptedPassword,
    });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "COMPANY_CREDENTIALS_FETCH_FAILED",
      userMessage: "認証情報を取得できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Failed to fetch company credentials",
      logContext: "fetch-credentials",
    });
  }
}
