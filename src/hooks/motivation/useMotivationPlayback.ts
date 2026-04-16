"use client";

import { useCallback } from "react";

import { notifyMotivationDraftReady } from "@/lib/notifications";
import { useConversationPlayback } from "@/hooks/conversation/useConversationPlayback";

import type { PendingCompleteData } from "./types";

export function useMotivationPlayback({
  applyPendingCompleteData,
}: {
  applyPendingCompleteData: (data: PendingCompleteData) => void;
}) {
  const onCommit = useCallback(
    (pendingCompleteData: PendingCompleteData) => {
      applyPendingCompleteData(pendingCompleteData);
      if (pendingCompleteData.draftReadyJustUnlocked) {
        notifyMotivationDraftReady();
      }
    },
    [applyPendingCompleteData],
  );

  return useConversationPlayback<PendingCompleteData>({ onCommit });
}
