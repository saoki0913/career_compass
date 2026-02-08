/**
 * Settings Profile API
 *
 * GET: Get user profile
 * PUT: Update user profile
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userProfiles, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { logError } from "@/lib/logger";

export async function GET(request: NextRequest) {
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

    // Get user and profile
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();

    const profile = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .get();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      profile: {
        name: user.name,
        email: user.email,
        image: user.image,
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
      },
    });
  } catch (error) {
    logError("fetch-profile", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
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
        return NextResponse.json(
          { error: "名前は必須です" },
          { status: 400 }
        );
      }
      if (typeof name !== "string" || name.trim().length > MAX_STRING_LENGTH) {
        return NextResponse.json(
          { error: `名前は${MAX_STRING_LENGTH}文字以内にしてください` },
          { status: 400 }
        );
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
          return NextResponse.json(
            { error: `${field}は${MAX_STRING_LENGTH}文字以内にしてください` },
            { status: 400 }
          );
        }
      }
    }

    // Validate array fields
    for (const [field, value] of Object.entries({ targetIndustries, targetJobTypes })) {
      if (value !== undefined && value !== null) {
        if (!Array.isArray(value) || value.length > MAX_ARRAY_SIZE) {
          return NextResponse.json(
            { error: `${field}は${MAX_ARRAY_SIZE}件以内にしてください` },
            { status: 400 }
          );
        }
        for (const item of value) {
          if (typeof item !== "string" || item.length > MAX_ARRAY_ITEM_LENGTH) {
            return NextResponse.json(
              { error: `${field}の各項目は${MAX_ARRAY_ITEM_LENGTH}文字以内の文字列にしてください` },
              { status: 400 }
            );
          }
        }
      }
    }

    // Check if profile exists
    const existingProfile = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .get();

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
        return NextResponse.json(
          { error: "無効な卒業年度です" },
          { status: 400 }
        );
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

    // Get updated profile
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();

    const profile = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .get();

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
      },
    });
  } catch (error) {
    logError("update-profile", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
