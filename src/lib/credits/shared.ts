import { db } from "@/lib/db";
import { credits, creditTransactions, userProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export { db, credits, creditTransactions, userProfiles };

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
  | "interview"
  | "interview_feedback"
  | "refund";

export const CONVERSATION_CREDITS_PER_TURN = 1;
export const DEFAULT_INTERVIEW_SESSION_CREDIT_COST = 6;

export async function getCreditRow(userId: string) {
  const [row] = await db.select().from(credits).where(eq(credits.userId, userId)).limit(1);
  return row ?? null;
}

export async function getUserPlan(userId: string): Promise<PlanType> {
  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return (profile?.plan || "free") as PlanType;
}
