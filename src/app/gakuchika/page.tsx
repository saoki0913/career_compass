"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getDeviceToken } from "@/lib/auth/device-token";
import { STARStatusBadge, STARProgressCompact, type STARScores } from "@/components/gakuchika";

// Icons
const ChatIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
    />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const LoadingSpinner = () => (
  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

interface Gakuchika {
  id: string;
  title: string;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  conversationStatus: "in_progress" | "completed" | null;
  starScores: STARScores | null;
  questionCount: number;
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

type CharLimitType = "300" | "400" | "500";

const CHAR_LIMITS: { value: CharLimitType; label: string }[] = [
  { value: "300", label: "300文字" },
  { value: "400", label: "400文字" },
  { value: "500", label: "500文字" },
];

interface NewGakuchikaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string, content: string, charLimitType: CharLimitType) => Promise<void>;
}

function NewGakuchikaModal({ isOpen, onClose, onCreate }: NewGakuchikaModalProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [charLimitType, setCharLimitType] = useState<CharLimitType>("400");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const charLimit = parseInt(charLimitType);
  const charCount = content.length;
  const isOverLimit = charCount > charLimit;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError("テーマを入力してください");
      return;
    }

    if (!content.trim()) {
      setError("ガクチカの内容を入力してください");
      return;
    }

    if (isOverLimit) {
      setError(`文字数が${charLimit}文字を超えています`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onCreate(title.trim(), content.trim(), charLimitType);
      setTitle("");
      setContent("");
      setCharLimitType("400");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setTitle("");
    setContent("");
    setError(null);
    setCharLimitType("400");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>新しいガクチカを作成</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="title">テーマ *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="サークル活動、アルバイト、研究など"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="charLimit">文字数制限</Label>
                <div className="flex gap-1">
                  {CHAR_LIMITS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setCharLimitType(option.value)}
                      className={cn(
                        "px-3 py-1 text-xs rounded-full transition-colors",
                        charLimitType === option.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted hover:bg-muted/80"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="content">ガクチカ内容 *</Label>
                <span
                  className={cn(
                    "text-xs",
                    isOverLimit
                      ? "text-red-600 font-medium"
                      : charCount > charLimit * 0.9
                      ? "text-amber-600"
                      : "text-muted-foreground"
                  )}
                >
                  {charCount} / {charLimit}文字
                </span>
              </div>
              <textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="学生時代に力を入れたことを記入してください..."
                rows={8}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg text-sm resize-none",
                  "focus:outline-none focus:ring-2 focus:ring-primary/20",
                  isOverLimit ? "border-red-300 focus:ring-red-200" : "border-border"
                )}
              />
              <p className="text-xs text-muted-foreground">
                入力したガクチカをもとにAIが深掘り質問をします
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
                キャンセル
              </Button>
              <Button type="submit" disabled={isSubmitting || isOverLimit}>
                {isSubmitting ? (
                  <>
                    <LoadingSpinner />
                    <span className="ml-2">作成中...</span>
                  </>
                ) : (
                  "作成して深掘り開始"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function GakuchikaListPage() {
  const router = useRouter();
  const [gakuchikas, setGakuchikas] = useState<Gakuchika[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);

  const fetchGakuchikas = useCallback(async () => {
    try {
      const response = await fetch("/api/gakuchika", {
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch");
      }

      const data = await response.json();
      setGakuchikas(data.gakuchikas || []);
    } catch (err) {
      console.error("Error fetching gakuchikas:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGakuchikas();
  }, [fetchGakuchikas]);

  const handleCreate = async (title: string, content: string, charLimitType: CharLimitType) => {
    const response = await fetch("/api/gakuchika", {
      method: "POST",
      headers: buildHeaders(),
      credentials: "include",
      body: JSON.stringify({ title, content, charLimitType }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to create");
    }

    const data = await response.json();
    router.push(`/gakuchika/${data.gakuchika.id}`);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">ガクチカ深掘り</h1>
            <p className="text-muted-foreground mt-1">AIと対話しながら自己分析を深めましょう</p>
          </div>
          <Button onClick={() => setShowNewModal(true)}>
            <PlusIcon />
            <span className="ml-1.5">新規作成</span>
          </Button>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : gakuchikas.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <ChatIcon />
              </div>
              <h3 className="text-lg font-medium mb-2">ガクチカがありません</h3>
              <p className="text-muted-foreground mb-6">
                AIが深掘り質問をしてあなたの経験を引き出します
              </p>
              <Button variant="outline" onClick={() => setShowNewModal(true)}>
                <PlusIcon />
                <span className="ml-1.5">新規作成</span>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {gakuchikas.map((gakuchika) => (
              <Link key={gakuchika.id} href={`/gakuchika/${gakuchika.id}`}>
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium truncate">{gakuchika.title}</h3>
                          <STARStatusBadge scores={gakuchika.starScores} />
                        </div>
                        {gakuchika.summary ? (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {gakuchika.summary}
                          </p>
                        ) : gakuchika.conversationStatus === "in_progress" ? (
                          <p className="text-sm text-muted-foreground">深掘り中...</p>
                        ) : (
                          <p className="text-sm text-muted-foreground">タップして深掘りを開始</p>
                        )}
                        <div className="flex items-center justify-between mt-3">
                          <STARProgressCompact scores={gakuchika.starScores} />
                          <p className="text-xs text-muted-foreground">
                            {formatDate(gakuchika.updatedAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {/* New Modal */}
        <NewGakuchikaModal
          isOpen={showNewModal}
          onClose={() => setShowNewModal(false)}
          onCreate={handleCreate}
        />
      </main>
    </div>
  );
}
