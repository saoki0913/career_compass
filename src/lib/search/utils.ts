/**
 * Search Utilities
 *
 * Utility functions for global search feature
 */

/**
 * Escape special characters in SQL LIKE pattern
 * Prevents SQL injection and ensures correct pattern matching
 */
export function escapeLikePattern(query: string): string {
  const escaped = query
    .replace(/\\/g, "\\\\") // Escape backslash first
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
  return `%${escaped}%`;
}

/**
 * Normalize Japanese text for search
 * Converts full-width characters to half-width where appropriate
 */
export function normalizeForSearch(text: string): string {
  // Convert full-width alphanumerics to half-width
  return text.normalize("NFKC");
}

/**
 * Extract searchable text from JSON content (Notion-style blocks)
 */
export function extractTextFromContent(content: string | null): string {
  if (!content) return "";

  try {
    const blocks = JSON.parse(content);
    if (!Array.isArray(blocks)) return content;

    return blocks
      .map((block: Record<string, unknown>) => {
        // Handle different block types
        if (typeof block.text === "string") return block.text;
        if (typeof block.content === "string") return block.content;
        if (typeof block.title === "string") return block.title;

        // Handle nested children
        if (Array.isArray(block.children)) {
          return block.children
            .map((child: Record<string, unknown>) =>
              typeof child.text === "string" ? child.text : ""
            )
            .join(" ");
        }

        return "";
      })
      .filter(Boolean)
      .join(" ");
  } catch {
    // If not valid JSON, return as-is (fallback)
    return content;
  }
}

/**
 * Create a snippet with highlighted match
 * Returns text around the match with context
 */
export function createSnippet(
  text: string,
  query: string,
  contextLength: number = 50
): { snippet: string; matchIndex: number } {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) {
    // No match found, return beginning of text
    const snippet =
      text.length > contextLength * 2
        ? text.slice(0, contextLength * 2) + "..."
        : text;
    return { snippet, matchIndex: -1 };
  }

  // Calculate snippet boundaries
  const start = Math.max(0, matchIndex - contextLength);
  const end = Math.min(text.length, matchIndex + query.length + contextLength);

  let snippet = text.slice(start, end);

  // Add ellipsis if truncated
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";

  return { snippet, matchIndex: start > 0 ? contextLength + 3 : matchIndex };
}

/**
 * Determine which field matched the query
 */
export function findMatchedField<T extends Record<string, unknown>>(
  item: T,
  query: string,
  fields: (keyof T)[]
): keyof T | null {
  const lowerQuery = query.toLowerCase();

  for (const field of fields) {
    const value = item[field];
    if (typeof value === "string" && value.toLowerCase().includes(lowerQuery)) {
      return field;
    }
  }

  return null;
}

/**
 * Search result types
 */
export interface SearchResultCompany {
  id: string;
  name: string;
  industry: string | null;
  status: string;
  matchedField: "name" | "industry" | "notes";
  snippet: string;
}

export interface SearchResultDocument {
  id: string;
  title: string;
  type: "es" | "tips" | "company_analysis";
  companyId: string | null;
  companyName: string | null;
  matchedField: "title" | "content";
  snippet: string;
  updatedAt: string;
}

export interface SearchResultDeadline {
  id: string;
  title: string;
  type: string;
  companyId: string;
  companyName: string;
  dueDate: string;
  isCompleted: boolean;
  matchedField: "title" | "description" | "memo";
  snippet: string;
}

export interface SearchResponse {
  query: string;
  results: {
    companies: SearchResultCompany[];
    documents: SearchResultDocument[];
    deadlines: SearchResultDeadline[];
  };
  counts: {
    companies: number;
    documents: number;
    deadlines: number;
    total: number;
  };
}
