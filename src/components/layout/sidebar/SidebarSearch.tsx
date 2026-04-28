"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeSearchInput } from "@/lib/search/utils";
import { useSearch } from "@/hooks/useSearch";
import { SearchResultItem } from "@/components/search/SearchResultItem";

interface SidebarSearchProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

function SearchIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx={11} cy={11} r={8} />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

export function SidebarSearch({ collapsed, onNavigate }: SidebarSearchProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { query, setQuery, results, isLoading, error, clear } = useSearch({
    limit: 3,
    autoSearch: true,
    debounceMs: 300,
    minQueryLength: 2,
  });
  const sanitizedQuery = sanitizeSearchInput(query);
  const shouldShowDropdown = isDropdownOpen && sanitizedQuery.length >= 2;
  const currentResults = results?.query === sanitizedQuery ? results : null;
  const hasResults = (currentResults?.counts.total ?? 0) > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sanitizedQuery) return;
    router.push(`/search?q=${encodeURIComponent(sanitizedQuery)}`);
    setIsDropdownOpen(false);
    onNavigate?.();
  }

  function handleResultNavigate() {
    setIsDropdownOpen(false);
    clear();
    onNavigate?.();
  }

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [clear]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsDropdownOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [clear]);

  if (collapsed) {
    return (
      <Link
        href="/search"
        onClick={onNavigate}
        className="group relative mx-auto flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        aria-label="検索"
      >
        <SearchIcon />
        <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100">
          検索
        </span>
      </Link>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <form
        onSubmit={handleSubmit}
        className={cn(
          "group flex h-10 w-full items-center gap-2 rounded-lg border border-sidebar-border/70 bg-background/70 px-3 transition-colors focus-within:border-sidebar-ring hover:bg-sidebar-accent/40",
        )}
        role="search"
        aria-label="サイト内検索"
      >
        <button
          type="submit"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          aria-label="検索を実行"
        >
          <SearchIcon />
        </button>
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsDropdownOpen(true);
          }}
          onFocus={() => setIsDropdownOpen(true)}
          placeholder="検索"
          aria-label="検索キーワード"
          className="min-w-0 flex-1 bg-transparent text-sm text-sidebar-foreground outline-none placeholder:text-muted-foreground"
        />
      </form>

      {shouldShowDropdown ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(28rem,calc(100vh-8rem))] overflow-y-auto rounded-xl border border-border bg-background shadow-lg">
          {(isLoading || !currentResults) && !error ? (
            <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              検索中...
            </div>
          ) : error ? (
            <div className="px-3 py-4 text-sm text-destructive">{error}</div>
          ) : hasResults && currentResults ? (
            <div className="py-1">
              {currentResults.results.companies.map((company) => (
                <SearchResultItem
                  key={`company-${company.id}`}
                  type="company"
                  item={company}
                  query={sanitizedQuery}
                  onClick={handleResultNavigate}
                />
              ))}
              {currentResults.results.documents.map((document) => (
                <SearchResultItem
                  key={`document-${document.id}`}
                  type="document"
                  item={document}
                  query={sanitizedQuery}
                  onClick={handleResultNavigate}
                />
              ))}
              {currentResults.results.deadlines.map((deadline) => (
                <SearchResultItem
                  key={`deadline-${deadline.id}`}
                  type="deadline"
                  item={deadline}
                  query={sanitizedQuery}
                  onClick={handleResultNavigate}
                />
              ))}
              <button
                type="button"
                onClick={() => {
                  router.push(`/search?q=${encodeURIComponent(sanitizedQuery)}`);
                  setIsDropdownOpen(false);
                  onNavigate?.();
                }}
                className="w-full border-t border-border/60 px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-muted/50"
              >
                すべての結果を見る
              </button>
            </div>
          ) : (
            <div className="px-3 py-4 text-sm text-muted-foreground">一致する候補がありません</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
