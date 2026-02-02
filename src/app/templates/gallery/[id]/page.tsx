"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTemplateDetail } from "@/hooks/useTemplates";

const ArrowLeftIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const HeartIcon = ({ filled }: { filled?: boolean }) => (
  <svg
    className="w-5 h-5"
    fill={filled ? "currentColor" : "none"}
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
    />
  </svg>
);

const CopyIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
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

export default function TemplateGalleryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const templateId = useMemo(() => {
    const raw = params?.id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  const { template, isLoading, error, likeTemplate, unlikeTemplate, copyTemplate } = useTemplateDetail(
    templateId || ""
  );
  const [likePending, setLikePending] = useState(false);
  const [copyPending, setCopyPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleLike = async () => {
    if (!template) return;
    setActionError(null);
    setLikePending(true);
    try {
      if (template.isLiked) {
        await unlikeTemplate();
      } else {
        await likeTemplate();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "いいねに失敗しました");
    } finally {
      setLikePending(false);
    }
  };

  const handleCopy = async () => {
    if (!template) return;
    setActionError(null);
    setCopyPending(true);
    try {
      await copyTemplate();
      router.push("/templates");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "コピーに失敗しました");
    } finally {
      setCopyPending(false);
    }
  };

  const formatDate = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const languageLabel = template?.language === "en" ? "英語" : "日本語";
  const authorLabel = template?.isAnonymous
    ? "匿名"
    : template?.authorDisplayName || "ユーザー";
  const publishedAt = template?.sharedAt || template?.createdAt;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/templates/gallery"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeftIcon />
            ギャラリーへ戻る
          </Link>
        </div>

        {isLoading && !template ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : error && !template ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <p className="text-sm text-red-600 mb-4">{error}</p>
              <Button variant="outline" asChild>
                <Link href="/templates/gallery">ギャラリーへ戻る</Link>
              </Button>
            </CardContent>
          </Card>
        ) : !template ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground mb-4">
                テンプレートが見つかりません
              </p>
              <Button variant="outline" asChild>
                <Link href="/templates/gallery">ギャラリーへ戻る</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Title & Description */}
            <div>
              <h1 className="text-2xl font-bold">{template.title}</h1>
              <p className="text-muted-foreground mt-1">
                {template.description || "テンプレートの概要はまだ登録されていません。"}
              </p>
            </div>

            {/* Tags & Meta */}
            <div className="flex flex-wrap items-center gap-2">
              {template.industry && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {template.industry}
                </span>
              )}
              {(template.tags || []).slice(0, 6).map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {languageLabel}
              </span>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>作成者: {authorLabel}</span>
              <span>{template.viewCount} 閲覧</span>
              <span>{template.likeCount} いいね</span>
              <span>{template.copyCount} コピー</span>
            </div>

            {/* Action Error */}
            {actionError && (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-800">{actionError}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button onClick={handleCopy} disabled={copyPending}>
                {copyPending ? (
                  <LoadingSpinner />
                ) : (
                  <>
                    <CopyIcon />
                    <span className="ml-1.5">マイテンプレにコピー</span>
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleLike}
                disabled={likePending}
                className={cn(template.isLiked && "border-red-200 text-red-500")}
              >
                {likePending ? (
                  <LoadingSpinner />
                ) : (
                  <>
                    <HeartIcon filled={template.isLiked} />
                    <span className="ml-1.5">{template.isLiked ? "いいね済み" : "いいね"}</span>
                  </>
                )}
              </Button>
            </div>

            {/* Questions Card */}
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">設問一覧</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(template.questions || []).map((q, index) => (
                  <div
                    key={q.id}
                    className="p-4 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground mb-1">設問 {index + 1}</p>
                        <p className="font-medium">{q.question}</p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        目標 {q.maxLength ?? 400}字
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Meta Info Card */}
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">テンプレート情報</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">公開日</dt>
                    <dd className="font-medium">{formatDate(publishedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">更新日</dt>
                    <dd className="font-medium">{formatDate(template.updatedAt)}</dd>
                  </div>
                  {template.shareExpiresAt && (
                    <div>
                      <dt className="text-muted-foreground">公開期限</dt>
                      <dd className="font-medium">{formatDate(template.shareExpiresAt)}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-muted-foreground">設問数</dt>
                    <dd className="font-medium">{template.questions?.length || 0} 件</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
