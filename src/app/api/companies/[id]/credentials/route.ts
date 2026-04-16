/**
 * Company Credentials API
 *
 * GET: Retrieve decrypted mypage credentials for a company
 *
 * This endpoint exists to serve credentials on-demand,
 * preventing them from being exposed in general company list/detail responses.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";
import { logError } from "@/lib/logger";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    // Authenticate
    const identity = await getRequestIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    const { userId, guestId } = identity;

    // Fetch only credential fields + ownership fields
    const [company] = await db
      .select({
        id: companies.id,
        userId: companies.userId,
        guestId: companies.guestId,
        mypageLoginId: companies.mypageLoginId,
        mypagePassword: companies.mypagePassword,
      })
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);

    if (!company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (userId && company.userId !== userId) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }
    if (guestId && company.guestId !== guestId) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    // Decrypt password and return credentials
    let decryptedPassword: string | null = null;
    if (company.mypagePassword) {
      try {
        decryptedPassword = decrypt(company.mypagePassword);
      } catch {
        logError("decrypt-credential", new Error("Failed to decrypt password, possibly stored as plaintext"));
        decryptedPassword = null;
      }
    }

    return NextResponse.json({
      mypageLoginId: company.mypageLoginId || null,
      mypagePassword: decryptedPassword,
    });
  } catch (error) {
    logError("fetch-credentials", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
