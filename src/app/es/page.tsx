"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface NewDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: CreateDocumentInput) => Promise<void>;
  companies: Array<{ id: string; name: string }>;
}

function NewDocumentModal({ isOpen, onClose, onCreate, companies }: NewDocumentModalProps) {
  const [title, setTitle] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setTitle("");
      setSelectedCompanyId("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>新しいESを作成</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="title">タイトル *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="〇〇会社 夏インターンES"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company">企業（任意）</Label>
              <select
                id="company"
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">企業を選択...</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                キャンセル
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <LoadingSpinner />
                    <span className="ml-2">作成中...</span>
                  </>
                ) : (
                  "作成"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
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
  const router = useRouter();
  const [showNewModal, setShowNewModal] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const { documents, isLoading, createDocument, deleteDocument, restoreDocument, permanentlyDeleteDocument } = useDocuments({ type: "es", includeDeleted: showTrash });
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
                  <div className="flex items-start justify-between">
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
                            ? "公開中"
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
          onClose={() => setShowNewModal(false)}
          onCreate={handleCreate}
          companies={companies}
        />
      </main>
    </div>
  );
}
