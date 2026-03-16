"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getDeviceToken } from "@/lib/auth/device-token";
import {
  STARStatusBadge,
  STARProgressCompact,
  type STARScores,
  DeleteConfirmDialog,
} from "@/components/gakuchika";
import { GakuchikaGrid } from "@/components/gakuchika/GakuchikaGrid";
import { StatusGroup } from "@/components/gakuchika/StatusGroup";
import type { Gakuchika } from "@/components/gakuchika/GakuchikaCard";
import { usePins } from "@/hooks/usePins";
import {
  ListPageFilterBar,
  ListPageSkeleton,
  ListPageEmptyState,
  FavoritesSection,
  ViewToggle,
} from "@/components/shared";
import type { FilterTab, SortOption } from "@/components/shared";
import { Reorder } from "framer-motion";
import {
  MoreVertical,
  GripVertical,
  Pencil,
  Trash2,
  Plus,
  MessageCircle,
  LayoutGrid,
  Layers,
  List,
  Loader2,
} from "lucide-react";

// Filter tabs
const filterTabs: FilterTab[] = [
  { key: "all", label: "すべて" },
  { key: "not_started", label: "未開始" },
  { key: "in_progress", label: "深掘り中" },
  { key: "completed", label: "完了" },
];

type FilterKey = "all" | "not_started" | "in_progress" | "completed";

// Sort options
const sortOptions: SortOption[] = [
  { value: "date_desc", label: "更新日 (新しい順)" },
  { value: "date_asc", label: "更新日 (古い順)" },
  { value: "title_asc", label: "タイトル (あ→わ)" },
  { value: "title_desc", label: "タイトル (わ→あ)" },
];

type SortKey = "date_desc" | "date_asc" | "title_asc" | "title_desc";

function getStatusKey(
  status: "in_progress" | "completed" | null
): "not_started" | "in_progress" | "completed" {
  if (status === null) return "not_started";
  return status;
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

// ─── New Gakuchika Modal ────────────────────────────────────────────

interface NewGakuchikaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string, content: string) => Promise<void>;
}

function NewGakuchikaModal({
  isOpen,
  onClose,
  onCreate,
}: NewGakuchikaModalProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    setIsSubmitting(true);
    setError(null);

    try {
      await onCreate(title.trim(), content.trim());
      setTitle("");
      setContent("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setTitle("");
          setContent("");
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="text-center sm:text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-1">
              <MessageCircle className="w-6 h-6 text-primary" />
            </div>
            <DialogTitle>新しいガクチカを作成</DialogTitle>
            <DialogDescription>
              テーマと内容を入力して深掘りを始めましょう
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="gakuchika-title">
                テーマ <span className="text-red-500">*</span>
              </Label>
              <Input
                id="gakuchika-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="サークル活動、アルバイト、研究など"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gakuchika-content">
                ガクチカ内容 <span className="text-red-500">*</span>
              </Label>
              <textarea
                id="gakuchika-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="学生時代に力を入れたことを400文字程度で記入してください..."
                rows={8}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg text-sm resize-none",
                  "focus:outline-none focus:ring-2 focus:ring-primary/20",
                  "border-border"
                )}
              />
              <p className="text-xs text-muted-foreground">
                深掘りの材料として使うため、400文字程度を目安に入力してください
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={isSubmitting}>
                キャンセル
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={isSubmitting || !title.trim() || !content.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  作成中...
                </>
              ) : (
                "作成して深掘り開始"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reorder List View ──────────────────────────────────────────────

interface ReorderViewProps {
  gakuchikas: Gakuchika[];
  onReorder: (newOrder: Gakuchika[]) => void;
  onEditStart: (id: string, title: string) => void;
  onDeleteStart: (id: string) => void;
  editingId: string | null;
  editTitle: string;
  onEditTitleChange: (value: string) => void;
  onEditSave: (id: string) => void;
  onEditCancel: () => void;
}

function ReorderView({
  gakuchikas,
  onReorder,
  onEditStart,
  onDeleteStart,
  editingId,
  editTitle,
  onEditTitleChange,
  onEditSave,
  onEditCancel,
}: ReorderViewProps) {
  return (
    <div className="max-w-4xl mx-auto">
      <Reorder.Group
        axis="y"
        values={gakuchikas}
        onReorder={onReorder}
        className="space-y-4"
      >
        {gakuchikas.map((gakuchika) => (
          <Reorder.Item key={gakuchika.id} value={gakuchika}>
            <Card className="hover:bg-muted/50 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <button
                    className="cursor-grab active:cursor-grabbing pt-1 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="ドラッグして並び替え"
                  >
                    <GripVertical className="w-5 h-5" />
                  </button>

                  <Link
                    href={`/gakuchika/${gakuchika.id}`}
                    className="flex-1 min-w-0"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {editingId === gakuchika.id ? (
                          <div
                            className="mb-2"
                            onClick={(e) => e.preventDefault()}
                          >
                            <Input
                              value={editTitle}
                              onChange={(e) =>
                                onEditTitleChange(e.target.value)
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  onEditSave(gakuchika.id);
                                } else if (e.key === "Escape") {
                                  onEditCancel();
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
                                  onEditSave(gakuchika.id);
                                }}
                              >
                                保存
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.preventDefault();
                                  onEditCancel();
                                }}
                              >
                                キャンセル
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium truncate">
                              {gakuchika.title}
                            </h3>
                            <STARStatusBadge scores={gakuchika.starScores} />
                          </div>
                        )}
                        {gakuchika.summaryPreview ? (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {gakuchika.summaryPreview}
                          </p>
                        ) : gakuchika.conversationStatus === "completed" ? (
                          <p className="text-sm text-muted-foreground">
                            要約を生成中...
                          </p>
                        ) : gakuchika.conversationStatus === "in_progress" ? (
                          <p className="text-sm text-muted-foreground">
                            深掘り中...
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            タップして深掘りを開始
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-3">
                          <STARProgressCompact scores={gakuchika.starScores} />
                          <p className="text-xs text-muted-foreground">
                            {new Date(gakuchika.updatedAt).toLocaleDateString(
                              "ja-JP",
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              }
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Link>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onEditStart(gakuchika.id, gakuchika.title);
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDeleteStart(gakuchika.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Reorder.Item>
        ))}
      </Reorder.Group>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────

export default function GakuchikaListPage() {
  const router = useRouter();
  const [gakuchikas, setGakuchikas] = useState<Gakuchika[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [currentCount, setCurrentCount] = useState(0);
  const [maxCount, setMaxCount] = useState(0);

  // Filter/sort state
  const [filter, setFilter] = useState<FilterKey>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("date_desc");
  const [viewMode, setViewMode] = useState<"grid" | "status" | "reorder">(
    "grid"
  );

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reorder debounce
  const reorderTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Pins
  const { pinnedIds, togglePin } = usePins("gakuchika");

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

  const handleCreate = async (title: string, content: string) => {
    const response = await fetch("/api/gakuchika", {
      method: "POST",
      headers: buildHeaders(),
      credentials: "include",
      body: JSON.stringify({ title, content }),
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

  // Filtering & sorting
  const filteredGakuchikas = useMemo(() => {
    const normalizedQuery = searchQuery.toLowerCase().trim();
    const filtered = gakuchikas
      .filter(
        (g) => filter === "all" || getStatusKey(g.conversationStatus) === filter
      )
      .filter(
        (g) =>
          normalizedQuery === "" ||
          g.title.toLowerCase().includes(normalizedQuery)
      );

    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "date_desc":
          return (
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
        case "date_asc":
          return (
            new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
          );
        case "title_asc":
          return a.title.localeCompare(b.title, "ja");
        case "title_desc":
          return b.title.localeCompare(a.title, "ja");
        default:
          return 0;
      }
    });

    return sorted;
  }, [gakuchikas, filter, searchQuery, sortBy]);

  // Split pinned/unpinned
  const { pinnedGakuchikas, unpinnedGakuchikas } = useMemo(() => {
    const pinned = filteredGakuchikas.filter((g) => pinnedIds.has(g.id));
    const unpinned = filteredGakuchikas.filter((g) => !pinnedIds.has(g.id));
    return { pinnedGakuchikas: pinned, unpinnedGakuchikas: unpinned };
  }, [filteredGakuchikas, pinnedIds]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: gakuchikas.length,
      not_started: gakuchikas.filter(
        (g) => g.conversationStatus === null
      ).length,
      in_progress: gakuchikas.filter(
        (g) => g.conversationStatus === "in_progress"
      ).length,
      completed: gakuchikas.filter(
        (g) => g.conversationStatus === "completed"
      ).length,
    };
    return counts;
  }, [gakuchikas]);

  const isAtLimit = currentCount >= maxCount;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">
                ガクチカ深掘り
              </h1>
              {maxCount > 0 && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                  {currentCount}/{maxCount} 素材使用中
                </span>
              )}
            </div>
            <p className="mt-1 text-muted-foreground">
              AIと対話しながら自己分析を深めましょう
            </p>
          </div>
          <Button
            onClick={() => setShowNewModal(true)}
            disabled={isAtLimit}
            className="sm:self-start"
            title={
              isAtLimit
                ? "上限に達しました。プランをアップグレードしてください。"
                : ""
            }
          >
            <Plus className="w-5 h-5" />
            <span className="ml-1.5">新規作成</span>
          </Button>
        </div>

        {/* Limit warning */}
        {isAtLimit && (
          <Card className="mb-6 border-orange-200 bg-orange-50/50">
            <CardContent className="py-4">
              <p className="text-sm text-orange-800">
                ガクチカ素材の上限に達しました。
                <Link
                  href="/pricing"
                  className="text-primary hover:underline ml-1"
                >
                  プランをアップグレード
                </Link>
                して、さらに素材を追加しましょう。
              </p>
            </CardContent>
          </Card>
        )}

        {/* Filter bar */}
        {!isLoading && gakuchikas.length > 0 && (
          <ListPageFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder="タイトルで検索..."
            filterTabs={filterTabs}
            activeFilter={filter}
            onFilterChange={(key) => setFilter(key as FilterKey)}
            tabCounts={tabCounts}
            sortOptions={sortOptions}
            sortBy={sortBy}
            onSortChange={(value) => setSortBy(value as SortKey)}
            viewToggle={
              <ViewToggle
                options={[
                  {
                    key: "grid",
                    icon: <LayoutGrid className="w-4 h-4" />,
                    label: "グリッド表示",
                  },
                  {
                    key: "status",
                    icon: <Layers className="w-4 h-4" />,
                    label: "ステータス別表示",
                  },
                  {
                    key: "reorder",
                    icon: <List className="w-4 h-4" />,
                    label: "並び替え",
                  },
                ]}
                activeKey={viewMode}
                onChange={(key) =>
                  setViewMode(key as "grid" | "status" | "reorder")
                }
              />
            }
          />
        )}

        {/* Content */}
        {isLoading ? (
          <ListPageSkeleton />
        ) : gakuchikas.length === 0 ? (
          <ListPageEmptyState
            icon={
              <MessageCircle className="w-12 h-12 text-muted-foreground/50" />
            }
            title="ガクチカがありません"
            description="AIが深掘り質問をしてあなたの経験を引き出します"
            action={{
              label: "新規作成",
              icon: <Plus className="w-5 h-5" />,
              onClick: () => setShowNewModal(true),
              disabled: isAtLimit,
            }}
          />
        ) : filteredGakuchikas.length === 0 ? (
          <ListPageEmptyState
            icon={
              <MessageCircle className="w-12 h-12 text-muted-foreground/50" />
            }
            title="該当するガクチカがありません"
            description="フィルターを変更するか、新しいガクチカを追加してください"
            action={{
              label: "新規作成",
              icon: <Plus className="w-5 h-5" />,
              onClick: () => setShowNewModal(true),
              disabled: isAtLimit,
            }}
          />
        ) : viewMode === "reorder" ? (
          <ReorderView
            gakuchikas={gakuchikas}
            onReorder={handleReorder}
            onEditStart={handleEditStart}
            onDeleteStart={handleDeleteStart}
            editingId={editingId}
            editTitle={editTitle}
            onEditTitleChange={setEditTitle}
            onEditSave={handleEditSave}
            onEditCancel={handleEditCancel}
          />
        ) : viewMode === "status" ? (
          <StatusGroup
            gakuchikas={filteredGakuchikas}
            pinnedIds={pinnedIds}
            onTogglePin={togglePin}
            onEditStart={handleEditStart}
            onDeleteStart={handleDeleteStart}
          />
        ) : (
          <div className="space-y-8">
            {/* Favorites Section */}
            <FavoritesSection count={pinnedGakuchikas.length}>
              <GakuchikaGrid
                gakuchikas={pinnedGakuchikas}
                pinnedIds={pinnedIds}
                onTogglePin={togglePin}
                onEditStart={handleEditStart}
                onDeleteStart={handleDeleteStart}
              />
            </FavoritesSection>

            {/* All Gakuchikas Section */}
            {unpinnedGakuchikas.length > 0 && (
              <section>
                {pinnedGakuchikas.length > 0 && (
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-lg font-semibold text-foreground">
                      すべてのガクチカ
                    </h2>
                    <span className="text-sm text-muted-foreground">
                      ({unpinnedGakuchikas.length})
                    </span>
                  </div>
                )}
                <GakuchikaGrid
                  gakuchikas={unpinnedGakuchikas}
                  pinnedIds={pinnedIds}
                  onTogglePin={togglePin}
                  onEditStart={handleEditStart}
                  onDeleteStart={handleDeleteStart}
                />
              </section>
            )}
          </div>
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
