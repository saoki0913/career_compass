import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { revokeGoogleOAuthToken } from "@/lib/calendar/google";

export async function revokeGoogleAccountTokens(userId: string): Promise<void> {
  const rows = await db
    .select({
      accessToken: accounts.accessToken,
      refreshToken: accounts.refreshToken,
    })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "google")));

  for (const row of rows) {
    const token = row.refreshToken ?? row.accessToken;
    if (token) {
      await revokeGoogleOAuthToken(token);
    }
  }
}
