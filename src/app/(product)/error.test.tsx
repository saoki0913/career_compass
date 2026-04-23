import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ProductError from "./error";

describe("ProductError", () => {
  it("renders error message and buttons", () => {
    const reset = vi.fn();
    const error = Object.assign(new Error("test"), { digest: "abc123" });
    render(<ProductError error={error} reset={reset} />);
    expect(screen.getByText("読み込みに失敗しました")).toBeDefined();
    expect(screen.getByText("再試行する")).toBeDefined();
    expect(screen.getByText("ホームに戻る")).toBeDefined();
  });
});
