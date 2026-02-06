"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getDeviceToken } from "@/lib/auth/device-token";
import {
  STARStatusBadge,
  STARProgressCompact,
  type STARScores,
  DeleteConfirmDialog
} from "@/components/gakuchika";
import { Reorder } from "framer-motion";
import { MoreVertical, GripVertical, Pencil, Trash2, Plus } from "lucide-react";

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
  const [currentCount, setCurrentCount] = useState(0);
  const [maxCount, setMaxCount] = useState(0);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reorder debounce
  const reorderTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      setCurrentCount(data.currentCount || 0);
      setMaxCount(data.maxCount || 0);
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

  const handleEditStart = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditTitle("");
  };

  const handleEditSave = async (id: string) => {
    if (!editTitle.trim()) return;

    try {
      const response = await fetch(`/api/gakuchika/${id}`, {
        method: "PUT",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({ title: editTitle.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to update");
      }

      setGakuchikas((prev) =>
        prev.map((g) => (g.id === id ? { ...g, title: editTitle.trim() } : g))
      );
      setEditingId(null);
      setEditTitle("");
    } catch (err) {
      console.error("Error updating title:", err);
    }
  };

  const handleDeleteStart = (id: string) => {
    setDeleteId(id);
  };

  const handleDeleteCancel = () => {
    setDeleteId(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteId) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/gakuchika/${deleteId}`, {
        method: "DELETE",
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to delete");
      }

      setGakuchikas((prev) => prev.filter((g) => g.id !== deleteId));
      setCurrentCount((prev) => Math.max(0, prev - 1));
      setDeleteId(null);
    } catch (err) {
      console.error("Error deleting gakuchika:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReorder = (newOrder: Gakuchika[]) => {
    setGakuchikas(newOrder);

    // Debounce API call
    if (reorderTimeoutRef.current) {
      clearTimeout(reorderTimeoutRef.current);
    }

    reorderTimeoutRef.current = setTimeout(async () => {
      try {
        const orderedIds = newOrder.map((g) => g.id);
        await fetch("/api/gakuchika/reorder", {
          method: "PATCH",
          headers: buildHeaders(),
          credentials: "include",
          body: JSON.stringify({ orderedIds }),
        });
      } catch (err) {
        console.error("Error reordering:", err);
      }
    }, 500);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const parseSummary = (summary: string | null): string => {
    if (!summary) return "";
    try {
      const parsed = JSON.parse(summary);
      return parsed.summary || summary;
    } catch {
      return summary;
    }
  };

  const isAtLimit = currentCount >= maxCount;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">ガクチカ深掘り</h1>
              {maxCount > 0 && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                  {currentCount}/{maxCount} 素材使用中
                </span>
              )}
            </div>
            <p className="text-muted-foreground mt-1">AIと対話しながら自己分析を深めましょう</p>
          </div>
          <Button
            onClick={() => setShowNewModal(true)}
            disabled={isAtLimit}
            className="hidden sm:flex"
            title={isAtLimit ? "上限に達しました。プランをアップグレードしてください。" : ""}
          >
            <PlusIcon />
            <span className="ml-1.5">新規作成</span>
          </Button>
        </div>

        {isAtLimit && (
          <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-sm text-amber-800">
              ガクチカ素材の上限に達しました。
              <Link href="/pricing" className="underline font-medium ml-1">
                プランをアップグレード
              </Link>
              して、さらに素材を追加しましょう。
            </p>
          </div>
        )}

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
              <Button variant="outline" onClick={() => setShowNewModal(true)} disabled={isAtLimit}>
                <PlusIcon />
                <span className="ml-1.5">新規作成</span>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Reorder.Group
            axis="y"
            values={gakuchikas}
            onReorder={handleReorder}
            className="space-y-4"
          >
            {gakuchikas.map((gakuchika) => (
              <Reorder.Item key={gakuchika.id} value={gakuchika}>
                <Card className="hover:bg-muted/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Drag Handle */}
                      <button
                        className="cursor-grab active:cursor-grabbing pt-1 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="ドラッグして並び替え"
                      >
                        <GripVertical className="w-5 h-5" />
                      </button>

                      {/* Content - clickable to navigate */}
                      <Link href={`/gakuchika/${gakuchika.id}`} className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            {editingId === gakuchika.id ? (
                              <div className="mb-2" onClick={(e) => e.preventDefault()}>
                                <Input
                                  value={editTitle}
                                  onChange={(e) => setEditTitle(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      handleEditSave(gakuchika.id);
                                    } else if (e.key === "Escape") {
                                      handleEditCancel();
                                    }
                                  }}
                                  autoFocus
                                  className="text-sm"
                                />
                                <div className="flex gap-2 mt-2">
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleEditSave(gakuchika.id);
                                    }}
                                  >
                                    保存
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleEditCancel();
                                    }}
                                  >
                                    キャンセル
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-medium truncate">{gakuchika.title}</h3>
                                <STARStatusBadge scores={gakuchika.starScores} />
                              </div>
                            )}
                            {gakuchika.summary ? (
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {parseSummary(gakuchika.summary)}
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
                      </Link>

                      {/* Three-dot menu */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-40 p-1" align="end">
                          <button
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleEditStart(gakuchika.id, gakuchika.title);
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                            タイトル編集
                          </button>
                          <button
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md hover:bg-destructive/10 text-destructive transition-colors"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDeleteStart(gakuchika.id);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                            削除
                          </button>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </CardContent>
                </Card>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        )}

        {/* Mobile FAB */}
        {!isLoading && (
          <Button
            onClick={() => setShowNewModal(true)}
            disabled={isAtLimit}
            className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg sm:hidden"
            size="icon"
            title={isAtLimit ? "上限に達しました" : "新規作成"}
          >
            <Plus className="w-6 h-6" />
          </Button>
        )}

        {/* New Modal */}
        <NewGakuchikaModal
          isOpen={showNewModal}
          onClose={() => setShowNewModal(false)}
          onCreate={handleCreate}
        />

        {/* Delete Confirmation */}
        <DeleteConfirmDialog
          isOpen={deleteId !== null}
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
          title={gakuchikas.find((g) => g.id === deleteId)?.title || ""}
          isDeleting={isDeleting}
        />
      </main>
    </div>
  );
}
