import { asc, eq, sql } from "drizzle-orm";

import type { RequestIdentity } from "@/app/api/_shared/request-identity";
import { db } from "@/lib/db";
import {
  companies,
  motivationConversations,
  userProfiles,
} from "@/lib/db/schema";
import {
  buildCompanyWhere,
  toNumber,
} from "./loader-helpers";

export async function getActivationData(identity: RequestIdentity) {
  const companyWhere = buildCompanyWhere(identity);
  const motivationWhere = identity.userId
    ? eq(motivationConversations.userId, identity.userId)
    : eq(motivationConversations.guestId, identity.guestId!);

  const [companyCountRows, firstCompanyRows, motivationCountRows, profileRows] = await Promise.all([
    db.select({ count: sql`count(*)` }).from(companies).where(companyWhere),
    db
      .select({ id: companies.id })
      .from(companies)
      .where(companyWhere)
      .orderBy(asc(companies.createdAt))
      .limit(1),
    db
      .select({ count: sql`count(*)` })
      .from(motivationConversations)
      .where(motivationWhere),
    identity.userId
      ? db
          .select({ onboardingCompleted: userProfiles.onboardingCompleted })
          .from(userProfiles)
          .where(eq(userProfiles.userId, identity.userId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const companyCount = toNumber(companyCountRows[0]?.count);
  const motivationCount = toNumber(motivationCountRows[0]?.count);
  const firstCompanyId = firstCompanyRows[0]?.id ?? null;
  const profileCompleted = identity.userId ? Boolean(profileRows[0]?.onboardingCompleted) : false;
  const profileHref = identity.userId ? "/onboarding" : "/login?redirect=/onboarding";

  const steps = {
    company: {
      label: "企業を登録して締切管理を始める",
      done: companyCount > 0,
      count: companyCount,
      href: "/companies/new",
    },
    motivation: {
      label: "志望動機をAIでたたき台化する",
      done: motivationCount > 0,
      count: motivationCount,
      href: firstCompanyId ? `/companies/${firstCompanyId}/motivation` : "/companies/new",
    },
    profile: {
      label: identity.userId ? "プロフィールを整えて提案精度を上げる" : "ログインして進捗を保存する",
      done: profileCompleted,
      count: profileCompleted ? 1 : 0,
      href: profileHref,
    },
  } as const;

  const ordered = [steps.company, steps.motivation, steps.profile];
  const nextAction = ordered.find((step) => !step.done) ?? null;

  return {
    steps,
    completedSteps: ordered.filter((step) => step.done).length,
    totalSteps: ordered.length,
    nextAction: nextAction ? { href: nextAction.href, label: nextAction.label } : null,
  };
}
