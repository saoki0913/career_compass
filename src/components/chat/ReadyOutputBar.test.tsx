// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";

import { ReadyOutputBar } from "./ReadyOutputBar";

const source = readFileSync(path.resolve(__dirname, "ReadyOutputBar.tsx"), "utf8");

describe("ReadyOutputBar", () => {
  it("renders action buttons from the actions prop", () => {
    expect(source).toContain("export function ReadyOutputBar");
    expect(source).toContain("actions");
  });

  it("no longer exposes the helperText prop (supplementary text moved into GenerationModal)", () => {
    expect(source).not.toContain("helperText");
  });

  it("keeps pending actions clickable and switches the visible label", () => {
    const onClick = vi.fn();

    render(
      <ReadyOutputBar
        actions={[
          {
            key: "draft",
            label: "ES作成",
            pending: true,
            pendingLabel: "ES生成状況を見る",
            onClick,
          },
        ]}
      />,
    );

    const button = screen.getByRole("button", {
      name: "ES作成: 生成中 - クリックで進捗を確認",
    });

    expect(button).toBeInstanceOf(HTMLButtonElement);
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.textContent).toContain("ES生成状況を見る");

    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
