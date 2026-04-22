/**
 * Motivation conversation serialization: functions that prepare domain
 * objects for Postgres persistence.
 */
import type {
  EvidenceCard,
  Message,
  MotivationConversationContext,
  MotivationScores,
  StageStatus,
} from "./conversation";

export function serializeMessages(messages: Message[]): Message[] {
  return messages;
}

export function serializeScores(scores: MotivationScores | null | undefined): MotivationScores | null {
  return scores ?? null;
}

export function serializeConversationContext(
  context: MotivationConversationContext | null | undefined,
): MotivationConversationContext | null {
  return context ?? null;
}

export function serializeEvidenceCards(cards: EvidenceCard[] | null | undefined): EvidenceCard[] | null {
  return cards ?? null;
}

export function serializeStageStatus(stageStatus: StageStatus | null | undefined): StageStatus | null {
  return stageStatus ?? null;
}
