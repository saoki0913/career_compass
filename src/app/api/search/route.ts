import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { performSearch } from "@/lib/server/search-loader";

const searchParamsSchema = z.object({
  q: z.string().trim().min(1).max(100),
  types: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const identity = await getRequestIdentity(request);

    if (!identity) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const parsedParams = searchParamsSchema.safeParse({
      q: searchParams.get("q") || "",
      types: searchParams.get("types") || undefined,
      limit: searchParams.get("limit") || 5,
    });

    if (!parsedParams.success) {
      return NextResponse.json({ error: "検索条件を確認してください" }, { status: 400 });
    }

    const response = await performSearch(identity, {
      q: parsedParams.data.q,
      types: parsedParams.data.types || "all",
      limit: parsedParams.data.limit ?? 5,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error in search:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
