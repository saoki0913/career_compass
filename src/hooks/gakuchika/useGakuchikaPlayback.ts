"use client";

import { useCallback, useState } from "react";

import { useConversationPlayback } from "@/hooks/conversation/useConversationPlayback";
import type { PendingGakuchikaCompleteData } from "@/lib/gakuchika/ui";

export function useGakuchikaPlayback({
  applyConversationUpdate,
}: {
  applyConversationUpdate: (data: PendingGakuchikaCompleteData) => void;
}) {
  const [isBufferingQuestionChunks, setIsBufferingQuestionChunks] = useState(false);

  const onCommit = useCallback(
    (pendingCompleteData: PendingGakuchikaCompleteData) => {
      applyConversationUpdate(pendingCompleteData);
      setIsBufferingQuestionChunks(false);
    },
    [applyConversationUpdate],
  );

  return {
    ...useConversationPlayback<PendingGakuchikaCompleteData>({ onCommit }),
    isBufferingQuestionChunks,
    setIsBufferingQuestionChunks,
  };
}
