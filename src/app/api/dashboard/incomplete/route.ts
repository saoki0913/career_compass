/**
 * Dashboard Incomplete Items API
 *
 * GET: Returns incomplete/in-progress items for the Zeigarnik Effect UX enhancement
 * - Draft ES documents
 * - In-progress Gakuchika sessions (no summary yet)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents, gakuchikaContents, companies } from "@/lib/db/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";

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

export async function GET(request: NextRequest) {
  try {
    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { userId, guestId } = identity;

    // Fetch draft ES documents (status = "draft", type = "es")
    const draftESDocuments = await db
      .select({
        id: documents.id,
        title: documents.title,
        companyName: companies.name,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .leftJoin(companies, eq(documents.companyId, companies.id))
      .where(
        and(
          userId
            ? eq(documents.userId, userId)
            : guestId
            ? eq(documents.guestId, guestId)
            : isNull(documents.id),
          eq(documents.status, "draft"),
          eq(documents.type, "es")
        )
      )
      .orderBy(desc(documents.updatedAt))
      .limit(5);

    // Fetch in-progress gakuchika (no summary yet)
    const inProgressGakuchika = await db
      .select({
        id: gakuchikaContents.id,
        title: gakuchikaContents.title,
        updatedAt: gakuchikaContents.updatedAt,
      })
      .from(gakuchikaContents)
      .where(
        and(
          userId
            ? eq(gakuchikaContents.userId, userId)
            : guestId
            ? eq(gakuchikaContents.guestId, guestId)
            : isNull(gakuchikaContents.id),
          isNull(gakuchikaContents.summary)
        )
      )
      .orderBy(desc(gakuchikaContents.updatedAt))
      .limit(3);

    return NextResponse.json({
      draftES: draftESDocuments.map((doc) => ({
        id: doc.id,
        title: doc.title,
        company: doc.companyName,
        updatedAt: doc.updatedAt?.toISOString(),
      })),
      draftESCount: draftESDocuments.length,
      inProgressGakuchika: inProgressGakuchika.map((g) => ({
        id: g.id,
        title: g.title,
        updatedAt: g.updatedAt?.toISOString(),
      })),
      inProgressGakuchikaCount: inProgressGakuchika.length,
    });
  } catch (error) {
    console.error("Error fetching incomplete items:", error);
    return NextResponse.json(
      { error: "Failed to fetch incomplete items" },
      { status: 500 }
    );
  }
}
