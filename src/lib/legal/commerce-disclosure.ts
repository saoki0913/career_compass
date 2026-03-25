const DEFAULT_SALES_URL = "https://www.shupass.jp";
const DEFAULT_SUPPORT_EMAIL = "support@shupass.jp";
const DEFAULT_DISCLOSURE_NOTICE =
  "販売事業者、運営責任者、所在地、電話番号は、請求があった場合に遅滞なく開示いたします。開示をご希望の方は下記メールアドレスまでご連絡ください。";

function env(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

export function getLegalSalesUrl(): string {
  return env("LEGAL_SALES_URL") ?? DEFAULT_SALES_URL;
}

export function getLegalSupportEmail(): string {
  return env("LEGAL_SUPPORT_EMAIL") ?? DEFAULT_SUPPORT_EMAIL;
}

export function getLegalDisclosureRequestEmail(): string {
  return env("LEGAL_DISCLOSURE_REQUEST_EMAIL") ?? getLegalSupportEmail();
}

export function getLegalDisclosureNotice(): string {
  return env("LEGAL_DISCLOSURE_REQUEST_NOTICE") ?? DEFAULT_DISCLOSURE_NOTICE;
}
