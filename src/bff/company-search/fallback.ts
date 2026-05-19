import { serverEnv } from "@/env/server";

export function isCompanySearchMockFallbackAllowed(): boolean {
  if (serverEnv.ALLOW_COMPANY_SEARCH_MOCK_FALLBACK === "1") {
    return true;
  }
  return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
}
