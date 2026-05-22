import { desc, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { gakuchikaConversations } from "@/lib/db/schema";

export type LatestOwnedGakuchikaConversation = {
  gakuchikaId: string;
  status: string | null;
  starScores: unknown;
  questionCount: number;
};

export async function loadLatestGakuchikaConversationsForOwnedContentIds(
  ownedContentIds: readonly string[],
): Promise<LatestOwnedGakuchikaConversation[]> {
  if (ownedContentIds.length === 0) {
    return [];
  }

  const rows = await db
    .selectDistinctOn([gakuchikaConversations.gakuchikaId], {
      id: gakuchikaConversations.id,
      gakuchikaId: gakuchikaConversations.gakuchikaId,
      status: gakuchikaConversations.status,
      starScores: gakuchikaConversations.starScores,
      questionCount: gakuchikaConversations.questionCount,
      createdAt: gakuchikaConversations.createdAt,
      updatedAt: gakuchikaConversations.updatedAt,
    })
    .from(gakuchikaConversations)
    .where(inArray(gakuchikaConversations.gakuchikaId, [...ownedContentIds]))
    .orderBy(
      gakuchikaConversations.gakuchikaId,
      desc(gakuchikaConversations.updatedAt),
      desc(gakuchikaConversations.createdAt),
      desc(gakuchikaConversations.id),
    );

  return rows.map((row) => ({
    gakuchikaId: row.gakuchikaId,
    status: typeof row.status === "string" ? row.status : null,
    starScores: row.starScores,
    questionCount: Number(row.questionCount ?? 0),
  }));
}
