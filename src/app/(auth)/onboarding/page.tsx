"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { INDUSTRIES, PROFILE_JOB_TYPES } from "@/lib/constants/industries";

// Generate graduation year options (current year to +5 years)
function getGraduationYears(): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let i = 0; i <= 5; i++) {
    years.push(currentYear + i);
  }
  return years;
}

interface OnboardingData {
  university: string;
  faculty: string;
  graduationYear: number | null;
  targetIndustries: string[];
  targetJobTypes: string[];
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

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { isAuthenticated, isLoading, refreshPlan } = useAuth();

  const [data, setData] = useState<OnboardingData>({
    university: "",
    faculty: "",
    graduationYear: null,
    targetIndustries: [],
    targetJobTypes: [],
  });

  const [gakuchikaTitle, setGakuchikaTitle] = useState("");
  const [gakuchikaContent, setGakuchikaContent] = useState("");

  // Redirect if not authenticated.
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    const loadOnboarding = async () => {
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

    loadOnboarding();
  }, [isLoading, isAuthenticated]);

  const handleIndustryToggle = (industry: string) => {
    setData((prev) => ({
      ...prev,
      targetIndustries: prev.targetIndustries.includes(industry)
        ? prev.targetIndustries.filter((i) => i !== industry)
        : [...prev.targetIndustries, industry],
    }));
  };

  const handleJobTypeToggle = (jobType: string) => {
    setData((prev) => ({
      ...prev,
      targetJobTypes: prev.targetJobTypes.includes(jobType)
        ? prev.targetJobTypes.filter((j) => j !== jobType)
        : [...prev.targetJobTypes, jobType],
    }));
  };

  const handleSubmit = async (skip = false, skipGakuchika = false) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const submitData = skip
        ? {}
        : {
            university: data.university || undefined,
            faculty: data.faculty || undefined,
            graduationYear: data.graduationYear || undefined,
            targetIndustries:
              data.targetIndustries.length > 0 ? data.targetIndustries : undefined,
            targetJobTypes:
              data.targetJobTypes.length > 0 ? data.targetJobTypes : undefined,
          };

      const response = await fetch("/api/auth/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitData),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "保存に失敗しました");
      }

      await refreshPlan();

      // If gakuchika is entered, create it and redirect to deep-dive
      if (!skipGakuchika && gakuchikaTitle.trim() && gakuchikaContent.trim()) {
        const gakuchikaRes = await fetch("/api/gakuchika", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: gakuchikaTitle.trim(),
            content: gakuchikaContent.trim(),
            charLimitType: "400",
          }),
        });

        if (gakuchikaRes.ok) {
          const gakuchikaData = await gakuchikaRes.json();
          router.push(`/gakuchika/${gakuchikaData.gakuchika.id}`);
          return;
        }
      }

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  if (isLoading || isFetching) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const graduationYears = getGraduationYears();

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
              step >= 1
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            1
          </div>
          <div
            className={`w-16 h-1 rounded transition-colors ${
              step >= 2 ? "bg-primary" : "bg-muted"
            }`}
          />
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
              step >= 2
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            2
          </div>
          <div
            className={`w-16 h-1 rounded transition-colors ${
              step >= 3 ? "bg-primary" : "bg-muted"
            }`}
          />
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
              step >= 3
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            3
          </div>
        </div>
        <div className="flex justify-center gap-6 mt-2 text-xs text-muted-foreground">
          <span>基本情報</span>
          <span>志望先</span>
          <span>ガクチカ</span>
        </div>
      </div>

      {/* Header */}
      <div className="text-center mb-8">
        <p className="text-sm font-medium text-primary mb-2">プロフィール設定</p>
        <h1 className="text-2xl font-bold mb-2">
          {step === 1
            ? "あなたについて教えてください"
            : step === 2
            ? "志望先を教えてください"
            : "ガクチカを入力しましょう"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {step === 1
            ? "入力した内容はおすすめ企業や作業提案の精度向上に使います"
            : step === 2
            ? "志望業界と職種を入れておくと、企業管理やES作成が整理しやすくなります"
            : "ここで作ったガクチカは、そのままAI深掘りに進めます（任意）"}
        </p>
      </div>

      {/* Step 1: Basic Info */}
      {step === 1 && (
        <Card>
          <CardContent className="pt-6 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="university">大学名</Label>
              <Input
                id="university"
                placeholder="例: 東京大学"
                value={data.university}
                onChange={(e) =>
                  setData((prev) => ({ ...prev, university: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="faculty">学部・学科</Label>
              <Input
                id="faculty"
                placeholder="例: 工学部 情報工学科"
                value={data.faculty}
                onChange={(e) =>
                  setData((prev) => ({ ...prev, faculty: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="graduationYear">卒業予定年</Label>
              <select
                id="graduationYear"
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={data.graduationYear || ""}
                onChange={(e) =>
                  setData((prev) => ({
                    ...prev,
                    graduationYear: e.target.value ? parseInt(e.target.value) : null,
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
      )}

      {/* Step 2: Career Goals */}
      {step === 2 && (
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <Label className="mb-4 block">志望業界（複数選択可）</Label>
              <div className="flex flex-wrap gap-2">
                {INDUSTRIES.map((industry) => (
                  <button
                    key={industry}
                    type="button"
                    onClick={() => handleIndustryToggle(industry)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                      data.targetIndustries.includes(industry)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted/80"
                    }`}
                  >
                    {industry}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <Label className="mb-4 block">志望職種（複数選択可）</Label>
              <div className="flex flex-wrap gap-2">
                {PROFILE_JOB_TYPES.map((jobType) => (
                  <button
                    key={jobType}
                    type="button"
                    onClick={() => handleJobTypeToggle(jobType)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                      data.targetJobTypes.includes(jobType)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted/80"
                    }`}
                  >
                    {jobType}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 3: Gakuchika */}
      {step === 3 && (
        <Card>
          <CardContent className="pt-6 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="gakuchikaTitle">ガクチカのテーマ</Label>
              <Input
                id="gakuchikaTitle"
                placeholder="例: サークル活動、アルバイト、研究など"
                value={gakuchikaTitle}
                onChange={(e) => setGakuchikaTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gakuchikaContent">簡単な説明（任意）</Label>
              <textarea
                id="gakuchikaContent"
                placeholder="どんなことをしていたか、簡単に教えてください..."
                value={gakuchikaContent}
                onChange={(e) => setGakuchikaContent(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 border border-input rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                入力するとAIが深掘り質問をして、あなたの経験を引き出します
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error display */}
      {error && (
        <div className="mt-4 text-center text-destructive text-sm">{error}</div>
      )}

      {/* Navigation buttons */}
      <div className="mt-8 flex justify-between items-center">
        {step === 1 ? (
          <>
            <Button
              variant="ghost"
              onClick={() => handleSubmit(true, true)}
              disabled={isSubmitting}
            >
              スキップ
            </Button>
            <Button onClick={handleNext}>次へ</Button>
          </>
        ) : step === 2 ? (
          <>
            <Button variant="outline" onClick={handleBack} disabled={isSubmitting}>
              戻る
            </Button>
            <Button onClick={handleNext}>次へ</Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={handleBack} disabled={isSubmitting}>
              戻る
            </Button>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => handleSubmit(false, true)}
                disabled={isSubmitting}
              >
                ガクチカはあとで
              </Button>
              <Button onClick={() => handleSubmit(false, false)} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                    保存中...
                  </>
                ) : (
                  "保存する"
                )}
              </Button>
            </div>
          </>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        この情報は後からいつでも更新できます
      </p>
    </div>
  );
}
