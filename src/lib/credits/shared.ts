import { db } from "@/lib/db";
import { credits, creditTransactions, subscriptions, userProfiles } from "@/lib/db/schema";
import { and, eq, inArray, or, sql } from "drizzle-orm";

export { db, credits, creditTransactions, subscriptions, userProfiles };

export const PLAN_CREDITS = {
  guest: 0,
  free: 50,
  standard: 350,
  pro: 750,
} as const;

export type PlanType = "guest" | "free" | "standard" | "pro";
export type TransactionType =
  | "monthly_grant"
  | "plan_change"
  | "company_fetch"
  | "es_review"
  | "gakuchika"
  | "gakuchika_draft"
  | "motivation"
  | "motivation_draft"
  | "motivation_resume_deepdive"
  | "interview"
  | "interview_feedback"
  | "refund";

export const CONVERSATION_CREDITS_PER_TURN = 1;
export const INTERVIEW_START_CREDIT_COST = 2;
export const INTERVIEW_TURN_CREDIT_COST = 1;
export const INTERVIEW_CONTINUE_CREDIT_COST = 1;
export const DEFAULT_INTERVIEW_SESSION_CREDIT_COST = 6;

export async function getCreditRow(userId: string) {
  const [row] = await db.select().from(credits).where(eq(credits.userId, userId)).limit(1);
  return row ?? null;
}

export type CreditConsumptionBlockCode = "BILLING_HOLD" | "SUBSCRIPTION_BLOCKED";

export type CreditConsumptionBlock = {
  code: CreditConsumptionBlockCode;
  message: string;
};

export class BillingGateUnavailableError extends Error {
  readonly code = "BILLING_GATE_UNAVAILABLE";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "BillingGateUnavailableError";
    this.cause = options?.cause;
  }
}

function isUndefinedColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? String(error.code) : "";
  if (code === "42703") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /billing_hold_(status|reason|stripe_dispute_id|started_at|ended_at)|undefined column|does not exist/i.test(
    message,
  );
}

export function isBillingGateUnavailableError(
  error: unknown,
): error is BillingGateUnavailableError {
  return (
    error instanceof BillingGateUnavailableError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "BILLING_GATE_UNAVAILABLE")
  );
}

const CREDIT_BLOCKING_SUBSCRIPTION_STATUSES = new Set([
  "past_due",
  "unpaid",
  "paused",
  "incomplete",
  "incomplete_expired",
]);
const CREDIT_BLOCKING_SUBSCRIPTION_STATUS_VALUES = Array.from(CREDIT_BLOCKING_SUBSCRIPTION_STATUSES);
const CREDIT_BLOCKING_SUBSCRIPTION_STATUS_SQL = sql.join(
  CREDIT_BLOCKING_SUBSCRIPTION_STATUS_VALUES.map((status) => sql`${status}`),
  sql`, `,
);

export function creditConsumptionAllowedSql(userId: string) {
  return sql`not exists (
    select 1
    from ${subscriptions}
    where ${subscriptions.userId} = ${userId}
      and (
        ${subscriptions.billingHoldStatus} = 'dispute'
        or ${subscriptions.status} in (${CREDIT_BLOCKING_SUBSCRIPTION_STATUS_SQL})
      )
  )`;
}

export async function getCreditConsumptionBlockDetails(
  userId: string,
): Promise<CreditConsumptionBlock | null> {
  let subscription:
    | {
        status: string | null;
        billingHoldStatus: string;
        billingHoldReason: string | null;
      }
    | undefined;

  try {
    [subscription] = await db
      .select({
        status: subscriptions.status,
        billingHoldStatus: subscriptions.billingHoldStatus,
        billingHoldReason: subscriptions.billingHoldReason,
      })
      .from(subscriptions)
      .where(and(
        eq(subscriptions.userId, userId),
        or(
          eq(subscriptions.billingHoldStatus, "dispute"),
          inArray(subscriptions.status, CREDIT_BLOCKING_SUBSCRIPTION_STATUS_VALUES),
        ),
      ))
      .limit(1);
  } catch (error) {
    if (isUndefinedColumnError(error)) {
      throw new BillingGateUnavailableError(
        "Credit billing gate schema is unavailable. Run billing hold column migration or repair.",
        { cause: error },
      );
    }
    throw error;
  }

  if (!subscription) {
    return null;
  }

  if (subscription.billingHoldStatus === "dispute") {
    return {
      code: "BILLING_HOLD",
      message: subscription.billingHoldReason || "Billing dispute is under review",
    };
  }

  if (subscription.status && CREDIT_BLOCKING_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    return {
      code: "SUBSCRIPTION_BLOCKED",
      message: `Subscription status does not allow credit use: ${subscription.status}`,
    };
  }

  return null;
}

export async function getCreditConsumptionBlock(userId: string): Promise<string | null> {
  const block = await getCreditConsumptionBlockDetails(userId);
  return block?.message ?? null;
}

export async function getUserPlan(userId: string): Promise<PlanType> {
  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return (profile?.plan || "free") as PlanType;
}
