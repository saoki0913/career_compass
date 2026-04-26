import { and, eq } from "drizzle-orm";

import type { RequestIdentity } from "@/app/api/_shared/request-identity";
import {
  interviewConversations,
  interviewFeedbackHistories,
} from "@/lib/db/schema";

export function buildConversationOwnerWhere(companyId: string, identity: RequestIdentity) {
  return identity.userId
    ? and(eq(interviewConversations.companyId, companyId), eq(interviewConversations.userId, identity.userId))
    : and(eq(interviewConversations.companyId, companyId), eq(interviewConversations.guestId, identity.guestId!));
}

export function buildFeedbackOwnerWhere(companyId: string, identity: RequestIdentity) {
  return identity.userId
    ? and(eq(interviewFeedbackHistories.companyId, companyId), eq(interviewFeedbackHistories.userId, identity.userId))
    : and(eq(interviewFeedbackHistories.companyId, companyId), eq(interviewFeedbackHistories.guestId, identity.guestId!));
}
