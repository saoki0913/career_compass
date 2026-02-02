import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

interface CompanySuggestion {
  name: string;
  industry: string;
}

interface CompanyMappings {
  mappings: Record<string, string[]>;
}

// Cache the parsed mappings
let cachedMappings: Map<string, string> | null = null;

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
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q")?.trim() || "";

  // Require at least 1 character for search
  if (query.length < 1) {
    return NextResponse.json({ suggestions: [] });
  }

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

  return NextResponse.json({ suggestions });
}
