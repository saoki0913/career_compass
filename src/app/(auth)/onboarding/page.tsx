"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { INDUSTRIES, PROFILE_JOB_TYPES } from "@/lib/constants/industries";

function getGraduationYears(): number[] {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 6 }, (_, index) => currentYear + index);
}

interface OnboardingResponse {
  onboardingCompleted: boolean;
  data: {
    university: string | null;
    faculty: string | null;
    graduationYear: number | null;
    targetIndustries: string[];
    targetJobTypes: string[];
  } | null;
}

type ProfileForm = {
  university: string;
  faculty: string;
  graduationYear: number | null;
  targetIndustries: string[];
  targetJobTypes: string[];
};

export default function OnboardingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, refreshPlan } = useAuth();
  const [isFetching, setIsFetching] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProfileForm>({
    university: "",
    faculty: "",
    graduationYear: null,
    targetIndustries: [],
    targetJobTypes: [],
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login?redirect=/onboarding");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    const loadProfile = async () => {
      try {
        setIsFetching(true);
        const response = await fetch("/api/auth/onboarding");
        if (!response.ok) {
          throw new Error("プロフィール情報の取得に失敗しました");
        }

        const result: OnboardingResponse = await response.json();
        if (!result.data) return;

        setData({
          university: result.data.university || "",
          faculty: result.data.faculty || "",
          graduationYear: result.data.graduationYear,
          targetIndustries: result.data.targetIndustries || [],
          targetJobTypes: result.data.targetJobTypes || [],
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "エラーが発生しました");
      } finally {
        setIsFetching(false);
      }
    };

    void loadProfile();
  }, [isAuthenticated, isLoading]);

  const graduationYears = useMemo(() => getGraduationYears(), []);
  const hasAnyInput = Boolean(
    data.university.trim() ||
      data.faculty.trim() ||
      data.graduationYear ||
      data.targetIndustries.length ||
      data.targetJobTypes.length
  );

  const toggleIndustry = (industry: string) => {
    setData((prev) => ({
      ...prev,
      targetIndustries: prev.targetIndustries.includes(industry)
        ? prev.targetIndustries.filter((item) => item !== industry)
        : [...prev.targetIndustries, industry],
    }));
  };

  const toggleJobType = (jobType: string) => {
    setData((prev) => ({
      ...prev,
      targetJobTypes: prev.targetJobTypes.includes(jobType)
        ? prev.targetJobTypes.filter((item) => item !== jobType)
        : [...prev.targetJobTypes, jobType],
    }));
  };

  const handleSubmit = async () => {
    if (!hasAnyInput) {
      setError("入力はあとでも構いません。保存する場合は1項目以上入力してください。");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          university: data.university || undefined,
          faculty: data.faculty || undefined,
          graduationYear: data.graduationYear || undefined,
          targetIndustries: data.targetIndustries.length ? data.targetIndustries : undefined,
          targetJobTypes: data.targetJobTypes.length ? data.targetJobTypes : undefined,
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "保存に失敗しました");
      }

      await refreshPlan();
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || isFetching) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8">
        <p className="text-sm font-medium text-primary">プロフィール補完</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">提案精度を上げるための情報を、必要な分だけ入れてください</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          初回の企業登録と AI 体験はすでに先に進められます。ここでは、業界や卒年を入れておくと候補提案や文章生成の文脈が合わせやすくなります。
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
            <CardDescription>後からいつでも変更できます。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="university">大学名</Label>
              <Input
                id="university"
                placeholder="例: 東京大学"
                value={data.university}
                onChange={(event) => setData((prev) => ({ ...prev, university: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="faculty">学部・学科</Label>
              <Input
                id="faculty"
                placeholder="例: 工学部 情報工学科"
                value={data.faculty}
                onChange={(event) => setData((prev) => ({ ...prev, faculty: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="graduationYear">卒業予定年</Label>
              <select
                id="graduationYear"
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={data.graduationYear || ""}
                onChange={(event) =>
                  setData((prev) => ({
                    ...prev,
                    graduationYear: event.target.value ? Number.parseInt(event.target.value, 10) : null,
                  }))
                }
              >
                <option value="">選択してください</option>
                {graduationYears.map((year) => (
                  <option key={year} value={year}>
                    {year}年
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>志望情報</CardTitle>
            <CardDescription>AI の提案内容や候補整理に使います。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="mb-3 block">志望業界</Label>
              <div className="flex flex-wrap gap-2">
                {INDUSTRIES.map((industry) => (
                  <button
                    key={industry}
                    type="button"
                    onClick={() => toggleIndustry(industry)}
                    className={cnTag(data.targetIndustries.includes(industry))}
                  >
                    {industry}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-3 block">志望職種</Label>
              <div className="flex flex-wrap gap-2">
                {PROFILE_JOB_TYPES.map((jobType) => (
                  <button
                    key={jobType}
                    type="button"
                    onClick={() => toggleJobType(jobType)}
                    className={cnTag(data.targetJobTypes.includes(jobType))}
                  >
                    {jobType}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" asChild>
          <Link href="/dashboard">あとで入力する</Link>
        </Button>
        <Button onClick={() => void handleSubmit()} disabled={isSubmitting}>
          {isSubmitting ? "保存中..." : "保存してダッシュボードへ戻る"}
        </Button>
      </div>
    </div>
  );
}

function cnTag(selected: boolean) {
  return `rounded-full px-3 py-1.5 text-sm transition-colors ${
    selected ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
  }`;
}
