"use client";

import { useState } from "react";
import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useTemplates, Template, TemplateQuestion } from "@/hooks/useTemplates";

// Icons
const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const FileTextIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    />
  </svg>
);

const GlobeIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
    />
  </svg>
);

const LockIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
    />
  </svg>
);

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

interface NewTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    description?: string;
    questions: TemplateQuestion[];
  }) => Promise<void>;
}

function NewTemplateModal({ isOpen, onClose, onCreate }: NewTemplateModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<TemplateQuestion[]>([
    { id: crypto.randomUUID(), question: "", maxLength: 400 },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddQuestion = () => {
    setQuestions([
      ...questions,
      { id: crypto.randomUUID(), question: "", maxLength: 400 },
    ]);
  };

  const handleRemoveQuestion = (id: string) => {
    if (questions.length > 1) {
      setQuestions(questions.filter((q) => q.id !== id));
    }
  };

  const handleQuestionChange = (id: string, field: keyof TemplateQuestion, value: string | number) => {
    setQuestions(
      questions.map((q) =>
        q.id === id ? { ...q, [field]: value } : q
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError("タイトルを入力してください");
      return;
    }

    const validQuestions = questions.filter((q) => q.question.trim());
    if (validQuestions.length === 0) {
      setError("設問を1つ以上入力してください");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onCreate({
        title: title.trim(),
        description: description.trim() || undefined,
        questions: validQuestions,
      });
      setTitle("");
      setDescription("");
      setQuestions([{ id: crypto.randomUUID(), question: "", maxLength: 400 }]);
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
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>新しいテンプレートを作成</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="title">テンプレート名 *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例: 志望動機テンプレート"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">説明</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="このテンプレートの説明（任意）"
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>設問 *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddQuestion}
                >
                  <PlusIcon />
                  <span className="ml-1">設問を追加</span>
                </Button>
              </div>

              {questions.map((q, index) => (
                <div key={q.id} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-2">
                    <Input
                      value={q.question}
                      onChange={(e) => handleQuestionChange(q.id, "question", e.target.value)}
                      placeholder={`設問 ${index + 1}`}
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">文字数上限:</span>
                      <Input
                        type="number"
                        value={q.maxLength || ""}
                        onChange={(e) =>
                          handleQuestionChange(q.id, "maxLength", parseInt(e.target.value) || 400)
                        }
                        className="w-24"
                        min={100}
                        max={2000}
                      />
                      <span className="text-xs text-muted-foreground">文字</span>
                    </div>
                  </div>
                  {questions.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveQuestion(q.id)}
                    >
                      <TrashIcon />
                    </Button>
                  )}
                </div>
              ))}
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

export default function TemplatesPage() {
  const { templates, isLoading, error, createTemplate, deleteTemplate } = useTemplates();
  const [showNewModal, setShowNewModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate(id);
      setDeleteConfirm(null);
    } catch (err) {
      console.error("Delete failed:", err);
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

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">ESテンプレート</h1>
            <p className="text-muted-foreground mt-1">よく使う設問セットを保存して再利用できます</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/templates/gallery">ギャラリーを見る</Link>
            </Button>
            <Button onClick={() => setShowNewModal(true)}>
              <PlusIcon />
              <span className="ml-1.5">新規作成</span>
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 mb-6">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : templates.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <FileTextIcon />
              </div>
              <h3 className="text-lg font-medium mb-2">テンプレートがありません</h3>
              <p className="text-muted-foreground mb-6">
                よく使う設問セットをテンプレートとして保存しましょう
              </p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" asChild>
                  <Link href="/templates/gallery">ギャラリーから探す</Link>
                </Button>
                <Button onClick={() => setShowNewModal(true)}>
                  <PlusIcon />
                  <span className="ml-1.5">新規作成</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {templates.map((template) => (
              <Card key={template.id} className="hover:bg-muted/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{template.title}</h3>
                        {template.isPublic ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-600">
                            <GlobeIcon />
                            公開中
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <LockIcon />
                            非公開
                          </span>
                        )}
                      </div>
                      {template.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {template.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>{template.questions?.length || 0} 設問</span>
                        {template.isPublic && (
                          <>
                            <span>{template.likeCount} いいね</span>
                            <span>{template.copyCount} コピー</span>
                          </>
                        )}
                        <span>最終更新: {formatDate(template.updatedAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {deleteConfirm === template.id ? (
                        <>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(template.id)}
                          >
                            削除する
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteConfirm(null)}
                          >
                            キャンセル
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirm(template.id)}
                        >
                          <TrashIcon />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* New Modal */}
        <NewTemplateModal
          isOpen={showNewModal}
          onClose={() => setShowNewModal(false)}
          onCreate={createTemplate}
        />
      </main>
    </div>
  );
}
