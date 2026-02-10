/**
 * Document AI Review SSE Stream API
 *
 * POST: Request AI review with real-time progress streaming
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents, companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import { reserveCredits, confirmReservation, cancelReservation, calculateESReviewCost } from "@/lib/credits";
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";
import type { TemplateType } from "@/hooks/useESReview";

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
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;

    const identity = await getIdentity(request);
    if (!identity) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const { userId, guestId } = identity;

    // Rate limiting check
    const rateLimitKey = createRateLimitKey("review", userId, guestId);
    const rateLimit = await checkRateLimit(rateLimitKey, RATE_LIMITS.review);
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({
          error: "リクエストが多すぎます。しばらく待ってから再試行してください。",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(rateLimit.resetIn),
            "X-RateLimit-Remaining": String(rateLimit.remaining),
          },
        }
      );
    }

    const access = await verifyDocumentAccess(documentId, userId, guestId);
    if (!access.valid || !access.document) {
      return new Response(
        JSON.stringify({ error: "Document not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await request.json();
    const {
      content,
      sectionId,
      style = "バランス",
      hasCompanyRag = false,
      companyId: requestCompanyId,
      sections,
      sectionData,
      reviewMode = "full",
      sectionTitle,
      sectionCharLimit,
      templateType,
      internName,
      roleName,
    } = body as {
      content: string;
      sectionId?: string;
      style?: string;
      hasCompanyRag?: boolean;
      companyId?: string;
      sections?: string[];
      sectionData?: Array<{ title: string; content: string; charLimit?: number }>;
      reviewMode?: string;
      sectionTitle?: string;
      sectionCharLimit?: number;
      templateType?: TemplateType;
      internName?: string;
      roleName?: string;
    };

    // Verify requestCompanyId ownership to prevent IDOR
    let companyId = access.document.companyId;
    if (requestCompanyId && requestCompanyId !== access.document.companyId) {
      const [ownedCompany] = await db
        .select({ id: companies.id, userId: companies.userId, guestId: companies.guestId })
        .from(companies)
        .where(eq(companies.id, requestCompanyId))
        .limit(1);
      if (
        ownedCompany &&
        ((userId && ownedCompany.userId === userId) ||
         (guestId && ownedCompany.guestId === guestId))
      ) {
        companyId = requestCompanyId;
      }
      // else: silently fall back to document's companyId (safe default)
    } else if (requestCompanyId) {
      companyId = requestCompanyId;
    }

    // Fetch company info for template review
    let companyInfo: { name: string | null; industry: string | null } = {
      name: null,
      industry: null,
    };
    if (companyId && templateType) {
      const [company] = await db
        .select({ name: companies.name, industry: companies.industry })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
      if (company) {
        companyInfo = { name: company.name, industry: company.industry };
      }
    }

    if (!content || content.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "内容が空です" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Determine plan info from session
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    const userPlan = (session?.user as { plan?: string })?.plan || "free";
    const isPaid = userPlan === "standard" || userPlan === "pro";
    const rewriteCount = isPaid ? Number(process.env.ES_REWRITE_COUNT || "1") : 1;

    // Calculate credit cost: max(2, ceil(chars/800)), max 5
    const charCount = content.length;
    const creditCost = calculateESReviewCost(charCount);

    // Reserve credits upfront (only for logged-in users)
    // Credits are deducted now and refunded if the stream fails.
    let reservationId: string | null = null;
    if (userId) {
      const reservation = await reserveCredits(userId, creditCost, "es_review", documentId, `ES添削: ${documentId}`);
      if (!reservation.success) {
        return new Response(
          JSON.stringify({ error: "クレジットが不足しています", creditCost }),
          { status: 402, headers: { "Content-Type": "application/json" } }
        );
      }
      reservationId = reservation.reservationId;
    } else {
      // Guests can't use AI review - require login
      return new Response(
        JSON.stringify({ error: "AI添削機能を使用するにはログインが必要です" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Call FastAPI SSE streaming endpoint
    const fastApiUrl = process.env.FASTAPI_URL || "http://localhost:8000";

    const aiResponse = await fetch(`${fastApiUrl}/api/es/review/stream`, {
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
        company_id: companyId || null,
        rewrite_count: rewriteCount,
        sections: isPaid ? sections : null,
        section_data: isPaid ? sectionData : null,
        review_mode: reviewMode,
        section_title: sectionTitle || null,
        section_char_limit: sectionCharLimit || null,
        template_request: templateType
          ? {
              template_type: templateType,
              company_name: companyInfo.name,
              industry: companyInfo.industry,
              question: sectionTitle || "",
              answer: content,
              char_min: sectionCharLimit
                ? sectionCharLimit -
                  Math.max(20, Math.floor(sectionCharLimit * 0.1))
                : null,
              char_max: sectionCharLimit || null,
              intern_name: internName || null,
              role_name: roleName || null,
            }
          : null,
        // SSE specific: include document_id for credit consumption on completion
        document_id: documentId,
        user_id: userId,
        credit_cost: creditCost,
      }),
    });

    if (!aiResponse.ok) {
      // FastAPI rejected the request — refund reserved credits
      if (reservationId) {
        await cancelReservation(reservationId).catch(console.error);
      }
      const errorBody = await aiResponse.json().catch(() => null);
      return new Response(
        JSON.stringify({
          error: errorBody?.detail?.error || "AI review failed",
          error_type: errorBody?.detail?.error_type,
        }),
        { status: aiResponse.status, headers: { "Content-Type": "application/json" } }
      );
    }

    // Proxy the SSE stream, intercepting events to manage credit reservation
    const capturedReservationId = reservationId;
    let creditConfirmed = false;

    const { readable, writable } = new TransformStream({
      async transform(chunk, controller) {
        controller.enqueue(chunk);

        // Check for "complete" event in the SSE data to confirm credits
        if (!creditConfirmed && capturedReservationId) {
          const text = new TextDecoder().decode(chunk);
          if (text.includes('event: complete') || text.includes('"type":"complete"') || text.includes('"type": "complete"')) {
            creditConfirmed = true;
            await confirmReservation(capturedReservationId).catch(console.error);
          }
        }
      },
      async flush() {
        // If stream ended without a "complete" event, cancel the reservation
        if (!creditConfirmed && capturedReservationId) {
          await cancelReservation(capturedReservationId).catch(console.error);
        }
      },
    });

    aiResponse.body!.pipeTo(writable).catch(() => {
      // Stream error — cancel reservation if not yet confirmed
      if (!creditConfirmed && capturedReservationId) {
        cancelReservation(capturedReservationId).catch(console.error);
      }
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("Error in review stream:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
