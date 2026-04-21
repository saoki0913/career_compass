/**
 * Phase 2 Stage 8-4: Pure aggregation for the PrepPack component.
 *
 * Takes already-loaded interview context (materials, plan, recent feedback
 * histories, motivation summary) and produces the four lists the PrepPack
 * component renders. Separated from the component so we can unit-test without
 * React, and so the caller can invoke it in either a Server Component or a
 * Client Component depending on which surface the prep card lives on.
 */

import type { InterviewPlan } from "@/lib/interview/plan";
import type { FeedbackHistoryItem, MaterialCard } from "@/lib/interview/ui";

export type PrepPackInput = {
  materials: MaterialCard[];
  interviewPlan: InterviewPlan | null | undefined;
  recentFeedbackHistories: FeedbackHistoryItem[];
  motivationSummary?: string | null;
};

export type PrepPackSections = {
  likelyTopics: string[];
  mustCoverTopics: string[];
  motivationConnections: string[];
};

const TOPIC_SEPARATOR = /[\/、,，]/u;

function splitSeedText(text: string | undefined | null): string[] {
  if (!text) return [];
  return text
    .split(TOPIC_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function dedupe<T>(items: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function extractLikelyTopics(input: PrepPackInput): string[] {
  const fromCompanySeed = input.materials
    .filter((m) => m.kind === "company_seed")
    .flatMap((m) => splitSeedText(m.text));
  const fromIndustrySeed = input.materials
    .filter((m) => m.kind === "industry_seed")
    .flatMap((m) => splitSeedText(m.text));
  const fromFeedback = input.recentFeedbackHistories
    .slice(0, 3)
    .flatMap((history) => history.improvements)
    .filter((item) => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());

  // Prioritize company-specific topics, then industry seeds, then feedback keywords.
  return dedupe([...fromCompanySeed, ...fromIndustrySeed, ...fromFeedback]).slice(0, 5);
}

function extractMustCoverTopics(plan: InterviewPlan | null | undefined): string[] {
  if (!plan) return [];
  const topics = (plan as unknown as { must_cover_topics?: unknown }).must_cover_topics;
  if (!Array.isArray(topics)) return [];
  return dedupe(
    topics
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  ).slice(0, 6);
}

function extractMotivationConnections(input: PrepPackInput): string[] {
  const motivation = input.motivationSummary?.trim();
  const fromPlan = input.interviewPlan
    ? splitSeedText((input.interviewPlan as unknown as { motivation_hooks?: string }).motivation_hooks)
    : [];
  const fromMaterials = input.materials
    .filter((m) => m.kind === "motivation")
    .flatMap((m) => splitSeedText(m.text));

  const base = dedupe([...fromPlan, ...fromMaterials]);
  if (motivation && base.length === 0) {
    // fallback: surface the motivation summary head as a single bullet if no plan hook exists
    return [motivation.slice(0, 60)];
  }
  return base.slice(0, 5);
}

export function buildPrepPackSections(input: PrepPackInput): PrepPackSections {
  return {
    likelyTopics: extractLikelyTopics(input),
    mustCoverTopics: extractMustCoverTopics(input.interviewPlan),
    motivationConnections: extractMotivationConnections(input),
  };
}
