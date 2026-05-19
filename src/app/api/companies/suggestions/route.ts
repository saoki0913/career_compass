import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { createApiErrorResponse } from "@/bff/api/error-response";
import {
  checkRateLimit,
  createAnonymousRateLimitKey,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { cacheGet } from "@/lib/redis";

interface CompanySuggestion {
  name: string;
  industry: string;
}

interface CompanyMappings {
  mappings: Record<string, string[]>;
}

// Cache the parsed mappings
let cachedMappings: Map<string, string> | null = null;

function hashSuggestionQuery(query: string): string {
  return createHash("sha256")
    .update(query.trim().toLowerCase())
    .digest("hex")
    .slice(0, 24);
}

function loadCompanyMappings(): Map<string, string> {
  if (cachedMappings) {
    return cachedMappings;
  }

  const filePath = path.join(
    process.cwd(),
    "backend/data/company_mappings.json"
  );

  try {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const data: CompanyMappings = JSON.parse(fileContent);

    // Parse mappings and extract industry from section comments
    const companyToIndustry = new Map<string, string>();
    let currentIndustry = "";

    for (const key of Object.keys(data.mappings)) {
      // Section headers like "_section_01": "=== 商社 ==="
      if (key.startsWith("_section_")) {
        const sectionValue = data.mappings[key] as unknown as string;
        // Extract industry name from "=== 商社 ===" or "=== IT・通信 ==="
        const match = sectionValue.match(/===\s*(.+?)\s*===/);
        if (match) {
          currentIndustry = match[1];
        }
        continue;
      }

      // Skip subsection headers
      if (key.startsWith("_")) {
        continue;
      }

      // This is a company name
      companyToIndustry.set(key, currentIndustry);
    }

    cachedMappings = companyToIndustry;
    return companyToIndustry;
  } catch (error) {
    console.error("Failed to load company mappings:", error);
    return new Map();
  }
}

export async function GET(request: NextRequest) {
  const rateLimitKey = createAnonymousRateLimitKey(
    "companySuggestions",
    request.headers
  );
  const rateLimit = await checkRateLimit(
    rateLimitKey,
    RATE_LIMITS.companySuggestions,
    "companySuggestions"
  );
  if (!rateLimit.allowed) {
    const response = createApiErrorResponse(request, {
      status: 429,
      code: "RATE_LIMITED",
      userMessage: "しばらく待ってから再試行してください。",
      action: `${rateLimit.resetIn}秒ほど待ってから、もう一度お試しください。`,
    });
    response.headers.set("Retry-After", String(rateLimit.resetIn));
    response.headers.set("X-RateLimit-Remaining", String(rateLimit.remaining));
    return response;
  }

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q")?.trim() || "";

  // Require at least 2 characters to avoid one-keypress public enumeration.
  if (query.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const suggestions = await cacheGet(
    ["company-suggestions", hashSuggestionQuery(query)],
    async () => searchCompanies(query),
    { ttlSeconds: 86400 },
  );

  return NextResponse.json({ suggestions });
}

function searchCompanies(query: string): CompanySuggestion[] {
  const companyMappings = loadCompanyMappings();
  const suggestions: CompanySuggestion[] = [];

  // Search for matching companies
  for (const [name, industry] of companyMappings) {
    if (name.includes(query)) {
      suggestions.push({ name, industry });
    }

    // Limit results
    if (suggestions.length >= 20) {
      break;
    }
  }

  // Sort by relevance (exact match first, then by position of match)
  suggestions.sort((a, b) => {
    const aIndex = a.name.indexOf(query);
    const bIndex = b.name.indexOf(query);

    // Exact match or starts with gets priority
    if (aIndex === 0 && bIndex !== 0) return -1;
    if (bIndex === 0 && aIndex !== 0) return 1;

    // Then by position
    return aIndex - bIndex;
  });

  return suggestions;
}
