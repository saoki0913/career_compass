/**
 * ES 下書きを 1 段落（改行なし）に正規化する。API ルートから利用（client 不可）。
 */
export function normalizeEsDraftSingleParagraph(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/[ \u3000]{2,}/g, " ")
    .trim();
}
