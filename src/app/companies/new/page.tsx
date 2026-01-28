"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCompanies, CompanyStatus } from "@/hooks/useCompanies";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Status options
const statusOptions: { value: CompanyStatus; label: string; description: string }[] = [
  { value: "interested", label: "興味あり", description: "情報収集中" },
  { value: "applied", label: "応募済", description: "ES提出完了" },
  { value: "interview", label: "面接中", description: "選考進行中" },
];

// Icons
const ArrowLeftIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const SparklesIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
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

export default function NewCompanyPage() {
  const router = useRouter();
  const { createCompany, canAddMore } = useCompanies();

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [recruitmentUrl, setRecruitmentUrl] = useState("");
  const [corporateUrl, setCorporateUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<CompanyStatus>("interested");
  const [autoFetchInfo, setAutoFetchInfo] = useState(true);  // AI auto-fetch toggle
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("企業名を入力してください");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const company = await createCompany({
        name: name.trim(),
        industry: industry.trim() || undefined,
        recruitmentUrl: recruitmentUrl.trim() || undefined,
        corporateUrl: corporateUrl.trim() || undefined,
        notes: notes.trim() || undefined,
        status,
        autoFetchInfo: autoFetchInfo && !!recruitmentUrl.trim(),
      });

      // If auto-fetch is enabled and company was created, trigger info fetch
      if (autoFetchInfo && recruitmentUrl.trim() && company?.id) {
        // Fire and forget - don't wait for the fetch to complete
        fetch(`/api/companies/${company.id}/fetch-info`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }).catch((err) => {
          console.error("Auto-fetch info error:", err);
        });
      }

      router.push("/companies");
    } catch (err) {
      setError(err instanceof Error ? err.message : "企業の登録に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // If can't add more, show error
  if (!canAddMore) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card className="border-orange-200 bg-orange-50/50">
            <CardContent className="py-8 text-center">
              <h2 className="text-lg font-semibold text-orange-800 mb-2">
                登録企業数の上限に達しています
              </h2>
              <p className="text-sm text-orange-700 mb-4">
                プランをアップグレードすると無制限に企業を登録できます
              </p>
              <div className="flex justify-center gap-4">
                <Button variant="outline" asChild>
                  <Link href="/companies">戻る</Link>
                </Button>
                <Button asChild>
                  <Link href="/settings/plan">プランを確認</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back button */}
        <Link
          href="/companies"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeftIcon />
          企業一覧に戻る
        </Link>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-xl">企業を追加</CardTitle>
            <CardDescription>
              志望企業の情報を登録して、選考状況を管理しましょう
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Error message */}
              {error && (
                <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {/* Company name */}
              <div className="space-y-2">
                <Label htmlFor="name">
                  企業名 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="株式会社〇〇"
                  className="h-11"
                  required
                />
              </div>

              {/* Industry */}
              <div className="space-y-2">
                <Label htmlFor="industry">業界</Label>
                <Input
                  id="industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="IT・通信"
                  className="h-11"
                />
              </div>

              {/* URLs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="recruitmentUrl">採用ページURL</Label>
                  <Input
                    id="recruitmentUrl"
                    type="url"
                    value={recruitmentUrl}
                    onChange={(e) => setRecruitmentUrl(e.target.value)}
                    placeholder="https://"
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="corporateUrl">企業HP URL</Label>
                  <Input
                    id="corporateUrl"
                    type="url"
                    value={corporateUrl}
                    onChange={(e) => setCorporateUrl(e.target.value)}
                    placeholder="https://"
                    className="h-11"
                  />
                </div>
              </div>

              {/* Status selection */}
              <div className="space-y-3">
                <Label>選考ステータス</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {statusOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setStatus(option.value)}
                      className={cn(
                        "p-4 rounded-xl border-2 text-left transition-all",
                        status === option.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30"
                      )}
                    >
                      <p className="font-medium">{option.label}</p>
                      <p className="text-sm text-muted-foreground">{option.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">メモ</Label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="選考に関するメモや志望理由など..."
                  className="w-full min-h-[100px] px-3 py-2 rounded-lg border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
              </div>

              {/* Auto info fetch toggle */}
              <div
                className={cn(
                  "p-4 rounded-xl border cursor-pointer transition-all",
                  autoFetchInfo
                    ? "bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20"
                    : "bg-muted/30 border-border"
                )}
                onClick={() => setAutoFetchInfo(!autoFetchInfo)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors",
                      autoFetchInfo ? "bg-primary/10" : "bg-muted"
                    )}
                  >
                    <SparklesIcon />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">AIが企業情報を自動取得</p>
                      <button
                        type="button"
                        className={cn(
                          "w-11 h-6 rounded-full transition-colors relative",
                          autoFetchInfo ? "bg-primary" : "bg-muted-foreground/30"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          setAutoFetchInfo(!autoFetchInfo);
                        }}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
                            autoFetchInfo ? "translate-x-[22px]" : "translate-x-0.5"
                          )}
                        />
                      </button>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {autoFetchInfo
                        ? recruitmentUrl.trim()
                          ? "登録後、採用ページURLから締切情報を自動抽出します（1クレジット消費）"
                          : "採用ページURLを入力すると自動取得が有効になります"
                        : "ONにすると、登録後に自動で情報を取得します"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Submit button */}
              <div className="flex justify-end gap-4 pt-4">
                <Button type="button" variant="outline" asChild>
                  <Link href="/companies">キャンセル</Link>
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <LoadingSpinner />
                      <span className="ml-2">登録中...</span>
                    </>
                  ) : (
                    "企業を登録"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
