/**
 * Search Hook
 *
 * Provides debounced global search functionality with abort control
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { getDeviceToken } from "@/lib/auth/device-token";
import type { SearchResponse } from "@/lib/search/utils";

const DEBOUNCE_MS = 300;

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (typeof window !== "undefined") {
    try {
      const deviceToken = getDeviceToken();
      if (deviceToken) {
        headers["x-device-token"] = deviceToken;
      }
    } catch {
      // Ignore errors
    }
  }
  return headers;
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
  } = options;

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "検索に失敗しました");
        }

        const data: SearchResponse = await response.json();
        setResults(data);
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setError(err instanceof Error ? err.message : "検索に失敗しました");
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
