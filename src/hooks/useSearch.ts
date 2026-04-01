/**
 * Search Hook
 *
 * Provides debounced global search functionality with abort control
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { SearchResponse } from "@/lib/search/utils";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";

const DEBOUNCE_MS = 300;

function buildHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
  };
}

export interface UseSearchOptions {
  /** Search types to include (comma-separated: companies,documents,deadlines) */
  types?: string;
  /** Maximum results per type (1-20) */
  limit?: number;
  /** Debounce delay in milliseconds */
  debounceMs?: number;
  /** Auto-search when query changes */
  autoSearch?: boolean;
  /** Initial query shown in the input */
  initialQuery?: string;
  /** Initial results rendered before any client-side request */
  initialResults?: SearchResponse | null;
  /** Initial loading state used when the server has not preloaded results yet */
  initialLoading?: boolean;
}

export interface UseSearchResult {
  /** Current search query */
  query: string;
  /** Set the search query */
  setQuery: (query: string) => void;
  /** Search results */
  results: SearchResponse | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Manually trigger a search */
  search: (query?: string) => Promise<void>;
  /** Clear search results */
  clear: () => void;
}

export function useSearch(options: UseSearchOptions = {}): UseSearchResult {
  const {
    types = "all",
    limit = 5,
    debounceMs = DEBOUNCE_MS,
    autoSearch = true,
    initialQuery = "",
    initialResults = null,
    initialLoading = false,
  } = options;

  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(initialResults);
  const [isLoading, setIsLoading] = useState(initialLoading);
  const [error, setError] = useState<string | null>(null);

  // Abort controller ref for cancelling previous requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Debounce the query
  useEffect(() => {
    if (!autoSearch) return;

    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, debounceMs, autoSearch]);

  // Execute search
  const executeSearch = useCallback(
    async (searchQuery: string) => {
      // Cancel any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Don't search for empty or very short queries
      if (!searchQuery || searchQuery.trim().length < 1) {
        setResults(null);
        setError(null);
        return;
      }

      // Create new abort controller
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          q: searchQuery.trim(),
          types,
          limit: limit.toString(),
        });

        const response = await fetch(`/api/search?${params.toString()}`, {
          headers: buildHeaders(),
          credentials: "include",
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw await parseApiErrorResponse(
            response,
            {
              code: "SEARCH_FAILED",
              userMessage: "検索結果を読み込めませんでした。",
              action: "キーワードを確認して、もう一度お試しください。",
              retryable: true,
              authMessage: "ログイン状態を確認して、もう一度お試しください。",
            },
            "useSearch.executeSearch"
          );
        }

        const data: SearchResponse = await response.json();
        setResults(data);
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        const uiError = toAppUiError(
          err,
          {
            code: "SEARCH_FAILED",
            userMessage: "検索結果を読み込めませんでした。",
            action: "キーワードを確認して、もう一度お試しください。",
            retryable: true,
          },
          "useSearch.executeSearch"
        );
        setError(uiError.message);
        setResults(null);
      } finally {
        // Only set loading false if this is still the current request
        if (abortControllerRef.current === abortController) {
          setIsLoading(false);
        }
      }
    },
    [types, limit]
  );

  // Auto-search when debounced query changes
  useEffect(() => {
    if (autoSearch && debouncedQuery) {
      executeSearch(debouncedQuery);
    }
  }, [debouncedQuery, executeSearch, autoSearch]);

  // Manual search function
  const search = useCallback(
    async (manualQuery?: string) => {
      const searchQuery = manualQuery ?? query;
      await executeSearch(searchQuery);
    },
    [query, executeSearch]
  );

  // Clear function
  const clear = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setQuery("");
    setDebouncedQuery("");
    setResults(null);
    setError(null);
    setIsLoading(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    query,
    setQuery,
    results,
    isLoading,
    error,
    search,
    clear,
  };
}
