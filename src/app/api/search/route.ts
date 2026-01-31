/**
 * Global Search API
 *
 * GET: Search across companies, documents, and deadlines
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { companies, documents, deadlines } from "@/lib/db/schema";
import { eq, or, like, and, desc } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import {
  escapeLikePattern,
  normalizeForSearch,
  extractTextFromContent,
  createSnippet,
  findMatchedField,
  type SearchResultCompany,
  type SearchResultDocument,
  type SearchResultDeadline,
  type SearchResponse,
} from "@/lib/search/utils";

/**
 * Get current user or guest from request
 */
async function getCurrentIdentity(request: NextRequest) {
  // Try authenticated session first
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user?.id) {
    return {
      type: "user" as const,
      userId: session.user.id,
      guestId: null,
    };
  }

  // Try guest token from header
  const deviceToken = request.headers.get("x-device-token");
  if (deviceToken) {
    const guest = await getGuestUser(deviceToken);
    if (guest) {
      return {
        type: "guest" as const,
        userId: null,
        guestId: guest.id,
      };
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const identity = await getCurrentIdentity(request);

    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q")?.trim() || "";
    const typesParam = searchParams.get("types") || "all";
    const limitParam = searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitParam || "5", 10), 1), 20);

    // Validate query
    if (!query || query.length < 1) {
      return NextResponse.json(
        { error: "Search query is required" },
        { status: 400 }
      );
    }

    if (query.length > 100) {
      return NextResponse.json(
        { error: "Search query too long (max 100 characters)" },
        { status: 400 }
      );
    }

    // Normalize and escape query for SQL LIKE
    const normalizedQuery = normalizeForSearch(query);
    const escapedPattern = escapeLikePattern(normalizedQuery);

    // Parse which types to search
    const searchTypes = typesParam === "all"
      ? ["companies", "documents", "deadlines"]
      : typesParam.split(",").filter((t) =>
          ["companies", "documents", "deadlines"].includes(t)
        );

    // Build owner condition based on identity (only for tables with userId/guestId)
    const ownerCondition = identity.type === "user"
      ? (table: typeof companies | typeof documents) =>
          eq(table.userId, identity.userId!)
      : (table: typeof companies | typeof documents) =>
          eq(table.guestId, identity.guestId!);

    // Get user's company IDs for deadlines search (deadlines don't have userId/guestId)
    const userCompanyIds = await db
      .select({ id: companies.id })
      .from(companies)
      .where(ownerCondition(companies));
    const companyIdSet = new Set(userCompanyIds.map((c) => c.id));

    // Execute searches in parallel
    const [companyResults, documentResults, deadlineResults] = await Promise.all([
      // Search companies
      searchTypes.includes("companies")
        ? db
            .select()
            .from(companies)
            .where(
              and(
                ownerCondition(companies),
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

      // Search documents
      searchTypes.includes("documents")
        ? db
            .select({
              id: documents.id,
              title: documents.title,
              content: documents.content,
              type: documents.type,
              companyId: documents.companyId,
              updatedAt: documents.updatedAt,
            })
            .from(documents)
            .where(
              and(
                ownerCondition(documents),
                or(
                  like(documents.title, escapedPattern),
                  like(documents.content, escapedPattern)
                )
              )
            )
            .orderBy(desc(documents.updatedAt))
            .limit(limit)
        : Promise.resolve([]),

      // Search deadlines (filter by user's companies since deadlines don't have userId/guestId)
      searchTypes.includes("deadlines") && companyIdSet.size > 0
        ? db
            .select({
              id: deadlines.id,
              title: deadlines.title,
              description: deadlines.description,
              memo: deadlines.memo,
              type: deadlines.type,
              companyId: deadlines.companyId,
              dueDate: deadlines.dueDate,
              completedAt: deadlines.completedAt,
            })
            .from(deadlines)
            .where(
              and(
                or(...Array.from(companyIdSet).map((id) => eq(deadlines.companyId, id))),
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

    // Get company names for documents and deadlines
    const companyIds = new Set<string>();
    documentResults.forEach((d) => d.companyId && companyIds.add(d.companyId));
    deadlineResults.forEach((d) => d.companyId && companyIds.add(d.companyId));

    const companyNames: Record<string, string> = {};
    if (companyIds.size > 0) {
      const companyList = await db
        .select({ id: companies.id, name: companies.name })
        .from(companies)
        .where(
          and(
            ownerCondition(companies),
            or(...Array.from(companyIds).map((id) => eq(companies.id, id)))
          )
        );
      companyList.forEach((c) => {
        companyNames[c.id] = c.name;
      });
    }

    // Transform results with snippets
    const transformedCompanies: SearchResultCompany[] = companyResults.map((c) => {
      const matchedField = findMatchedField(c, normalizedQuery, ["name", "industry", "notes"]);
      const textToSnippet = matchedField === "notes"
        ? c.notes || ""
        : matchedField === "industry"
        ? c.industry || ""
        : c.name;
      const { snippet } = createSnippet(textToSnippet, normalizedQuery);

      return {
        id: c.id,
        name: c.name,
        industry: c.industry,
        status: c.status || "interested",
        matchedField: (matchedField || "name") as "name" | "industry" | "notes",
        snippet,
      };
    });

    const transformedDocuments: SearchResultDocument[] = documentResults.map((d) => {
      const extractedContent = extractTextFromContent(d.content);
      const matchedField = d.title?.toLowerCase().includes(normalizedQuery.toLowerCase())
        ? "title"
        : "content";
      const textToSnippet = matchedField === "title" ? d.title : extractedContent;
      const { snippet } = createSnippet(textToSnippet, normalizedQuery);

      return {
        id: d.id,
        title: d.title,
        type: d.type as "es" | "tips" | "company_analysis",
        companyId: d.companyId,
        companyName: d.companyId ? companyNames[d.companyId] || null : null,
        matchedField,
        snippet,
        updatedAt: d.updatedAt?.toISOString() || new Date().toISOString(),
      };
    });

    const transformedDeadlines: SearchResultDeadline[] = deadlineResults.map((d) => {
      const matchedField = findMatchedField(d, normalizedQuery, ["title", "description", "memo"]);
      const textToSnippet = matchedField === "description"
        ? d.description || ""
        : matchedField === "memo"
        ? d.memo || ""
        : d.title;
      const { snippet } = createSnippet(textToSnippet, normalizedQuery);

      return {
        id: d.id,
        title: d.title,
        type: d.type,
        companyId: d.companyId,
        companyName: companyNames[d.companyId] || "",
        dueDate: d.dueDate?.toISOString() || "",
        isCompleted: d.completedAt !== null,
        matchedField: (matchedField || "title") as "title" | "description" | "memo",
        snippet,
      };
    });

    const response: SearchResponse = {
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

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error in search:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
