import { useState, useEffect, useRef } from "react";

export interface CompanySuggestion {
  name: string;
  industry: string;
}

interface UseCompanySuggestionsResult {
  suggestions: CompanySuggestion[];
  isLoading: boolean;
}

export function useCompanySuggestions(
  query: string,
  debounceMs: number = 200
): UseCompanySuggestionsResult {
  const [suggestions, setSuggestions] = useState<CompanySuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Clear suggestions if query is too short
    if (query.trim().length < 1) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    // Debounce the API call
    const timeoutId = setTimeout(async () => {
      // Cancel previous request if any
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      setIsLoading(true);

      try {
        const response = await fetch(
          `/api/companies/suggestions?q=${encodeURIComponent(query.trim())}`,
          { signal: abortControllerRef.current.signal }
        );

        if (response.ok) {
          const data = await response.json();
          setSuggestions(data.suggestions || []);
        } else {
          setSuggestions([]);
        }
      } catch (error) {
        // Ignore abort errors
        if (error instanceof Error && error.name !== "AbortError") {
          console.error("Failed to fetch company suggestions:", error);
          setSuggestions([]);
        }
      } finally {
        setIsLoading(false);
      }
    }, debounceMs);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [query, debounceMs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { suggestions, isLoading };
}
