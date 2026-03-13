"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useDocuments, DOCUMENT_TYPE_LABELS, CreateDocumentInput } from "@/hooks/useDocuments";
import { useCompanies } from "@/hooks/useCompanies";

// Icons
const DocumentIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
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

const BuildingIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
    />
  </svg>
);

// Hero icon for dialog header
const DocumentPlusIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M14.5 2.5v4a1 1 0 001 1h4"
    />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
  </svg>
);

const ChevronsUpDownIcon = () => (
  <svg className="w-4 h-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 15l5 5 5-5M7 9l5-5 5 5" />
  </svg>
);

interface NewDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: CreateDocumentInput) => Promise<void>;
  companies: Array<{ id: string; name: string }>;
  initialCompanyId?: string;
}

function NewDocumentModal({ isOpen, onClose, onCreate, companies, initialCompanyId }: NewDocumentModalProps) {
  const [title, setTitle] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companyOpen, setCompanyOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens/closes, pre-fill if initialCompanyId is provided
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
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="text-center sm:text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-1">
              <span className="text-primary">
                <DocumentPlusIcon />
              </span>
            </div>
            <DialogTitle>新しいESを作成</DialogTitle>
            <DialogDescription>
              タイトルを入力してESの編集を始めましょう
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {/* Server error */}
            {error && title.trim() && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Title field */}
            <div className="space-y-2">
              <Label htmlFor="title">
                タイトル <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => { setTitle(e.target.value); if (error) setError(null); }}
                placeholder="〇〇会社 夏インターンES"
                autoFocus
                className={cn(
                  error && !title.trim() && "border-red-300 focus-visible:ring-red-500"
                )}
              />
              {error && !title.trim() && (
                <p className="text-xs text-red-500">タイトルを入力してください</p>
              )}
            </div>

            {/* Company combobox */}
            <div className="space-y-2">
              <Label>企業（任意）</Label>
              <Popover open={companyOpen} onOpenChange={setCompanyOpen} modal={true}>
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
                        <BuildingIcon />
                        {selectedCompany.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">企業を選択...</span>
                    )}
                    <ChevronsUpDownIcon />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command shouldFilter={true}>
                    <CommandInput placeholder="企業名で検索..." />
                    <CommandList>
                      <CommandEmpty>企業が見つかりません</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="__none__"
                          onSelect={() => { setSelectedCompanyId(""); setCompanyOpen(false); }}
                        >
                          <span className={cn("mr-2 h-4 w-4 shrink-0", !selectedCompanyId ? "opacity-100" : "opacity-0")}>
                            <CheckIcon />
                          </span>
                          <span className="text-muted-foreground">選択なし</span>
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
                                onSelect={() => { setSelectedCompanyId(company.id); setCompanyOpen(false); }}
                              >
                                <span className={cn("mr-2 h-4 w-4 shrink-0", selectedCompanyId === company.id ? "opacity-100" : "opacity-0")}>
                                  <CheckIcon />
                                </span>
                                <BuildingIcon />
                                <span className="truncate">{company.name}</span>
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
                  <LoadingSpinner />
                  作成中...
                </>
              ) : (
                <>
                  <PlusIcon />
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

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
);

const RestoreIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
  </svg>
);

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
  const [initialCompanyId, setInitialCompanyId] = useState<string | undefined>();
  const [gakuchikaContext, setGakuchikaContext] = useState<{
    id: string;
    title: string;
    summary: string | null;
  } | null>(null);

  // Auto-open new document modal when ?new=1 is in URL
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setShowNewModal(true);
      router.replace("/es", { scroll: false });
    }
  }, [searchParams, router]);

  // Auto-open new document modal with company pre-filled when ?companyId=xxx is in URL
  useEffect(() => {
    const companyId = searchParams.get("companyId");
    if (companyId) {
      setInitialCompanyId(companyId);
      setShowNewModal(true);
      router.replace("/es", { scroll: false });
    }
  }, [searchParams, router]);

  // Handle ?gakuchikaId=xxx from gakuchika completion screen
  useEffect(() => {
    const gakuchikaId = searchParams.get("gakuchikaId");
    if (gakuchikaId) {
      // Fetch gakuchika info for the banner
      fetch(`/api/gakuchika/${gakuchikaId}`, {
        credentials: "include",
      })
        .then((res) => res.ok ? res.json() : null)
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

      // Auto-open the new document modal
      setShowNewModal(true);
      // Clean URL
      router.replace("/es", { scroll: false });
    }
  }, [searchParams, router]);
  const { documents, isLoading, createDocument, updateDocument, deleteDocument, restoreDocument, permanentlyDeleteDocument } = useDocuments({ type: "es", includeDeleted: showTrash });
  const { companies } = useCompanies();

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
    if (confirm("このドキュメントを完全に削除しますか？この操作は取り消せません。")) {
      await permanentlyDeleteDocument(documentId);
    }
  };

  const handleToggleStatus = async (documentId: string, currentStatus: string) => {
    if (statusUpdatingId) return;
    const nextStatus = currentStatus === "published" ? "draft" : "published";
    setStatusUpdatingId(documentId);
    await updateDocument(documentId, { status: nextStatus });
    setStatusUpdatingId(null);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const activeDocuments = documents.filter(doc => doc.status !== "deleted");
  const trashedDocuments = documents.filter(doc => doc.status === "deleted");
  const displayedDocuments = showTrash ? trashedDocuments : activeDocuments;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">ES作成</h1>
            <p className="text-muted-foreground mt-1">エントリーシートを作成・編集</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowTrash(!showTrash)}>
              <TrashIcon />
              <span className="ml-1.5">{showTrash ? "通常表示" : "ゴミ箱"}</span>
            </Button>
            {!showTrash && (
              <Button onClick={() => setShowNewModal(true)}>
                <PlusIcon />
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
                <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  ガクチカ「{gakuchikaContext.title}」の深掘り結果を活用
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
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Document list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : displayedDocuments.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                {showTrash ? <TrashIcon /> : <DocumentIcon />}
              </div>
              <h3 className="text-lg font-medium mb-2">
                {showTrash ? "ゴミ箱は空です" : "ESがありません"}
              </h3>
              <p className="text-muted-foreground mb-6">
                {showTrash
                  ? "削除されたドキュメントはありません"
                  : "「新規作成」ボタンからESを作成しましょう"}
              </p>
              {!showTrash && (
                <Button variant="outline" onClick={() => setShowNewModal(true)}>
                  <PlusIcon />
                  <span className="ml-1.5">新規作成</span>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayedDocuments.map((doc) => (
              <Card key={doc.id} className="h-full hover:bg-muted/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {DOCUMENT_TYPE_LABELS[doc.type]}
                        </span>
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-full",
                            doc.status === "draft"
                              ? "bg-amber-100 text-amber-700"
                              : doc.status === "published"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-gray-100 text-gray-600"
                          )}
                        >
                          {doc.status === "draft"
                            ? "下書き"
                            : doc.status === "published"
                            ? "提出済み"
                            : "削除済み"}
                        </span>
                      </div>
                      {showTrash ? (
                        <h3 className="font-medium truncate">{doc.title}</h3>
                      ) : (
                        <Link href={`/es/${doc.id}`}>
                          <h3 className="font-medium truncate hover:underline cursor-pointer">
                            {doc.title}
                          </h3>
                        </Link>
                      )}
                      {doc.company && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <BuildingIcon />
                          {doc.company.name}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        {showTrash && doc.deletedAt
                          ? `削除日: ${formatDate(doc.deletedAt)}`
                          : `最終更新: ${formatDate(doc.updatedAt)}`}
                      </p>
                    </div>
                    {!showTrash && doc.status !== "deleted" && (
                      <Button
                        size="sm"
                        variant={doc.status === "published" ? "secondary" : "outline"}
                        className="shrink-0"
                        disabled={statusUpdatingId === doc.id}
                        onClick={() => handleToggleStatus(doc.id, doc.status)}
                      >
                        {statusUpdatingId === doc.id ? (
                          <>
                            <LoadingSpinner />
                            <span className="ml-1">更新中</span>
                          </>
                        ) : doc.status === "published" ? (
                          "下書きに戻す"
                        ) : (
                          "提出済みにする"
                        )}
                      </Button>
                    )}
                  </div>
                  {showTrash && (
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRestore(doc.id)}
                      >
                        <RestoreIcon />
                        <span className="ml-1">復元</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handlePermanentDelete(doc.id)}
                      >
                        <TrashIcon />
                        <span className="ml-1">完全削除</span>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* New Document Modal */}
        <NewDocumentModal
          isOpen={showNewModal}
          onClose={() => { setShowNewModal(false); setInitialCompanyId(undefined); }}
          onCreate={handleCreate}
          companies={companies}
          initialCompanyId={initialCompanyId}
        />
      </main>
    </div>
  );
}
