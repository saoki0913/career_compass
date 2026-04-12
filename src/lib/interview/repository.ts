import { type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import { interviewConversations, interviewFeedbackHistories } from "@/lib/db/schema";

export async function getInterviewConversationByCondition(whereClause: SQL<unknown> | undefined) {
  const [row] = await db.select().from(interviewConversations).where(whereClause).limit(1);
  return row ?? null;
}

export async function getInterviewFeedbackHistoryByCondition(whereClause: SQL<unknown> | undefined) {
  return db.select().from(interviewFeedbackHistories).where(whereClause);
}
