"use client";

import { useState, useEffect, useCallback } from "react";
import { getDeviceToken } from "@/lib/auth/device-token";

export interface TemplateQuestion {
  id: string;
  question: string;
  maxLength?: number;
}

export interface Template {
  id: string;
  userId: string | null;
  guestId: string | null;
  title: string;
  description: string | null;
  questions: TemplateQuestion[];
  industry: string | null;
  tags: string[];
  isPublic: boolean;
  likeCount: number;
  copyCount: number;
  viewCount: number;
  authorDisplayName: string | null;
  isAnonymous: boolean;
  isLiked?: boolean;
  isFavorited?: boolean;
  isOwner?: boolean;
  createdAt: string;
  updatedAt: string;
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

// Hook for user's own templates
export function useTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/templates", {
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch templates");
      }

      const data = await response.json();
      setTemplates(data.templates || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "テンプレートの取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const createTemplate = async (data: {
    title: string;
    description?: string;
    questions: TemplateQuestion[];
    industry?: string;
    tags?: string[];
    isPublic?: boolean;
    authorDisplayName?: string;
    isAnonymous?: boolean;
  }) => {
    const response = await fetch("/api/templates", {
      method: "POST",
      headers: buildHeaders(),
      credentials: "include",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "テンプレートの作成に失敗しました");
    }

    const result = await response.json();
    await fetchTemplates();
    return result.template;
  };

  const updateTemplate = async (id: string, data: Partial<Template>) => {
    const response = await fetch(`/api/templates/${id}`, {
      method: "PUT",
      headers: buildHeaders(),
      credentials: "include",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "テンプレートの更新に失敗しました");
    }

    const result = await response.json();
    await fetchTemplates();
    return result.template;
  };

  const deleteTemplate = async (id: string) => {
    const response = await fetch(`/api/templates/${id}`, {
      method: "DELETE",
      headers: buildHeaders(),
      credentials: "include",
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "テンプレートの削除に失敗しました");
    }

    await fetchTemplates();
  };

  return {
    templates,
    isLoading,
    error,
    refresh: fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}

// Hook for template gallery
export function useGallery(options: {
  sort?: "popular" | "newest" | "likes";
  industry?: string;
  search?: string;
  limit?: number;
} = {}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const fetchGallery = useCallback(async (reset = false) => {
    try {
      setIsLoading(true);
      const currentOffset = reset ? 0 : offset;

      const params = new URLSearchParams();
      if (options.sort) params.set("sort", options.sort);
      if (options.industry) params.set("industry", options.industry);
      if (options.search) params.set("search", options.search);
      params.set("limit", String(options.limit || 20));
      params.set("offset", String(currentOffset));

      const response = await fetch(`/api/templates/gallery?${params.toString()}`, {
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch gallery");
      }

      const data = await response.json();

      if (reset) {
        setTemplates(data.templates || []);
        setOffset(data.templates?.length || 0);
      } else {
        setTemplates((prev) => [...prev, ...(data.templates || [])]);
        setOffset((prev) => prev + (data.templates?.length || 0));
      }

      setHasMore(data.pagination?.hasMore || false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ギャラリーの取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [offset, options.sort, options.industry, options.search, options.limit]);

  useEffect(() => {
    fetchGallery(true);
  }, [options.sort, options.industry, options.search]);

  const loadMore = () => {
    if (!isLoading && hasMore) {
      fetchGallery(false);
    }
  };

  const likeTemplate = async (id: string) => {
    const response = await fetch(`/api/templates/${id}/like`, {
      method: "POST",
      headers: buildHeaders(),
      credentials: "include",
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "いいねに失敗しました");
    }

    // Update local state
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, isLiked: true, likeCount: t.likeCount + 1 }
          : t
      )
    );
  };

  const unlikeTemplate = async (id: string) => {
    const response = await fetch(`/api/templates/${id}/like`, {
      method: "DELETE",
      headers: buildHeaders(),
      credentials: "include",
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "いいね解除に失敗しました");
    }

    // Update local state
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, isLiked: false, likeCount: Math.max(0, t.likeCount - 1) }
          : t
      )
    );
  };

  const copyTemplate = async (id: string) => {
    const response = await fetch(`/api/templates/${id}/copy`, {
      method: "POST",
      headers: buildHeaders(),
      credentials: "include",
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "コピーに失敗しました");
    }

    const result = await response.json();
    return result.template;
  };

  return {
    templates,
    isLoading,
    error,
    hasMore,
    refresh: () => fetchGallery(true),
    loadMore,
    likeTemplate,
    unlikeTemplate,
    copyTemplate,
  };
}
