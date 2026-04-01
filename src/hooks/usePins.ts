"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type EntityType = "document" | "gakuchika";

function buildHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
  };
}

interface UsePinsReturn {
  pinnedIds: Set<string>;
  isLoading: boolean;
  togglePin: (entityId: string) => void;
  isPinned: (entityId: string) => boolean;
}

export function usePins(entityType: EntityType): UsePinsReturn {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const previousPinnedRef = useRef<Set<string>>(new Set());

  const fetchPins = useCallback(async () => {
    try {
      const response = await fetch(`/api/pins?entityType=${entityType}`, {
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch pins");
      }

      const data = await response.json();
      const newSet = new Set<string>(data.pinnedIds || []);
      setPinnedIds(newSet);
      previousPinnedRef.current = newSet;
    } catch (error) {
      console.error("Error fetching pins:", error);
    } finally {
      setIsLoading(false);
    }
  }, [entityType]);

  useEffect(() => {
    fetchPins();
  }, [fetchPins]);

  const togglePin = useCallback(
    (entityId: string) => {
      const currentlyPinned = pinnedIds.has(entityId);

      // Optimistic update
      previousPinnedRef.current = new Set(pinnedIds);
      setPinnedIds((prev) => {
        const next = new Set(prev);
        if (currentlyPinned) {
          next.delete(entityId);
        } else {
          next.add(entityId);
        }
        return next;
      });

      // API call
      const method = currentlyPinned ? "DELETE" : "POST";
      fetch("/api/pins", {
        method,
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({ entityType, entityId }),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error("Failed to toggle pin");
          }
        })
        .catch((error) => {
          // Rollback on error
          console.error("Error toggling pin:", error);
          setPinnedIds(previousPinnedRef.current);
        });
    },
    [entityType, pinnedIds]
  );

  const isPinned = useCallback(
    (entityId: string) => pinnedIds.has(entityId),
    [pinnedIds]
  );

  return { pinnedIds, isLoading, togglePin, isPinned };
}
