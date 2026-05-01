import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, it, expect } from "vitest";
import { DeadlineCard } from "./DeadlineCard";
import type { Deadline } from "@/hooks/useDeadlines";

function makeDeadline(overrides: Partial<Deadline> = {}): Deadline {
  return {
    id: "deadline-1",
    companyId: "company-1",
    company: "三菱商事",
    type: "es_submission",
    title: "ES提出",
    description: null,
    dueDate: "2026-05-02T03:00:00.000Z",
    daysLeft: 1,
    isConfirmed: true,
    confidence: "high",
    sourceUrl: null,
    ...overrides,
  };
}

describe("DeadlineCard", () => {
  it("exports DeadlineCard component", async () => {
    const mod = await import("./DeadlineCard");
    expect(mod.DeadlineCard).toBeDefined();
  });

  it("uses compact padding for sidebar layout", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DeadlineCard.tsx", import.meta.url), "utf8");
    expect(source).toContain("py-1.5");
    expect(source).toContain("py-1");
  });

  it("supports dashboard-controlled deadline density", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DeadlineCard.tsx", import.meta.url), "utf8");
    expect(source).toContain("maxVisible");
    expect(source).toContain("filter((deadline) => deadline.isConfirmed).slice(0, maxVisible)");
  });

  it("uses dashboard asset illustration for empty deadlines", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DeadlineCard.tsx", import.meta.url), "utf8");
    expect(source).toContain("next/image");
    expect(source).toContain("/dashboard/assets/image_05.png");
    expect(source).toContain('data-testid="dashboard-deadline-card"');
  });

  it("renders only confirmed deadlines", () => {
    const html = renderToStaticMarkup(
      createElement(DeadlineCard, {
        deadlines: [
          makeDeadline({ id: "confirmed", title: "承認済み締切", isConfirmed: true }),
          makeDeadline({ id: "unconfirmed", title: "未承認締切", isConfirmed: false }),
        ],
      })
    );

    expect(html).toContain("承認済み締切");
    expect(html).not.toContain("未承認締切");
  });
});
