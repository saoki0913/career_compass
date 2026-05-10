import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("CompanyKanbanBoard", () => {
  it("uses dnd-kit sensors and the shared selection phase columns", async () => {
    const source = await readFile(new URL("./CompanyKanbanBoard.tsx", import.meta.url), "utf8");
    expect(source).toContain("DndContext");
    expect(source).toContain("PointerSensor");
    expect(source).toContain("KeyboardSensor");
    expect(source).toContain("COMPANY_SELECTION_PHASE_COLUMNS");
  });

  it("announces successful phase moves for assistive technology", async () => {
    const source = await readFile(new URL("./CompanyKanbanBoard.tsx", import.meta.url), "utf8");
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("へ移動しました");
  });

  it("uses DragOverlay to render dragged card above columns", async () => {
    const source = await readFile(new URL("./CompanyKanbanBoard.tsx", import.meta.url), "utf8");
    expect(source).toContain("DragOverlay");
    expect(source).toContain("activeCompany");
    expect(source).toContain("isOverlay");
  });

  it("memoizes drag handlers with useCallback", async () => {
    const source = await readFile(new URL("./CompanyKanbanBoard.tsx", import.meta.url), "utf8");
    expect(source).toContain("useCallback");
    expect(source).toContain("handleDragStart");
    expect(source).toContain("handleDragCancel");
    expect(source).toContain("onDragStart");
    expect(source).toContain("onDragCancel");
  });
});
