/**
 * useCompanies hook
 *
 * Hook for fetching and managing companies data
 */

import { useState, useEffect, useCallback } from "react";
import { getDeviceToken } from "@/lib/auth/device-token";
import { CompanyStatus } from "@/lib/constants/status";

export type { CompanyStatus } from "@/lib/constants/status";

export interface NearestDeadline {
  id: string;
  title: string;
  dueDate: string;
  type: string;
  daysLeft: number;
}

export interface Company {
  id: string;
  userId: string | null;
  guestId: string | null;
  name: string;
  industry: string | null;
  recruitmentUrl: string | null;
  corporateUrl: string | null;
  mypageUrl: string | null;
  mypageLoginId: string | null;
  mypagePassword: string | null; // Encrypted in DB
  notes: string | null;
  status: CompanyStatus;
  isPinned: boolean;
  sortOrder: number;
  infoFetchedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Aggregate fields
  nearestDeadline: NearestDeadline | null;
  applicationCount: number;
  activeApplicationCount: number;
  documentCount: number;
  esDocumentCount: number;
}

interface CompaniesResponse {
  companies: Company[];
  count: number;
  limit: number | null;
  canAddMore: boolean;
}

interface CreateCompanyData {
  name: string;
  industry?: string;
  recruitmentUrl?: string;
  corporateUrl?: string;
  mypageUrl?: string;
  mypageLoginId?: string;
  mypagePassword?: string;
  notes?: string;
  status?: CompanyStatus;
}

interface UpdateCompanyData extends Partial<CreateCompanyData> {
  id: string;
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
      // Ignore errors on server side
    }
  }
  return headers;
}

export function useCompanies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [count, setCount] = useState(0);
  const [limit, setLimit] = useState<number | null>(null);
  const [canAddMore, setCanAddMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCompanies = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/companies", {
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to fetch companies");
      }

      const data: CompaniesResponse = await response.json();
      setCompanies(data.companies);
      setCount(data.count);
      setLimit(data.limit);
      setCanAddMore(data.canAddMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch companies");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createCompany = useCallback(async (data: CreateCompanyData) => {
    try {
      setError(null);

      const response = await fetch("/api/companies", {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create company");
      }

      const result = await response.json();
      await fetchCompanies();
      return result.company;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create company";
      setError(message);
      throw new Error(message);
    }
  }, [fetchCompanies]);

  const updateCompany = useCallback(async (data: UpdateCompanyData) => {
    try {
      setError(null);

      const { id, ...updateData } = data;
      const response = await fetch(`/api/companies/${id}`, {
        method: "PUT",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update company");
      }

      const result = await response.json();
      setCompanies((prev) =>
        prev.map((c) => (c.id === id ? result.company : c))
      );
      return result.company;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update company";
      setError(message);
      throw new Error(message);
    }
  }, []);

  const deleteCompany = useCallback(async (id: string) => {
    try {
      setError(null);

      const response = await fetch(`/api/companies/${id}`, {
        method: "DELETE",
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete company");
      }

      setCompanies((prev) => prev.filter((c) => c.id !== id));
      setCount((prev) => prev - 1);
      setCanAddMore(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete company";
      setError(message);
      throw new Error(message);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  return {
    companies,
    count,
    limit,
    canAddMore,
    isLoading,
    error,
    createCompany,
    updateCompany,
    deleteCompany,
    refresh: fetchCompanies,
  };
}
