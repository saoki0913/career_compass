import type { ConversationState } from "@/lib/gakuchika/conversation-state";

export const PROCESSING_LABELS = {
  organizing_intent: "質問の意図を整理中",
  generating_question: "次の質問を生成中...",
} as const;

export type GakuchikaDraftCharLimit = 300 | 400 | 500;

export function parseGakuchikaCharLimitType(value: unknown): GakuchikaDraftCharLimit {
  const n = Number(value);
  if (n === 300 || n === 400 || n === 500) return n;
  return 400;
}

export type AssistantProcessingPhase = "idle" | "organizing_intent" | "generating_question";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isOptimistic?: boolean;
}

export interface ConversationUpdate {
  messages: Message[];
  nextQuestion: string | null;
  questionCount: number;
  isCompleted: boolean;
  isInterviewReady: boolean;
  conversationState: ConversationState | null;
  isAIPowered: boolean;
}

export type PendingGakuchikaCompleteData = ConversationUpdate;

export interface Session {
  id: string;
  status: "in_progress" | "completed";
  conversationState: ConversationState | null;
  questionCount: number;
  createdAt: string;
}

export function getProcessingPhase(step?: string): AssistantProcessingPhase {
  if (step === "analysis") return "organizing_intent";
  if (step === "question") return "generating_question";
  return "organizing_intent";
}

export function normalizeGakuchikaMessages(messages: unknown): Message[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message): message is { role: "user" | "assistant"; content: string; id?: string } => (
      typeof message === "object" &&
      message !== null &&
      ((message as { role?: unknown }).role === "user" || (message as { role?: unknown }).role === "assistant") &&
      typeof (message as { content?: unknown }).content === "string"
    ))
    .map((message, idx) => ({
      ...message,
      id: message.id || `msg-${idx}`,
    }));
}
