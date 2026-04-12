import {
  normalizeInterviewPlanValue,
  normalizeInterviewTurnState,
  type InterviewPlan,
  type InterviewTurnState,
} from "@/lib/interview/session";
import type { InterviewFeedback, InterviewMessage } from "@/lib/interview/conversation";

export { normalizeInterviewPlanValue };

function parseUnknownJson(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

export function parseJsonArray(value: unknown): string[] {
  const parsed = parseUnknownJson(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

export function parseFeedbackScores(value: unknown): InterviewFeedback["scores"] {
  const parsed = parseUnknownJson(value);
  return parsed && typeof parsed === "object" ? (parsed as InterviewFeedback["scores"]) : {};
}

export function parseInterviewPlan(value: unknown): InterviewPlan | null {
  const parsed = parseUnknownJson(value);
  return parsed ? normalizeInterviewPlanValue(parsed) : null;
}

export function validateInterviewMessages(value: unknown): InterviewMessage[] | null {
  if (!Array.isArray(value)) return null;
  const messages = value.filter(
    (message): message is InterviewMessage =>
      !!message &&
      typeof message === "object" &&
      ((message as { role?: string }).role === "user" ||
        (message as { role?: string }).role === "assistant") &&
      typeof (message as { content?: unknown }).content === "string",
  );

  if (messages.length !== value.length) return null;

  return messages.map((message) => ({
    role: message.role,
    content: message.content.trim(),
  }));
}

export function validateInterviewTurnState(value: unknown): InterviewTurnState | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return normalizeInterviewTurnState(value as Partial<InterviewTurnState>);
}
