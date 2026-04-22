/**
 * Documents Hook
 *
 * Manages documents (ES, TIPS, etc.)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { trackEvent } from "@/lib/analytics/client";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";
import { notifyUserFacingAppError } from "@/lib/client-error-ui";
import type { EsDocumentCategory } from "@/lib/es-document-category";

export type { EsDocumentCategory };

export type DocumentType = "es" | "tips" | "company_analysis";
export type DocumentStatus = "draft" | "published" | "deleted";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  es: "エントリーシート",
  tips: "就活TIPS",
  company_analysis: "企業分析",
};

export interface DocumentBlock {
  id: string;
  type: "h2" | "paragraph" | "bullet" | "numbered";
  content: string;
  charLimit?: number;  // 文字数制限（H2設問に設定、配下の段落に適用）
}

export interface Document {
  id: string;
  userId: string | null;
  guestId: string | null;
  companyId: string | null;
  applicationId: string | null;
  jobTypeId: string | null;
  type: DocumentType;
  esCategory?: EsDocumentCategory;
  title: string;
  content: DocumentBlock[] | null;
  status: DocumentStatus;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  company?: {
    id: string;
    name: string;
    infoFetchedAt?: string | null;  // Indicates if company has RAG data
    corporateInfoFetchedAt?: string | null;
  } | null;
  application?: {
    id: string;
    name: string;
  } | null;
}

export interface CreateDocumentInput {
  title: string;
  type: DocumentType;
  esCategory?: EsDocumentCategory;
  companyId?: string;
  applicationId?: string;
  jobTypeId?: string;
  content?: DocumentBlock[];
}

export interface UpdateDocumentInput {
  title?: string;
  content?: DocumentBlock[];
  status?: DocumentStatus;
  companyId?: string;
  applicationId?: string;
  jobTypeId?: string;
  esCategory?: EsDocumentCategory;
}

function buildHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
  };
}

export interface UseDocumentsOptions {
  type?: DocumentType;
  companyId?: string;
  applicationId?: string;
  includeDeleted?: boolean;
  initialData?: Document[];
}

interface UseDocumentOptions {
  initialData?: Document | null;
}

export function useDocuments(options: UseDocumentsOptions = {}) {
  const [documents, setDocuments] = useState<Document[]>(() => options.initialData ?? []);
  const [isLoading, setIsLoading] = useState(() => !options.initialData);
  const [error, setError] = useState<string | null>(null);
  const skipInitialFetchRef = useRef(Boolean(options.initialData));

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (options.type) params.set("type", options.type);
      if (options.companyId) params.set("companyId", options.companyId);
      if (options.applicationId) params.set("applicationId", options.applicationId);
      if (options.includeDeleted) params.set("includeDeleted", "true");

      const url = `/api/documents${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url, {
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "DOCUMENTS_FETCH_FAILED",
            userMessage: "ドキュメント一覧を読み込めませんでした。",
            action: "ページを再読み込みして、もう一度お試しください。",
            retryable: true,
          },
          "useDocuments.fetch"
        );
      }

      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "DOCUMENTS_FETCH_FAILED",
          userMessage: "ドキュメント一覧を読み込めませんでした。",
          action: "ページを再読み込みして、もう一度お試しください。",
          retryable: true,
        },
        "useDocuments.fetch"
      );
      setError(uiError.message);
      notifyUserFacingAppError(uiError);
    } finally {
      setIsLoading(false);
    }
  }, [options.type, options.companyId, options.applicationId, options.includeDeleted]);

  useEffect(() => {
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false;
      return;
    }
    fetchDocuments();
  }, [fetchDocuments]);

  const createDocument = useCallback(
    async (input: CreateDocumentInput): Promise<Document> => {
      try {
        const response = await fetch("/api/documents", {
          method: "POST",
          headers: buildHeaders(),
          credentials: "include",
          body: JSON.stringify(input),
        });

        if (!response.ok) {
          throw await parseApiErrorResponse(
            response,
            {
              code: "DOCUMENT_CREATE_FAILED",
              userMessage: "ドキュメントを作成できませんでした。",
              action: "入力内容を確認して、もう一度お試しください。",
              retryable: response.status >= 500,
            },
            "useDocuments.create"
          );
        }

        const data = await response.json();
        if (input.type === "es") {
          trackEvent("es_create");
        }
        await fetchDocuments();
        return data.document;
      } catch (err) {
        const uiError = toAppUiError(
          err,
          {
            code: "DOCUMENT_CREATE_FAILED",
            userMessage: "ドキュメントを作成できませんでした。",
            action: "入力内容を確認して、もう一度お試しください。",
            retryable: false,
          },
          "useDocuments.create"
        );
        setError(uiError.message);
        throw uiError;
      }
    },
    [fetchDocuments]
  );

  const deleteDocument = useCallback(
    async (documentId: string): Promise<void> => {
      try {
        const response = await fetch(`/api/documents/${documentId}`, {
          method: "DELETE",
          headers: buildHeaders(),
          credentials: "include",
        });

        if (!response.ok) {
          throw await parseApiErrorResponse(
            response,
            {
              code: "DOCUMENT_DELETE_FAILED",
              userMessage: "ドキュメントを削除できませんでした。",
              action: "時間を置いて、もう一度お試しください。",
              retryable: response.status >= 500,
            },
            "useDocuments.delete"
          );
        }

        await fetchDocuments();
      } catch (err) {
        const uiError = toAppUiError(
          err,
          {
            code: "DOCUMENT_DELETE_FAILED",
            userMessage: "ドキュメントを削除できませんでした。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "useDocuments.delete"
        );
        setError(uiError.message);
        throw uiError;
      }
    },
    [fetchDocuments]
  );

  const updateDocument = useCallback(
    async (documentId: string, input: UpdateDocumentInput): Promise<void> => {
      try {
        const response = await fetch(`/api/documents/${documentId}`, {
          method: "PUT",
          headers: buildHeaders(),
          credentials: "include",
          body: JSON.stringify(input),
        });

        if (!response.ok) {
          throw await parseApiErrorResponse(
            response,
            {
              code: "DOCUMENT_UPDATE_FAILED",
              userMessage: "ドキュメントを更新できませんでした。",
              action: "入力内容を確認して、もう一度お試しください。",
              retryable: response.status >= 500,
            },
            "useDocuments.update"
          );
        }

        await fetchDocuments();
      } catch (err) {
        const uiError = toAppUiError(
          err,
          {
            code: "DOCUMENT_UPDATE_FAILED",
            userMessage: "ドキュメントを更新できませんでした。",
            action: "入力内容を確認して、もう一度お試しください。",
            retryable: true,
          },
          "useDocuments.update"
        );
        setError(uiError.message);
        throw uiError;
      }
    },
    [fetchDocuments]
  );

  const restoreDocument = useCallback(
    async (documentId: string): Promise<void> => {
      try {
        const response = await fetch(`/api/documents/${documentId}/restore`, {
          method: "POST",
          headers: buildHeaders(),
          credentials: "include",
        });

        if (!response.ok) {
          throw await parseApiErrorResponse(
            response,
            {
              code: "DOCUMENT_RESTORE_FAILED",
              userMessage: "ドキュメントを復元できませんでした。",
              action: "時間を置いて、もう一度お試しください。",
              retryable: response.status >= 500,
            },
            "useDocuments.restore"
          );
        }

        await fetchDocuments();
      } catch (err) {
        const uiError = toAppUiError(
          err,
          {
            code: "DOCUMENT_RESTORE_FAILED",
            userMessage: "ドキュメントを復元できませんでした。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "useDocuments.restore"
        );
        setError(uiError.message);
        throw uiError;
      }
    },
    [fetchDocuments]
  );

  const permanentlyDeleteDocument = useCallback(
    async (documentId: string): Promise<void> => {
      try {
        const response = await fetch(`/api/documents/${documentId}/permanent`, {
          method: "DELETE",
          headers: buildHeaders(),
          credentials: "include",
        });

        if (!response.ok) {
          throw await parseApiErrorResponse(
            response,
            {
              code: "DOCUMENT_PERMANENT_DELETE_FAILED",
              userMessage: "ドキュメントを完全削除できませんでした。",
              action: "時間を置いて、もう一度お試しください。",
              retryable: response.status >= 500,
            },
            "useDocuments.permanentDelete"
          );
        }

        await fetchDocuments();
      } catch (err) {
        const uiError = toAppUiError(
          err,
          {
            code: "DOCUMENT_PERMANENT_DELETE_FAILED",
            userMessage: "ドキュメントを完全削除できませんでした。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "useDocuments.permanentDelete"
        );
        setError(uiError.message);
        throw uiError;
      }
    },
    [fetchDocuments]
  );

  return {
    documents,
    isLoading,
    error,
    refresh: fetchDocuments,
    createDocument,
    updateDocument,
    deleteDocument,
    restoreDocument,
    permanentlyDeleteDocument,
  };
}

export function useDocument(documentId: string, options: UseDocumentOptions = {}) {
  const [document, setDocument] = useState<Document | null>(() => options.initialData ?? null);
  const [isLoading, setIsLoading] = useState(() => !options.initialData);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const skipInitialFetchRef = useRef(Boolean(options.initialData));

  const fetchDocument = useCallback(async () => {
    if (!documentId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "DOCUMENT_DETAIL_FETCH_FAILED",
            userMessage: "ドキュメントを読み込めませんでした。",
            action: "ページを再読み込みして、もう一度お試しください。",
            retryable: true,
          },
          "useDocument.fetch"
        );
      }

      const data = await response.json();
      setDocument(data.document);
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "DOCUMENT_DETAIL_FETCH_FAILED",
          userMessage: "ドキュメントを読み込めませんでした。",
          action: "ページを再読み込みして、もう一度お試しください。",
          retryable: true,
        },
        "useDocument.fetch"
      );
      setError(uiError.message);
      notifyUserFacingAppError(uiError);
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false;
      return;
    }
    fetchDocument();
  }, [fetchDocument]);

  const updateDocument = useCallback(
    async (input: UpdateDocumentInput): Promise<boolean> => {
      setIsSaving(true);
      try {
        const response = await fetch(`/api/documents/${documentId}`, {
          method: "PUT",
          headers: buildHeaders(),
          credentials: "include",
          body: JSON.stringify(input),
        });

        if (!response.ok) {
          throw await parseApiErrorResponse(
            response,
            {
              code: "DOCUMENT_UPDATE_FAILED",
              userMessage: "ドキュメントを更新できませんでした。",
              action: "入力内容を確認して、もう一度お試しください。",
              retryable: response.status >= 500,
            },
            "useDocument.update"
          );
        }

        const data = await response.json();
        const nextDocument = data.document as Document;
        setDocument((prev) => {
          if (!prev) {
            return nextDocument;
          }

          return {
            ...prev,
            ...nextDocument,
            company: nextDocument.company === undefined ? prev.company : nextDocument.company,
            application:
              nextDocument.application === undefined ? prev.application : nextDocument.application,
          };
        });
        return true;
      } catch (err) {
        const uiError = toAppUiError(
          err,
          {
            code: "DOCUMENT_UPDATE_FAILED",
            userMessage: "ドキュメントを更新できませんでした。",
            action: "入力内容を確認して、もう一度お試しください。",
            retryable: true,
          },
          "useDocument.update"
        );
        setError(uiError.message);
        notifyUserFacingAppError(uiError);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [documentId]
  );

  return {
    document,
    isLoading,
    isSaving,
    error,
    refresh: fetchDocument,
    updateDocument,
  };
}

// Hook for ES statistics (for dashboard)
interface UseEsStatsOptions {
  initialData?: {
    draftCount: number;
    publishedCount: number;
    total: number;
  };
}

export function useEsStats(options: UseEsStatsOptions = {}) {
  const [stats, setStats] = useState<{
    draftCount: number;
    publishedCount: number;
    total: number;
  }>(() => options.initialData ?? { draftCount: 0, publishedCount: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(() => !options.initialData);

  useEffect(() => {
    if (options.initialData) {
      return;
    }
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/documents?type=es", {
          headers: buildHeaders(),
          credentials: "include",
        });

        if (!response.ok) {
          return;
        }

        const data = await response.json();
        const documents: Document[] = data.documents || [];

        const draftCount = documents.filter((d) => d.status === "draft").length;
        const publishedCount = documents.filter((d) => d.status === "published").length;

        setStats({
          draftCount,
          publishedCount,
          total: draftCount + publishedCount,
        });
      } catch {
        // Ignore errors, use default values
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [options.initialData]);

  return { ...stats, isLoading };
}
