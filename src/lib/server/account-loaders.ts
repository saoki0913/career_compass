import { and, count, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  companies,
  credits,
  documents,
  notificationSettings,
  subscriptions,
  userProfiles,
  users,
} from "@/lib/db/schema";
import { getBillingPeriodFromPriceId } from "@/lib/stripe/config";
import type { CreditsInfo } from "@/hooks/useCredits";
import { getCreditsInfo, getRemainingFreeFetches } from "@/lib/credits";
import {
  getMonthlyScheduleFetchFreeLimit,
  getMonthlyRagHtmlFreeUnits,
  getMonthlyRagPdfFreeUnits,
} from "@/lib/company-info/pricing";
import {
  getRagPdfIngestPolicySummaryJa,
  getRagPdfMaxIngestPages,
  getRagPdfMaxGoogleOcrPages,
  getRagPdfMaxMistralOcrPages,
} from "@/lib/company-info/pdf-ingest-limits";
import {
  getRemainingCompanyRagHtmlFreeUnitsSafe,
  getRemainingCompanyRagPdfFreeUnitsSafe,
} from "@/lib/company-info/usage";

function parseStringArray(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseReminderTiming(
  value: string | null,
): Array<{ type: string; hours?: number }> {
  if (!value) {
    return [{ type: "day_before" }, { type: "hour_before", hours: 3 }];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is { type: string; hours?: number } =>
            typeof item === "object" &&
            item !== null &&
            typeof item.type === "string" &&
            (item.hours === undefined || typeof item.hours === "number"),
        )
      : [{ type: "day_before" }, { type: "hour_before", hours: 3 }];
  } catch {
    return [{ type: "day_before" }, { type: "hour_before", hours: 3 }];
  }
}

function serializeDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function buildAccountProfile(params: {
  user: typeof users.$inferSelect;
  profile: typeof userProfiles.$inferSelect | undefined;
  creditBalance: number;
  subscription: {
    currentPeriodEnd: Date | null;
    status: string | null;
    stripePriceId: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
}): AccountProfileData {
  const { user, profile, creditBalance, subscription } = params;

  return {
    name: user.name ?? "",
    email: user.email,
    image: user.image ?? null,
    plan: profile?.plan ?? "free",
    university: profile?.university ?? null,
    faculty: profile?.faculty ?? null,
    graduationYear: profile?.graduationYear ?? null,
    targetIndustries: parseStringArray(profile?.targetIndustries ?? null),
    targetJobTypes: parseStringArray(profile?.targetJobTypes ?? null),
    createdAt: serializeDate(user.createdAt),
    creditsBalance: creditBalance,
    currentPeriodEnd: serializeDate(subscription?.currentPeriodEnd),
    subscriptionStatus: subscription?.status ?? null,
    billingPeriod: subscription?.stripePriceId
      ? getBillingPeriodFromPriceId(subscription.stripePriceId)
      : null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
  };
}

function buildNotificationSettings(
  settings: typeof notificationSettings.$inferSelect | undefined,
): AccountNotificationSettingsData {
  return {
    deadlineReminder: settings?.deadlineReminder ?? true,
    deadlineNear: settings?.deadlineNear ?? true,
    companyFetch: settings?.companyFetch ?? true,
    esReview: settings?.esReview ?? true,
    dailySummary: settings?.dailySummary ?? true,
    dailySummaryHourJst: settings?.dailySummaryHourJst ?? 9,
    reminderTiming: parseReminderTiming(settings?.reminderTiming ?? null),
  };
}

async function getAccountBaseData(userId: string) {
  const [user, profile, creditRow, subscriptionRow] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1).then((rows) => rows[0]),
    db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1).then((rows) => rows[0]),
    db.select({ balance: credits.balance }).from(credits).where(eq(credits.userId, userId)).limit(1).then((rows) => rows[0]),
    db
      .select({
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        status: subscriptions.status,
        stripePriceId: subscriptions.stripePriceId,
        cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  if (!user) {
    throw new Error(`User not found for account loaders: ${userId}`);
  }

  return {
    profile: buildAccountProfile({
      user,
      profile,
      creditBalance: creditRow?.balance ?? 0,
      subscription: subscriptionRow
        ? {
            currentPeriodEnd: subscriptionRow.currentPeriodEnd ?? null,
            status: subscriptionRow.status ?? null,
            stripePriceId: subscriptionRow.stripePriceId ?? null,
            cancelAtPeriodEnd: subscriptionRow.cancelAtPeriodEnd ?? false,
          }
        : null,
    }),
  };
}

export interface AccountProfileData {
  name: string;
  email: string;
  image: string | null;
  plan: string;
  university: string | null;
  faculty: string | null;
  graduationYear: number | null;
  targetIndustries: string[];
  targetJobTypes: string[];
  createdAt: string | null;
  creditsBalance: number;
  currentPeriodEnd: string | null;
  subscriptionStatus: string | null;
  billingPeriod: "monthly" | "annual" | null;
  cancelAtPeriodEnd: boolean;
}

export interface AccountNotificationSettingsData {
  deadlineReminder: boolean;
  deadlineNear: boolean;
  companyFetch: boolean;
  esReview: boolean;
  dailySummary: boolean;
  dailySummaryHourJst: number;
  reminderTiming: Array<{ type: string; hours?: number }>;
}

export async function getSettingsPageData(userId: string) {
  const [{ profile }, settingsRow] = await Promise.all([
    getAccountBaseData(userId),
    db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, userId))
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  return {
    profile,
    notificationSettings: buildNotificationSettings(settingsRow),
  };
}

export async function getProfilePageData(userId: string) {
  const [{ profile }, companyCountRow, esStatsRow] = await Promise.all([
    getAccountBaseData(userId),
    db
      .select({ count: count() })
      .from(companies)
      .where(eq(companies.userId, userId))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({
        draftCount: sql<number>`SUM(CASE WHEN ${documents.status} = 'draft' THEN 1 ELSE 0 END)`,
        publishedCount: sql<number>`SUM(CASE WHEN ${documents.status} = 'published' THEN 1 ELSE 0 END)`,
      })
      .from(documents)
      .where(and(eq(documents.userId, userId), eq(documents.type, "es"), ne(documents.status, "deleted")))
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  const plan = (profile.plan || "free") as "free" | "standard" | "pro";
  const [creditsInfo, remainingFreeFetches, remainingRagHtmlFreeUnits, remainingRagPdfFreeUnits] = await Promise.all([
    getCreditsInfo(userId),
    getRemainingFreeFetches(userId, null, plan),
    getRemainingCompanyRagHtmlFreeUnitsSafe(userId, plan),
    getRemainingCompanyRagPdfFreeUnitsSafe(userId, plan),
  ]);

  const draftCount = Number(esStatsRow?.draftCount ?? 0);
  const publishedCount = Number(esStatsRow?.publishedCount ?? 0);

  return {
    profile,
    companyCount: Number(companyCountRow?.count ?? 0),
    esStats: {
      draftCount,
      publishedCount,
      total: draftCount + publishedCount,
    },
    creditsInitialData: {
      type: "user",
      plan,
      balance: creditsInfo.balance,
      monthlyAllocation: creditsInfo.monthlyAllocation,
      nextResetAt: creditsInfo.nextResetAt.toISOString(),
      monthlyFree: {
        companyRagHtmlPages: {
          remaining: remainingRagHtmlFreeUnits,
          limit: getMonthlyRagHtmlFreeUnits(plan),
        },
        companyRagPdfPages: {
          remaining: remainingRagPdfFreeUnits,
          limit: getMonthlyRagPdfFreeUnits(plan),
        },
        selectionSchedule: {
          remaining: remainingFreeFetches,
          limit: getMonthlyScheduleFetchFreeLimit(plan),
        },
      },
      ragPdfLimits: {
        maxPagesIngest: getRagPdfMaxIngestPages(plan),
        maxPagesGoogleOcr: getRagPdfMaxGoogleOcrPages(plan),
        maxPagesMistralOcr: getRagPdfMaxMistralOcrPages(plan),
        summaryJa: getRagPdfIngestPolicySummaryJa(plan),
      },
    } satisfies CreditsInfo,
  };
}
