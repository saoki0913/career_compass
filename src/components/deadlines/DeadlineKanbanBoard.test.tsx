import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DeadlineKanbanBoard } from "./DeadlineKanbanBoard";
import type { DeadlineDashboardItem } from "@/hooks/useDeadlinesDashboard";

function makeDeadline(
  overrides: Partial<DeadlineDashboardItem> = {},
): DeadlineDashboardItem {
  return {
    id: "deadline-1",
    companyId: "company-1",
    companyName: "東京海上日動火災保険",
    type: "es_submission",
    title: "エントリーシート提出",
    dueDate: "2026-05-30T15:00:00.000Z",
    status: "overdue",
    statusOverride: null,
    isConfirmed: true,
    completedAt: null,
    totalTasks: 3,
    completedTasks: 1,
    createdAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("DeadlineKanbanBoard", () => {
  it("renders all four status columns", () => {
    const html = renderToStaticMarkup(
      createElement(DeadlineKanbanBoard, { deadlines: [] }),
    );

    expect(html).toContain("未着手");
    expect(html).toContain("進行中");
    expect(html).toContain("完了");
    expect(html).toContain("期限切れ");
  });

  it("groups deadline cards into their status columns", () => {
    const html = renderToStaticMarkup(
      createElement(DeadlineKanbanBoard, {
        deadlines: [
          makeDeadline({ id: "not-started", status: "not_started", title: "MY PAGE登録締切" }),
          makeDeadline({ id: "in-progress", status: "in_progress", title: "適性検査受検" }),
          makeDeadline({ id: "completed", status: "completed", title: "説明会予約" }),
          makeDeadline({ id: "overdue", status: "overdue", title: "ES提出" }),
        ],
      }),
    );

    expect(html).toContain("MY PAGE登録締切");
    expect(html).toContain("適性検査受検");
    expect(html).toContain("説明会予約");
    expect(html).toContain("ES提出");
  });

  it("uses responsive one, two, and four column classes", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DeadlineKanbanBoard.tsx", import.meta.url), "utf8");
    expect(source).toContain("grid-cols-1");
    expect(source).toContain("md:grid-cols-2");
    expect(source).toContain("xl:grid-cols-4");
  });
});
