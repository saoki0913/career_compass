"use client";

import { useEffect, useRef } from "react";
import { Loader2, Search, X } from "lucide-react";
import { SearchResults } from "@/components/search";
import { Input } from "@/components/ui/input";
import { useSearch } from "@/hooks/useSearch";
import type { SearchResponse } from "@/lib/search/utils";

type SearchPageClientProps = {
  initialQuery: string;
  initialResults: SearchResponse | null;
};

export function SearchPageClient({
  initialQuery,
  initialResults,
}: SearchPageClientProps) {
  const initialSearchTriggeredRef = useRef(false);
  const { query, setQuery, results, isLoading, error, search, clear } = useSearch({
    limit: 10,
    autoSearch: false,
    initialQuery,
    initialResults,
    initialLoading: Boolean(initialQuery && !initialResults),
  });

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

    void search(trimmedQuery);
    const url = new URL(window.location.href);
    url.searchParams.set("q", trimmedQuery);
    window.history.pushState({}, "", url.toString());
  };

  const handleClear = () => {
    clear();
    const url = new URL(window.location.href);
    url.searchParams.delete("q");
    window.history.pushState({}, "", url.toString());
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <form onSubmit={handleSubmit} className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="企業・ES・締切を検索..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-12 pl-12 pr-12 text-lg"
            autoFocus
          />
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-4 top-1/2 -translate-y-1/2"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : (
                <X className="w-5 h-5 text-muted-foreground hover:text-foreground" />
              )}
            </button>
          )}
        </form>
      </div>

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
