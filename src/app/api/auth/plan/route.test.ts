import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, dbSelectMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: getSessionMock,
    },
  },
}));

const fromMock = vi.fn();
const whereMock = vi.fn();
const limitMock = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: fromMock }),
    insert: vi.fn(() => ({ values: vi.fn() })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  userProfiles: { userId: "userId" },
  subscriptions: { userId: "userId", status: "status" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => "eq-condition"),
}));

function setupDbChain(results: unknown[][]) {
  let callIndex = 0;
  fromMock.mockImplementation(() => {
    const currentResults = results[callIndex] ?? [];
    callIndex++;
    return { where: () => ({ limit: () => currentResults }) };
  });
}

describe("GET /api/auth/plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    getSessionMock.mockResolvedValue(null);

    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns hasActiveSubscription: false for free users without subscription", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    setupDbChain([
      [{ plan: "free", planSelectedAt: new Date(), onboardingCompleted: true }],
      [],
    ]);

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();
    expect(body.hasActiveSubscription).toBe(false);
    expect(body.plan).toBe("free");
  });

  it("returns hasActiveSubscription: true for users with active subscription", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    setupDbChain([
      [{ plan: "standard", planSelectedAt: new Date(), onboardingCompleted: true }],
      [{ status: "active" }],
    ]);

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();
    expect(body.hasActiveSubscription).toBe(true);
    expect(body.plan).toBe("standard");
  });

  it("returns hasActiveSubscription: false for canceled subscription", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    setupDbChain([
      [{ plan: "standard", planSelectedAt: new Date(), onboardingCompleted: true }],
      [{ status: "canceled" }],
    ]);

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();
    expect(body.hasActiveSubscription).toBe(false);
  });
});
