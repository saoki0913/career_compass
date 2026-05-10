import { describe, expect, it } from "vitest";

import { parseSimpleMarkdown } from "./simple-markdown";

describe("parseSimpleMarkdown", () => {
  it("parses paragraphs and one-level lists", () => {
    const blocks = parseSimpleMarkdown("最初の段落です。\n続きです。\n\n- 役割を明示\n- 数字を補う\n\n1. 冒頭\n2. 根拠");

    expect(blocks).toEqual([
      {
        type: "paragraph",
        children: [{ type: "text", text: "最初の段落です。 続きです。" }],
      },
      {
        type: "list",
        ordered: false,
        items: [
          [{ type: "text", text: "役割を明示" }],
          [{ type: "text", text: "数字を補う" }],
        ],
      },
      {
        type: "list",
        ordered: true,
        items: [
          [{ type: "text", text: "冒頭" }],
          [{ type: "text", text: "根拠" }],
        ],
      },
    ]);
  });

  it("parses bold and inline code without interpreting HTML", () => {
    const blocks = parseSimpleMarkdown("**結論**を先に置き、`STAR`を整えます。<script>alert(1)</script>");

    expect(blocks).toEqual([
      {
        type: "paragraph",
        children: [
          { type: "strong", text: "結論" },
          { type: "text", text: "を先に置き、" },
          { type: "code", text: "STAR" },
          { type: "text", text: "を整えます。<script>alert(1)</script>" },
        ],
      },
    ]);
  });

  it("falls back to text for unclosed markup", () => {
    expect(parseSimpleMarkdown("**結論を先に置く")).toEqual([
      {
        type: "paragraph",
        children: [{ type: "text", text: "**結論を先に置く" }],
      },
    ]);
  });
});
