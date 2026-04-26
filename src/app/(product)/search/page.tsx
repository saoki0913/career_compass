import { headers } from "next/headers";
import { SearchPageClient } from "@/components/search/SearchPageClient";
import { getHeadersIdentity } from "@/app/api/_shared/request-identity";
import { getInitialSearchResults } from "@/lib/server/search-loader";
import { sanitizeSearchInput } from "@/lib/search/utils";

type SearchPageProps = {
  searchParams?: {
    q?: string | string[];
  };
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const requestHeaders = await headers();
  const identity = await getHeadersIdentity(requestHeaders);
  const rawQuery = Array.isArray(searchParams?.q) ? searchParams?.q[0] : searchParams?.q;
  const initialQuery = sanitizeSearchInput(rawQuery || "");
  const initialResults = await getInitialSearchResults(identity, initialQuery, {
    types: "all",
    limit: 10,
  });

  return (
    <div className="min-h-screen bg-background">
      <SearchPageClient initialQuery={initialQuery} initialResults={initialResults} />
    </div>
  );
}
