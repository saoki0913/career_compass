import { db } from "@/lib/db";
import {
  gakuchikaContents,
  gakuchikaConversations,
  userProfiles,
} from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { isInterviewReady, safeParseConversationState } from "@/app/api/gakuchika";

export interface ProfileContext {
  university: string | null;
  faculty: string | null;
  graduation_year: number | null;
  target_industries: string[];
  target_job_types: string[];
}

export interface GakuchikaContextItem {
  title: string;
  source_status: "structured_summary" | "raw_material";
  strengths?: Array<{ title?: string; description?: string } | string>;
  action_text?: string;
  result_text?: string;
  numbers?: string[];
  content_excerpt?: string;
  fact_spans?: string[];
}

export interface DocumentSectionContext {
  title: string;
  content: string;
}

interface FetchGakuchikaContextOptions {
  allowIncomplete?: boolean;
  limit?: number;
}

type BlockType = "h2" | "paragraph" | "bullet" | "numbered";

interface DocumentBlock {
  id?: string;
  type?: BlockType | string;
  content?: string;
}

export function safeParseProfileArray(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function safeParseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizeFactSpan(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length < 12) return null;
  return normalized.slice(0, 120);
}

function extractFactSpansFromText(text: string, maxItems = 4): string[] {
  const spans: string[] = [];
  const sentences = text
    .replace(/\r/g, "\n")
    .split(/(?<=[。！？!?])|\n+/)
    .map((part) => normalizeFactSpan(part))
    .filter((part): part is string => Boolean(part));

  for (const sentence of sentences) {
    if (spans.length >= maxItems) break;
    if (!spans.includes(sentence)) {
      spans.push(sentence);
    }
  }
  return spans;
}

function buildRawMaterialExcerpt(text: string, factSpans: string[]): string {
  const joined = factSpans.join(" ");
  if (joined.length > 0) {
    return joined.slice(0, 220);
  }
  return text.replace(/\s+/g, " ").trim().slice(0, 220);
}

export async function fetchProfileContext(userId: string | null): Promise<ProfileContext | null> {
  if (!userId) return null;

  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  if (!profile) return null;

  return {
    university: profile.university || null,
    faculty: profile.faculty || null,
    graduation_year: profile.graduationYear || null,
    target_industries: safeParseProfileArray(profile.targetIndustries),
    target_job_types: safeParseProfileArray(profile.targetJobTypes),
  };
}

export async function fetchGakuchikaContext(
  userId: string,
  options: FetchGakuchikaContextOptions = {},
): Promise<GakuchikaContextItem[]> {
  const { allowIncomplete = false, limit = 3 } = options;

  try {
    const contents = await db
      .select({
        id: gakuchikaContents.id,
        title: gakuchikaContents.title,
        summary: gakuchikaContents.summary,
        content: gakuchikaContents.content,
      })
      .from(gakuchikaContents)
      .where(eq(gakuchikaContents.userId, userId))
      .orderBy(desc(gakuchikaContents.updatedAt));

    const results: GakuchikaContextItem[] = [];

    for (const content of contents) {
      if (results.length >= limit) break;

      const [latestConv] = await db
        .select({
          status: gakuchikaConversations.status,
          starScores: gakuchikaConversations.starScores,
        })
        .from(gakuchikaConversations)
        .where(eq(gakuchikaConversations.gakuchikaId, content.id))
        .orderBy(desc(gakuchikaConversations.updatedAt))
        .limit(1);

      const isCompleted = latestConv
        ? isInterviewReady(safeParseConversationState(latestConv.starScores ?? null, latestConv.status))
        : false;
      if (isCompleted && content.summary) {
        try {
          const parsed = JSON.parse(content.summary);
          if (parsed && typeof parsed === "object") {
            results.push({
              title: content.title,
              source_status: "structured_summary",
              strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
              action_text: typeof parsed.action_text === "string" ? parsed.action_text : "",
              result_text: typeof parsed.result_text === "string" ? parsed.result_text : "",
              numbers: safeParseStringArray(parsed.numbers),
            });
            continue;
          }
        } catch {
          // Fall through to raw material mode when allowed.
        }
      }

      if (!allowIncomplete || !content.content) {
        continue;
      }

      const factSpans = extractFactSpansFromText(content.content);
      if (factSpans.length === 0) {
        continue;
      }

      results.push({
        title: content.title,
        source_status: "raw_material",
        content_excerpt: buildRawMaterialExcerpt(content.content, factSpans),
        fact_spans: factSpans,
      });
    }

    return results;
  } catch (error) {
    console.error("[UserContext] Failed to fetch gakuchika context:", error);
    return [];
  }
}

export function extractOtherDocumentSections(
  rawContent: string | null,
  currentSectionTitle?: string | null,
  options: { maxSections?: number; maxCharsPerSection?: number } = {},
): DocumentSectionContext[] {
  if (!rawContent) return [];

  const maxSections = options.maxSections ?? 4;
  const maxCharsPerSection = options.maxCharsPerSection ?? 260;

  try {
    const parsed = JSON.parse(rawContent);
    if (!Array.isArray(parsed)) return [];

    const blocks = parsed as DocumentBlock[];
    const sections: DocumentSectionContext[] = [];

    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index];
      if (block?.type !== "h2") continue;

      const title = (block.content || "").trim();
      if (!title || title === (currentSectionTitle || "").trim()) {
        continue;
      }

      let content = "";
      for (let cursor = index + 1; cursor < blocks.length; cursor += 1) {
        const next = blocks[cursor];
        if (next?.type === "h2") break;
        const line = (next?.content || "").trim();
        if (!line) continue;
        content += `${line}\n`;
      }

      const normalized = content.replace(/\s+/g, " ").trim();
      if (!normalized) continue;

      sections.push({
        title,
        content: normalized.slice(0, maxCharsPerSection),
      });

      if (sections.length >= maxSections) {
        break;
      }
    }

    return sections;
  } catch {
    return [];
  }
}
