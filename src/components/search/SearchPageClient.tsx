"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { SearchResults } from "@/components/search";
import { ListPageFilterBar } from "@/components/shared/ListPageFilterBar";
import { ProductPageHeader } from "@/components/shared/ProductPageHeader";
import { useSearch } from "@/hooks/useSearch";
import { sanitizeSearchInput, type SearchResponse } from "@/lib/search/utils";

type SearchPageClientProps = {
  initialQuery: string;
  initialResults: SearchResponse | null;
};

export function SearchPageClient({
  initialQuery,
  initialResults,
}: SearchPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearchTriggeredRef = useRef(false);
  const syncedUrlQueryRef = useRef(initialQuery);
  const { query, setQuery, results, isLoading, error, search, clear } = useSearch({
    limit: 10,
    autoSearch: false,
    initialQuery,
    initialResults,
    initialLoading: Boolean(initialQuery && !initialResults),
  });

  useEffect(() => {
    const urlQuery = sanitizeSearchInput(searchParams.get("q") || "");
    if (urlQuery === syncedUrlQueryRef.current) {
      return;
    }

    syncedUrlQueryRef.current = urlQuery;
    setQuery(urlQuery);
    if (urlQuery) {
      void search(urlQuery);
    } else {
      clear();
    }
  }, [clear, search, searchParams, setQuery]);

  useEffect(() => {
    if (initialSearchTriggeredRef.current || !initialQuery || initialResults) {
      return;
    }

    initialSearchTriggeredRef.current = true;
    void search(initialQuery);
  }, [initialQuery, initialResults, search]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    const sanitizedQuery = sanitizeSearchInput(trimmedQuery);
    if (!sanitizedQuery) return;

    syncedUrlQueryRef.current = sanitizedQuery;
    setQuery(sanitizedQuery);
    void search(sanitizedQuery);
    router.push(`/search?q=${encodeURIComponent(sanitizedQuery)}`);
  };

  const handleClear = () => {
    syncedUrlQueryRef.current = "";
    clear();
    router.push("/search");
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <ProductPageHeader
        title="検索"
        description="企業名、ES内容、締切タイトルなどを横断して検索できます"
        descriptionMode="always"
        variant="compact"
        backLink={{ href: "/dashboard", label: "ダッシュボードへ戻る" }}
      />
      <ListPageFilterBar
        searchQuery={query}
        onSearchChange={setQuery}
        searchPlaceholder="企業・ES・締切を検索..."
        searchType="search"
        searchAutoFocus
        searchLoading={isLoading}
        onSearchSubmit={handleSubmit}
        onSearchClear={query ? handleClear : undefined}
        variant="search"
      />

      {query || results ? (
        <SearchResults results={results} query={query} isLoading={isLoading} error={error} />
      ) : (
        <div className="py-16 text-center">
          <Search className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">検索キーワードを入力してください</p>
          <p className="mt-2 text-sm text-muted-foreground">
            企業名、ES内容、締切タイトルなどで検索できます
          </p>
        </div>
      )}
    </main>
  );
}
