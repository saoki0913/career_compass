import { type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import { motivationConversations } from "@/lib/db/schema";

export async function getMotivationConversationByCondition(whereClause: SQL<unknown> | undefined) {
  const [row] = await db.select().from(motivationConversations).where(whereClause).limit(1);
  return row ?? null;
}
