"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface AIThread {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  messageCount: number;
}

interface AIThreadHistoryProps {
  documentId: string;
}

const HistoryIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const ChatIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
    />
  </svg>
);

const LoadingSpinner = () => (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

export function AIThreadHistory({ documentId }: AIThreadHistoryProps) {
  const [threads, setThreads] = useState<AIThread[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedThread, setSelectedThread] = useState<any>(null);
  const [isLoadingThread, setIsLoadingThread] = useState(false);

  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}/threads`);
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads || []);
      }
    } catch (e) {
      console.error("Failed to fetch threads:", e);
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  const handleThreadClick = async (threadId: string) => {
    setIsLoadingThread(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/threads/${threadId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedThread(data.thread);
      }
    } catch (e) {
      console.error("Failed to fetch thread details:", e);
    } finally {
      setIsLoadingThread(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("ja-JP", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
        <LoadingSpinner />
        読み込み中...
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        AI添削履歴はありません
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium px-1 flex items-center gap-2">
        <HistoryIcon />
        AI添削履歴
      </h3>
      {threads.map((thread) => (
        <Card
          key={thread.id}
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => handleThreadClick(thread.id)}
        >
          <CardContent className="p-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <ChatIcon />
                  <span className="text-sm font-medium">
                    {thread.title || "添削結果"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDate(thread.createdAt)}
                  {thread.messageCount > 0 && ` • ${thread.messageCount}件のメッセージ`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {selectedThread && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-background border-b border-border p-4 flex items-center justify-between">
              <div>
                <span className="text-lg font-semibold">
                  {selectedThread.title || "添削結果"}
                </span>
                <span className="text-sm text-muted-foreground ml-2">
                  {formatDate(selectedThread.createdAt)}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedThread(null)}
              >
                <CloseIcon />
              </Button>
            </div>
            <CardContent className="p-6">
              {isLoadingThread ? (
                <div className="flex items-center justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedThread.messages?.map((msg: any, index: number) => (
                    <div
                      key={index}
                      className={
                        msg.role === "assistant"
                          ? "bg-muted/50 p-4 rounded-lg"
                          : "p-4"
                      }
                    >
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        {msg.role === "assistant" ? "AI添削結果" : "ユーザー"}
                      </p>
                      <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                        {msg.content}
                      </div>
                      {msg.metadata && (
                        <div className="mt-3 text-xs text-muted-foreground">
                          {/* Display metadata if needed, like scores, improvements, etc. */}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
