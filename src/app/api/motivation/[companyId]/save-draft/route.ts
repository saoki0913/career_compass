import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getRequestIdentity, type RequestIdentity } from "@/app/api/_shared/request-identity";
import { db } from "@/lib/db";
import { companies, documents, motivationConversations } from "@/lib/db/schema";
import { buildCompanyMotivationEsSectionTitle } from "@/lib/es-review/es-document-section-titles";
import { getMotivationConversationByCondition } from "@/lib/motivation/conversation";

async function getOwnedCompanyData(
  companyId: string,
  identity: RequestIdentity,
): Promise<{ id: string; name: string } | null> {
  const [company] = await db
    .select({
      id: companies.id,
      name: companies.name,
    })
    .from(companies)
    .where(
      identity.userId
        ? and(eq(companies.id, companyId), eq(companies.userId, identity.userId))
        : and(eq(companies.id, companyId), eq(companies.guestId, identity.guestId!)),
    )
    .limit(1);

  return company ?? null;
}

function resolveCharLimit(value: string | null | undefined): 300 | 400 | 500 {
  if (value === "300" || value === "400" || value === "500") {
    return Number(value) as 300 | 400 | 500;
  }
  return 400;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const identity = await getRequestIdentity(request);
  if (!identity?.userId) {
    return NextResponse.json({ error: "志望動機の保存はログインが必要です" }, { status: 401 });
  }

  const { companyId } = await params;
  const company = await getOwnedCompanyData(companyId, identity);
  if (!company) {
    return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 });
  }

  const conversation = await getMotivationConversationByCondition(
    and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.userId, identity.userId)),
  );
  const generatedDraft = conversation?.generatedDraft?.trim();
  if (!generatedDraft) {
    return NextResponse.json({ error: "保存できる下書きがありません" }, { status: 409 });
  }

  const charLimit = resolveCharLimit(conversation?.charLimitType);
  const documentId = randomUUID();
  const now = new Date();

  await db.insert(documents).values({
    id: documentId,
    userId: identity.userId,
    guestId: null,
    companyId,
    type: "es",
    title: `${company.name} 志望動機`,
    content: JSON.stringify([
      {
        id: randomUUID(),
        type: "h2",
        content: buildCompanyMotivationEsSectionTitle(),
        charLimit,
      },
      {
        id: randomUUID(),
        type: "paragraph",
        content: generatedDraft,
      },
    ]),
    status: "draft",
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ documentId });
}
