import { describe, it, expect } from "vitest";

describe("TaskKanbanCard", () => {
  it("exports component", async () => {
    const mod = await import("./TaskKanbanCard");
    expect(mod.TaskKanbanCard).toBeDefined();
  });

  it("separates edit and completion controls", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) =>
      readFile(new URL("./TaskKanbanCard.tsx", import.meta.url), "utf8"),
    );

    expect(source).toContain('role="button"');
    expect(source).toContain("onKeyDown");
    expect(source).toContain("aria-label={`${task.title}を編集`}");
    expect(source).toContain("`${task.title}を完了にする`");
  });
});
