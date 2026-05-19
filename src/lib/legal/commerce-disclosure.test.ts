import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

type CommerceDisclosure = typeof import("@/lib/legal/commerce-disclosure");

async function loadCommerceDisclosure(): Promise<CommerceDisclosure> {
  return import("@/lib/legal/commerce-disclosure");
}

describe("commerce disclosure helpers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.LEGAL_SALES_URL;
    delete process.env.LEGAL_SUPPORT_EMAIL;
    delete process.env.LEGAL_SUPPORT_URL;
    delete process.env.LEGAL_REFUND_POLICY_URL;
    delete process.env.LEGAL_DISCLOSURE_REQUEST_EMAIL;
    delete process.env.LEGAL_DISCLOSURE_REQUEST_NOTICE;
    delete process.env.LEGAL_HEAD_OF_OPERATIONS;
    delete process.env.LEGAL_BUSINESS_NAME;
    delete process.env.LEGAL_REPRESENTATIVE_NAME;
    delete process.env.LEGAL_BUSINESS_ADDRESS;
    delete process.env.LEGAL_PHONE_NUMBER;
    vi.resetModules();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("falls back to default public support values", async () => {
    const {
      getLegalBusinessAddress,
      getLegalBusinessName,
      getLegalDisclosureNotice,
      getLegalDisclosureRequestEmail,
      getLegalHeadOfOperations,
      getLegalPhoneNumber,
      getLegalRepresentativeName,
      getLegalRefundPolicyUrl,
      getLegalSalesUrl,
      getLegalSupportEmail,
      getLegalSupportUrl,
    } = await loadCommerceDisclosure();

    expect(getLegalSalesUrl()).toBe("https://www.shupass.jp");
    expect(getLegalSupportEmail()).toBe("support@shupass.jp");
    expect(getLegalSupportUrl()).toBe("/contact");
    expect(getLegalRefundPolicyUrl()).toBe("/terms#billing");
    expect(getLegalDisclosureRequestEmail()).toBe("support@shupass.jp");
    expect(getLegalDisclosureNotice()).toBe(
      "請求があった場合、購入申込み前に遅滞なく電子メールにて開示いたします。開示をご希望の方は下記メールアドレスまでご連絡ください。"
    );
    expect(getLegalHeadOfOperations()).toBe("青木 駿介");
    expect(getLegalBusinessName()).toBe("青木 駿介");
    expect(getLegalRepresentativeName()).toBe("青木 駿介");
    expect(getLegalBusinessAddress()).toBe(
      "請求があった場合、購入申込み前に遅滞なく電子メールにて開示いたします。開示をご希望の方は下記メールアドレスまでご連絡ください。"
    );
    expect(getLegalPhoneNumber()).toBe(
      "請求があった場合、購入申込み前に遅滞なく電子メールにて開示いたします。開示をご希望の方は下記メールアドレスまでご連絡ください。"
    );
  });

  it("prefers explicit env overrides for Stripe-facing disclosure items", async () => {
    process.env.LEGAL_SALES_URL = "https://example.com/sales";
    process.env.LEGAL_SUPPORT_EMAIL = "billing@example.com";
    process.env.LEGAL_SUPPORT_URL = "https://example.com/help";
    process.env.LEGAL_REFUND_POLICY_URL = "https://example.com/refunds";
    process.env.LEGAL_DISCLOSURE_REQUEST_EMAIL = "disclosure@example.com";
    process.env.LEGAL_DISCLOSURE_REQUEST_NOTICE = "メールで開示します。";
    process.env.LEGAL_HEAD_OF_OPERATIONS = "山田 太郎";
    process.env.LEGAL_BUSINESS_NAME = "就活Pass";
    process.env.LEGAL_REPRESENTATIVE_NAME = "山田 太郎";
    process.env.LEGAL_BUSINESS_ADDRESS = "東京都千代田区1-2-3";
    process.env.LEGAL_PHONE_NUMBER = "03-1234-5678";

    const {
      getLegalBusinessAddress,
      getLegalBusinessName,
      getLegalDisclosureNotice,
      getLegalDisclosureRequestEmail,
      getLegalHeadOfOperations,
      getLegalPhoneNumber,
      getLegalRepresentativeName,
      getLegalRefundPolicyUrl,
      getLegalSalesUrl,
      getLegalSupportEmail,
      getLegalSupportUrl,
    } = await loadCommerceDisclosure();

    expect(getLegalSalesUrl()).toBe("https://example.com/sales");
    expect(getLegalSupportEmail()).toBe("billing@example.com");
    expect(getLegalSupportUrl()).toBe("https://example.com/help");
    expect(getLegalRefundPolicyUrl()).toBe("https://example.com/refunds");
    expect(getLegalDisclosureRequestEmail()).toBe("disclosure@example.com");
    expect(getLegalDisclosureNotice()).toBe("メールで開示します。");
    expect(getLegalHeadOfOperations()).toBe("山田 太郎");
    expect(getLegalBusinessName()).toBe("就活Pass");
    expect(getLegalRepresentativeName()).toBe("山田 太郎");
    expect(getLegalBusinessAddress()).toBe("東京都千代田区1-2-3");
    expect(getLegalPhoneNumber()).toBe("03-1234-5678");
  });
});
