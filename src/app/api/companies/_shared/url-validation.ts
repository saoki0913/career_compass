import { NextRequest, NextResponse } from "next/server";

import { createApiErrorResponse } from "@/bff/api/error-response";
import { normalizePublicHttpsUrl } from "@/lib/security/public-url";

export type CompanyUrlField = "recruitmentUrl" | "corporateUrl" | "mypageUrl";

const COMPANY_URL_FIELD_LABELS: Record<CompanyUrlField, string> = {
  recruitmentUrl: "採用ページURL",
  corporateUrl: "企業サイトURL",
  mypageUrl: "マイページURL",
};

function codeForCompanyUrlField(field: CompanyUrlField): string {
  return `COMPANY_${field.replace(/([A-Z])/g, "_$1").toUpperCase()}_INVALID`;
}

export async function normalizeCompanyUrlField(
  request: NextRequest,
  field: CompanyUrlField,
  value: unknown,
): Promise<
  | { value: string | null; response?: undefined }
  | { value?: undefined; response: NextResponse }
> {
  const result = await normalizePublicHttpsUrl(value);
  if (result.ok) {
    return { value: result.value };
  }

  return {
    response: createApiErrorResponse(request, {
      status: 400,
      code: codeForCompanyUrlField(field),
      userMessage: `${COMPANY_URL_FIELD_LABELS[field]}は公開された HTTPS のURLを指定してください。`,
      action: "URLを確認して、もう一度お試しください。",
      developerMessage: result.code
        ? `${field} failed public URL validation: ${result.code}`
        : `${field} failed public URL validation`,
      logContext: "company-url-validation",
    }),
  };
}
