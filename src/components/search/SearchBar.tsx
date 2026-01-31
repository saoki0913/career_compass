/**
 * SearchBar Component
 *
 * Global search bar with dropdown results
 * - Desktop: inline input with dropdown
 * - Mobile: icon that expands to full-width overlay
 */

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSearch } from "@/hooks/useSearch";
import { SearchResultItem } from "./SearchResultItem";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  className?: string;
}

export function SearchBar({ className }: SearchBarProps) {
  const router = useRouter();
  const { query, setQuery, results, isLoading, clear } = useSearch({
    limit: 3,
  });

  const [isExpanded, setIsExpanded] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Derive showDropdown - show when focused and has query with results
  const showDropdown = isFocused && query.length > 0 && (isLoading || (results?.counts.total ?? 0) > 0);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
        setIsExpanded(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Cmd/Ctrl + K to focus search
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setIsExpanded(true);
        setIsFocused(true);
      }

      // Escape to close
      if (event.key === "Escape") {
        setIsFocused(false);
        setIsExpanded(false);
        inputRef.current?.blur();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
    },
    [setQuery]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (query.trim()) {
        router.push(`/search?q=${encodeURIComponent(query.trim())}`);
        setIsFocused(false);
        setIsExpanded(false);
        inputRef.current?.blur();
      }
    },
    [query, router]
  );

  const handleResultClick = useCallback(() => {
    setIsFocused(false);
    setIsExpanded(false);
    clear();
  }, [clear]);

  const handleMobileToggle = useCallback(() => {
    setIsExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleClear = useCallback(() => {
    clear();
    inputRef.current?.focus();
  }, [clear]);

  const handleClose = useCallback(() => {
    setIsExpanded(false);
    setIsFocused(false);
    clear();
  }, [clear]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Mobile search icon */}
      <button
        type="button"
        onClick={handleMobileToggle}
        className="md:hidden p-2 rounded-lg hover:bg-secondary transition-all duration-200 cursor-pointer"
        aria-label="検索"
      >
        <Search className="w-5 h-5" />
      </button>

      {/* Mobile expanded overlay */}
      {isExpanded && (
        <div className="md:hidden fixed inset-0 z-50 bg-background p-4">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                type="search"
                placeholder="企業・ES・締切を検索..."
                value={query}
                onChange={handleInputChange}
                className="pl-9 pr-9"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : (
                    <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                  )}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-2 text-muted-foreground hover:text-foreground"
            >
              キャンセル
            </button>
          </form>

          {/* Mobile dropdown results */}
          {showDropdown && (
            <div className="mt-2 border border-border rounded-xl bg-background shadow-lg overflow-hidden">
              <SearchDropdownContent
                results={results}
                query={query}
                isLoading={isLoading}
                onResultClick={handleResultClick}
                onViewAll={handleSubmit}
              />
            </div>
          )}
        </div>
      )}

      {/* Desktop search input */}
      <form onSubmit={handleSubmit} className="hidden md:block relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="search"
          placeholder="検索... (⌘K)"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setIsFocused(true)}
          className="w-60 pl-9 pr-9"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : (
              <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
            )}
          </button>
        )}

        {/* Desktop dropdown */}
        {showDropdown && (
          <div className="absolute top-full left-0 right-0 mt-2 border border-border rounded-xl bg-background shadow-lg overflow-hidden z-50 min-w-80">
            <SearchDropdownContent
              results={results}
              query={query}
              isLoading={isLoading}
              onResultClick={handleResultClick}
              onViewAll={handleSubmit}
            />
          </div>
        )}
      </form>
    </div>
  );
}

interface SearchDropdownContentProps {
  results: ReturnType<typeof useSearch>["results"];
  query: string;
  isLoading: boolean;
  onResultClick: () => void;
  onViewAll: (e: React.FormEvent) => void;
}

function SearchDropdownContent({
  results,
  query,
  isLoading,
  onResultClick,
  onViewAll,
}: SearchDropdownContentProps) {
  if (isLoading && !results) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground mt-2">検索中...</p>
      </div>
    );
  }

  if (!results || results.counts.total === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">
          「{query}」に一致する結果がありません
        </p>
      </div>
    );
  }

  const { companies, documents, deadlines } = results.results;

  return (
    <div className="max-h-96 overflow-y-auto">
      {/* Companies */}
      {companies.length > 0 && (
        <div>
          <div className="px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/30">
            企業 ({companies.length})
          </div>
          {companies.map((company) => (
            <SearchResultItem
              key={company.id}
              type="company"
              item={company}
              query={query}
              onClick={onResultClick}
            />
          ))}
        </div>
      )}

      {/* Documents */}
      {documents.length > 0 && (
        <div>
          <div className="px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/30">
            ES・ドキュメント ({documents.length})
          </div>
          {documents.map((doc) => (
            <SearchResultItem
              key={doc.id}
              type="document"
              item={doc}
              query={query}
              onClick={onResultClick}
            />
          ))}
        </div>
      )}

      {/* Deadlines */}
      {deadlines.length > 0 && (
        <div>
          <div className="px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/30">
            締切 ({deadlines.length})
          </div>
          {deadlines.map((deadline) => (
            <SearchResultItem
              key={deadline.id}
              type="deadline"
              item={deadline}
              query={query}
              onClick={onResultClick}
            />
          ))}
        </div>
      )}

      {/* View all results */}
      <div className="border-t border-border/50">
        <button
          type="button"
          onClick={onViewAll}
          className="w-full py-3 text-center text-sm text-primary font-medium hover:bg-muted/50 transition-all duration-200 cursor-pointer"
        >
          すべての結果を見る ({results.counts.total}件)
        </button>
      </div>
    </div>
  );
}
