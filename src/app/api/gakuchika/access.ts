import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { db } from "@/lib/db";
import { gakuchikaContents } from "@/lib/db/schema";

export interface Identity {
  userId: string | null;
  guestId: string | null;
}

export async function getIdentity(request: NextRequest): Promise<Identity | null> {
  return getRequestIdentity(request);
}

export async function verifyGakuchikaAccess(
  gakuchikaId: string,
  userId: string | null,
  guestId: string | null,
): Promise<boolean> {
  const [gakuchika] = await db
    .select()
    .from(gakuchikaContents)
    .where(eq(gakuchikaContents.id, gakuchikaId))
    .limit(1);

  if (!gakuchika) return false;
  if (userId && gakuchika.userId === userId) return true;
  if (guestId && gakuchika.guestId === guestId) return true;
  return false;
}
