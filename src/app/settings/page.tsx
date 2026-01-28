"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

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

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

// Industry options
const INDUSTRIES = [
  "IT・通信",
  "メーカー",
  "金融",
  "商社",
  "コンサル",
  "広告・メディア",
  "インフラ",
  "サービス",
  "不動産",
  "その他",
];

// Job type options
const JOB_TYPES = [
  "総合職",
  "エンジニア",
  "営業",
  "マーケティング",
  "企画",
  "コンサルタント",
  "デザイナー",
  "データサイエンティスト",
  "その他",
];

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
  currentPeriodEnd?: string | null;
  creditsBalance?: number;
}

interface NotificationSettings {
  deadlineReminder: boolean;
  deadlineNear: boolean;
  companyFetch: boolean;
  esReview: boolean;
  dailySummary: boolean;
  reminderTiming: Array<{ type: string; hours?: number }>;
}

export default function SettingsPage() {
  const { isGuest, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [isChangingPlan, setIsChangingPlan] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [university, setUniversity] = useState("");
  const [faculty, setFaculty] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [selectedJobTypes, setSelectedJobTypes] = useState<string[]>([]);

  // Notification settings state
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(null);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const [notificationSuccess, setNotificationSuccess] = useState(false);

  useEffect(() => {
    if (!isAuthLoading && isGuest) {
      router.push("/login?redirect=/settings");
      return;
    }

    const fetchProfile = async () => {
      try {
        const response = await fetch("/api/settings/profile", {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch profile");
        }

        const data = await response.json();
        setProfile(data.profile);

        // Initialize form state
        setName(data.profile.name || "");
        setUniversity(data.profile.university || "");
        setFaculty(data.profile.faculty || "");
        setGraduationYear(data.profile.graduationYear?.toString() || "");
        setSelectedIndustries(data.profile.targetIndustries || []);
        setSelectedJobTypes(data.profile.targetJobTypes || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "プロフィールの取得に失敗しました");
      } finally {
        setIsLoading(false);
      }
    };

    const fetchNotificationSettings = async () => {
      try {
        const response = await fetch("/api/settings/notifications", {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch notification settings");
        }

        const data = await response.json();
        setNotificationSettings(data.settings);
      } catch (err) {
        console.error("Failed to fetch notification settings:", err);
      }
    };

    if (!isAuthLoading && !isGuest) {
      fetchProfile();
      fetchNotificationSettings();
    }
  }, [isAuthLoading, isGuest, router]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("名前を入力してください");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/settings/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          university: university.trim() || null,
          faculty: faculty.trim() || null,
          graduationYear: graduationYear || null,
          targetIndustries: selectedIndustries,
          targetJobTypes: selectedJobTypes,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update profile");
      }

      const data = await response.json();
      setProfile(data.profile);
      setSuccess(true);

      // Hide success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleIndustry = (industry: string) => {
    setSelectedIndustries((prev) =>
      prev.includes(industry)
        ? prev.filter((i) => i !== industry)
        : [...prev, industry]
    );
  };

  const toggleJobType = (jobType: string) => {
    setSelectedJobTypes((prev) =>
      prev.includes(jobType)
        ? prev.filter((j) => j !== jobType)
        : [...prev, jobType]
    );
  };

  const handleSaveNotifications = async () => {
    if (!notificationSettings) return;

    setIsSavingNotifications(true);
    setError(null);
    setNotificationSuccess(false);

    try {
      const response = await fetch("/api/settings/notifications", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(notificationSettings),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update notification settings");
      }

      const data = await response.json();
      setNotificationSettings(data.settings);
      setNotificationSuccess(true);

      // Hide success message after 3 seconds
      setTimeout(() => setNotificationSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "通知設定の保存に失敗しました");
    } finally {
      setIsSavingNotifications(false);
    }
  };

  const toggleNotificationSetting = (key: keyof NotificationSettings) => {
    if (!notificationSettings) return;
    if (typeof notificationSettings[key] === "boolean") {
      setNotificationSettings({
        ...notificationSettings,
        [key]: !notificationSettings[key],
      });
    }
  };

  const handlePlanChange = async (newPlan: string) => {
    if (!profile) return;

    setIsChangingPlan(true);
    setError(null);

    try {
      // For paid plans, redirect to Stripe Checkout
      if (newPlan === "standard" || newPlan === "pro") {
        // Create Stripe Checkout session
        const response = await fetch("/api/stripe/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ plan: newPlan }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to create checkout session");
        }

        const { url } = await response.json();
        window.location.href = url;
        return;
      }

      // For downgrade to free, show confirmation
      if (newPlan === "free" && profile.plan !== "free") {
        setSelectedPlan(newPlan);
        setShowPlanModal(true);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "プラン変更に失敗しました");
    } finally {
      setIsChangingPlan(false);
    }
  };

  const confirmDowngrade = async () => {
    if (!selectedPlan) return;

    setIsChangingPlan(true);
    setError(null);

    try {
      const response = await fetch("/api/settings/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan: selectedPlan }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to change plan");
      }

      // Refresh profile
      const profileResponse = await fetch("/api/settings/profile", {
        credentials: "include",
      });

      if (profileResponse.ok) {
        const data = await profileResponse.json();
        setProfile(data.profile);
      }

      setShowPlanModal(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "プラン変更に失敗しました");
    } finally {
      setIsChangingPlan(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "削除") {
      setError("削除を確認するために「削除」と入力してください");
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch("/api/settings/account", {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete account");
      }

      // Redirect to login page after successful deletion
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "アカウント削除に失敗しました");
      setIsDeleting(false);
    }
  };

  if (isAuthLoading || isLoading) {
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
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold">設定</h1>
          <p className="text-muted-foreground mt-1">プロフィールや通知設定を管理</p>
        </div>

        {/* Success message */}
        {success && (
          <div className="mb-6 p-4 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
              <CheckIcon />
            </div>
            <p className="text-sm text-emerald-800">保存しました</p>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Profile Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>プロフィール</CardTitle>
            <CardDescription>基本情報を編集</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar and email */}
            <div className="flex items-center gap-4">
              {profile?.image ? (
                <img
                  src={profile.image}
                  alt=""
                  className="w-16 h-16 rounded-full ring-2 ring-border"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-2xl font-medium text-muted-foreground">
                    {name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div>
                <p className="font-medium">{profile?.email}</p>
                <p className="text-sm text-muted-foreground">
                  {profile?.plan === "pro"
                    ? "Proプラン"
                    : profile?.plan === "standard"
                    ? "Standardプラン"
                    : "Freeプラン"}
                </p>
              </div>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">名前 *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="山田 太郎"
              />
            </div>

            {/* University */}
            <div className="space-y-2">
              <Label htmlFor="university">大学</Label>
              <Input
                id="university"
                value={university}
                onChange={(e) => setUniversity(e.target.value)}
                placeholder="〇〇大学"
              />
            </div>

            {/* Faculty */}
            <div className="space-y-2">
              <Label htmlFor="faculty">学部・学科</Label>
              <Input
                id="faculty"
                value={faculty}
                onChange={(e) => setFaculty(e.target.value)}
                placeholder="〇〇学部 〇〇学科"
              />
            </div>

            {/* Graduation Year */}
            <div className="space-y-2">
              <Label htmlFor="graduationYear">卒業予定年</Label>
              <Input
                id="graduationYear"
                type="number"
                value={graduationYear}
                onChange={(e) => setGraduationYear(e.target.value)}
                placeholder="2026"
                min={2020}
                max={2040}
              />
            </div>
          </CardContent>
        </Card>

        {/* Target Industries */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>志望業界</CardTitle>
            <CardDescription>興味のある業界を選択（複数可）</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {INDUSTRIES.map((industry) => (
                <button
                  key={industry}
                  type="button"
                  onClick={() => toggleIndustry(industry)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                    selectedIndustries.includes(industry)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {industry}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Target Job Types */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>志望職種</CardTitle>
            <CardDescription>興味のある職種を選択（複数可）</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {JOB_TYPES.map((jobType) => (
                <button
                  key={jobType}
                  type="button"
                  onClick={() => toggleJobType(jobType)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                    selectedJobTypes.includes(jobType)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {jobType}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <LoadingSpinner />
                <span className="ml-2">保存中...</span>
              </>
            ) : (
              "保存する"
            )}
          </Button>
        </div>

        {/* Plan Management */}
        <Card className="mt-12">
          <CardHeader>
            <CardTitle>プラン管理</CardTitle>
            <CardDescription>現在のプランと利用状況</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Current plan info */}
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm text-muted-foreground">現在のプラン</p>
                  <p className="text-xl font-bold">
                    {profile?.plan === "pro"
                      ? "Pro プラン"
                      : profile?.plan === "standard"
                      ? "Standard プラン"
                      : "Free プラン"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">クレジット残高</p>
                  <p className="text-xl font-bold">{profile?.creditsBalance || 0}</p>
                </div>
              </div>
              {profile?.currentPeriodEnd && (
                <p className="text-sm text-muted-foreground">
                  次回更新日: {new Date(profile.currentPeriodEnd).toLocaleDateString("ja-JP")}
                </p>
              )}
            </div>

            {/* Plan options */}
            <div className="grid gap-4 md:grid-cols-3">
              {/* Free Plan */}
              <div className={cn(
                "p-4 rounded-lg border-2 transition-all",
                profile?.plan === "free" ? "border-primary bg-primary/5" : "border-border"
              )}>
                <h3 className="font-bold mb-1">Free</h3>
                <p className="text-2xl font-bold mb-2">¥0</p>
                <ul className="space-y-2 text-sm mb-4">
                  <li className="flex items-center gap-2">
                    <CheckIcon />
                    企業登録 5社
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon />
                    AI添削 月3回
                  </li>
                </ul>
                {profile?.plan !== "free" && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handlePlanChange("free")}
                    disabled={isChangingPlan}
                  >
                    ダウングレード
                  </Button>
                )}
              </div>

              {/* Standard Plan */}
              <div className={cn(
                "p-4 rounded-lg border-2 transition-all",
                profile?.plan === "standard" ? "border-primary bg-primary/5" : "border-border"
              )}>
                <h3 className="font-bold mb-1">Standard</h3>
                <p className="text-2xl font-bold mb-2">¥980<span className="text-sm font-normal">/月</span></p>
                <ul className="space-y-2 text-sm mb-4">
                  <li className="flex items-center gap-2">
                    <CheckIcon />
                    企業登録 30社
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon />
                    AI添削 月10回
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon />
                    カレンダー連携
                  </li>
                </ul>
                {profile?.plan === "free" && (
                  <Button
                    className="w-full"
                    onClick={() => handlePlanChange("standard")}
                    disabled={isChangingPlan}
                  >
                    アップグレード
                  </Button>
                )}
                {profile?.plan === "pro" && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handlePlanChange("standard")}
                    disabled={isChangingPlan}
                  >
                    変更
                  </Button>
                )}
              </div>

              {/* Pro Plan */}
              <div className={cn(
                "p-4 rounded-lg border-2 transition-all",
                profile?.plan === "pro" ? "border-primary bg-primary/5" : "border-border"
              )}>
                <h3 className="font-bold mb-1">Pro</h3>
                <p className="text-2xl font-bold mb-2">¥2,980<span className="text-sm font-normal">/月</span></p>
                <ul className="space-y-2 text-sm mb-4">
                  <li className="flex items-center gap-2">
                    <CheckIcon />
                    企業登録 無制限
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon />
                    AI添削 無制限
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon />
                    すべての機能
                  </li>
                </ul>
                {profile?.plan !== "pro" && (
                  <Button
                    className="w-full"
                    onClick={() => handlePlanChange("pro")}
                    disabled={isChangingPlan}
                  >
                    アップグレード
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        {notificationSuccess && (
          <div className="mt-12 mb-6 p-4 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
              <CheckIcon />
            </div>
            <p className="text-sm text-emerald-800">通知設定を保存しました</p>
          </div>
        )}

        <Card className="mt-12 mb-6">
          <CardHeader>
            <CardTitle>通知設定</CardTitle>
            <CardDescription>受け取る通知の種類を選択</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {notificationSettings ? (
              <>
                {/* Deadline Reminder */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="deadline-reminder">締切リマインド</Label>
                    <p className="text-sm text-muted-foreground">
                      締切が近づいたときに通知を受け取る
                    </p>
                  </div>
                  <Switch
                    id="deadline-reminder"
                    checked={notificationSettings.deadlineReminder}
                    onCheckedChange={() => toggleNotificationSetting("deadlineReminder")}
                  />
                </div>

                {/* Deadline Near */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="deadline-near">締切が近い</Label>
                    <p className="text-sm text-muted-foreground">
                      締切24時間以内の緊急通知を受け取る
                    </p>
                  </div>
                  <Switch
                    id="deadline-near"
                    checked={notificationSettings.deadlineNear}
                    onCheckedChange={() => toggleNotificationSetting("deadlineNear")}
                  />
                </div>

                {/* Company Fetch */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="company-fetch">企業情報取得</Label>
                    <p className="text-sm text-muted-foreground">
                      企業情報の取得完了時に通知を受け取る
                    </p>
                  </div>
                  <Switch
                    id="company-fetch"
                    checked={notificationSettings.companyFetch}
                    onCheckedChange={() => toggleNotificationSetting("companyFetch")}
                  />
                </div>

                {/* ES Review */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="es-review">ES添削完了</Label>
                    <p className="text-sm text-muted-foreground">
                      ES添削の完了時に通知を受け取る
                    </p>
                  </div>
                  <Switch
                    id="es-review"
                    checked={notificationSettings.esReview}
                    onCheckedChange={() => toggleNotificationSetting("esReview")}
                  />
                </div>

                {/* Daily Summary */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="daily-summary">デイリーサマリー</Label>
                    <p className="text-sm text-muted-foreground">
                      毎日の進捗サマリーを受け取る（JST 9:00）
                    </p>
                  </div>
                  <Switch
                    id="daily-summary"
                    checked={notificationSettings.dailySummary}
                    onCheckedChange={() => toggleNotificationSetting("dailySummary")}
                  />
                </div>

                {/* Save Notifications Button */}
                <div className="flex justify-end pt-4">
                  <Button onClick={handleSaveNotifications} disabled={isSavingNotifications}>
                    {isSavingNotifications ? (
                      <>
                        <LoadingSpinner />
                        <span className="ml-2">保存中...</span>
                      </>
                    ) : (
                      "通知設定を保存"
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Danger Zone - Account Deletion */}
        <Card className="mt-12 border-red-200 bg-red-50/50">
          <CardHeader>
            <CardTitle className="text-red-700">アカウント削除</CardTitle>
            <CardDescription className="text-red-600">
              この操作は取り消せません。すべてのデータが完全に削除されます。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => setShowDeleteModal(true)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              アカウントを削除
            </Button>
          </CardContent>
        </Card>

        {/* Plan Change Confirmation Modal */}
        {showPlanModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h2 className="text-xl font-bold mb-4">
                プランをダウングレードしますか？
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Freeプランに変更すると、一部の機能が制限されます。次回更新日以降に変更が適用されます。
              </p>
              <div className="flex gap-2 justify-end">
                <Button
                  onClick={() => {
                    setShowPlanModal(false);
                    setSelectedPlan(null);
                  }}
                  variant="outline"
                  disabled={isChangingPlan}
                >
                  キャンセル
                </Button>
                <Button
                  onClick={confirmDowngrade}
                  disabled={isChangingPlan}
                >
                  {isChangingPlan ? (
                    <>
                      <LoadingSpinner />
                      <span className="ml-2">変更中...</span>
                    </>
                  ) : (
                    "変更する"
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h2 className="text-xl font-bold text-red-700 mb-4">
                アカウントを削除しますか？
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                この操作は取り消せません。すべてのデータが完全に削除されます。
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                削除を確認するために、下のフィールドに <strong>削除</strong> と入力してください。
              </p>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="削除"
                className="mb-4"
              />
              <div className="flex gap-2 justify-end">
                <Button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeleteConfirmText("");
                    setError(null);
                  }}
                  className="bg-muted text-muted-foreground hover:bg-muted/80"
                  disabled={isDeleting}
                >
                  キャンセル
                </Button>
                <Button
                  onClick={handleDeleteAccount}
                  className="bg-red-600 hover:bg-red-700 text-white"
                  disabled={isDeleting || deleteConfirmText !== "削除"}
                >
                  {isDeleting ? (
                    <>
                      <LoadingSpinner />
                      <span className="ml-2">削除中...</span>
                    </>
                  ) : (
                    "削除する"
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
