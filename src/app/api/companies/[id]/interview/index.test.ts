import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dbSelectMock,
  getInterviewIndustrySeedMock,
  getInterviewCompanySeedMock,
  resolveMotivationRoleContextMock,
} = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  getInterviewIndustrySeedMock: vi.fn(),
  getInterviewCompanySeedMock: vi.fn(),
  resolveMotivationRoleContextMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

vi.mock("@/lib/interview/company-seeds", () => ({
  getInterviewIndustrySeed: getInterviewIndustrySeedMock,
  getInterviewCompanySeed: getInterviewCompanySeedMock,
}));

vi.mock("@/lib/constants/es-review-role-catalog", () => ({
  resolveMotivationRoleContext: resolveMotivationRoleContextMock,
}));

function makeWhereLimitQuery(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

function makeWhereOrderByLimitQuery(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue(result),
        })),
      })),
    })),
  };
}

function makeWhereLimitRejectingQuery(error: Error) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockRejectedValue(error),
      })),
    })),
  };
}

function makeWhereOrderByLimitRejectingQuery(error: Error) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn().mockRejectedValue(error),
        })),
      })),
    })),
  };
}

function makeLeftJoinWhereQuery(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      leftJoin: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

describe("buildInterviewContext", () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
    getInterviewIndustrySeedMock.mockReset();
    getInterviewCompanySeedMock.mockReset();
    resolveMotivationRoleContextMock.mockReset();

    getInterviewIndustrySeedMock.mockReturnValue(null);
    getInterviewCompanySeedMock.mockReturnValue(null);
    resolveMotivationRoleContextMock.mockImplementation(
      ({ companyIndustry, selectedIndustry }: { companyIndustry?: string | null; selectedIndustry?: string | null }) => ({
        resolvedIndustry: selectedIndustry ?? companyIndustry ?? null,
        requiresIndustrySelection: false,
        industryOptions: companyIndustry ? [companyIndustry] : [],
      }),
    );
  });

  it("throws a normalized persistence error when the new interview tables are missing", async () => {
    const company = {
      id: "company-1",
      userId: "user-1",
      guestId: null,
      name: "Alpha",
      industry: "商社",
      notes: null,
      recruitmentUrl: null,
      corporateUrl: null,
    };

    dbSelectMock
      .mockReturnValueOnce(makeWhereLimitQuery([company]))
      .mockReturnValueOnce(makeWhereLimitQuery([]))
      .mockReturnValueOnce(makeWhereOrderByLimitQuery([]))
      .mockReturnValueOnce(makeWhereOrderByLimitQuery([]))
      .mockReturnValueOnce(
        makeWhereLimitRejectingQuery(
          new Error('relation "interview_conversations" does not exist'),
        ),
      )
      .mockReturnValueOnce(
        makeWhereOrderByLimitRejectingQuery(
          new Error('relation "interview_feedback_histories" does not exist'),
        ),
      )
      .mockReturnValueOnce(makeLeftJoinWhereQuery([]));

    const { buildInterviewContext } = await import(".");

    await expect(
      buildInterviewContext("company-1", { userId: "user-1", guestId: null }),
    ).rejects.toMatchObject({
      code: "INTERVIEW_PERSISTENCE_UNAVAILABLE",
      companyId: "company-1",
      operation: "interview:build-context",
      missingTables: ["interview_conversations"],
    });
  });

  it("detects wrapped Postgres missing-table errors for interview persistence", async () => {
    const { normalizeInterviewPersistenceError } = await import("./persistence-errors");

    const cause = new Error('relation "interview_feedback_histories" does not exist');
    Object.assign(cause, { code: "42P01" });
    const wrapped = new Error(
      'Failed query: select * from "interview_feedback_histories" where "company_id" = $1',
    );
    wrapped.cause = cause;

    expect(
      normalizeInterviewPersistenceError(wrapped, {
        companyId: "company-1",
        operation: "interview:test",
      }),
    ).toMatchObject({
      code: "INTERVIEW_PERSISTENCE_UNAVAILABLE",
      missingTables: ["interview_feedback_histories"],
    });
  });

  it("detects missing interview v2 columns separately from missing tables", async () => {
    const {
      createInterviewPersistenceUnavailableResponse,
      normalizeInterviewPersistenceError,
    } = await import("./persistence-errors");

    const cause = new Error('column "role_track" of relation "interview_conversations" does not exist');
    Object.assign(cause, { code: "42703" });
    const wrapped = new Error(
      'Failed query: select "role_track" from "interview_conversations" where "company_id" = $1',
    );
    wrapped.cause = cause;

    const normalized = normalizeInterviewPersistenceError(wrapped, {
      companyId: "company-1",
      operation: "interview:test-columns",
    });

    expect(normalized).toMatchObject({
      code: "INTERVIEW_PERSISTENCE_UNAVAILABLE",
      missingTables: [],
      missingColumns: ["interview_conversations.role_track"],
    });

    const response = createInterviewPersistenceUnavailableResponse(
      new Request("http://localhost/api/companies/company-1/interview") as never,
      normalized!,
    );
    const payload = await response.json();
    expect(payload.error.extra).toMatchObject({
      missingTables: [],
      missingColumns: ["interview_conversations.role_track"],
    });
  });

  it("detects bare Postgres missing-column errors for interview persistence", async () => {
    const { normalizeInterviewPersistenceError } = await import("./persistence-errors");

    const error = new Error('column "role_track" does not exist');
    Object.assign(error, { code: "42703" });

    expect(
      normalizeInterviewPersistenceError(error, {
        companyId: "company-1",
        operation: "interview:test-bare-column",
      }),
    ).toMatchObject({
      code: "INTERVIEW_PERSISTENCE_UNAVAILABLE",
      missingTables: [],
      missingColumns: ["interview_conversations.role_track"],
    });
  });
});
