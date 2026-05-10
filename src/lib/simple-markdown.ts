export type SimpleMarkdownInline =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "code"; text: string };

export type SimpleMarkdownBlock =
  | { type: "paragraph"; children: SimpleMarkdownInline[] }
  | { type: "list"; ordered: boolean; items: SimpleMarkdownInline[][] };

const UNORDERED_LIST_RE = /^\s*[-*]\s+(.+)$/;
const ORDERED_LIST_RE = /^\s*\d+[.)]\s+(.+)$/;

function parseInline(text: string): SimpleMarkdownInline[] {
  const tokens: SimpleMarkdownInline[] = [];
  let index = 0;

  while (index < text.length) {
    const strongIndex = text.indexOf("**", index);
    const codeIndex = text.indexOf("`", index);
    const nextIndex =
      strongIndex === -1
        ? codeIndex
        : codeIndex === -1
          ? strongIndex
          : Math.min(strongIndex, codeIndex);

    if (nextIndex === -1) {
      tokens.push({ type: "text", text: text.slice(index) });
      break;
    }

    if (nextIndex > index) {
      tokens.push({ type: "text", text: text.slice(index, nextIndex) });
    }

    if (nextIndex === strongIndex) {
      const closeIndex = text.indexOf("**", nextIndex + 2);
      if (closeIndex === -1) {
        tokens.push({ type: "text", text: text.slice(nextIndex) });
        break;
      }
      tokens.push({ type: "strong", text: text.slice(nextIndex + 2, closeIndex) });
      index = closeIndex + 2;
      continue;
    }

    const closeIndex = text.indexOf("`", nextIndex + 1);
    if (closeIndex === -1) {
      tokens.push({ type: "text", text: text.slice(nextIndex) });
      break;
    }
    tokens.push({ type: "code", text: text.slice(nextIndex + 1, closeIndex) });
    index = closeIndex + 1;
  }

  return tokens.filter((token) => token.text.length > 0);
}

function flushParagraph(lines: string[], blocks: SimpleMarkdownBlock[]) {
  if (lines.length === 0) return;
  blocks.push({
    type: "paragraph",
    children: parseInline(lines.join(" ").replace(/\s+/g, " ").trim()),
  });
  lines.length = 0;
}

function flushList(
  listState: { ordered: boolean; items: string[] } | null,
  blocks: SimpleMarkdownBlock[],
) {
  if (!listState) return;
  blocks.push({
    type: "list",
    ordered: listState.ordered,
    items: listState.items.map(parseInline),
  });
}

export function parseSimpleMarkdown(input: string): SimpleMarkdownBlock[] {
  const blocks: SimpleMarkdownBlock[] = [];
  const paragraphLines: string[] = [];
  let listState: { ordered: boolean; items: string[] } | null = null;

  for (const rawLine of input.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph(paragraphLines, blocks);
      flushList(listState, blocks);
      listState = null;
      continue;
    }

    const orderedMatch = ORDERED_LIST_RE.exec(rawLine);
    const unorderedMatch = UNORDERED_LIST_RE.exec(rawLine);
    const listMatch = orderedMatch ?? unorderedMatch;
    if (listMatch) {
      flushParagraph(paragraphLines, blocks);
      const ordered = Boolean(orderedMatch);
      if (!listState || listState.ordered !== ordered) {
        flushList(listState, blocks);
        listState = { ordered, items: [] };
      }
      listState.items.push(listMatch[1].trim());
      continue;
    }

    flushList(listState, blocks);
    listState = null;
    paragraphLines.push(line);
  }

  flushParagraph(paragraphLines, blocks);
  flushList(listState, blocks);
  return blocks;
}
