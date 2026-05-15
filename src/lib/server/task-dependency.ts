/**
 * Task dependency management service.
 *
 * Handles unblocking successors when a task completes, and recursively
 * re-blocking the chain when a task is reverted to open.
 * All operations run inside db.transaction() for atomicity.
 */

import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { eq, and, type SQL } from "drizzle-orm";

type TaskDependencyExecutor = Pick<typeof db, "select" | "update">;

/**
 * When a task is completed: unblock all immediate successors.
 */
export async function unblockSuccessor(
  taskId: string,
  executor?: TaskDependencyExecutor,
  ownerCondition?: SQL | null,
): Promise<void> {
  const run = async (tx: TaskDependencyExecutor) => {
    const successors = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.dependsOnTaskId, taskId), ownerCondition ?? undefined));

    for (const successor of successors) {
      if (!successor.isBlocked) continue;
      await tx
        .update(tasks)
        .set({ isBlocked: false, updatedAt: new Date() })
        .where(and(eq(tasks.id, successor.id), ownerCondition ?? undefined));
    }
  };

  if (executor) {
    await run(executor);
    return;
  }

  await db.transaction(run);
}

/**
 * When a task is reverted (done → open): recursively re-block all
 * downstream successors that are still open.
 * Completed successors are not affected.
 */
export async function reblockSuccessors(
  taskId: string,
  executor?: TaskDependencyExecutor,
  ownerCondition?: SQL | null,
): Promise<void> {
  const run = async (tx: TaskDependencyExecutor) => {
    async function reblock(tid: string) {
      const successors = await tx
        .select()
        .from(tasks)
        .where(
          and(eq(tasks.dependsOnTaskId, tid), eq(tasks.status, "open"), ownerCondition ?? undefined),
        );

      for (const s of successors) {
        if (!s.isBlocked) {
          await tx
            .update(tasks)
            .set({ isBlocked: true, updatedAt: new Date() })
            .where(and(eq(tasks.id, s.id), ownerCondition ?? undefined));
          await reblock(s.id);
        }
      }
    }

    await reblock(taskId);
  };

  if (executor) {
    await run(executor);
    return;
  }

  await db.transaction(run);
}
