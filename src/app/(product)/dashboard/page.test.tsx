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

vi.mock("@/lib/server/request-identity-cache", () => ({
  getCurrentRequestIdentity: vi.fn(async () => null),
}));

vi.mock("@/lib/server/app-loaders", () => ({
  getCompaniesPageData: vi.fn(),
  getTodayTaskData: vi.fn(),
  getUpcomingDeadlinesData: vi.fn(),
}));

vi.mock("@/lib/server/task-loaders", () => ({
  getTasksPageData: vi.fn(),
}));

vi.mock("@/components/error/StreamingErrorBoundary", () => ({
  StreamingErrorBoundary: vi.fn(({ children }) => children),
}));

vi.mock("@/components/ui/AnimatedSuspenseContent", () => ({
  AnimatedSuspenseContent: vi.fn(({ children }) => children),
}));

vi.mock("@/components/dashboard/DashboardShell", () => ({
  DashboardShell: vi.fn(() => null),
}));

vi.mock("@/components/dashboard/DashboardHeader", () => ({
  DashboardHeader: vi.fn(() => null),
}));

vi.mock("@/components/dashboard/DashboardScheduleZone", () => ({
  DashboardScheduleZone: vi.fn(() => null),
}));

vi.mock("@/components/dashboard/DashboardPipelineZone", () => ({
  DashboardPipelineZone: vi.fn(() => null),
}));

vi.mock("@/components/dashboard/DashboardTasksZone", () => ({
  DashboardTasksZone: vi.fn(() => null),
}));

vi.mock("@/components/dashboard/DashboardDeadlinesZone", () => ({
  DashboardDeadlinesZone: vi.fn(() => null),
}));

vi.mock("@/components/skeletons/DashboardSkeleton", () => ({
  DashboardScheduleSkeleton: vi.fn(() => null),
  DashboardPipelineSkeleton: vi.fn(() => null),
  DashboardTasksSkeleton: vi.fn(() => null),
  DashboardDeadlinesSkeleton: vi.fn(() => null),
}));

vi.mock("@/lib/server/streaming-helpers", () => ({
  streamableLoad: vi.fn((_name, fn) => fn()),
}));

describe("DashboardPage", () => {
  it("exports a default component", async () => {
    const mod = await import("./page");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
