import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  guardDailyTokenLimitMock,
  fetchFastApiInternalMock,
  dbSelectMock,
  logErrorMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  guardDailyTokenLimitMock: vi.fn(),
  fetchFastApiInternalMock: vi.fn(),
  dbSelectMock: vi.fn(),
  logErrorMock: vi.fn(),
}));

vi.mock("@/bff/identity/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("@/bff/identity/llm-cost-guard", () => ({
  guardDailyTokenLimit: guardDailyTokenLimitMock,
}));

vi.mock("@/lib/fastapi/client", () => ({
  fetchFastApiInternal: fetchFastApiInternalMock,
  fetchFastApiWithPrincipal: (path: string, init?: RequestInit & { principal?: unknown }) => {
    const { principal: _principal, ...rest } = (init || {}) as RequestInit & { principal?: unknown };
    void _principal;
    return fetchFastApiInternalMock(path, rest);
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logError: logErrorMock,
}));

function makeSelectRows<T>(rows: T[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(rows),
      })),
    })),
  };
}

describe("api/companies/[id]/interview/drill", () => {
  beforeEach(() => {
    getRequestIdentityMock.mockReset();
    guardDailyTokenLimitMock.mockReset();
    fetchFastApiInternalMock.mockReset();
    dbSelectMock.mockReset();
    logErrorMock.mockReset();

    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    guardDailyTokenLimitMock.mockResolvedValue(null);
  });

  it("sanitizes upstream drill start detail in the public response", async () => {
    const rawUpstreamError = "SQL failed at /internal/drill/start with secret-token";
    dbSelectMock
      .mockReturnValueOnce(makeSelectRows([
        {
          id: "conversation-1",
          selectedRole: "総合職",
          interviewFormat: "standard_behavioral",
          interviewerType: "hr",
          strictnessMode: "standard",
        },
      ]))
      .mockReturnValueOnce(makeSelectRows([{ name: "テスト株式会社" }]));
    fetchFastApiInternalMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: rawUpstreamError }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { POST } = await import("@/app/api/companies/[id]/interview/drill/start/route");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/interview/drill/start", {
      method: "POST",
      body: JSON.stringify({
        weakestTurnId: "turn-1",
        weakestQuestion: "質問",
        weakestAnswer: "回答",
        weakestAxis: "logic",
        originalScore: 2,
      }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request, { params: Promise.resolve({ id: "company-1" }) });
    const data = await response.json();
    const serialized = JSON.stringify(data);

    expect(response.status).toBe(500);
    expect(data.error.code).toBe("INTERVIEW_DRILL_UPSTREAM_FAILED");
    expect(data.error.userMessage).toBe("ドリルの生成に失敗しました。");
    expect(serialized).not.toContain(rawUpstreamError);
    expect(serialized).not.toContain("/internal/drill/start");
    expect(serialized).not.toContain("secret-token");
  });

  it("sanitizes upstream drill score detail in the public response", async () => {
    const rawUpstreamError = "Traceback from /internal/drill/score with api_key=secret";
    dbSelectMock
      .mockReturnValueOnce(makeSelectRows([
        {
          id: "attempt-1",
          conversationId: "conversation-1",
          weakestTurnId: "turn-1",
          retryQuestion: "再回答してください",
          weakestAxis: "logic",
          originalScores: {
            company_fit: 1,
            role_fit: 1,
            specificity: 1,
            logic: 1,
            persuasiveness: 1,
            consistency: 1,
            credibility: 1,
          },
        },
      ]))
      .mockReturnValueOnce(makeSelectRows([{ name: "テスト株式会社" }]));
    fetchFastApiInternalMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: rawUpstreamError }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { POST } = await import("@/app/api/companies/[id]/interview/drill/score/route");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/interview/drill/score", {
      method: "POST",
      body: JSON.stringify({
        attemptId: "attempt-1",
        retryAnswer: "改善した回答です。",
      }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request, { params: Promise.resolve({ id: "company-1" }) });
    const data = await response.json();
    const serialized = JSON.stringify(data);

    expect(response.status).toBe(502);
    expect(data.error.code).toBe("INTERVIEW_DRILL_SCORE_UPSTREAM_FAILED");
    expect(data.error.userMessage).toBe("再採点に失敗しました。");
    expect(serialized).not.toContain(rawUpstreamError);
    expect(serialized).not.toContain("/internal/drill/score");
    expect(serialized).not.toContain("api_key=secret");
  });
});
