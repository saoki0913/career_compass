"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCompanies } from "@/hooks/useCompanies";
import { parseApiErrorResponse } from "@/lib/api-errors";
import { trackEvent } from "@/lib/analytics/client";
import { notifySuccess } from "@/lib/notifications";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CompanyAutocomplete } from "@/components/companies/CompanyAutocomplete";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { INDUSTRIES } from "@/lib/constants/industries";
import {
  CompanyStatus,
  GROUPED_STATUSES,
  CATEGORY_LABELS,
  getStatusLabel,
} from "@/lib/constants/status";

function normalizeIndustry(input: string | null | undefined) {
  if (!input) return "";
  const trimmed = input.trim();
  return INDUSTRIES.find((industry) => industry === trimmed) ?? trimmed;
}

// Icons
const ArrowLeftIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const EyeIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

const EyeOffIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
  </svg>
);

function buildCompanyPostHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
  };
}

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
  const { count, refresh } = useCompanies();
  const isFirstCompany = count === 0;

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [recruitmentUrl, setRecruitmentUrl] = useState("");
  const [corporateUrl, setCorporateUrl] = useState("");
  const [mypageUrl, setMypageUrl] = useState("");
  const [mypageLoginId, setMypageLoginId] = useState("");
  const [mypagePassword, setMypagePassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<CompanyStatus>("inbox");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateExisting, setDuplicateExisting] = useState<{ id: string; name: string } | null>(
    null,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("企業名を入力してください");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: buildCompanyPostHeaders(),
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          industry: industry.trim() || undefined,
          recruitmentUrl: recruitmentUrl.trim() || undefined,
          corporateUrl: corporateUrl.trim() || undefined,
          mypageUrl: mypageUrl.trim() || undefined,
          mypageLoginId: mypageLoginId.trim() || undefined,
          mypagePassword: mypagePassword.trim() || undefined,
          notes: notes.trim() || undefined,
          status,
        }),
      });

      if (response.status === 409) {
        const body = (await response.json().catch(() => null)) as {
          code?: string;
          existingCompany?: { id?: string; name?: string };
        } | null;
        if (
          body?.code === "COMPANY_DUPLICATE" &&
          body.existingCompany?.id &&
          body.existingCompany?.name
        ) {
          setDuplicateExisting({
            id: body.existingCompany.id,
            name: body.existingCompany.name,
          });
          setDuplicateOpen(true);
          return;
        }
      }

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "COMPANY_CREATE_FAILED",
            userMessage: "企業を登録できませんでした。",
            action: "入力内容を確認して、もう一度お試しください。",
            retryable: response.status >= 500,
          },
          "companies.new.create",
        );
      }

      const result = await response.json();

      trackEvent("company_create");
      await refresh();
      notifySuccess({ title: "企業を登録しました" });
      router.push(isFirstCompany ? `/companies/${result.company.id}/motivation` : `/companies/${result.company.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "企業の登録に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>同じ名前の企業があります</DialogTitle>
            <DialogDescription>
              {duplicateExisting
                ? `既に「${duplicateExisting.name}」が登録されています。既存の企業ページを開くか、名前を修正してから再度お試しください。`
                : "同じ名前の企業が既に登録されています。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDuplicateOpen(false)}>
              名前を修正する
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (duplicateExisting?.id) {
                  router.push(`/companies/${duplicateExisting.id}`);
                }
              }}
            >
              既存の企業を開く
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
        {/* Back button */}
        <Link
          href="/companies"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
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
            {isFirstCompany ? (
              <div className="mb-5 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
                初回は企業名と業界だけで始められます。登録後、そのまま志望動機の AI 作成に進みます。
              </div>
            ) : null}
            <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
              {/* Error message - full width */}
              {error && (
                <div className="lg:col-span-2 p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {/* Left column: Basic info */}
              <div className="space-y-4">
                {/* Company name */}
                <div className="space-y-1.5">
                  <Label htmlFor="name">
                    企業名 <span className="text-red-500">*</span>
                  </Label>
                  <CompanyAutocomplete
                    id="name"
                    value={name}
                    onChange={setName}
                    onSelect={(selectedName, selectedIndustry) => {
                      setName(selectedName);
                      setIndustry(normalizeIndustry(selectedIndustry));
                    }}
                    required
                  />
                </div>

                {/* Industry */}
                <div className="space-y-1.5">
                  <Label htmlFor="industry">業界</Label>
                  <Select value={industry} onValueChange={setIndustry}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="選択してください" />
                    </SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES.map((ind) => (
                        <SelectItem key={ind} value={ind}>
                          {ind}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* URLs */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="recruitmentUrl">採用ページURL</Label>
                    <Input
                      id="recruitmentUrl"
                      type="url"
                      value={recruitmentUrl}
                      onChange={(e) => setRecruitmentUrl(e.target.value)}
                      placeholder="https://"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="corporateUrl">企業HP URL</Label>
                    <Input
                      id="corporateUrl"
                      type="url"
                      value={corporateUrl}
                      onChange={(e) => setCorporateUrl(e.target.value)}
                      placeholder="https://"
                      className="h-10"
                    />
                  </div>
                </div>

                {/* Status selection */}
                <div className="space-y-1.5">
                  <Label>選考ステータス</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as CompanyStatus)}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="選択してください">
                        {getStatusLabel(status)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel className="text-xs text-muted-foreground font-normal">
                          {CATEGORY_LABELS.not_started}
                        </SelectLabel>
                        {GROUPED_STATUSES.not_started.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel className="text-xs text-muted-foreground font-normal">
                          {CATEGORY_LABELS.in_progress}
                        </SelectLabel>
                        {GROUPED_STATUSES.in_progress.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel className="text-xs text-muted-foreground font-normal">
                          {CATEGORY_LABELS.completed}
                        </SelectLabel>
                        {GROUPED_STATUSES.completed.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Right column: Mypage info + Notes */}
              <div className="space-y-4">
                {/* Mypage Info */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">マイページ情報</Label>
                  <p className="text-xs text-muted-foreground">
                    保存した MyPage 情報はメモと外部リンク用です。企業情報取得や選考日程取得には使いません。
                  </p>
                  <div className="space-y-3 p-3 rounded-lg border border-border/50 bg-muted/20">
                    <div className="space-y-1.5">
                      <Label htmlFor="mypageUrl" className="text-xs">マイページURL</Label>
                      <Input
                        id="mypageUrl"
                        type="url"
                        value={mypageUrl}
                        onChange={(e) => setMypageUrl(e.target.value)}
                        placeholder="https://"
                        className="h-9"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="mypageLoginId" className="text-xs">ログインID</Label>
                        <Input
                          id="mypageLoginId"
                          type="text"
                          value={mypageLoginId}
                          onChange={(e) => setMypageLoginId(e.target.value)}
                          placeholder="ID / メールアドレス"
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="mypagePassword" className="text-xs">パスワード</Label>
                        <div className="relative">
                          <Input
                            id="mypagePassword"
                            type={showPassword ? "text" : "password"}
                            value={mypagePassword}
                            onChange={(e) => setMypagePassword(e.target.value)}
                            placeholder="••••••••"
                            className="h-9 pr-9"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="notes">メモ</Label>
                  <textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="選考に関するメモや志望理由など..."
                    className="w-full min-h-[120px] px-3 py-2 rounded-lg border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  />
                </div>
              </div>

              {/* Submit button - full width */}
              <div className="lg:col-span-2 flex justify-end gap-3 pt-2 border-t border-border/50">
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link href="/companies">キャンセル</Link>
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting}>
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
