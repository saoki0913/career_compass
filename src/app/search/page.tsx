/**
 * Search Page
 *
 * Full search results page with URL query parameter sync
 */

"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard";
import { SearchResults } from "@/components/search";
import { useSearch } from "@/hooks/useSearch";
import { Input } from "@/components/ui/input";
import { Search, Loader2, X } from "lucide-react";

function SearchContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const { query, setQuery, results, isLoading, error, search, clear } = useSearch({
    limit: 10,
    autoSearch: false,
  });

  // Sync with URL query on mount
  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      search(initialQuery);
    }
  }, [initialQuery, setQuery, search]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      search(query.trim());
      // Update URL without navigation
      const url = new URL(window.location.href);
      url.searchParams.set("q", query.trim());
      window.history.pushState({}, "", url.toString());
    }
  };

  const handleClear = () => {
    clear();
    // Clear URL parameter
    const url = new URL(window.location.href);
    url.searchParams.delete("q");
    window.history.pushState({}, "", url.toString());
  };

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Search Input */}
      <div className="mb-8">
        <form onSubmit={handleSubmit} className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="企業・ES・締切を検索..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-12 pr-12 h-12 text-lg"
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

      {/* Results */}
      {query || results ? (
        <SearchResults
          results={results}
          query={query}
          isLoading={isLoading}
          error={error}
        />
      ) : (
        <div className="text-center py-16">
          <Search className="w-12 h-12 mx-auto text-muted-foreground/50" />
          <p className="text-muted-foreground mt-4">
            検索キーワードを入力してください
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            企業名、ES内容、締切タイトルなどで検索できます
          </p>
        </div>
      )}
    </main>
  );
}

function SearchFallback() {
  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="企業・ES・締切を検索..."
            className="pl-12 pr-12 h-12 text-lg"
            disabled
          />
        </div>
      </div>
      <div className="text-center py-16">
        <Loader2 className="w-12 h-12 mx-auto text-muted-foreground/50 animate-spin" />
        <p className="text-muted-foreground mt-4">読み込み中...</p>
      </div>
    </main>
  );
}

export default function SearchPage() {
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <Suspense fallback={<SearchFallback />}>
        <SearchContent />
      </Suspense>
    </div>
  );
}
