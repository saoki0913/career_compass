"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCompanies } from "@/hooks/useCompanies";
import { useEsStats } from "@/hooks/useDocuments";
import { useCredits } from "@/hooks/useCredits";

// Icons
const ArrowLeftIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const UserIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
    />
  </svg>
);

const ChartIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
    />
  </svg>
);

const CreditIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const GraduationCapIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 14l9-5-9-5-9 5 9 5z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"
    />
  </svg>
);

const BuildingIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
    />
  </svg>
);

const SettingsIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const LoadingSpinner = () => (
  <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

interface Profile {
  name: string;
  email: string;
  image: string | null;
  plan: string;
  university: string | null;
  faculty: string | null;
  graduationYear: number | null;
  targetIndustries: string[];
  targetJobTypes: string[];
  createdAt?: string;
}

const PLAN_LABELS: Record<string, string> = {
  free: "フリープラン",
  standard: "スタンダードプラン",
  pro: "プロプラン",
};

export default function ProfilePage() {
  const router = useRouter();
  const { user, isGuest, isLoading: authLoading } = useAuth();
  const { count: companyCount } = useCompanies();
  const { total: esTotal, draftCount, publishedCount } = useEsStats();
  const { balance } = useCredits();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Redirect guests to login
  useEffect(() => {
    if (!authLoading && isGuest) {
      router.push("/login?redirect=/profile");
    }
  }, [authLoading, isGuest, router]);

  // Fetch profile data
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch("/api/settings/profile", {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          setProfile(data.profile);
        }
      } catch (error) {
        console.error("Failed to fetch profile:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (!isGuest) {
      fetchProfile();
    }
  }, [isGuest]);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner />
          </div>
        </main>
      </div>
    );
  }

  if (isGuest) {
    return null;
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return "不明";
    const date = new Date(dateString);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeftIcon />
          ダッシュボードへ戻る
        </Link>

        {/* Profile Header Card */}
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <UserIcon />
              <CardTitle>プロフィール</CardTitle>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/settings" className="flex items-center gap-1.5">
                <SettingsIcon />
                設定を編集
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              {profile?.image || user?.image ? (
                <img
                  src={profile?.image || user?.image || ""}
                  alt=""
                  className="w-20 h-20 rounded-full ring-4 ring-muted"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold">
                  {(profile?.name || user?.name || "U").charAt(0)}
                </div>
              )}
              <div>
                <h2 className="text-xl font-bold">{profile?.name || user?.name || "名前未設定"}</h2>
                <p className="text-muted-foreground">{profile?.email || user?.email}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  利用開始: {formatDate(profile?.createdAt)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Usage Stats Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ChartIcon />
                <CardTitle className="text-base">利用状況</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">登録企業</span>
                <span className="font-semibold">{companyCount} 社</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">ES作成数</span>
                <span className="font-semibold">{esTotal} 件</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground pl-4">- 完了</span>
                <span>{publishedCount} 件</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground pl-4">- 下書き</span>
                <span>{draftCount} 件</span>
              </div>
            </CardContent>
          </Card>

          {/* Plan Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditIcon />
                <CardTitle className="text-base">プラン</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">現在のプラン</span>
                <span className="font-semibold text-primary">
                  {PLAN_LABELS[profile?.plan || "free"] || "フリープラン"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">クレジット残高</span>
                <span className="font-semibold">{balance?.toLocaleString() ?? "---"}</span>
              </div>
              <div className="pt-2">
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link href="/plan-selection">プランを変更</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Education Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <GraduationCapIcon />
              <CardTitle className="text-base">学歴情報</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">大学</span>
              <span className={profile?.university ? "font-medium" : "text-muted-foreground"}>
                {profile?.university || "未設定"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">学部・学科</span>
              <span className={profile?.faculty ? "font-medium" : "text-muted-foreground"}>
                {profile?.faculty || "未設定"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">卒業予定</span>
              <span className={profile?.graduationYear ? "font-medium" : "text-muted-foreground"}>
                {profile?.graduationYear ? `${profile.graduationYear}年3月` : "未設定"}
              </span>
            </div>
            {(!profile?.university || !profile?.faculty || !profile?.graduationYear) && (
              <div className="pt-2">
                <Link
                  href="/settings"
                  className="text-sm text-primary hover:underline"
                >
                  設定画面で学歴情報を入力する →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Target Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BuildingIcon />
              <CardTitle className="text-base">志望情報</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">志望業界</p>
              {profile?.targetIndustries && profile.targetIndustries.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {profile.targetIndustries.map((industry) => (
                    <span
                      key={industry}
                      className="px-3 py-1 text-sm rounded-full bg-primary/10 text-primary"
                    >
                      {industry}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">未設定</p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">志望職種</p>
              {profile?.targetJobTypes && profile.targetJobTypes.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {profile.targetJobTypes.map((jobType) => (
                    <span
                      key={jobType}
                      className="px-3 py-1 text-sm rounded-full bg-emerald-100 text-emerald-700"
                    >
                      {jobType}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">未設定</p>
              )}
            </div>
            {((!profile?.targetIndustries || profile.targetIndustries.length === 0) ||
              (!profile?.targetJobTypes || profile.targetJobTypes.length === 0)) && (
              <div className="pt-2">
                <Link
                  href="/settings"
                  className="text-sm text-primary hover:underline"
                >
                  設定画面で志望情報を入力する →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
