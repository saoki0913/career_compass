const DEFAULT_SALES_URL = "https://www.shupass.jp";
const DEFAULT_SUPPORT_EMAIL = "support@shupass.jp";
const DEFAULT_SUPPORT_URL = "/contact";
const DEFAULT_REFUND_POLICY_URL = "/terms#billing";
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

export function getLegalSupportUrl(): string {
  return env("LEGAL_SUPPORT_URL") ?? DEFAULT_SUPPORT_URL;
}

export function getLegalRefundPolicyUrl(): string {
  return env("LEGAL_REFUND_POLICY_URL") ?? DEFAULT_REFUND_POLICY_URL;
}

export function getLegalDisclosureRequestEmail(): string {
  return env("LEGAL_DISCLOSURE_REQUEST_EMAIL") ?? getLegalSupportEmail();
}

export function getLegalDisclosureNotice(): string {
  return env("LEGAL_DISCLOSURE_REQUEST_NOTICE") ?? DEFAULT_DISCLOSURE_NOTICE;
}

export function getLegalHeadOfOperations(): string {
  return env("LEGAL_HEAD_OF_OPERATIONS") ?? getLegalDisclosureNotice();
}

export function getLegalBusinessName(): string {
  return env("LEGAL_BUSINESS_NAME")
    || "未設定（※Stripe審査のためには環境変数 LEGAL_BUSINESS_NAME の設定が必要です）";
}

export function getLegalRepresentativeName(): string {
  return env("LEGAL_REPRESENTATIVE_NAME")
    || "未設定（※環境変数 LEGAL_REPRESENTATIVE_NAME の設定が必要です）";
}

export function getLegalBusinessAddress(): string {
  return env("LEGAL_BUSINESS_ADDRESS")
    || "未設定（※環境変数 LEGAL_BUSINESS_ADDRESS の設定が必要です）";
}

export function getLegalPhoneNumber(): string {
  return env("LEGAL_PHONE_NUMBER")
    || "未設定（※環境変数 LEGAL_PHONE_NUMBER の設定が必要です）";
}
