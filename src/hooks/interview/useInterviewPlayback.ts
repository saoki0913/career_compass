"use client";

import { useState } from "react";

import type { Message } from "@/lib/interview/ui";

export function useInterviewPlayback() {
  const [pendingAssistantMessage, setPendingAssistantMessage] = useState<Message | null>(null);

  return {
    pendingAssistantMessage,
    setPendingAssistantMessage,
  };
}
