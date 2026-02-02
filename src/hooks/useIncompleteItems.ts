/**
 * useIncompleteItems Hook
 *
 * Fetches incomplete items for the Zeigarnik Effect UX enhancement
 * - Draft ES documents
 * - In-progress Gakuchika sessions
 */

import { useState, useEffect, useCallback } from "react";
import { getDeviceToken } from "@/lib/auth/device-token";

export interface DraftES {
  id: string;
  title: string;
  company: string | null;
  updatedAt: string;
}

export interface InProgressGakuchika {
  id: string;
  title: string;
  updatedAt: string;
}

export interface IncompleteItemsData {
  draftES: DraftES[];
  draftESCount: number;
  inProgressGakuchika: InProgressGakuchika[];
  inProgressGakuchikaCount: number;
}

interface UseIncompleteItemsResult {
  data: IncompleteItemsData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useIncompleteItems(): UseIncompleteItemsResult {
  const [data, setData] = useState<IncompleteItemsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIncompleteItems = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      // Add device token for guest support
      const deviceToken = getDeviceToken();
      if (deviceToken) {
        headers["x-device-token"] = deviceToken;
      }

      const response = await fetch("/api/dashboard/incomplete", { headers });

      if (!response.ok) {
        throw new Error("Failed to fetch incomplete items");
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error("Error fetching incomplete items:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIncompleteItems();
  }, [fetchIncompleteItems]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchIncompleteItems,
  };
}

// Helper to check if there are any incomplete items
export function hasIncompleteItems(data: IncompleteItemsData | null): boolean {
  if (!data) return false;
  return data.draftESCount > 0 || data.inProgressGakuchikaCount > 0;
}

export default useIncompleteItems;
