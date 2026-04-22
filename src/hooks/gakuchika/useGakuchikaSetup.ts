"use client";

import { useState } from "react";

export function useGakuchikaSetup() {
  const [conversationStarted, setConversationStarted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [gakuchikaTitle, setGakuchikaTitle] = useState("");
  const [gakuchikaContent, setGakuchikaContent] = useState<string | null>(null);
  const [showStarInfo, setShowStarInfo] = useState(false);
  const [restartDialogOpen, setRestartDialogOpen] = useState(false);

  return {
    conversationStarted,
    isStarting,
    gakuchikaTitle,
    gakuchikaContent,
    showStarInfo,
    restartDialogOpen,
    setConversationStarted,
    setIsStarting,
    setGakuchikaTitle,
    setGakuchikaContent,
    setShowStarInfo,
    setRestartDialogOpen,
  };
}
