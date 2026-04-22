import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { gakuchikaContents } from "@/lib/db/schema";
import {
  type GakuchikaSummary,
  type LegacySummary,
  type StructuredSummary,
} from "@/lib/gakuchika/summary";
import { type Message } from "@/app/api/gakuchika";
import { fetchFastApiInternal } from "@/lib/fastapi/client";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function normalizeStructuredSummaryPayload(data: unknown): StructuredSummary | null {
  if (!isRecord(data)) return null;

  const strengths = Array.isArray(data.strengths)
    ? data.strengths
        .map((item) => {
          if (typeof item === "string") {
            return item.trim() ? { title: item.trim(), description: "" } : null;
          }
          if (!isRecord(item)) return null;
          const title = cleanString(item.title);
          const description = cleanString(item.description);
          if (!title) return null;
          return { title, description };
        })
        .filter((item): item is StructuredSummary["strengths"][number] => item !== null)
    : [];

  const learnings = Array.isArray(data.learnings)
    ? data.learnings
        .map((item) => {
          if (typeof item === "string") {
            return item.trim() ? { title: item.trim(), description: "" } : null;
          }
          if (!isRecord(item)) return null;
          const title = cleanString(item.title);
          const description = cleanString(item.description);
          if (!title) return null;
          return { title, description };
        })
        .filter((item): item is StructuredSummary["learnings"][number] => item !== null)
    : [];

  return {
    situation_text: cleanString(data.situation_text),
    task_text: cleanString(data.task_text),
    action_text: cleanString(data.action_text),
    result_text: cleanString(data.result_text),
    strengths,
    learnings,
    numbers: cleanStringList(data.numbers),
    interviewer_hooks: cleanStringList(data.interviewer_hooks),
    decision_reasons: cleanStringList(data.decision_reasons),
    before_after_comparisons: cleanStringList(data.before_after_comparisons),
    credibility_notes: cleanStringList(data.credibility_notes),
    role_scope: cleanString(data.role_scope),
    reusable_principles: cleanStringList(data.reusable_principles),
    interview_supporting_details: cleanStringList(data.interview_supporting_details),
    future_outlook_notes: cleanStringList(data.future_outlook_notes),
    backstory_notes: cleanStringList(data.backstory_notes),
    one_line_core_answer: cleanString(data.one_line_core_answer),
    likely_followup_questions: cleanStringList(data.likely_followup_questions),
    weak_points_to_prepare: cleanStringList(data.weak_points_to_prepare),
    two_minute_version_outline: cleanStringList(data.two_minute_version_outline),
  };
}

function buildFallbackSummary(messages: Message[]): LegacySummary {
  const summary = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join(" ");

  return {
    summary: summary.slice(0, 500) + (summary.length > 500 ? "..." : ""),
    key_points: [],
    numbers: [],
    strengths: [],
  };
}

async function requestStructuredSummary(
  gakuchikaTitle: string,
  draftText: string,
  messages: Message[]
): Promise<StructuredSummary | null> {
  const response = await fetchFastApiInternal("/api/gakuchika/structured-summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      draft_text: draftText,
      conversation_history: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      gakuchika_title: gakuchikaTitle,
    }),
  });

  if (!response.ok) {
    return null;
  }

  return normalizeStructuredSummaryPayload(await response.json());
}

export async function generateGakuchikaSummary(
  gakuchikaTitle: string,
  draftText: string,
  messages: Message[]
): Promise<GakuchikaSummary> {
  try {
    const structured = await requestStructuredSummary(gakuchikaTitle, draftText, messages);
    if (structured) {
      return structured;
    }
  } catch (error) {
    console.error("[Gakuchika Summary] Structured summary generation failed:", error);
  }

  return buildFallbackSummary(messages);
}

export async function persistGakuchikaSummary(
  gakuchikaId: string,
  gakuchikaTitle: string,
  draftText: string,
  messages: Message[]
): Promise<GakuchikaSummary> {
  const summary = await generateGakuchikaSummary(gakuchikaTitle, draftText, messages);

  await db
    .update(gakuchikaContents)
    .set({
      summary: JSON.stringify(summary),
      updatedAt: new Date(),
    })
    .where(eq(gakuchikaContents.id, gakuchikaId));

  return summary;
}
