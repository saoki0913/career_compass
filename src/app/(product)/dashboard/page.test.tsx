import { describe, it, expect, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => null),
    },
  },
}));

vi.mock("@/bff/identity/request-identity", () => ({
  getHeadersIdentity: vi.fn(async () => null),
}));

vi.mock("@/lib/server/app-loaders", () => ({
  getCompaniesPageData: vi.fn(),
  getTodayTaskData: vi.fn(),
  getUpcomingDeadlinesData: vi.fn(),
  getViewerPlan: vi.fn(),
}));

vi.mock("@/lib/server/task-loaders", () => ({
  getTasksPageData: vi.fn(),
}));

vi.mock("@/lib/server/safe-loader", () => ({
  safeLoad: vi.fn(),
}));

vi.mock("@/components/dashboard/DashboardPageClient", () => ({
  DashboardPageClient: vi.fn(() => null),
}));

vi.mock("@/components/skeletons/DashboardSkeleton", () => ({
  DashboardSkeleton: vi.fn(() => null),
}));

describe("DashboardPage", () => {
  it("exports a default component", async () => {
    const mod = await import("./page");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
