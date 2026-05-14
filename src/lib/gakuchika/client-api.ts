import type { ConversationState } from "@/lib/gakuchika/conversation-state";
import { deleteJson, patchJson, postJson, putJson } from "@/lib/shared";

export type GakuchikaListConversationStatus = "in_progress" | "completed" | null;

export type GakuchikaListItem = {
  id: string;
  title: string;
  summary: string | null;
  summaryPreview?: string | null;
  summaryKind?: "structured" | "legacy" | "none";
  sortOrder: number | null;
  createdAt: string;
  updatedAt: string;
  conversationStatus: GakuchikaListConversationStatus;
  conversationState: ConversationState | null;
  questionCount: number;
};

export type GakuchikaResponse = {
  id: string;
  title: string;
  content: string | null;
  charLimitType: "300" | "400" | "500" | null;
  summary: string | null;
  sortOrder: number | null;
  createdAt: string;
  updatedAt: string;
};

export type GakuchikaListResponse = {
  gakuchikas: GakuchikaListItem[];
  currentCount: number;
  maxCount: number;
};

export type GakuchikaCreateResponse = {
  gakuchika: GakuchikaResponse;
};

export function fetchGakuchikaList() {
  return fetch("/api/gakuchika", {
    credentials: "include",
  });
}

export function fetchGakuchikaDetail(gakuchikaId: string) {
  return fetch(`/api/gakuchika/${gakuchikaId}`, {
    credentials: "include",
  });
}

export function createGakuchika(payload: {
  title: string;
  content: string;
  charLimitType?: "300" | "400" | "500";
}) {
  return postJson("/api/gakuchika", payload);
}

export function updateGakuchikaTitle(gakuchikaId: string, title: string) {
  return putJson(`/api/gakuchika/${gakuchikaId}`, { title });
}

export function deleteGakuchika(gakuchikaId: string) {
  return deleteJson(`/api/gakuchika/${gakuchikaId}`);
}

export function reorderGakuchikas(orderedIds: string[]) {
  return patchJson("/api/gakuchika/reorder", { orderedIds });
}

export function fetchGakuchikaConversation(gakuchikaId: string, sessionId?: string) {
  const searchParams = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
  return fetch(`/api/gakuchika/${gakuchikaId}/conversation${searchParams}`, {
    credentials: "include",
  });
}

export function startGakuchikaConversation(gakuchikaId: string) {
  return postJson(`/api/gakuchika/${gakuchikaId}/conversation/new`);
}

export function streamGakuchikaConversation(
  gakuchikaId: string,
  payload: { answer: string; sessionId: string | null },
) {
  return postJson(`/api/gakuchika/${gakuchikaId}/conversation/stream`, payload);
}

export function resumeGakuchikaConversation(
  gakuchikaId: string,
  payload: { sessionId: string | null },
) {
  return postJson(`/api/gakuchika/${gakuchikaId}/conversation/resume`, payload);
}

export function generateGakuchikaEsDraft(
  gakuchikaId: string,
  payload: { charLimit: 300 | 400 | 500; sessionId?: string | null },
) {
  return postJson(`/api/gakuchika/${gakuchikaId}/generate-es-draft`, payload);
}

export function discardGeneratedGakuchikaDraft(
  gakuchikaId: string,
  payload: { sessionId: string | null; documentId: string | null },
) {
  return postJson(`/api/gakuchika/${gakuchikaId}/discard-generated-draft`, payload);
}

export function generateGakuchikaInterviewSummary(
  gakuchikaId: string,
  payload: { sessionId: string | null },
) {
  return postJson(`/api/gakuchika/${gakuchikaId}/interview-summary`, payload);
}
