"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useGallery, Template } from "@/hooks/useTemplates";

// Icons
const SearchIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
    />
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

const ArrowLeftIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
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

const INDUSTRIES = [
  { value: "", label: "すべての業界" },
  { value: "IT", label: "IT・通信" },
  { value: "製造", label: "製造" },
  { value: "金融", label: "金融" },
  { value: "商社", label: "商社" },
  { value: "コンサル", label: "コンサルティング" },
  { value: "広告", label: "広告・マスコミ" },
  { value: "小売", label: "小売・流通" },
  { value: "不動産", label: "不動産・建設" },
  { value: "その他", label: "その他" },
];

const SORT_OPTIONS = [
  { value: "popular", label: "人気順" },
  { value: "newest", label: "新着順" },
  { value: "likes", label: "いいね数" },
];

export default function TemplateGalleryPage() {
  const router = useRouter();
  const [sort, setSort] = useState<"popular" | "newest" | "likes">("popular");
  const [industry, setIndustry] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const {
    templates,
    isLoading,
    error,
    hasMore,
    loadMore,
    likeTemplate,
    unlikeTemplate,
    copyTemplate,
  } = useGallery({ sort, industry: industry || undefined, search: search || undefined });

  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const handleLike = async (template: Template) => {
    try {
      if (template.isLiked) {
        await unlikeTemplate(template.id);
      } else {
        await likeTemplate(template.id);
      }
    } catch (err) {
      console.error("Like failed:", err);
    }
  };

  const handleCopy = async (template: Template) => {
    try {
      setCopyingId(template.id);
      setCopyError(null);
      const newTemplate = await copyTemplate(template.id);
      router.push("/templates");
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : "コピーに失敗しました");
    } finally {
      setCopyingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/templates"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeftIcon />
            マイテンプレート
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold">テンプレートギャラリー</h1>
          <p className="text-muted-foreground mt-1">他のユーザーが公開したテンプレートを探せます</p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <SearchIcon />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="テンプレートを検索..."
                className="pl-10"
              />
            </div>
            <Button type="submit" variant="outline">
              検索
            </Button>
          </form>

          <div className="flex gap-2">
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="px-3 py-2 rounded-md border border-input bg-background text-sm"
            >
              {INDUSTRIES.map((ind) => (
                <option key={ind.value} value={ind.value}>
                  {ind.label}
                </option>
              ))}
            </select>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as "popular" | "newest" | "likes")}
              className="px-3 py-2 rounded-md border border-input bg-background text-sm"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Error */}
        {(error || copyError) && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 mb-6">
            <p className="text-sm text-red-800">{error || copyError}</p>
          </div>
        )}

        {/* Loading */}
        {isLoading && templates.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : templates.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <h3 className="text-lg font-medium mb-2">テンプレートが見つかりません</h3>
              <p className="text-muted-foreground">
                検索条件を変更してお試しください
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {templates.map((template) => (
                <Card key={template.id} className="hover:bg-muted/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex flex-col h-full">
                      <div className="flex-1">
                        <h3 className="font-medium line-clamp-1">{template.title}</h3>
                        {template.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {template.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 mt-2">
                          {template.industry && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                              {template.industry}
                            </span>
                          )}
                          {template.tags?.slice(0, 3).map((tag: string, i: number) => (
                            <span
                              key={i}
                              className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                          <span>{template.questions?.length || 0} 設問</span>
                          <span>{template.viewCount} 閲覧</span>
                          <span>
                            {template.isAnonymous
                              ? "匿名"
                              : template.authorDisplayName || "ユーザー"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-4 pt-3 border-t">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleLike(template)}
                            className={cn(
                              "flex items-center gap-1 text-sm transition-colors",
                              template.isLiked
                                ? "text-red-500"
                                : "text-muted-foreground hover:text-red-500"
                            )}
                          >
                            <HeartIcon filled={template.isLiked} />
                            <span>{template.likeCount}</span>
                          </button>
                          <span className="flex items-center gap-1 text-sm text-muted-foreground">
                            <CopyIcon />
                            <span>{template.copyCount}</span>
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopy(template)}
                          disabled={copyingId === template.id}
                        >
                          {copyingId === template.id ? (
                            <LoadingSpinner />
                          ) : (
                            <>
                              <CopyIcon />
                              <span className="ml-1">コピー</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Load More */}
            {hasMore && (
              <div className="flex justify-center mt-8">
                <Button variant="outline" onClick={loadMore} disabled={isLoading}>
                  {isLoading ? <LoadingSpinner /> : "もっと見る"}
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
