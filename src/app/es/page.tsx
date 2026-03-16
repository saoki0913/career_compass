"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { MultiSelect } from "@/components/ui/multi-select";
import { cn } from "@/lib/utils";
import {
  useDocuments,
  DOCUMENT_TYPE_LABELS,
  CreateDocumentInput,
} from "@/hooks/useDocuments";
import { useCompanies } from "@/hooks/useCompanies";
import { usePins } from "@/hooks/usePins";
import { ESGrid } from "@/components/es/ESGrid";
import { CompanyGroup } from "@/components/es/CompanyGroup";
import {
  ListPageFilterBar,
  ListPageSkeleton,
  ListPageEmptyState,
  FavoritesSection,
  ViewToggle,
} from "@/components/shared";
import type { FilterTab, SortOption } from "@/components/shared";
import {
  Plus,
  FileText,
  Trash2,
  RotateCcw,
  LayoutGrid,
  Layers,
  Building2,
  Check,
  ChevronsUpDown,
  Loader2,
} from "lucide-react";

// Filter tabs
const filterTabs: FilterTab[] = [
  { key: "all", label: "すべて" },
  { key: "draft", label: "下書き" },
  { key: "published", label: "提出済み" },
];

type FilterKey = "all" | "draft" | "published";

// Sort options
const sortOptions: SortOption[] = [
  { value: "date_desc", label: "更新日 (新しい順)" },
  { value: "date_asc", label: "更新日 (古い順)" },
  { value: "title_asc", label: "タイトル (あ→わ)" },
  { value: "title_desc", label: "タイトル (わ→あ)" },
];

type SortKey = "date_desc" | "date_asc" | "title_asc" | "title_desc";

// ─── New Document Modal ─────────────────────────────────────────────

interface NewDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: CreateDocumentInput) => Promise<void>;
  companies: Array<{ id: string; name: string }>;
  initialCompanyId?: string;
}

function NewDocumentModal({
  isOpen,
  onClose,
  onCreate,
  companies,
  initialCompanyId,
}: NewDocumentModalProps) {
  const [title, setTitle] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companyOpen, setCompanyOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setTitle("");
      setSelectedCompanyId("");
      setCompanyOpen(false);
      setError(null);
    } else if (initialCompanyId) {
      const company = companies.find((c) => c.id === initialCompanyId);
      if (company) {
        setSelectedCompanyId(initialCompanyId);
        setTitle(`${company.name}ES`);
      }
    }
  }, [isOpen, initialCompanyId, companies]);

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError("タイトルを入力してください");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onCreate({
        title: title.trim(),
        type: "es",
        companyId: selectedCompanyId || undefined,
      });
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
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="text-center sm:text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-1">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <DialogTitle>新しいESを作成</DialogTitle>
            <DialogDescription>
              タイトルを入力してESの編集を始めましょう
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {error && title.trim() && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="title">
                タイトル <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="〇〇会社 夏インターンES"
                autoFocus
                className={cn(
                  error &&
                    !title.trim() &&
                    "border-red-300 focus-visible:ring-red-500"
                )}
              />
              {error && !title.trim() && (
                <p className="text-xs text-red-500">
                  タイトルを入力してください
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>企業（任意）</Label>
              <Popover
                open={companyOpen}
                onOpenChange={setCompanyOpen}
                modal={true}
              >
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={companyOpen}
                    className="w-full justify-between font-normal h-10"
                  >
                    {selectedCompany ? (
                      <span className="flex items-center gap-2 truncate">
                        <Building2 className="w-4 h-4" />
                        {selectedCompany.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        企業を選択...
                      </span>
                    )}
                    <ChevronsUpDown className="w-4 h-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] p-0"
                  align="start"
                >
                  <Command shouldFilter={true}>
                    <CommandInput placeholder="企業名で検索..." />
                    <CommandList>
                      <CommandEmpty>企業が見つかりません</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="__none__"
                          onSelect={() => {
                            setSelectedCompanyId("");
                            setCompanyOpen(false);
                          }}
                        >
                          <span
                            className={cn(
                              "mr-2 h-4 w-4 shrink-0",
                              !selectedCompanyId
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          >
                            <Check className="w-4 h-4" />
                          </span>
                          <span className="text-muted-foreground">
                            選択なし
                          </span>
                        </CommandItem>
                      </CommandGroup>
                      {companies.length > 0 && (
                        <>
                          <CommandSeparator />
                          <CommandGroup>
                            {companies.map((company) => (
                              <CommandItem
                                key={company.id}
                                value={company.name}
                                onSelect={() => {
                                  setSelectedCompanyId(company.id);
                                  setCompanyOpen(false);
                                }}
                              >
                                <span
                                  className={cn(
                                    "mr-2 h-4 w-4 shrink-0",
                                    selectedCompanyId === company.id
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                >
                                  <Check className="w-4 h-4" />
                                </span>
                                <Building2 className="w-4 h-4" />
                                <span className="truncate">
                                  {company.name}
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={isSubmitting}>
                キャンセル
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting || !title.trim()}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  作成中...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  ESを作成
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────

export default function ESListPage() {
  return (
    <Suspense>
      <ESListPageContent />
    </Suspense>
  );
}

function ESListPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showNewModal, setShowNewModal] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [initialCompanyId, setInitialCompanyId] = useState<
    string | undefined
  >();
  const [gakuchikaContext, setGakuchikaContext] = useState<{
    id: string;
    title: string;
    summary: string | null;
  } | null>(null);

  // Filter/sort state
  const [filter, setFilter] = useState<FilterKey>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("date_desc");
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [groupByCompany, setGroupByCompany] = useState(false);

  // Hooks
  const {
    documents,
    isLoading,
    createDocument,
    updateDocument,
    deleteDocument,
    restoreDocument,
    permanentlyDeleteDocument,
  } = useDocuments({ type: "es", includeDeleted: showTrash });
  const { companies } = useCompanies();
  const { pinnedIds, togglePin } = usePins("document");

  // URL param handlers
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- query param should open the modal before the URL is cleaned up
      setShowNewModal(true);
      router.replace("/es", { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    const companyId = searchParams.get("companyId");
    if (companyId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preserve selected company while handling a one-shot deep link
      setInitialCompanyId(companyId);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- query param should open the modal before the URL is cleaned up
      setShowNewModal(true);
      router.replace("/es", { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    const gakuchikaId = searchParams.get("gakuchikaId");
    if (gakuchikaId) {
      fetch(`/api/gakuchika/${gakuchikaId}`, { credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.gakuchika) {
            setGakuchikaContext({
              id: data.gakuchika.id,
              title: data.gakuchika.title,
              summary: data.gakuchika.summary,
            });
          }
        })
        .catch(() => {});
      // eslint-disable-next-line react-hooks/set-state-in-effect -- query param should open the modal before the URL is cleaned up
      setShowNewModal(true);
      router.replace("/es", { scroll: false });
    }
  }, [searchParams, router]);

  // Handlers
  const handleCreate = async (data: CreateDocumentInput) => {
    const doc = await createDocument(data);
    if (doc) {
      router.push(`/es/${doc.id}`);
    }
  };

  const handleRestore = async (documentId: string) => {
    if (confirm("このドキュメントを復元しますか？")) {
      await restoreDocument(documentId);
    }
  };

  const handlePermanentDelete = async (documentId: string) => {
    if (
      confirm(
        "このドキュメントを完全に削除しますか？この操作は取り消せません。"
      )
    ) {
      await permanentlyDeleteDocument(documentId);
    }
  };

  const handleToggleStatus = async (
    documentId: string,
    currentStatus: string
  ) => {
    if (statusUpdatingId) return;
    const nextStatus = currentStatus === "published" ? "draft" : "published";
    setStatusUpdatingId(documentId);
    await updateDocument(documentId, { status: nextStatus });
    setStatusUpdatingId(null);
  };

  // Derived data
  const activeDocuments = documents.filter((doc) => doc.status !== "deleted");
  const trashedDocuments = documents.filter((doc) => doc.status === "deleted");
  const displayedDocuments = showTrash ? trashedDocuments : activeDocuments;

  // Company options for multi-select filter
  const companyOptions = useMemo(() => {
    const uniqueCompanies = new Map<string, string>();
    for (const doc of activeDocuments) {
      if (doc.company) {
        uniqueCompanies.set(doc.company.id, doc.company.name);
      }
    }
    return Array.from(uniqueCompanies.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  }, [activeDocuments]);

  // Filter and sort
  const filteredDocuments = useMemo(() => {
    const normalizedQuery = searchQuery.toLowerCase().trim();
    const filtered = activeDocuments
      .filter((doc) => filter === "all" || doc.status === filter)
      .filter(
        (doc) =>
          selectedCompanies.length === 0 ||
          (doc.companyId && selectedCompanies.includes(doc.companyId))
      )
      .filter(
        (doc) =>
          normalizedQuery === "" ||
          doc.title.toLowerCase().includes(normalizedQuery) ||
          (doc.company?.name || "").toLowerCase().includes(normalizedQuery)
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
  }, [activeDocuments, filter, selectedCompanies, searchQuery, sortBy]);

  // Split pinned/unpinned
  const { pinnedDocs, unpinnedDocs } = useMemo(() => {
    const pinned = filteredDocuments.filter((doc) => pinnedIds.has(doc.id));
    const unpinned = filteredDocuments.filter((doc) => !pinnedIds.has(doc.id));
    return { pinnedDocs: pinned, unpinnedDocs: unpinned };
  }, [filteredDocuments, pinnedIds]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: activeDocuments.length,
      draft: activeDocuments.filter((d) => d.status === "draft").length,
      published: activeDocuments.filter((d) => d.status === "published").length,
    };
    return counts;
  }, [activeDocuments]);

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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ES作成</h1>
            <p className="mt-1 text-muted-foreground">
              {activeDocuments.length}件のエントリーシート
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowTrash(!showTrash)}
            >
              <Trash2 className="w-4 h-4" />
              <span className="ml-1.5">
                {showTrash ? "通常表示" : "ゴミ箱"}
              </span>
              {trashedDocuments.length > 0 && !showTrash && (
                <span className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded-full">
                  {trashedDocuments.length}
                </span>
              )}
            </Button>
            {!showTrash && (
              <Button onClick={() => setShowNewModal(true)}>
                <Plus className="w-5 h-5" />
                <span className="ml-1.5">新規作成</span>
              </Button>
            )}
          </div>
        </div>

        {/* Gakuchika context banner */}
        {gakuchikaContext && (
          <div className="mb-6 p-4 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                <svg
                  className="w-4 h-4 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  ガクチカ「{gakuchikaContext.title}
                  」の深掘り結果を活用
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  ESを作成すると、深掘りで得られた経験や強みが添削時に自動的に参照されます。
                </p>
              </div>
              <button
                onClick={() => setGakuchikaContext(null)}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="閉じる"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Filter bar - hidden in trash mode */}
        {!showTrash && !isLoading && activeDocuments.length > 0 && (
          <ListPageFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder="タイトル・企業名で検索..."
            filterTabs={filterTabs}
            activeFilter={filter}
            onFilterChange={(key) => setFilter(key as FilterKey)}
            tabCounts={tabCounts}
            sortOptions={sortOptions}
            sortBy={sortBy}
            onSortChange={(value) => setSortBy(value as SortKey)}
            extraFilter={
              companyOptions.length > 0 ? (
                <MultiSelect
                  options={companyOptions}
                  selected={selectedCompanies}
                  onChange={setSelectedCompanies}
                  placeholder="企業"
                  className="w-[160px]"
                />
              ) : undefined
            }
            viewToggle={
              <ViewToggle
                options={[
                  {
                    key: "grid",
                    icon: <LayoutGrid className="w-4 h-4" />,
                    label: "グリッド表示",
                  },
                  {
                    key: "company",
                    icon: <Layers className="w-4 h-4" />,
                    label: "企業別表示",
                  },
                ]}
                activeKey={groupByCompany ? "company" : "grid"}
                onChange={(key) => setGroupByCompany(key === "company")}
              />
            }
          />
        )}

        {/* Content */}
        {isLoading ? (
          <ListPageSkeleton />
        ) : showTrash ? (
          // Trash view
          trashedDocuments.length === 0 ? (
            <ListPageEmptyState
              icon={
                <Trash2 className="w-12 h-12 text-muted-foreground/50" />
              }
              title="ゴミ箱は空です"
              description="削除されたドキュメントはありません"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
              {trashedDocuments.map((doc) => (
                <Card key={doc.id} className="h-full">
                  <CardContent className="p-4 flex flex-col h-full">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        削除済み
                      </span>
                    </div>
                    <h3 className="font-medium truncate mb-1">{doc.title}</h3>
                    {doc.company && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mb-2">
                        <Building2 className="w-3.5 h-3.5" />
                        {doc.company.name}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-auto mb-3">
                      削除日: {formatDate(doc.deletedAt || doc.updatedAt)}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRestore(doc.id)}
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span className="ml-1">復元</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handlePermanentDelete(doc.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="ml-1">完全削除</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        ) : filteredDocuments.length === 0 ? (
          <ListPageEmptyState
            icon={<FileText className="w-12 h-12 text-muted-foreground/50" />}
            title={
              filter !== "all" || searchQuery || selectedCompanies.length > 0
                ? "該当するESがありません"
                : "ESがありません"
            }
            description={
              filter !== "all" || searchQuery || selectedCompanies.length > 0
                ? "フィルターを変更するか、新しいESを追加してください"
                : "「新規作成」ボタンからESを作成しましょう"
            }
            action={{
              label: "新規作成",
              icon: <Plus className="w-5 h-5" />,
              onClick: () => setShowNewModal(true),
            }}
          />
        ) : groupByCompany ? (
          <CompanyGroup
            documents={filteredDocuments}
            pinnedIds={pinnedIds}
            onTogglePin={togglePin}
            onToggleStatus={handleToggleStatus}
            statusUpdatingId={statusUpdatingId}
          />
        ) : (
          <div className="space-y-8">
            {/* Favorites Section */}
            <FavoritesSection count={pinnedDocs.length}>
              <ESGrid
                documents={pinnedDocs}
                pinnedIds={pinnedIds}
                onTogglePin={togglePin}
                onToggleStatus={handleToggleStatus}
                statusUpdatingId={statusUpdatingId}
              />
            </FavoritesSection>

            {/* All Documents Section */}
            {unpinnedDocs.length > 0 && (
              <section>
                {pinnedDocs.length > 0 && (
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-lg font-semibold text-foreground">
                      すべてのES
                    </h2>
                    <span className="text-sm text-muted-foreground">
                      ({unpinnedDocs.length})
                    </span>
                  </div>
                )}
                <ESGrid
                  documents={unpinnedDocs}
                  pinnedIds={pinnedIds}
                  onTogglePin={togglePin}
                  onToggleStatus={handleToggleStatus}
                  statusUpdatingId={statusUpdatingId}
                />
              </section>
            )}
          </div>
        )}

        {/* New Document Modal */}
        <NewDocumentModal
          isOpen={showNewModal}
          onClose={() => {
            setShowNewModal(false);
            setInitialCompanyId(undefined);
          }}
          onCreate={handleCreate}
          companies={companies}
          initialCompanyId={initialCompanyId}
        />
      </main>
    </div>
  );
}
