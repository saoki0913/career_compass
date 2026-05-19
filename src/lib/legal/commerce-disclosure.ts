import { serverEnv } from "@/env/server";

const DEFAULT_SALES_URL = "https://www.shupass.jp";
const DEFAULT_SUPPORT_EMAIL = "support@shupass.jp";
const DEFAULT_SUPPORT_URL = "/contact";
const DEFAULT_REFUND_POLICY_URL = "/terms#billing";
const DEFAULT_BUSINESS_NAME = "青木 駿介";
const DEFAULT_REPRESENTATIVE_NAME = "青木 駿介";
const DEFAULT_DISCLOSURE_NOTICE =
  "請求があった場合、購入申込み前に遅滞なく電子メールにて開示いたします。開示をご希望の方は下記メールアドレスまでご連絡ください。";

function clean(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

export function getLegalSalesUrl(): string {
  return clean(serverEnv.LEGAL_SALES_URL) ?? DEFAULT_SALES_URL;
}

export function getLegalSupportEmail(): string {
  return clean(serverEnv.LEGAL_SUPPORT_EMAIL) ?? DEFAULT_SUPPORT_EMAIL;
}

export function getLegalSupportUrl(): string {
  return clean(serverEnv.LEGAL_SUPPORT_URL) ?? DEFAULT_SUPPORT_URL;
}

export function getLegalRefundPolicyUrl(): string {
  return clean(serverEnv.LEGAL_REFUND_POLICY_URL) ?? DEFAULT_REFUND_POLICY_URL;
}

export function getLegalDisclosureRequestEmail(): string {
  return clean(serverEnv.LEGAL_DISCLOSURE_REQUEST_EMAIL) ?? getLegalSupportEmail();
}

export function getLegalDisclosureNotice(): string {
  return clean(serverEnv.LEGAL_DISCLOSURE_REQUEST_NOTICE) ?? DEFAULT_DISCLOSURE_NOTICE;
}

export function getLegalHeadOfOperations(): string {
  return clean(serverEnv.LEGAL_HEAD_OF_OPERATIONS) ?? getLegalRepresentativeName();
}

export function getLegalBusinessName(): string {
  return clean(serverEnv.LEGAL_BUSINESS_NAME) ?? DEFAULT_BUSINESS_NAME;
}

export function getLegalRepresentativeName(): string {
  return clean(serverEnv.LEGAL_REPRESENTATIVE_NAME) ?? DEFAULT_REPRESENTATIVE_NAME;
}

export function getLegalBusinessAddress(): string {
  return clean(serverEnv.LEGAL_BUSINESS_ADDRESS) ?? getLegalDisclosureNotice();
}

export function getLegalPhoneNumber(): string {
  return clean(serverEnv.LEGAL_PHONE_NUMBER) ?? getLegalDisclosureNotice();
}
