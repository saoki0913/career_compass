/**
 * Documents Hook
 *
 * Manages documents (ES, TIPS, etc.)
 */

import { useState, useEffect, useCallback } from "react";
import { getDeviceToken } from "@/lib/auth/device-token";
import { trackEvent } from "@/lib/analytics/client";

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
  title: string;
  content: DocumentBlock[] | null;
  status: DocumentStatus;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  company?: {
    id: string;
    name: string;
    infoFetchedAt?: Date | null;  // Indicates if company has RAG data
  } | null;
  application?: {
    id: string;
    name: string;
  } | null;
}

export interface CreateDocumentInput {
  title: string;
  type: DocumentType;
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
}

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

export interface UseDocumentsOptions {
  type?: DocumentType;
  companyId?: string;
  applicationId?: string;
  includeDeleted?: boolean;
}

export function useDocuments(options: UseDocumentsOptions = {}) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        throw new Error("Failed to fetch documents");
      }

      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ドキュメントの取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [options.type, options.companyId, options.applicationId, options.includeDeleted]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const createDocument = useCallback(
    async (input: CreateDocumentInput): Promise<Document | null> => {
      try {
        const response = await fetch("/api/documents", {
          method: "POST",
          headers: buildHeaders(),
          credentials: "include",
          body: JSON.stringify(input),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to create document");
        }

        const data = await response.json();
        if (input.type === "es") {
          trackEvent("es_create");
        }
        await fetchDocuments();
        return data.document;
      } catch (err) {
        setError(err instanceof Error ? err.message : "ドキュメントの作成に失敗しました");
        return null;
      }
    },
    [fetchDocuments]
  );

  const deleteDocument = useCallback(
    async (documentId: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/documents/${documentId}`, {
          method: "DELETE",
          headers: buildHeaders(),
          credentials: "include",
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to delete document");
        }

        await fetchDocuments();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "ドキュメントの削除に失敗しました");
        return false;
      }
    },
    [fetchDocuments]
  );

  const updateDocument = useCallback(
    async (documentId: string, input: UpdateDocumentInput): Promise<boolean> => {
      try {
        const response = await fetch(`/api/documents/${documentId}`, {
          method: "PUT",
          headers: buildHeaders(),
          credentials: "include",
          body: JSON.stringify(input),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to update document");
        }

        await fetchDocuments();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "ドキュメントの更新に失敗しました");
        return false;
      }
    },
    [fetchDocuments]
  );

  const restoreDocument = useCallback(
    async (documentId: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/documents/${documentId}/restore`, {
          method: "POST",
          headers: buildHeaders(),
          credentials: "include",
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to restore document");
        }

        await fetchDocuments();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "ドキュメントの復元に失敗しました");
        return false;
      }
    },
    [fetchDocuments]
  );

  const permanentlyDeleteDocument = useCallback(
    async (documentId: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/documents/${documentId}/permanent`, {
          method: "DELETE",
          headers: buildHeaders(),
          credentials: "include",
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to permanently delete document");
        }

        await fetchDocuments();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "ドキュメントの完全削除に失敗しました");
        return false;
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

export function useDocument(documentId: string) {
  const [document, setDocument] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
        throw new Error("Failed to fetch document");
      }

      const data = await response.json();
      setDocument(data.document);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ドキュメントの取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
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
          const data = await response.json();
          throw new Error(data.error || "Failed to update document");
        }

        const data = await response.json();
        setDocument(data.document);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "ドキュメントの更新に失敗しました");
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
export function useEsStats() {
  const [stats, setStats] = useState<{
    draftCount: number;
    publishedCount: number;
    total: number;
  }>({ draftCount: 0, publishedCount: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
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
  }, []);

  return { ...stats, isLoading };
}
