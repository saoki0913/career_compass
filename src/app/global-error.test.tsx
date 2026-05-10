import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import GlobalError from "./global-error";

describe("GlobalError", () => {
  it("renders a generic recovery message", () => {
    const html = renderToStaticMarkup(
      <GlobalError error={Object.assign(new Error("raw"), { digest: "digest-1" })} reset={vi.fn()} />,
    );

    expect(html).toContain("読み込みに失敗しました");
    expect(html).toContain("再試行する");
    expect(html).not.toContain("raw");
  });
});
