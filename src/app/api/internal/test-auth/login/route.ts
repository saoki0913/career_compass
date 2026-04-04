import { randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { serializeSignedCookie } from "better-call";
import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import {
  getBetterAuthSessionCookieAttributes,
  getBetterAuthSessionCookieName,
  isCiE2EAuthEnabled,
} from "@/lib/auth/ci-e2e";
import { db } from "@/lib/db";
import { sessions, userProfiles, users } from "@/lib/db/schema";
import type { PlanType } from "@/lib/stripe/config";

const DEFAULT_TEST_EMAIL = "ci-e2e-user@shupass.jp";
const DEFAULT_TEST_NAME = "CI E2E User";
const DEFAULT_TEST_PLAN: PlanType = "standard";

function parseBearerSecret(request: NextRequest) {
  const header = request.headers.get("authorization")?.trim();
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim();
}

function hasMatchingSecret(expected: string, actual: string | null) {
  if (!actual) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(actual, "utf8");
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function POST(request: NextRequest) {
  const authSecret = process.env.CI_E2E_AUTH_SECRET?.trim();
  const betterAuthSecret = process.env.BETTER_AUTH_SECRET?.trim();

  if (!isCiE2EAuthEnabled() || !authSecret || !betterAuthSecret) {
    return createApiErrorResponse(request, {
      status: 404,
      code: "CI_TEST_AUTH_DISABLED",
      userMessage: "このエンドポイントは利用できません。",
      action: "環境設定を確認してください。",
    });
  }

  if (!hasMatchingSecret(authSecret, parseBearerSecret(request))) {
    return createApiErrorResponse(request, {
      status: 401,
      code: "CI_TEST_AUTH_UNAUTHORIZED",
      userMessage: "認証に失敗しました。",
      action: "GitHub Actions secret を確認してください。",
    });
  }

  try {
    const email = process.env.CI_E2E_TEST_EMAIL?.trim() || DEFAULT_TEST_EMAIL;
    const name = process.env.CI_E2E_TEST_NAME?.trim() || DEFAULT_TEST_NAME;
    const requestedPlan = process.env.CI_E2E_TEST_PLAN?.trim();
    const plan: PlanType =
      requestedPlan === "free" || requestedPlan === "standard" || requestedPlan === "pro"
        ? requestedPlan
        : DEFAULT_TEST_PLAN;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { userId, sessionToken } = await db.transaction(async (tx) => {
      const [existingUser] = await tx.select().from(users).where(eq(users.email, email)).limit(1);
      const resolvedUserId = existingUser?.id ?? randomUUID();

      if (existingUser) {
        await tx
          .update(users)
          .set({
            name,
            emailVerified: true,
            updatedAt: now,
          })
          .where(eq(users.id, existingUser.id));
      } else {
        await tx.insert(users).values({
          id: resolvedUserId,
          email,
          name,
          emailVerified: true,
          image: null,
          createdAt: now,
          updatedAt: now,
        });
      }

      const [existingProfile] = await tx
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, resolvedUserId))
        .limit(1);

      if (existingProfile) {
        await tx
          .update(userProfiles)
          .set({
            plan,
            planSelectedAt: existingProfile.planSelectedAt ?? now,
            onboardingCompleted: true,
            updatedAt: now,
          })
          .where(eq(userProfiles.userId, resolvedUserId));
      } else {
        await tx.insert(userProfiles).values({
          id: randomUUID(),
          userId: resolvedUserId,
          plan,
          planSelectedAt: now,
          onboardingCompleted: true,
          createdAt: now,
          updatedAt: now,
        });
      }

      await tx.delete(sessions).where(eq(sessions.userId, resolvedUserId));

      const token = randomBytes(32).toString("hex");

      await tx.insert(sessions).values({
        id: randomUUID(),
        userId: resolvedUserId,
        token,
        expiresAt,
        ipAddress:
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          request.headers.get("x-real-ip")?.trim() ??
          "127.0.0.1",
        userAgent: request.headers.get("user-agent") ?? "ci-e2e-auth",
        createdAt: now,
        updatedAt: now,
      });

      return {
        userId: resolvedUserId,
        sessionToken: token,
      };
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: userId,
        email,
      },
    });

    response.headers.append(
      "set-cookie",
      await serializeSignedCookie(
        getBetterAuthSessionCookieName(),
        sessionToken,
        betterAuthSecret,
        getBetterAuthSessionCookieAttributes()
      )
    );

    return response;
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "CI_TEST_AUTH_FAILED",
      userMessage: "CI 用ログインに失敗しました。",
      action: "ログを確認して再実行してください。",
      error,
      logContext: "ci-test-auth-login",
    });
  }
}
