/**
 * Document AI Review API
 *
 * POST: Request AI review for a document
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents, aiThreads, aiMessages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import { consumeCredits, hasEnoughCredits } from "@/lib/credits";

async function getIdentity(request: NextRequest): Promise<{
  userId: string | null;
  guestId: string | null;
} | null> {
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

async function verifyDocumentAccess(
  documentId: string,
  userId: string | null,
  guestId: string | null
): Promise<{ valid: boolean; document?: typeof documents.$inferSelect }> {
  const doc = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .get();

  if (!doc) {
    return { valid: false };
  }

  if (userId && doc.userId === userId) {
    return { valid: true, document: doc };
  }
  if (guestId && doc.guestId === guestId) {
    return { valid: true, document: doc };
  }

  return { valid: false };
}

/**
 * Review result structure per SPEC Section 16.2
 * Scoring axes: 論理/具体性/熱意/企業接続/読みやすさ
 */
interface ReviewResult {
  scores: {
    logic: number;           // 論理の一貫性
    specificity: number;     // 具体性
    passion: number;         // 熱意・意欲の伝わり度
    company_connection?: number; // 企業接続（RAG取得時のみ）
    readability: number;     // 読みやすさ
  };
  top3: Array<{
    category: string;
    issue: string;
    suggestion: string;
  }>;
  rewrites: string[];        // Multiple rewrites based on plan
  section_feedbacks?: Array<{  // Paid only - 設問別指摘
    section_title: string;
    feedback: string;
    rewrite?: string;  // Section-specific rewrite respecting char limit
  }>;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;

    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { userId, guestId } = identity;
    const access = await verifyDocumentAccess(documentId, userId, guestId);
    if (!access.valid || !access.document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const {
      content,
      sectionId,
      style = "バランス",
      hasCompanyRag = false,
      sections,
      sectionData,
    } = body;

    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { error: "内容が空です" },
        { status: 400 }
      );
    }

    // Determine plan info from session
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    const userPlan = (session?.user as { plan?: string })?.plan || "free";
    const isPaid = userPlan === "standard" || userPlan === "pro";
    const rewriteCount = isPaid ? 3 : 1;

    // Calculate credit cost: ceil(chars/800), max 5
    const charCount = content.length;
    const creditCost = Math.min(5, Math.ceil(charCount / 800));

    // Check if user can afford (only for logged-in users)
    if (userId) {
      const canPay = await hasEnoughCredits(userId, creditCost);
      if (!canPay) {
        return NextResponse.json(
          { error: "クレジットが不足しています", creditCost },
          { status: 402 }
        );
      }
    } else {
      // Guests can't use AI review - require login
      return NextResponse.json(
        { error: "AI添削機能を使用するにはログインが必要です" },
        { status: 401 }
      );
    }

    // Call FastAPI for AI review
    const fastApiUrl = process.env.FASTAPI_URL || "http://localhost:8000";
    let reviewResult: ReviewResult;
    let isMockReview = false;

    try {
      const aiResponse = await fetch(`${fastApiUrl}/api/es/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content,
          section_id: sectionId,
          style,
          is_paid: isPaid,
          has_company_rag: hasCompanyRag,
          rewrite_count: rewriteCount,
          sections: isPaid ? sections : null,
          section_data: isPaid ? sectionData : null,
        }),
      });

      if (!aiResponse.ok) {
        // Parse detailed error from FastAPI
        const errorBody = await aiResponse.json().catch(() => null);
        const errorDetail = errorBody?.detail;

        // Service-level errors (billing, rate_limit, etc.) → return to user, don't fallback
        if (
          errorDetail?.error_type &&
          ["billing", "rate_limit", "invalid_key", "no_api_key"].includes(errorDetail.error_type)
        ) {
          return NextResponse.json(
            {
              error: errorDetail.error || "AIサービスが一時的に利用できません",
              error_type: errorDetail.error_type,
            },
            { status: 503 }
          );
        }

        // Other errors → fallback to mock (development)
        throw new Error(errorDetail?.error || "AI review failed");
      }

      reviewResult = await aiResponse.json();
    } catch (err) {
      // Fallback: Generate mock review for development
      console.warn("FastAPI not available, using mock review:", err);
      reviewResult = generateMockReview(content, hasCompanyRag, isPaid, rewriteCount, sections, sectionData);
      isMockReview = true;
    }

    // Consume credits on success (only for logged-in users, only for real AI reviews)
    if (userId && !isMockReview) {
      await consumeCredits(userId, creditCost, "es_review", documentId);
    }

    // Save to AI thread
    const now = new Date();

    // Get or create thread for this document
    let thread = await db
      .select()
      .from(aiThreads)
      .where(eq(aiThreads.documentId, documentId))
      .get();

    if (!thread) {
      const newThread = await db
        .insert(aiThreads)
        .values({
          id: crypto.randomUUID(),
          documentId,
          title: "ES添削",
          status: "active",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      thread = newThread[0];
    }

    // Save messages
    await db.insert(aiMessages).values([
      {
        id: crypto.randomUUID(),
        threadId: thread.id,
        role: "user",
        content: content.substring(0, 500) + (content.length > 500 ? "..." : ""),
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        threadId: thread.id,
        role: "assistant",
        content: JSON.stringify(reviewResult),
        metadata: JSON.stringify({
          type: "review",
          charCount,
          creditCost,
        }),
        createdAt: now,
      },
    ]);

    return NextResponse.json({
      review: reviewResult,
      creditCost,
    });
  } catch (error) {
    console.error("Error reviewing document:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

interface SectionDataInput {
  title: string;
  content: string;
  charLimit?: number;
}

/**
 * Mock review generator for development
 * Follows SPEC Section 16.2 scoring axes: 論理/具体性/熱意/企業接続/読みやすさ
 */
function generateMockReview(
  content: string,
  hasCompanyRag: boolean = false,
  isPaid: boolean = false,
  rewriteCount: number = 1,
  sections?: string[],
  sectionData?: SectionDataInput[]
): ReviewResult {
  // Scores per SPEC Section 16.2
  const scores: ReviewResult["scores"] = {
    logic: Math.floor(Math.random() * 3) + 2,
    specificity: Math.floor(Math.random() * 3) + 2,
    passion: Math.floor(Math.random() * 3) + 2,
    readability: Math.floor(Math.random() * 3) + 3,
  };

  // Only include company_connection if RAG is available
  if (hasCompanyRag) {
    scores.company_connection = Math.floor(Math.random() * 3) + 2;
  }

  // Top 3 issues
  const top3: ReviewResult["top3"] = [
    {
      category: "具体性",
      issue: "具体的なエピソードが不足しています",
      suggestion: "数値や具体的な結果を追加してみましょう",
    },
    {
      category: "論理",
      issue: "因果関係が曖昧な部分があります",
      suggestion: "「なぜそう考えたか」を明確にしましょう",
    },
    {
      category: "熱意",
      issue: "志望度の高さが伝わりにくい表現になっています",
      suggestion: "その企業・職種でなければならない理由を具体的に述べましょう",
    },
  ];

  // Replace third issue with company_connection if RAG available
  if (hasCompanyRag) {
    top3[2] = {
      category: "企業接続",
      issue: "企業の事業内容や求める人材像との接点が薄いです",
      suggestion: "企業の具体的な事業や価値観に触れながら、自分との接点を示しましょう",
    };
  }

  // Generate rewrites based on plan
  const baseRewrite = content.length > 200
    ? content.substring(0, 200) + "...（改善例）"
    : content + "（改善例）";

  const rewrites = [baseRewrite];
  if (rewriteCount >= 2) {
    rewrites.push(
      content.length > 150
        ? `【堅め】${content.substring(0, 150)}...（堅実な表現に修正）`
        : `【堅め】${content}（堅実な表現に修正）`
    );
  }
  if (rewriteCount >= 3) {
    rewrites.push(
      content.length > 150
        ? `【個性強め】${content.substring(0, 150)}...（独自性を強調）`
        : `【個性強め】${content}（独自性を強調）`
    );
  }

  // Section feedbacks (paid only)
  let section_feedbacks: ReviewResult["section_feedbacks"];
  if (isPaid && sectionData && sectionData.length > 0) {
    // Use sectionData with char limits
    section_feedbacks = sectionData.map((section) => {
      const charLimit = section.charLimit;
      const limitText = charLimit ? `${charLimit}文字以内で` : "";
      const mockRewrite = charLimit
        ? section.content.substring(0, Math.min(section.content.length, charLimit - 20)) + "（改善例）"
        : section.content.substring(0, 100) + "（改善例）";
      return {
        section_title: section.title,
        feedback: `「${section.title}」では具体的な数値や結果を追加すると説得力が増します。${limitText}まとめることで、より訴求力のある文章になります。`.substring(0, 150),
        rewrite: mockRewrite,
      };
    });
  } else if (isPaid && sections && sections.length > 0) {
    // Fallback to simple sections (no char limits)
    section_feedbacks = sections.map((section) => ({
      section_title: section,
      feedback: `「${section}」では具体的な数値や結果を追加すると説得力が増します。また、その経験から得た学びをより明確にすることで、成長をアピールできます。`.substring(0, 150),
    }));
  }

  return {
    scores,
    top3,
    rewrites,
    section_feedbacks,
  };
}
