import {
  getLegalBusinessAddress,
  getLegalBusinessName,
  getLegalDisclosureRequestEmail,
  getLegalHeadOfOperations,
  getLegalPhoneNumber,
  getLegalRepresentativeName,
  getLegalRefundPolicyUrl,
  getLegalSupportEmail,
  getLegalSupportUrl,
} from "@/lib/legal/commerce-disclosure";

describe("commerce disclosure helpers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.LEGAL_SUPPORT_EMAIL;
    delete process.env.LEGAL_SUPPORT_URL;
    delete process.env.LEGAL_REFUND_POLICY_URL;
    delete process.env.LEGAL_DISCLOSURE_REQUEST_EMAIL;
    delete process.env.LEGAL_HEAD_OF_OPERATIONS;
    delete process.env.LEGAL_BUSINESS_NAME;
    delete process.env.LEGAL_REPRESENTATIVE_NAME;
    delete process.env.LEGAL_BUSINESS_ADDRESS;
    delete process.env.LEGAL_PHONE_NUMBER;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("falls back to default public support values", () => {
    expect(getLegalSupportEmail()).toBe("support@shupass.jp");
    expect(getLegalSupportUrl()).toBe("/contact");
    expect(getLegalRefundPolicyUrl()).toBe("/terms#billing");
    expect(getLegalDisclosureRequestEmail()).toBe("support@shupass.jp");
    expect(getLegalHeadOfOperations()).toBe(
      "販売事業者、運営責任者、所在地、電話番号は、請求があった場合に遅滞なく開示いたします。開示をご希望の方は下記メールアドレスまでご連絡ください。"
    );
    expect(getLegalBusinessName()).toContain("LEGAL_BUSINESS_NAME");
    expect(getLegalRepresentativeName()).toContain("LEGAL_REPRESENTATIVE_NAME");
    expect(getLegalBusinessAddress()).toContain("LEGAL_BUSINESS_ADDRESS");
    expect(getLegalPhoneNumber()).toContain("LEGAL_PHONE_NUMBER");
  });

  it("prefers explicit env overrides for Stripe-facing disclosure items", () => {
    process.env.LEGAL_SUPPORT_EMAIL = "billing@example.com";
    process.env.LEGAL_SUPPORT_URL = "https://example.com/help";
    process.env.LEGAL_REFUND_POLICY_URL = "https://example.com/refunds";
    process.env.LEGAL_DISCLOSURE_REQUEST_EMAIL = "disclosure@example.com";
    process.env.LEGAL_HEAD_OF_OPERATIONS = "山田 太郎";
    process.env.LEGAL_BUSINESS_NAME = "就活Pass";
    process.env.LEGAL_REPRESENTATIVE_NAME = "山田 太郎";
    process.env.LEGAL_BUSINESS_ADDRESS = "東京都千代田区1-2-3";
    process.env.LEGAL_PHONE_NUMBER = "03-1234-5678";

    expect(getLegalSupportEmail()).toBe("billing@example.com");
    expect(getLegalSupportUrl()).toBe("https://example.com/help");
    expect(getLegalRefundPolicyUrl()).toBe("https://example.com/refunds");
    expect(getLegalDisclosureRequestEmail()).toBe("disclosure@example.com");
    expect(getLegalHeadOfOperations()).toBe("山田 太郎");
    expect(getLegalBusinessName()).toBe("就活Pass");
    expect(getLegalRepresentativeName()).toBe("山田 太郎");
    expect(getLegalBusinessAddress()).toBe("東京都千代田区1-2-3");
    expect(getLegalPhoneNumber()).toBe("03-1234-5678");
  });
});
