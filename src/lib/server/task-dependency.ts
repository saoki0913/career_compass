/**
 * Task dependency management service.
 *
 * Handles unblocking successors when a task completes, and recursively
 * re-blocking the chain when a task is reverted to open.
 * All operations run inside db.transaction() for atomicity.
 */

import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * When a task is completed: unblock its immediate successor.
 */
export async function unblockSuccessor(taskId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [successor] = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.dependsOnTaskId, taskId))
      .limit(1);

    if (successor?.isBlocked) {
      await tx
        .update(tasks)
        .set({ isBlocked: false, updatedAt: new Date() })
        .where(eq(tasks.id, successor.id));
    }
  });
}

/**
 * When a task is reverted (done → open): recursively re-block all
 * downstream successors that are still open.
 * Completed successors are not affected.
 */
export async function reblockSuccessors(taskId: string): Promise<void> {
  await db.transaction(async (tx) => {
    async function reblock(tid: string) {
      const successors = await tx
        .select()
        .from(tasks)
        .where(
          and(eq(tasks.dependsOnTaskId, tid), eq(tasks.status, "open")),
        );

      for (const s of successors) {
        if (!s.isBlocked) {
          await tx
            .update(tasks)
            .set({ isBlocked: true, updatedAt: new Date() })
            .where(eq(tasks.id, s.id));
          await reblock(s.id);
        }
      }
    }

    await reblock(taskId);
  });
}
