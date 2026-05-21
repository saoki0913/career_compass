// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { RoleGroup } from "@/shared/contracts/interview/role-options";
import { RoleSelector } from "./RoleSelector";

// Radix Select relies on pointer-capture / scrollIntoView / ResizeObserver which
// jsdom does not implement. These are standard jsdom shims to let the listbox open.
beforeAll(() => {
  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = () => false;
  }
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = () => {};
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => {};
  }
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => {};
  }
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

afterEach(cleanup);

const ROLE_GROUPS: RoleGroup[] = [
  {
    id: "course",
    label: "採用コース",
    options: [
      { value: "総合職", label: "総合職", source: "industry_default" },
      { value: "技術職", label: "技術職", source: "industry_default" },
    ],
  },
  {
    id: "job",
    label: "具体業務",
    options: [{ value: "営業", label: "営業", source: "company_override" }],
  },
];

type Overrides = Partial<React.ComponentProps<typeof RoleSelector>>;

function renderSelector(overrides: Overrides = {}) {
  const onSelectRole = vi.fn();
  const onClearRole = vi.fn();
  const onCustomRoleChange = vi.fn();
  const utils = render(
    <RoleSelector
      roleGroups={ROLE_GROUPS}
      selectedRoleName=""
      customRoleName=""
      roleSelectionSource={null}
      onSelectRole={onSelectRole}
      onClearRole={onClearRole}
      onCustomRoleChange={onCustomRoleChange}
      {...overrides}
    />,
  );
  return { ...utils, onSelectRole, onClearRole, onCustomRoleChange };
}

async function openCandidateList() {
  const trigger = screen.getByRole("combobox", { name: "職種候補" });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  return trigger;
}

describe("RoleSelector", () => {
  it("groups options under their group labels in the candidate list", async () => {
    renderSelector();
    await openCandidateList();

    expect(await screen.findByText("採用コース")).toBeDefined();
    expect(screen.getByText("具体業務")).toBeDefined();
    // option labels appear inside the open listbox
    expect(screen.getByRole("option", { name: "総合職" })).toBeDefined();
    expect(screen.getByRole("option", { name: "技術職" })).toBeDefined();
    expect(screen.getByRole("option", { name: "営業" })).toBeDefined();
  });

  it("calls onSelectRole with the chosen value when a candidate is picked", async () => {
    const { onSelectRole } = renderSelector();
    await openCandidateList();

    fireEvent.click(await screen.findByRole("option", { name: "技術職" }));

    expect(onSelectRole).toHaveBeenCalledWith("技術職");
  });

  it("uses a fieldset/legend labelled 職種 for accessible grouping", () => {
    const { container } = renderSelector();

    const fieldset = container.querySelector("fieldset");
    expect(fieldset).not.toBeNull();
    expect(fieldset?.querySelector("legend")?.textContent).toContain("職種");
  });

  it("shows the custom input only after switching to the free-input tab", () => {
    const { onCustomRoleChange } = renderSelector();

    // Candidate mode is the default: no free-text input yet.
    expect(screen.queryByRole("textbox", { name: "職種を自由入力" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "自由入力" }));

    const input = screen.getByRole("textbox", { name: "職種を自由入力" });
    fireEvent.change(input, { target: { value: "プロダクトデザイナー" } });
    expect(onCustomRoleChange).toHaveBeenCalledWith("プロダクトデザイナー");
  });

  it("caps the custom input at 40 characters", () => {
    const { onCustomRoleChange } = renderSelector();
    fireEvent.click(screen.getByRole("tab", { name: "自由入力" }));

    const input = screen.getByRole("textbox", { name: "職種を自由入力" }) as HTMLInputElement;
    expect(input.maxLength).toBe(40);

    const overLimit = "あ".repeat(45);
    fireEvent.change(input, { target: { value: overLimit } });

    const lastCallArg = onCustomRoleChange.mock.calls.at(-1)?.[0] as string;
    expect(lastCallArg.length).toBe(40);
  });

  it("preserves internal spaces so multi-word roles can be typed", () => {
    const { onCustomRoleChange } = renderSelector();
    fireEvent.click(screen.getByRole("tab", { name: "自由入力" }));

    const input = screen.getByRole("textbox", { name: "職種を自由入力" });
    // 内部スペースは保持する（最終的な正規化はデータ層の normalizeRoleLabel が担う）。
    fireEvent.change(input, { target: { value: "経営 企画" } });
    expect(onCustomRoleChange).toHaveBeenLastCalledWith("経営 企画");
  });

  it("strips only leading whitespace while keeping the rest intact", () => {
    const { onCustomRoleChange } = renderSelector();
    fireEvent.click(screen.getByRole("tab", { name: "自由入力" }));

    const input = screen.getByRole("textbox", { name: "職種を自由入力" });
    // 先頭スペースのみ抑制し、内部・末尾はそのまま（タイピング途中の文字結合を防がない）。
    fireEvent.change(input, { target: { value: "  海外 営業 " } });
    expect(onCustomRoleChange).toHaveBeenLastCalledWith("海外 営業 ");
  });

  it("starts in free-input mode when roleSelectionSource is custom", () => {
    renderSelector({ roleSelectionSource: "custom", customRoleName: "デザイナー" });

    expect(screen.getByRole("textbox", { name: "職種を自由入力" })).toBeDefined();
    expect(screen.queryByRole("combobox", { name: "職種候補" })).toBeNull();
  });

  it("renders the fallback notice and reason attribute when isFallback is true", () => {
    const { container } = renderSelector({ isFallback: true, fallbackReason: "industry_unresolved" });

    expect(screen.getByText(/業界が未設定のため汎用職種を表示しています/)).toBeDefined();
    expect(container.querySelector("[data-fallback-reason='industry_unresolved']")).not.toBeNull();
  });

  it("does not render the fallback notice when isFallback is false", () => {
    const { container } = renderSelector({ isFallback: false });

    expect(screen.queryByText(/業界が未設定のため汎用職種を表示しています/)).toBeNull();
    expect(container.querySelector("[data-fallback-reason]")).toBeNull();
  });

  it("disables both tabs and the candidate trigger when disabled", () => {
    renderSelector({ disabled: true });

    expect(screen.getByRole("tab", { name: "候補から選択" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("tab", { name: "自由入力" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("combobox", { name: "職種候補" })).toHaveProperty("disabled", true);
  });

  it("does not crash when roleGroups is empty", () => {
    expect(() => renderSelector({ roleGroups: [] })).not.toThrow();
    expect(screen.getByRole("combobox", { name: "職種候補" })).toBeDefined();
  });

  it("clears the selection via onClearRole when returning to candidate mode after a custom entry", () => {
    const { onClearRole } = renderSelector({ roleSelectionSource: "custom", customRoleName: "デザイナー" });

    fireEvent.click(screen.getByRole("tab", { name: "候補から選択" }));

    expect(onClearRole).toHaveBeenCalledTimes(1);
  });
});
