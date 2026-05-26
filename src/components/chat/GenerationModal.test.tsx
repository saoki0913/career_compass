// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { GenerationModal } from "./GenerationModal";

const source = readFileSync(path.resolve(__dirname, "GenerationModal.tsx"), "utf8");

beforeAll(() => {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
});

afterEach(cleanup);

describe("GenerationModal", () => {
  it("renders a status-driven state machine with all four states", () => {
    expect(source).toContain('status === "locked"');
    expect(source).toContain('status === "ready"');
    expect(source).toContain('status === "generating"');
    expect(source).toContain('status === "done"');
  });

  it("accepts slot props for each state", () => {
    expect(source).toContain("settingsSlot");
    expect(source).toContain("readyInfoSlot");
    expect(source).toContain("generatingSlot");
    expect(source).toContain("resultSlot");
  });

  it("suppresses closing while generating (no close button, blocks escape/outside)", () => {
    expect(source).toContain("showCloseButton={");
    expect(source).toContain("onEscapeKeyDown");
    expect(source).toContain("onPointerDownOutside");
  });

  it("marks the body as busy and announces progress for a11y", () => {
    expect(source).toContain("aria-busy");
    expect(source).toContain('aria-live="polite"');
  });

  it("uses an enlarged (wide) dialog layout", () => {
    expect(source).toContain("max-w-7xl");
  });

  it("supports a confirm dialog for the secondary (deep-dive) action", () => {
    expect(source).toContain("AlertDialog");
    expect(source).toContain("secondaryAction");
    expect(source).toContain("confirm");
  });

  it("shows helper text, locked reason and requirements in the locked state", () => {
    expect(source).toContain("helperText");
    expect(source).toContain("requirements");
    expect(source).toContain("lockedReason");
  });

  it("renders generate action in ready and primary action in done", () => {
    expect(source).toContain("generateAction");
    expect(source).toContain("primaryAction");
  });

  it("switches between Dialog and Sheet by viewport", () => {
    expect(source).toContain("useMediaQuery");
    expect(source).toContain("Sheet");
  });

  it("disables close controls immediately after generate is clicked and prevents double execution", async () => {
    let resolveGenerate: (() => void) | null = null;
    const onGenerate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveGenerate = resolve;
        }),
    );
    const onOpenChange = vi.fn();

    render(
      <GenerationModal
        open
        onOpenChange={onOpenChange}
        status="ready"
        title="ES作成"
        generateAction={{
          label: "ESを生成",
          onGenerate,
        }}
      />,
    );

    const generateButton = screen.getByRole("button", { name: "ESを生成" });
    fireEvent.click(generateButton);
    fireEvent.click(generateButton);

    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(screen.getByText("生成処理中のため、完了するまでこの画面は閉じられません。")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();

    const cancelButton = screen.getByRole("button", { name: "キャンセル" }) as HTMLButtonElement;
    expect(cancelButton.disabled).toBe(true);
    fireEvent.click(cancelButton);
    expect(onOpenChange).not.toHaveBeenCalled();

    resolveGenerate?.();

    await waitFor(() => {
      expect((screen.getByRole("button", { name: "キャンセル" }) as HTMLButtonElement).disabled).toBe(false);
    });
  });
});
