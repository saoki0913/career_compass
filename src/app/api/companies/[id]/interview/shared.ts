import { and, desc, eq, isNotNull, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { companies, documents, gakuchikaContents, motivationConversations } from "@/lib/db/schema";

export type InterviewMessage = {
  role: "user" | "assistant";
  content: string;
};

export type InterviewMaterialCard = {
  label: string;
  text: string;
  kind?: "motivation" | "gakuchika" | "es";
};

export type InterviewFeedback = {
  overall_comment: string;
  scores: {
    company_fit?: number;
    specificity?: number;
    logic?: number;
    persuasiveness?: number;
  };
  strengths: string[];
  improvements: string[];
  improved_answer: string;
  preparation_points: string[];
};

function clipText(value: string | null | undefined, maxLength = 500) {
  if (!value) return "";
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength).trim()}...`;
}

function parseConversationMessages(value: string | null | undefined): InterviewMessage[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as Array<{ role?: string; content?: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (message): message is InterviewMessage =>
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string" &&
          message.content.trim().length > 0,
      )
      .map((message) => ({
        role: message.role,
        content: message.content.trim(),
      }));
  } catch {
    return [];
  }
}

export function validateInterviewMessages(value: unknown): InterviewMessage[] | null {
  if (!Array.isArray(value)) return null;
  const messages = value.filter(
    (message): message is InterviewMessage =>
      !!message &&
      typeof message === "object" &&
      ((message as { role?: string }).role === "user" ||
        (message as { role?: string }).role === "assistant") &&
      typeof (message as { content?: unknown }).content === "string",
  );

  if (messages.length !== value.length) return null;

  return messages.map((message) => ({
    role: message.role,
    content: message.content.trim(),
  }));
}

async function getOwnedCompany(companyId: string, userId: string) {
  const [company] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.userId, userId)))
    .limit(1);

  return company ?? null;
}

export async function buildInterviewContext(companyId: string, userId: string) {
  const company = await getOwnedCompany(companyId, userId);
  if (!company) {
    return null;
  }

  const [motivationConversation, gakuchikaRows, esDocuments] = await Promise.all([
    db
      .select({
        generatedDraft: motivationConversations.generatedDraft,
        messages: motivationConversations.messages,
        selectedRole: motivationConversations.selectedRole,
        desiredWork: motivationConversations.desiredWork,
      })
      .from(motivationConversations)
      .where(and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.userId, userId)))
      .limit(1),
    db
      .select({
        title: gakuchikaContents.title,
        summary: gakuchikaContents.summary,
      })
      .from(gakuchikaContents)
      .where(and(eq(gakuchikaContents.userId, userId), isNotNull(gakuchikaContents.summary)))
      .orderBy(desc(gakuchikaContents.updatedAt))
      .limit(3),
    db
      .select({
        title: documents.title,
        content: documents.content,
      })
      .from(documents)
      .where(
        and(
          eq(documents.userId, userId),
          eq(documents.companyId, companyId),
          eq(documents.type, "es"),
          ne(documents.status, "deleted"),
        ),
      )
      .orderBy(desc(documents.updatedAt))
      .limit(3),
  ]);

  const motivation = motivationConversation[0] ?? null;
  const motivationSummary = clipText(
    motivation?.generatedDraft ||
      [
        motivation?.selectedRole ? `志望職種: ${motivation.selectedRole}` : "",
        motivation?.desiredWork ? `やりたい仕事: ${motivation.desiredWork}` : "",
        parseConversationMessages(motivation?.messages)
          .slice(-4)
          .map((message) => message.content)
          .join(" "),
      ]
        .filter(Boolean)
        .join(" "),
    900,
  );

  const gakuchikaSummary = gakuchikaRows
    .map((row) => {
      const summary = clipText(row.summary, 320);
      return summary ? `${row.title}: ${summary}` : row.title;
    })
    .filter(Boolean)
    .join("\n");

  const esSummary = esDocuments
    .map((doc) => `${doc.title}: ${clipText(doc.content, 260)}`)
    .filter(Boolean)
    .join("\n");

  const companySummary = [
    `企業名: ${company.name}`,
    company.industry ? `業界: ${company.industry}` : "",
    company.notes ? `メモ: ${clipText(company.notes, 600)}` : "",
    company.recruitmentUrl ? `採用URL: ${company.recruitmentUrl}` : "",
    company.corporateUrl ? `企業URL: ${company.corporateUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const materials: InterviewMaterialCard[] = [];
  if (motivationSummary) {
    materials.push({ label: "志望動機", text: motivationSummary, kind: "motivation" });
  }
  if (gakuchikaSummary) {
    materials.push({ label: "ガクチカ", text: gakuchikaSummary, kind: "gakuchika" });
  }
  if (esSummary) {
    materials.push({ label: "関連ES", text: esSummary, kind: "es" });
  }

  return {
    company,
    companySummary,
    motivationSummary: motivationSummary || null,
    gakuchikaSummary: gakuchikaSummary || null,
    esSummary: esSummary || null,
    materials,
  };
}
