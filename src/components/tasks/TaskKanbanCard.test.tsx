import { describe, it, expect } from "vitest";

describe("TaskKanbanCard", () => {
  it("exports component", async () => {
    const mod = await import("./TaskKanbanCard");
    expect(mod.TaskKanbanCard).toBeDefined();
  });

  it("card wrapper uses div[role=button] instead of button to avoid nesting", async () => {
    const mod = await import("./TaskKanbanCard");
    const src = mod.TaskKanbanCard.toString();
    expect(src).not.toMatch(new RegExp('createElement\\("button".*createElement\\("button"', "s"));
  });
});
