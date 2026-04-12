"use client";

import { useCallback, useState } from "react";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";
import { notifyUserFacingAppError } from "@/lib/client-error-ui";
import { searchCorporatePages } from "./client-api";
import { isRecommendedCandidate } from "./workflow-helpers";
import {
  type ModalStep,
  type SearchCandidate,
  type WebDraft,
} from "./workflow-config";
import {
  buildCorporateSearchQuery,
  detectCorporateContentType,
} from "./use-corporate-info-controller";

interface UseCorporateSearchArgs {
  companyId: string;
  companyName: string;
  acquireLock: (reason: string) => boolean;
  releaseLock: () => void;
  webDraft: WebDraft;
  setWebDraft: React.Dispatch<React.SetStateAction<WebDraft>>;
  setError: (error: string | null) => void;
  setModalStep: (step: ModalStep) => void;
}

export function useCorporateSearch({
  companyId,
  companyName,
  acquireLock,
  releaseLock,
  webDraft,
  setWebDraft,
  setError,
  setModalStep,
}: UseCorporateSearchArgs) {
  const [isSearching, setIsSearching] = useState(false);

  const handleTypeSearch = useCallback(
    async (allowSnippetMatch = false) => {
      if (!webDraft.selectedContentType) {
        setError("タイプを選択してください");
        return;
      }
      if (!acquireLock("企業情報ページを検索中")) return;

      const selectedContentType = webDraft.selectedContentType;
      setIsSearching(true);
      setError(null);
      setWebDraft((prev) => ({
        ...prev,
        hasSearched: true,
        isRelaxedSearch: allowSnippetMatch,
        lastWebSearchKind: "type",
        lastContentType: selectedContentType,
      }));

      try {
        const response = await searchCorporatePages(companyId, {
          contentType: selectedContentType,
          allowSnippetMatch,
        });

        if (!response.ok) {
          throw await parseApiErrorResponse(
            response,
            {
              code: "CORPORATE_PAGE_SEARCH_FAILED",
              userMessage: "企業情報ページを検索できませんでした。",
              action: "条件を見直して、もう一度お試しください。",
              retryable: true,
            },
            "CorporateInfoSection.handleTypeSearch",
          );
        }

        const data = await response.json();
        const nextCandidates = data.candidates || [];
        setWebDraft((prev) => ({
          ...prev,
          candidates: nextCandidates,
          selectedUrls: nextCandidates
            .filter((candidate: SearchCandidate) => isRecommendedCandidate(candidate))
            .map((candidate: SearchCandidate) => candidate.url),
          hasSearched: true,
          isRelaxedSearch: allowSnippetMatch,
          lastWebSearchKind: "type",
          lastContentType: selectedContentType,
          step: "review",
        }));
        setModalStep("review");
      } catch (err) {
        const uiError = toAppUiError(
          err,
          {
            code: "CORPORATE_PAGE_SEARCH_FAILED",
            userMessage: "企業情報ページを検索できませんでした。",
            action: "条件を見直して、もう一度お試しください。",
            retryable: true,
          },
          "CorporateInfoSection.handleTypeSearch",
        );
        setError(uiError.message);
        notifyUserFacingAppError(uiError);
      } finally {
        setIsSearching(false);
        releaseLock();
      }
    },
    [acquireLock, companyId, releaseLock, webDraft.selectedContentType, setError, setWebDraft, setModalStep],
  );

  const handleCustomSearch = useCallback(
    async (allowSnippetMatch = false) => {
      if (!webDraft.searchQuery.trim()) {
        setError("検索キーワードを入力してください");
        return;
      }
      if (!acquireLock("企業情報ページを検索中")) return;

      const rawSearchQuery = webDraft.searchQuery;
      const selectedContentType = webDraft.selectedContentType;
      setIsSearching(true);
      setError(null);
      const query = buildCorporateSearchQuery(companyName, rawSearchQuery);
      const resolvedContentType =
        selectedContentType ?? detectCorporateContentType(companyName, query);
      setWebDraft((prev) => ({
        ...prev,
        selectedContentType: prev.selectedContentType ?? resolvedContentType,
        lastContentType: resolvedContentType,
        hasSearched: true,
        isRelaxedSearch: allowSnippetMatch,
        lastWebSearchKind: "custom",
      }));

      try {
        const response = await searchCorporatePages(companyId, {
          customQuery: query,
          contentType: resolvedContentType,
          allowSnippetMatch,
        });

        if (!response.ok) {
          throw await parseApiErrorResponse(
            response,
            {
              code: "CORPORATE_PAGE_SEARCH_FAILED",
              userMessage: "企業情報ページを検索できませんでした。",
              action: "条件を見直して、もう一度お試しください。",
              retryable: true,
            },
            "CorporateInfoSection.handleCustomSearch",
          );
        }

        const data = await response.json();
        const nextCandidates = data.candidates || [];
        setWebDraft((prev) => ({
          ...prev,
          selectedContentType: prev.selectedContentType ?? resolvedContentType,
          lastContentType: resolvedContentType,
          candidates: nextCandidates,
          selectedUrls: nextCandidates
            .filter((candidate: SearchCandidate) => isRecommendedCandidate(candidate))
            .map((candidate: SearchCandidate) => candidate.url),
          hasSearched: true,
          isRelaxedSearch: allowSnippetMatch,
          lastWebSearchKind: "custom",
          step: "review",
        }));
        setModalStep("review");
      } catch (err) {
        const uiError = toAppUiError(
          err,
          {
            code: "CORPORATE_PAGE_SEARCH_FAILED",
            userMessage: "企業情報ページを検索できませんでした。",
            action: "条件を見直して、もう一度お試しください。",
            retryable: true,
          },
          "CorporateInfoSection.handleCustomSearch",
        );
        setError(uiError.message);
        notifyUserFacingAppError(uiError);
      } finally {
        setIsSearching(false);
        releaseLock();
      }
    },
    [
      acquireLock,
      companyId,
      companyName,
      releaseLock,
      webDraft.searchQuery,
      webDraft.selectedContentType,
      setError,
      setWebDraft,
      setModalStep,
    ],
  );

  return { isSearching, handleTypeSearch, handleCustomSearch };
}
