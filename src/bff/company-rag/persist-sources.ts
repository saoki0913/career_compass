import { and, eq } from "drizzle-orm";
import {
  cancelCompanyRagUsage,
  confirmCompanyRagUsage,
  type CompanyRagUsageReservation,
} from "@/lib/company-info/usage";
import { serializeCorporateInfoSources, type CorporateInfoSource } from "@/lib/company-info/sources";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";

export async function persistCompanyRagSourcesAfterUsageReservation(input: {
  companyId: string;
  userId: string;
  sources: CorporateInfoSource[];
  usageReservations: CompanyRagUsageReservation[];
}): Promise<void> {
  try {
    const updated = await db
      .update(companies)
      .set({
        corporateInfoUrls: serializeCorporateInfoSources(input.sources),
        corporateInfoFetchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(companies.id, input.companyId), eq(companies.userId, input.userId)))
      .returning({ id: companies.id });

    if (!updated[0]) {
      throw new Error("Owned company update failed during company RAG source persistence");
    }

    await Promise.all(input.usageReservations.map((usage) => confirmCompanyRagUsage(usage)));
  } catch (error) {
    await Promise.allSettled(input.usageReservations.map((usage) => cancelCompanyRagUsage(usage)));
    throw error;
  }
}
