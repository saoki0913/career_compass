/**
 * Activation checklist API
 *
 * Returns a lightweight progress snapshot used to guide first-time users.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import { db } from "@/lib/db";
import { aiThreads, companies, creditTransactions, deadlines, documents } from "@/lib/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";

async function getIdentity(request: NextRequest): Promise<
  | { userId: string; guestId: null }
  | { userId: null; guestId: string }
  | null
> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user?.id) {
    return { userId: session.user.id, guestId: null };
  }

  const deviceToken = request.headers.get("x-device-token");
  if (deviceToken) {
    const guest = await getGuestUser(deviceToken);
    if (guest) {
      return { userId: null, guestId: guest.id };
    }
  }

  return null;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number.parseInt(value, 10) || 0;
  return 0;
}

export async function GET(request: NextRequest) {
  try {
    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    let companyWhere: ReturnType<typeof eq>;
    let documentWhere: ReturnType<typeof eq>;
    if (identity.userId !== null) {
      companyWhere = eq(companies.userId, identity.userId);
      documentWhere = eq(documents.userId, identity.userId);
    } else {
      companyWhere = eq(companies.guestId, identity.guestId);
      documentWhere = eq(documents.guestId, identity.guestId);
    }

    const [{ count: companyCountRaw } = { count: 0 }] = await db
      .select({ count: sql`count(*)` })
      .from(companies)
      .where(companyWhere);
    const companyCount = toNumber(companyCountRaw);

    const [{ count: deadlineCountRaw } = { count: 0 }] = await db
      .select({ count: sql`count(*)` })
      .from(deadlines)
      .innerJoin(companies, eq(deadlines.companyId, companies.id))
      .where(companyWhere);
    const deadlineCount = toNumber(deadlineCountRaw);

    const [{ count: esCountRaw } = { count: 0 }] = await db
      .select({ count: sql`count(*)` })
      .from(documents)
      .where(and(documentWhere, eq(documents.type, "es"), ne(documents.status, "deleted")));
    const esCount = toNumber(esCountRaw);

    const aiReviewCount = identity.userId !== null
      ? (() => {
          // Auth users: count credit transactions (more reliable for billing/usage).
          return db
            .select({ count: sql`count(*)` })
            .from(creditTransactions)
            .where(and(eq(creditTransactions.userId, identity.userId), eq(creditTransactions.type, "es_review")))
            .then((rows) => toNumber(rows?.[0]?.count));
        })()
      : (() => {
          // Guests: infer from existence of ES review threads.
          return db
            .select({ count: sql`count(*)` })
            .from(aiThreads)
            .innerJoin(documents, eq(aiThreads.documentId, documents.id))
            .where(and(eq(documents.guestId, identity.guestId), eq(documents.type, "es"), ne(documents.status, "deleted")))
            .then((rows) => toNumber(rows?.[0]?.count));
        })();

    const resolvedAiReviewCount = await aiReviewCount;

    const steps = {
      company: {
        label: "企業を1社登録",
        done: companyCount > 0,
        count: companyCount,
        href: "/companies/new",
      },
      deadline: {
        label: "締切を1件追加",
        done: deadlineCount > 0,
        count: deadlineCount,
        href: companyCount > 0 ? "/companies" : "/companies/new",
      },
      es: {
        label: "ESを1件作成",
        done: esCount > 0,
        count: esCount,
        href: "/es?new=1",
      },
      ai_review: {
        label: "AI添削を1回実行",
        done: resolvedAiReviewCount > 0,
        count: resolvedAiReviewCount,
        href: "/es?action=review",
      },
    } as const;

    const ordered = [steps.company, steps.deadline, steps.es, steps.ai_review];
    const completedSteps = ordered.filter((s) => s.done).length;
    const totalSteps = ordered.length;

    const nextAction =
      ordered.find((s) => !s.done) ?? null;

    return NextResponse.json({
      steps,
      completedSteps,
      totalSteps,
      nextAction: nextAction ? { href: nextAction.href, label: nextAction.label } : null,
    });
  } catch (error) {
    console.error("Error getting activation progress:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
