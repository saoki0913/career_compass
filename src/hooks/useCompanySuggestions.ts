import { useState, useEffect, useRef } from "react";

export interface CompanySuggestion {
  name: string;
  industry: string;
}

interface UseCompanySuggestionsResult {
  suggestions: CompanySuggestion[];
  isLoading: boolean;
}

export const COMPANY_SUGGESTIONS_MIN_QUERY_LENGTH = 2;

export function normalizeCompanySuggestionsQuery(query: string): string | null {
  const normalizedQuery = query.trim();
  return normalizedQuery.length >= COMPANY_SUGGESTIONS_MIN_QUERY_LENGTH
    ? normalizedQuery
    : null;
}

export function useCompanySuggestions(
  query: string,
  debounceMs: number = 200
): UseCompanySuggestionsResult {
  const [suggestions, setSuggestions] = useState<CompanySuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    const normalizedQuery = normalizeCompanySuggestionsQuery(query);
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    let isActive = true;

    if (!normalizedQuery) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setSuggestions([]);
      setIsLoading(false);
      return () => {
        isActive = false;
      };
    }

    const timeoutId = setTimeout(async () => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsLoading(true);

      try {
        const response = await fetch(
          `/api/companies/suggestions?q=${encodeURIComponent(normalizedQuery)}`,
          { signal: controller.signal }
        );

        if (!isActive || requestSeqRef.current !== requestSeq) {
          return;
        }

        if (response.ok) {
          const data = await response.json();
          setSuggestions(data.suggestions || []);
        } else {
          setSuggestions([]);
        }
      } catch (error) {
        const isAbortError = error instanceof Error && error.name === "AbortError";
        if (!isAbortError && isActive && requestSeqRef.current === requestSeq) {
          console.error("Failed to fetch company suggestions:", error);
          setSuggestions([]);
        }
      } finally {
        if (isActive && requestSeqRef.current === requestSeq) {
          if (abortControllerRef.current === controller) {
            abortControllerRef.current = null;
          }
          setIsLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, [query, debounceMs]);

  return { suggestions, isLoading };
}
