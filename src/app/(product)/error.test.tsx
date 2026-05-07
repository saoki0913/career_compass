import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ProductError from "./error";

describe("ProductError", () => {
  it("renders error message and buttons", () => {
    const reset = vi.fn();
    const error = Object.assign(new Error("test"), { digest: "abc123" });
    const html = renderToStaticMarkup(<ProductError error={error} reset={reset} />);
    expect(html).toContain("読み込みに失敗しました");
    expect(html).toContain("再試行する");
    expect(html).toContain("ホームに戻る");
  });
});
