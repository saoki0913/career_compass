import { beforeEach, describe, it, expect, vi } from "vitest";

const { resolvePageIdentityMock } = vi.hoisted(() => ({
  resolvePageIdentityMock: vi.fn(),
}));

vi.mock("@/lib/server/page-identity", () => ({
  resolvePageIdentity: resolvePageIdentityMock,
}));

const {
  getCompaniesPageDataMock,
  getTodayTaskDataMock,
  getUpcomingDeadlinesDataMock,
  getTasksPageDataMock,
  DashboardShellMock,
  streamableLoadMock,
} = vi.hoisted(() => ({
  getCompaniesPageDataMock: vi.fn(),
  getTodayTaskDataMock: vi.fn(),
  getUpcomingDeadlinesDataMock: vi.fn(),
  getTasksPageDataMock: vi.fn(),
  DashboardShellMock: vi.fn(() => null),
  streamableLoadMock: vi.fn((_name, fn) => fn()),
}));

vi.mock("@/lib/server/app-loaders", () => ({
  getCompaniesPageData: getCompaniesPageDataMock,
  getTodayTaskData: getTodayTaskDataMock,
  getUpcomingDeadlinesData: getUpcomingDeadlinesDataMock,
}));

vi.mock("@/lib/server/task-loaders", () => ({
  getTasksPageData: getTasksPageDataMock,
}));

vi.mock("@/components/error/StreamingErrorBoundary", () => ({
  StreamingErrorBoundary: vi.fn(({ children }) => children),
}));

vi.mock("@/components/ui/AnimatedSuspenseContent", () => ({
  AnimatedSuspenseContent: vi.fn(({ children }) => children),
}));

vi.mock("@/components/dashboard/DashboardShell", () => ({
  DashboardShell: DashboardShellMock,
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
  streamableLoad: streamableLoadMock,
}));

describe("DashboardPage", () => {
  beforeEach(() => {
    resolvePageIdentityMock.mockReset();
    getCompaniesPageDataMock.mockReset();
    getTodayTaskDataMock.mockReset();
    getUpcomingDeadlinesDataMock.mockReset();
    getTasksPageDataMock.mockReset();
    DashboardShellMock.mockClear();
    streamableLoadMock.mockClear();

    getCompaniesPageDataMock.mockResolvedValue({ companies: [], total: 0 });
    getTodayTaskDataMock.mockResolvedValue({ task: null });
    getUpcomingDeadlinesDataMock.mockResolvedValue({ deadlines: [], count: 0, periodDays: 7 });
    getTasksPageDataMock.mockResolvedValue({ tasks: [], count: 0 });
  });

  it("exports a default component", async () => {
    const mod = await import("./page");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  it("renders fallback shell without private loaders when identity is missing", async () => {
    resolvePageIdentityMock.mockResolvedValue({
      status: "ready",
      identity: null,
      session: null,
    });

    const { default: DashboardPage } = await import("./page");
    const rendered = (await DashboardPage()) as { props: unknown };

    expect(getCompaniesPageDataMock).not.toHaveBeenCalled();
    expect(getTodayTaskDataMock).not.toHaveBeenCalled();
    expect(getUpcomingDeadlinesDataMock).not.toHaveBeenCalled();
    expect(getTasksPageDataMock).not.toHaveBeenCalled();
    expect(rendered.props).toEqual(
      expect.objectContaining({
        viewer: expect.objectContaining({
          displayName: "ゲスト",
          isGuest: true,
        }),
      }),
    );
  });

  it("starts dashboard loaders only after identity is resolved", async () => {
    const identity = {
      kind: "user",
      type: "user",
      userId: "user-1",
      guestId: null,
      role: "user",
      banned: false,
    };
    resolvePageIdentityMock.mockResolvedValue({
      status: "ready",
      identity,
      session: { user: { id: "user-1", name: "山田" } },
    });

    const { default: DashboardPage } = await import("./page");
    await DashboardPage();

    expect(streamableLoadMock).toHaveBeenCalledTimes(4);
    expect(getUpcomingDeadlinesDataMock).toHaveBeenCalledWith(identity, 7);
    expect(getCompaniesPageDataMock).toHaveBeenCalledWith(identity);
    expect(getTodayTaskDataMock).toHaveBeenCalledWith(identity);
    expect(getTasksPageDataMock).toHaveBeenCalledWith(identity, { status: "open" });
  });
});
