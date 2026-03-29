"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { INDUSTRIES, PROFILE_JOB_TYPES } from "@/lib/constants/industries";
import { DAILY_SUMMARY_HOURS_JST } from "@/lib/datetime/jst";
import { trackEvent } from "@/lib/analytics/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { notifySuccess } from "@/lib/notifications";
import type {
  AccountNotificationSettingsData,
  AccountProfileData,
} from "@/lib/server/account-loaders";

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
  currentPeriodEnd: string | null;
  creditsBalance: number;
  subscriptionStatus: string | null;
  billingPeriod: "monthly" | "annual" | null;
  cancelAtPeriodEnd: boolean;
}

interface NotificationSettings {
  deadlineReminder: boolean;
  deadlineNear: boolean;
  companyFetch: boolean;
  esReview: boolean;
  dailySummary: boolean;
  dailySummaryHourJst: number;
  reminderTiming: Array<{ type: string; hours?: number }>;
}

interface SettingsPageClientProps {
  initialProfile: AccountProfileData;
  initialNotificationSettings: AccountNotificationSettingsData;
}

export default function SettingsPageClient({
  initialProfile,
  initialNotificationSettings,
}: SettingsPageClientProps) {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  // Form state
  const [name, setName] = useState(initialProfile.name || "");
  const [university, setUniversity] = useState(initialProfile.university || "");
  const [faculty, setFaculty] = useState(initialProfile.faculty || "");
  const [graduationYear, setGraduationYear] = useState(initialProfile.graduationYear?.toString() || "");
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>(initialProfile.targetIndustries || []);
  const [selectedJobTypes, setSelectedJobTypes] = useState<string[]>(initialProfile.targetJobTypes || []);

  // Notification settings state
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(
    initialNotificationSettings,
  );
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("名前を入力してください");
      return;
    }

    setIsSaving(true);
    setError(null);

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
      setProfile((prev) => ({
        ...prev,
        ...data.profile,
      }));
      notifySuccess({ title: "プロフィールを保存しました" });
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
      notifySuccess({ title: "通知設定を保存しました" });
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

  const handleOpenPricing = () => {
    router.push("/pricing?source=settings");
  };

  const handleOpenBillingPortal = async () => {
    setIsOpeningPortal(true);
    setError(null);

    try {
      const response = await fetch("/api/stripe/portal", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to open billing portal");
      }

      const { url } = await response.json();
      trackEvent("portal_opened", { source: "settings", plan: profile.plan });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "請求管理ページを開けませんでした");
    } finally {
      setIsOpeningPortal(false);
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

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 py-8 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold">設定</h1>
          <p className="text-muted-foreground mt-1">プロフィールや通知設定を管理</p>
        </div>

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
                <Image
                  src={profile.image}
                  alt=""
                  width={64}
                  height={64}
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
                placeholder="プロフィールに表示する名前（任意）"
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
              {PROFILE_JOB_TYPES.map((jobType) => (
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
                  <p className="text-xl font-bold">{profile.creditsBalance}</p>
                </div>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                {profile.currentPeriodEnd ? (
                  <p>
                    {profile.cancelAtPeriodEnd ? "利用終了日" : "次回更新日"}:{" "}
                    {new Date(profile.currentPeriodEnd).toLocaleDateString("ja-JP")}
                  </p>
                ) : null}
                {profile.billingPeriod ? (
                  <p>請求周期: {profile.billingPeriod === "annual" ? "年額" : "月額"}</p>
                ) : null}
                {profile.cancelAtPeriodEnd ? (
                  <p className="font-medium text-amber-700">
                    解約予約済みです。現在の期間終了までは有料機能を利用できます。
                  </p>
                ) : null}
              </div>
            </div>

            {/* Billing Portal Button for paid users */}
            {profile.plan !== "free" ? (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={handleOpenBillingPortal}
                  disabled={isOpeningPortal}
                >
                  {isOpeningPortal ? (
                    <>
                      <LoadingSpinner />
                      <span className="ml-2">読み込み中...</span>
                    </>
                  ) : (
                    "請求・プラン管理"
                  )}
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-4">
                <p className="text-sm font-medium text-foreground">有料プランへの変更は料金ページから行います。</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  月額・年額の比較や適用中のキャンペーンを確認してから購入できます。
                </p>
                <Button className="mt-4" onClick={handleOpenPricing}>
                  料金ページでプランを選ぶ
                </Button>
              </div>
            )}

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
                {profile.plan !== "free" ? (
                  <p className="text-sm text-muted-foreground">
                    Free への変更や解約予約は上の請求管理から行えます。
                  </p>
                ) : null}
              </div>

              {/* Standard Plan */}
              <div className={cn(
                "p-4 rounded-lg border-2 transition-all",
                profile?.plan === "standard" ? "border-primary bg-primary/5" : "border-border"
              )}>
                <h3 className="font-bold mb-1">Standard</h3>
                <p className="text-2xl font-bold mb-2">¥1,480<span className="text-sm font-normal">/月</span></p>
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
                {profile.plan === "free" && (
                  <Button
                    className="w-full"
                    onClick={handleOpenPricing}
                  >
                    アップグレード
                  </Button>
                )}
                {profile.plan !== "free" ? (
                  <p className="text-sm text-muted-foreground">
                    有料プラン間の変更は請求管理から行えます。
                  </p>
                ) : null}
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
                {profile.plan === "free" && (
                  <Button
                    className="w-full"
                    onClick={handleOpenPricing}
                  >
                    アップグレード
                  </Button>
                )}
                {profile.plan !== "free" ? (
                  <p className="text-sm text-muted-foreground">
                    年額切替や Pro への変更も請求管理から行えます。
                  </p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

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
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <Label htmlFor="daily-summary">デイリーサマリー</Label>
                    <p className="text-sm text-muted-foreground">
                      毎日1回、選んだ時刻（日本時間）に進捗サマリーを通知します
                    </p>
                  </div>
                  <Switch
                    id="daily-summary"
                    className="shrink-0"
                    checked={notificationSettings.dailySummary}
                    onCheckedChange={() => toggleNotificationSetting("dailySummary")}
                  />
                </div>
                {notificationSettings.dailySummary && (
                  <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                    <Label htmlFor="daily-summary-hour" className="text-sm">
                      送信時刻（JST）
                    </Label>
                    <Select
                      value={String(notificationSettings.dailySummaryHourJst ?? 9)}
                      onValueChange={(v) =>
                        setNotificationSettings((prev) =>
                          prev ? { ...prev, dailySummaryHourJst: parseInt(v, 10) } : prev
                        )
                      }
                    >
                      <SelectTrigger id="daily-summary-hour" className="mt-2 w-full max-w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAILY_SUMMARY_HOURS_JST.map((h) => (
                          <SelectItem key={h} value={String(h)}>
                            {h}:00
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

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
