import { and, desc, eq, like, or, sql } from "drizzle-orm";
import type { RequestIdentity } from "@/app/api/_shared/request-identity";
import { db } from "@/lib/db";
import { companies, deadlines, documents } from "@/lib/db/schema";
import {
  buildSafeLikePattern,
  createSnippet,
  extractTextFromContent,
  findMatchedField,
  sanitizeSearchInput,
  type SearchResponse,
  type SearchResultCompany,
  type SearchResultDeadline,
  type SearchResultDocument,
} from "@/lib/search/utils";

const ALLOWED_SEARCH_TYPES = new Set(["companies", "documents", "deadlines"]);

type SearchQueryInput = {
  q: string;
  types?: string;
  limit?: number;
};

function buildOwnerCondition(identity: RequestIdentity) {
  return identity.userId
    ? eq(companies.userId, identity.userId)
    : eq(companies.guestId, identity.guestId!);
}

function buildDocumentOwnerCondition(identity: RequestIdentity) {
  return identity.userId
    ? eq(documents.userId, identity.userId)
    : eq(documents.guestId, identity.guestId!);
}

function getSearchTypes(typesParam?: string) {
  if (!typesParam || typesParam === "all") {
    return ["companies", "documents", "deadlines"];
  }

  return typesParam
    .split(",")
    .map((type) => type.trim())
    .filter((type) => ALLOWED_SEARCH_TYPES.has(type));
}

export async function performSearch(
  identity: RequestIdentity,
  input: SearchQueryInput
): Promise<SearchResponse> {
  const query = sanitizeSearchInput(input.q);
  const limit = input.limit ?? 5;
  const searchTypes = getSearchTypes(input.types);
  const escapedPattern = buildSafeLikePattern(query);

  const [companyResults, documentResults, deadlineResults] = await Promise.all([
    searchTypes.includes("companies")
      ? db
          .select()
          .from(companies)
          .where(
            and(
              buildOwnerCondition(identity),
              or(
                like(companies.name, escapedPattern),
                like(companies.industry, escapedPattern),
                like(companies.notes, escapedPattern)
              )
            )
          )
          .orderBy(desc(companies.updatedAt))
          .limit(limit)
      : Promise.resolve([]),
    searchTypes.includes("documents")
      ? db
          .select({
            id: documents.id,
            title: documents.title,
            contentForSnippet: sql<string | null>`CASE
              WHEN ${documents.title} LIKE ${escapedPattern} THEN NULL
              ELSE ${documents.content}
            END`,
            type: documents.type,
            companyId: documents.companyId,
            companyName: companies.name,
            updatedAt: documents.updatedAt,
          })
          .from(documents)
          .leftJoin(companies, eq(documents.companyId, companies.id))
          .where(
            and(
              buildDocumentOwnerCondition(identity),
              or(
                like(documents.title, escapedPattern),
                like(documents.content, escapedPattern)
              )
            )
          )
          .orderBy(desc(documents.updatedAt))
          .limit(limit)
      : Promise.resolve([]),
    searchTypes.includes("deadlines")
      ? db
          .select({
            id: deadlines.id,
            title: deadlines.title,
            description: deadlines.description,
            memo: deadlines.memo,
            type: deadlines.type,
            companyId: deadlines.companyId,
            companyName: companies.name,
            dueDate: deadlines.dueDate,
            completedAt: deadlines.completedAt,
          })
          .from(deadlines)
          .innerJoin(companies, eq(deadlines.companyId, companies.id))
          .where(
            and(
              buildOwnerCondition(identity),
              or(
                like(deadlines.title, escapedPattern),
                like(deadlines.description, escapedPattern),
                like(deadlines.memo, escapedPattern)
              )
            )
          )
          .orderBy(desc(deadlines.dueDate))
          .limit(limit)
      : Promise.resolve([]),
  ]);

  const transformedCompanies: SearchResultCompany[] = companyResults.map((company) => {
    const matchedField = findMatchedField(company, query, ["name", "industry", "notes"]);
    const textToSnippet =
      matchedField === "notes"
        ? company.notes || ""
        : matchedField === "industry"
        ? company.industry || ""
        : company.name;
    const { snippet } = createSnippet(textToSnippet, query);

    return {
      id: company.id,
      name: company.name,
      industry: company.industry,
      status: company.status || "interested",
      matchedField: (matchedField || "name") as "name" | "industry" | "notes",
      snippet,
    };
  });

  const transformedDocuments: SearchResultDocument[] = documentResults.map((document) => {
    const titleMatched = document.title?.toLowerCase().includes(query.toLowerCase()) ?? false;
    const extractedContent = titleMatched ? "" : extractTextFromContent(document.contentForSnippet);
    const resolvedMatchedField =
      titleMatched || !extractedContent.toLowerCase().includes(query.toLowerCase())
        ? "title"
        : "content";
    const textToSnippet = resolvedMatchedField === "title" ? document.title : extractedContent;
    const { snippet } = createSnippet(textToSnippet, query);

    return {
      id: document.id,
      title: document.title,
      type: document.type,
      companyId: document.companyId,
      companyName: document.companyName ?? "",
      matchedField: resolvedMatchedField as "title" | "content",
      snippet,
      updatedAt: document.updatedAt.toISOString(),
    };
  });

  const transformedDeadlines: SearchResultDeadline[] = deadlineResults.map((deadline) => {
    const matchedField = findMatchedField(deadline, query, ["title", "description", "memo"]);
    const textToSnippet =
      matchedField === "description"
        ? deadline.description || ""
        : matchedField === "memo"
        ? deadline.memo || ""
        : deadline.title;
    const { snippet } = createSnippet(textToSnippet, query);

    return {
      id: deadline.id,
      title: deadline.title,
      type: deadline.type,
      companyId: deadline.companyId,
      companyName: deadline.companyName ?? "",
      dueDate: deadline.dueDate?.toISOString() || "",
      isCompleted: deadline.completedAt !== null,
      matchedField: (matchedField || "title") as "title" | "description" | "memo",
      snippet,
    };
  });

  return {
    query,
    results: {
      companies: transformedCompanies,
      documents: transformedDocuments,
      deadlines: transformedDeadlines,
    },
    counts: {
      companies: transformedCompanies.length,
      documents: transformedDocuments.length,
      deadlines: transformedDeadlines.length,
      total:
        transformedCompanies.length +
        transformedDocuments.length +
        transformedDeadlines.length,
    },
  };
}

export async function getInitialSearchResults(
  identity: RequestIdentity | null,
  query: string,
  options: { types?: string; limit?: number } = {}
): Promise<SearchResponse | null> {
  const sanitizedQuery = sanitizeSearchInput(query);
  if (!identity || !sanitizedQuery) {
    return null;
  }

  return performSearch(identity, {
    q: sanitizedQuery,
    types: options.types ?? "all",
    limit: options.limit ?? 10,
  });
}
