import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyPublicSourceComplianceToCandidates,
  checkPublicSourceCompliance,
  filterAllowedPublicSourceUrls,
} from "@/lib/company-info/source-compliance";
import { guardedFetch, validatePublicUrl } from "@/lib/security/public-url";

vi.mock("@/lib/security/public-url", () => ({
  guardedFetch: vi.fn(),
  validatePublicUrl: vi.fn(),
}));

const guardedFetchMock = vi.mocked(guardedFetch);
const validatePublicUrlMock = vi.mocked(validatePublicUrl);

describe("source-compliance", () => {
  beforeEach(() => {
    guardedFetchMock.mockReset();
    validatePublicUrlMock.mockReset();
    validatePublicUrlMock.mockImplementation(async (input: string) => ({
      allowed: true,
      resolvedIps: ["203.0.113.10"],
      url: new URL(input),
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("blocks mypage-like urls before network checks", async () => {
    const result = await checkPublicSourceCompliance("https://example.com/mypage/login");

    expect(result.status).toBe("blocked");
    expect(result.reasons).toContain("ログインが必要なURLです");
    expect(guardedFetchMock).not.toHaveBeenCalled();
  });

  it("blocks urls when robots disallows crawling", async () => {
    guardedFetchMock.mockImplementation(async (input: string) => {
      if (input === "https://example.com/robots.txt") {
        return new Response("User-agent: *\nDisallow: /recruit\n", { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    const result = await checkPublicSourceCompliance("https://example.com/recruit");

    expect(result.status).toBe("blocked");
    expect(result.robotsStatus).toBe("disallowed");
    expect(result.reasons).toContain("このページは自動取得できません。別の公開ページを選んでください。");
  });

  it("warns instead of blocking when source policy cannot be confirmed", async () => {
    guardedFetchMock.mockImplementation(async (input: string) => {
      if (input === "https://example.com/robots.txt") {
        return new Response("service unavailable", { status: 503 });
      }
      if (input === "https://example.com" || input === "https://example.com/") {
        return new Response("<html><body>No terms link</body></html>", { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    const result = await checkPublicSourceCompliance("https://example.com/recruit");

    expect(result.status).toBe("warning");
    expect(result.robotsStatus).toBe("error");
    expect(result.reasons).toContain(
      "取得前にページ内容の確認が必要です。ページを開いて、公開情報として利用できることを確認してください。",
    );
  });

  it("warns when terms cannot be confirmed but no prohibition is found", async () => {
    guardedFetchMock.mockImplementation(async (input: string) => {
      if (input === "https://example.com/robots.txt") {
        return new Response("User-agent: *\nAllow: /\n", { status: 200 });
      }
      if (input === "https://example.com" || input === "https://example.com/") {
        return new Response("<html><body>No terms link</body></html>", { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    const result = await checkPublicSourceCompliance("https://example.com/recruit");

    expect(result.status).toBe("warning");
    expect(result.termsStatus).toBe("unknown");
    expect(result.reasons).toContain(
      "取得前にページ内容の確認が必要です。ページを開いて、公開情報として利用できることを確認してください。",
    );
  });

  it("blocks urls when terms explicitly prohibit automated access", async () => {
    guardedFetchMock.mockImplementation(async (input: string) => {
      if (input === "https://example.com/robots.txt") {
        return new Response("User-agent: *\nAllow: /\n", { status: 200 });
      }
      if (input === "https://example.com" || input === "https://example.com/") {
        return new Response(
          '<html><body><a href="/terms">利用規約</a></body></html>',
          { status: 200 },
        );
      }
      if (input === "https://example.com/terms") {
        return new Response("<html><body>自動取得やクローリングを禁止します。</body></html>", { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    const result = await checkPublicSourceCompliance("https://example.com/recruit");

    expect(result.status).toBe("blocked");
    expect(result.termsStatus).toBe("blocked");
    expect(result.reasons).toContain("このページは自動取得できません。別の公開ページを選んでください。");
  });

  it("allows urls when robots permits and terms do not prohibit automated access", async () => {
    guardedFetchMock.mockImplementation(async (input: string) => {
      if (input === "https://example.com/robots.txt") {
        return new Response("User-agent: *\nAllow: /\n", { status: 200 });
      }
      if (input === "https://example.com" || input === "https://example.com/") {
        return new Response(
          '<html><body><a href="/terms">利用規約</a></body></html>',
          { status: 200 },
        );
      }
      if (input === "https://example.com/terms") {
        return new Response("<html><body>本サイトの利用条件を定めます。</body></html>", { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    const result = await checkPublicSourceCompliance("https://example.com/recruit");

    expect(result.status).toBe("allowed");
    expect(result.robotsStatus).toBe("allowed");
    expect(result.termsStatus).toBe("allowed");
  });

  it("returns warnings separately while still allowing those urls", async () => {
    guardedFetchMock.mockImplementation(async (input: string) => {
      if (input === "https://example.com/robots.txt") {
        return new Response("User-agent: *\nAllow: /\n", { status: 200 });
      }
      if (input === "https://example.com" || input === "https://example.com/") {
        return new Response("<html><body>No terms link</body></html>", { status: 200 });
      }
      if (input === "https://example.com/legal") {
        return new Response("not found", { status: 404 });
      }
      if (input === "https://example.com/legal/") {
        return new Response("not found", { status: 404 });
      }
      if (input === "https://example.com/policy") {
        return new Response("not found", { status: 404 });
      }
      if (input === "https://example.com/policy/") {
        return new Response("not found", { status: 404 });
      }
      return new Response("not found", { status: 404 });
    });

    const results = await filterAllowedPublicSourceUrls([
      "https://example.com/recruit",
      "https://example.com/mypage",
    ]);

    expect(results.allowedUrls).toEqual(["https://example.com/recruit"]);
    expect(results.warningResults).toHaveLength(1);
    expect(results.warningResults[0]?.url).toBe("https://example.com/recruit");
    expect(results.blockedResults).toHaveLength(1);
    expect(results.blockedResults[0]?.url).toBe("https://example.com/mypage");
  });

  it("applies compliance to candidates using normalized urls", () => {
    const candidates = [
      { url: "https://example.com", title: "会社情報" },
      { url: "https://example.com/recruit", title: "採用情報" },
      { url: "https://example.com/private", title: "会員向け" },
    ];

    const results = applyPublicSourceComplianceToCandidates(candidates, {
      results: [
        {
          url: "https://example.com/",
          status: "warning",
          reasons: ["確認が必要です"],
          robotsStatus: "missing",
          termsStatus: "unknown",
          checkedAt: "2026-05-11T00:00:00.000Z",
          policyVersion: "test",
        },
        {
          url: "https://example.com/recruit",
          status: "allowed",
          reasons: [],
          robotsStatus: "allowed",
          termsStatus: "allowed",
          checkedAt: "2026-05-11T00:00:00.000Z",
          policyVersion: "test",
        },
        {
          url: "https://example.com/private",
          status: "blocked",
          reasons: ["取得できません"],
          robotsStatus: "disallowed",
          termsStatus: "allowed",
          checkedAt: "2026-05-11T00:00:00.000Z",
          policyVersion: "test",
        },
      ],
      allowedUrls: ["https://example.com/", "https://example.com/recruit"],
      warningResults: [],
      blockedResults: [],
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      url: "https://example.com",
      complianceStatus: "warning",
      complianceReasons: ["確認が必要です"],
      requiresUserConfirmation: true,
    });
    expect(results[1]).toMatchObject({
      url: "https://example.com/recruit",
      complianceStatus: "allowed",
      complianceReasons: [],
      requiresUserConfirmation: false,
    });
  });
});
