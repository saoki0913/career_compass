/**
 * Onboarding API
 *
 * POST: Save onboarding data and mark as completed
 * GET: Get current onboarding status and data
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";

// Onboarding data type
interface OnboardingData {
  university?: string;
  faculty?: string;
  graduationYear?: number;
  targetIndustries?: string[];
  targetJobTypes?: string[];
}

export async function POST(request: NextRequest) {
  try {
    // Get the authenticated user session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const data: OnboardingData = await request.json();
    const userId = session.user.id;

    // Validate graduation year if provided
    if (data.graduationYear !== undefined) {
      const currentYear = new Date().getFullYear();
      if (data.graduationYear < currentYear || data.graduationYear > currentYear + 6) {
        return NextResponse.json(
          { error: "Invalid graduation year" },
          { status: 400 }
        );
      }
    }

    // Check if profile exists
    const existingProfile = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .get();

    const now = new Date();

    // Prepare update data
    const updateData = {
      university: data.university || null,
      faculty: data.faculty || null,
      graduationYear: data.graduationYear || null,
      targetIndustries: data.targetIndustries ? JSON.stringify(data.targetIndustries) : null,
      targetJobTypes: data.targetJobTypes ? JSON.stringify(data.targetJobTypes) : null,
      onboardingCompleted: true,
      updatedAt: now,
    };

    if (existingProfile) {
      // Update existing profile
      await db
        .update(userProfiles)
        .set(updateData)
        .where(eq(userProfiles.userId, userId));
    } else {
      // This shouldn't happen normally (profile should exist after plan selection)
      // But handle it gracefully by creating a new profile
      await db.insert(userProfiles).values({
        id: crypto.randomUUID(),
        userId,
        plan: "free",
        planSelectedAt: now,
        ...updateData,
        createdAt: now,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Onboarding completed",
    });
  } catch (error) {
    console.error("Error saving onboarding data:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // Get the authenticated user session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const profile = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, session.user.id))
      .get();

    if (!profile) {
      return NextResponse.json({
        onboardingCompleted: false,
        data: null,
      });
    }

    // Parse JSON fields
    let targetIndustries: string[] = [];
    let targetJobTypes: string[] = [];

    try {
      if (profile.targetIndustries) {
        targetIndustries = JSON.parse(profile.targetIndustries);
      }
    } catch {
      // Ignore parse errors
    }

    try {
      if (profile.targetJobTypes) {
        targetJobTypes = JSON.parse(profile.targetJobTypes);
      }
    } catch {
      // Ignore parse errors
    }

    return NextResponse.json({
      onboardingCompleted: profile.onboardingCompleted,
      data: {
        university: profile.university,
        faculty: profile.faculty,
        graduationYear: profile.graduationYear,
        targetIndustries,
        targetJobTypes,
      },
    });
  } catch (error) {
    console.error("Error getting onboarding data:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
