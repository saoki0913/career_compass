/**
 * ES Templates Seed API
 *
 * POST: Seed 5 initial system templates
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { esTemplates } from "@/lib/db/schema";
import { eq, isNull, or } from "drizzle-orm";

// SPEC.md Section 16.9 準拠の初期テンプレート5種
const SYSTEM_TEMPLATES = [
  {
    title: "インターン①（夏想定）",
    description: "夏インターン向けのESテンプレート",
    industry: null,
    isPublic: true,
    questions: JSON.stringify([
      { id: crypto.randomUUID(), question: "インターンの応募理由を教えてください。", maxLength: 400 },
      { id: crypto.randomUUID(), question: "学生時代に力を入れたことを教えてください。", maxLength: 400 },
      { id: crypto.randomUUID(), question: "チームで取り組んだ経験を教えてください。", maxLength: 400 },
    ]),
    tags: JSON.stringify(["インターン", "夏"]),
  },
  {
    title: "インターン②（秋想定）",
    description: "秋インターン向けのESテンプレート",
    industry: null,
    isPublic: true,
    questions: JSON.stringify([
      { id: crypto.randomUUID(), question: "当社インターンを志望する理由を教えてください。", maxLength: 400 },
      { id: crypto.randomUUID(), question: "あなたの強みを教えてください。", maxLength: 400 },
      { id: crypto.randomUUID(), question: "課題を解決した経験を教えてください。", maxLength: 400 },
    ]),
    tags: JSON.stringify(["インターン", "秋"]),
  },
  {
    title: "インターン③（冬想定）",
    description: "冬インターン向けのESテンプレート",
    industry: null,
    isPublic: true,
    questions: JSON.stringify([
      { id: crypto.randomUUID(), question: "当社インターンを選んだ理由を教えてください。", maxLength: 400 },
      { id: crypto.randomUUID(), question: "志望職種に必要な力は何か教えてください。", maxLength: 400 },
      { id: crypto.randomUUID(), question: "インターンで挑戦したいことを教えてください。", maxLength: 400 },
    ]),
    tags: JSON.stringify(["インターン", "冬"]),
  },
  {
    title: "早期選考",
    description: "早期選考向けのESテンプレート",
    industry: null,
    isPublic: true,
    questions: JSON.stringify([
      { id: crypto.randomUUID(), question: "当社を志望する理由を教えてください。", maxLength: 400 },
      { id: crypto.randomUUID(), question: "入社後にやりたいことを教えてください。", maxLength: 400 },
      { id: crypto.randomUUID(), question: "会社選びの軸を教えてください。", maxLength: 400 },
    ]),
    tags: JSON.stringify(["早期選考", "本選考"]),
  },
  {
    title: "本選考",
    description: "本選考向けのESテンプレート",
    industry: null,
    isPublic: true,
    questions: JSON.stringify([
      { id: crypto.randomUUID(), question: "学生時代に最も力を入れたことを教えてください。", maxLength: 400 },
      { id: crypto.randomUUID(), question: "自己PRを教えてください。", maxLength: 400 },
      { id: crypto.randomUUID(), question: "当社・志望職種を選ぶ理由を教えてください。", maxLength: 400 },
    ]),
    tags: JSON.stringify(["本選考"]),
  },
];

export async function POST() {
  try {
    // Check if system templates already exist (userId = null means system template)
    const existing = await db
      .select()
      .from(esTemplates)
      .where(
        or(
          isNull(esTemplates.userId),
          eq(esTemplates.userId, "")
        )
      );

    if (existing.length >= 5) {
      return NextResponse.json({
        message: "System templates already seeded",
        count: existing.length,
      });
    }

    const now = new Date();
    const seeded: string[] = [];

    for (const tmpl of SYSTEM_TEMPLATES) {
      const id = crypto.randomUUID();
      await db.insert(esTemplates).values({
        id,
        userId: null, // null = system template
        guestId: null,
        ...tmpl,
        viewCount: 0,
        copyCount: 0,
        likeCount: 0,
        isAnonymous: false,
        authorDisplayName: "ウカルン運営",
        shareToken: null,
        shareExpiresAt: null,
        language: "ja",
        createdAt: now,
        updatedAt: now,
      });
      seeded.push(id);
    }

    return NextResponse.json({
      message: "Seeded 5 system templates",
      count: seeded.length,
      templateIds: seeded,
    });
  } catch (error) {
    console.error("Error seeding templates:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
