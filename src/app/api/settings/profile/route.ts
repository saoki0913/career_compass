/**
 * Settings Profile API
 *
 * GET: Get user profile
 * PUT: Update user profile
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { credits, subscriptions, userProfiles, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { logError } from "@/lib/logger";
import { getSettingsPageData } from "@/lib/server/account-loaders";
import { getBillingPeriodFromPriceId } from "@/lib/stripe/config";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        developerMessage: "Authentication required",
      });
    }

    const userId = session.user.id;
    const { profile } = await getSettingsPageData(userId);

    return NextResponse.json({
      profile,
    });
  } catch (error) {
    logError("fetch-profile", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "SETTINGS_PROFILE_FETCH_FAILED",
      userMessage: "プロフィールを読み込めませんでした。",
      action: "時間をおいて、もう一度お試しください。",
      developerMessage: "Failed to fetch profile",
      error,
    });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const body = await request.json();
    const { name, university, faculty, graduationYear, targetIndustries, targetJobTypes } = body;

    // Input validation constants
    const MAX_STRING_LENGTH = 100;
    const MAX_ARRAY_SIZE = 20;
    const MAX_ARRAY_ITEM_LENGTH = 50;

    // Update user name if provided
    if (name !== undefined) {
      if (!name || !name.trim()) {
        return createApiErrorResponse(request, {
          status: 400,
          code: "SETTINGS_PROFILE_NAME_REQUIRED",
          userMessage: "名前を入力してください。",
          developerMessage: "Name is required",
        });
      }
      if (typeof name !== "string" || name.trim().length > MAX_STRING_LENGTH) {
        return createApiErrorResponse(request, {
          status: 400,
          code: "SETTINGS_PROFILE_NAME_TOO_LONG",
          userMessage: `名前は${MAX_STRING_LENGTH}文字以内にしてください。`,
          developerMessage: "Name exceeds maximum length",
        });
      }
      await db
        .update(users)
        .set({ name: name.trim(), updatedAt: new Date() })
        .where(eq(users.id, userId));
    }

    // Validate string fields
    for (const [field, value] of Object.entries({ university, faculty })) {
      if (value !== undefined && value !== null) {
        if (typeof value !== "string" || value.trim().length > MAX_STRING_LENGTH) {
          return createApiErrorResponse(request, {
            status: 400,
            code: "SETTINGS_PROFILE_INVALID_TEXT",
            userMessage: "入力内容を確認してください。",
            action: `${MAX_STRING_LENGTH}文字以内で入力してください。`,
            developerMessage: `${field} exceeds maximum length`,
          });
        }
      }
    }

    // Validate array fields
    for (const [field, value] of Object.entries({ targetIndustries, targetJobTypes })) {
      if (value !== undefined && value !== null) {
        if (!Array.isArray(value) || value.length > MAX_ARRAY_SIZE) {
          return createApiErrorResponse(request, {
            status: 400,
            code: "SETTINGS_PROFILE_INVALID_LIST",
            userMessage: "選択内容を確認してください。",
            action: `${MAX_ARRAY_SIZE}件以内で選択してください。`,
            developerMessage: `${field} exceeds maximum array size`,
          });
        }
        for (const item of value) {
          if (typeof item !== "string" || item.length > MAX_ARRAY_ITEM_LENGTH) {
            return createApiErrorResponse(request, {
              status: 400,
              code: "SETTINGS_PROFILE_INVALID_LIST_ITEM",
              userMessage: "選択内容を確認してください。",
              action: `${MAX_ARRAY_ITEM_LENGTH}文字以内の項目を選択してください。`,
              developerMessage: `${field} contains an invalid item`,
            });
          }
        }
      }
    }

    // Check if profile exists
    const [existingProfile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    const profileData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (university !== undefined) {
      profileData.university = university?.trim() || null;
    }
    if (faculty !== undefined) {
      profileData.faculty = faculty?.trim() || null;
    }
    if (graduationYear !== undefined) {
      const year = parseInt(graduationYear);
      if (graduationYear && (isNaN(year) || year < 2020 || year > 2040)) {
        return createApiErrorResponse(request, {
          status: 400,
          code: "SETTINGS_PROFILE_INVALID_GRADUATION_YEAR",
          userMessage: "卒業年度を確認してください。",
          developerMessage: "Invalid graduation year",
        });
      }
      profileData.graduationYear = graduationYear ? year : null;
    }
    if (targetIndustries !== undefined) {
      profileData.targetIndustries = Array.isArray(targetIndustries)
        ? JSON.stringify(targetIndustries)
        : null;
    }
    if (targetJobTypes !== undefined) {
      profileData.targetJobTypes = Array.isArray(targetJobTypes)
        ? JSON.stringify(targetJobTypes)
        : null;
    }

    if (existingProfile) {
      await db
        .update(userProfiles)
        .set(profileData)
        .where(eq(userProfiles.userId, userId));
    } else {
      await db.insert(userProfiles).values({
        id: crypto.randomUUID(),
        userId,
        plan: "free",
        ...profileData,
        createdAt: new Date(),
      });
    }

    const [user, profile, creditRow, subscriptionRow] = await Promise.all([
      db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .then((rows) => rows[0]),
      db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1)
        .then((rows) => rows[0]),
      db
        .select()
        .from(credits)
        .where(eq(credits.userId, userId))
        .limit(1)
        .then((rows) => rows[0]),
      db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1)
        .then((rows) => rows[0]),
    ]);

    return NextResponse.json({
      profile: {
        name: user?.name,
        email: user?.email,
        image: user?.image,
        plan: profile?.plan || "free",
        university: profile?.university || null,
        faculty: profile?.faculty || null,
        graduationYear: profile?.graduationYear || null,
        targetIndustries: profile?.targetIndustries
          ? JSON.parse(profile.targetIndustries)
          : [],
        targetJobTypes: profile?.targetJobTypes
          ? JSON.parse(profile.targetJobTypes)
          : [],
        creditsBalance: creditRow?.balance ?? 0,
        currentPeriodEnd: subscriptionRow?.currentPeriodEnd?.toISOString() ?? null,
        subscriptionStatus: subscriptionRow?.status ?? null,
        billingPeriod: subscriptionRow?.stripePriceId
          ? getBillingPeriodFromPriceId(subscriptionRow.stripePriceId)
          : null,
        cancelAtPeriodEnd: subscriptionRow?.cancelAtPeriodEnd ?? false,
      },
    });
  } catch (error) {
    logError("update-profile", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "SETTINGS_PROFILE_UPDATE_FAILED",
      userMessage: "プロフィールを保存できませんでした。",
      action: "時間をおいて、もう一度お試しください。",
      developerMessage: "Failed to update profile",
      error,
    });
  }
}
