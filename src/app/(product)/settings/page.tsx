"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProductPageHeader } from "@/components/shared/ProductPageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { INDUSTRIES, PROFILE_JOB_TYPES } from "@/lib/constants/industries";
import { DAILY_SUMMARY_HOURS_JST } from "@/lib/datetime/jst";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { notifySuccess, notifyPortalReturnDetailed } from "@/lib/notifications";
import { SettingsPageSkeleton } from "@/components/skeletons/SettingsPageSkeleton";
import { LoginRequiredForAi } from "@/components/auth/LoginRequiredForAi";
import { reportUserFacingError } from "@/lib/client-error-ui";
import { parseApiErrorResponse } from "@/lib/api-errors";
import { BillingSection } from "@/components/billing/BillingSection";

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
  subscriptionStatus?: string | null;
  cancelAtPeriodEnd?: boolean;
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

const NOTIFICATION_SETTING_ITEMS = [
  {
    id: "deadline-reminder",
    key: "deadlineReminder",
    label: "締切リマインド",
    description: "締切が近づいたときに通知を受け取る",
  },
  {
    id: "deadline-near",
    key: "deadlineNear",
    label: "締切が近い",
    description: "締切24時間以内の緊急通知を受け取る",
  },
  {
    id: "company-fetch",
    key: "companyFetch",
    label: "企業情報取得",
    description: "企業情報の取得完了時に通知を受け取る",
  },
  {
    id: "es-review",
    key: "esReview",
    label: "ES添削完了",
    description: "ES添削の完了時に通知を受け取る",
  },
  {
    id: "daily-summary",
    key: "dailySummary",
    label: "デイリーサマリー",
    description: "毎日1回、選んだ時刻（日本時間）に進捗サマリーを通知します",
  },
] satisfies Array<{
  id: string;
  key: keyof Pick<NotificationSettings, "deadlineReminder" | "deadlineNear" | "companyFetch" | "esReview" | "dailySummary">;
  label: string;
  description: string;
}>;

export default function SettingsPage() {
  const { isAuthenticated, isLoading: isAuthLoading, userPlan, refreshPlan } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const portalReturnHandled = useRef(false);

  useEffect(() => {
    if (portalReturnHandled.current) return;
    if (!isAuthenticated) return;
    if (searchParams.get("portal") !== "return") return;
    if (!profile) return;
    portalReturnHandled.current = true;

    const previousPlan = userPlan?.plan ?? profile.plan;
    const previousHasActive = userPlan?.hasActiveSubscription ?? false;
    refreshPlan().then(async (updatedPlan) => {
      let currentPlan = updatedPlan?.plan ?? previousPlan;
      try {
        const response = await fetch("/api/settings/profile", {
          credentials: "include",
        });
        if (!response.ok) {
          throw await parseApiErrorResponse(response, {
            code: "SETTINGS_PROFILE_FETCH_FAILED",
            userMessage: "請求管理後のプロフィール再取得に失敗しました。",
          }, "SettingsPage:portalReturnProfileRefresh");
        }
        const data = await response.json();
        setProfile(data.profile);
        setName(data.profile.name || "");
        setUniversity(data.profile.university || "");
        setFaculty(data.profile.faculty || "");
        setGraduationYear(data.profile.graduationYear?.toString() || "");
        setSelectedIndustries(data.profile.targetIndustries || []);
        setSelectedJobTypes(data.profile.targetJobTypes || []);
        currentPlan = data.profile.plan ?? currentPlan;
      } catch (profileRefreshError) {
        setError(reportUserFacingError(profileRefreshError, {
          code: "SETTINGS_PROFILE_FETCH_FAILED",
          userMessage: "請求管理後のプロフィール再取得に失敗しました。",
        }, "SettingsPage:portalReturnProfileRefresh"));
      }
      notifyPortalReturnDetailed({
        previousPlan,
        currentPlan,
        previousHasActiveSubscription: previousHasActive,
        currentHasActiveSubscription: updatedPlan?.hasActiveSubscription ?? previousHasActive,
      });
    });

    router.replace("/settings", { scroll: false });
  }, [isAuthenticated, searchParams, profile, refreshPlan, router, userPlan]);

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

  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated) {
      setProfile(null);
      setNotificationSettings(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchProfile = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/settings/profile", {
          credentials: "include",
        });

        if (!response.ok) {
          throw await parseApiErrorResponse(response, {
            code: "SETTINGS_PROFILE_FETCH_FAILED",
            userMessage: "プロフィールの取得に失敗しました。",
          }, "SettingsPage:fetchProfile");
        }

        const data = await response.json();
        if (cancelled) return;
        setProfile(data.profile);

        // Initialize form state
        setName(data.profile.name || "");
        setUniversity(data.profile.university || "");
        setFaculty(data.profile.faculty || "");
        setGraduationYear(data.profile.graduationYear?.toString() || "");
        setSelectedIndustries(data.profile.targetIndustries || []);
        setSelectedJobTypes(data.profile.targetJobTypes || []);
      } catch (err) {
        if (cancelled) return;
        setError(reportUserFacingError(err, {
          code: "SETTINGS_PROFILE_FETCH_FAILED",
          userMessage: "プロフィールの取得に失敗しました。",
        }, "SettingsPage:fetchProfile"));
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    const fetchNotificationSettings = async () => {
      try {
        const response = await fetch("/api/settings/notifications", {
          credentials: "include",
        });

        if (!response.ok) {
          throw await parseApiErrorResponse(response, {
            code: "SETTINGS_NOTIFICATIONS_FETCH_FAILED",
            userMessage: "通知設定の取得に失敗しました。",
          }, "SettingsPage:fetchNotifications");
        }

        const data = await response.json();
        if (cancelled) return;
        setNotificationSettings({
          ...data.settings,
          dailySummaryHourJst: data.settings.dailySummaryHourJst ?? 9,
        });
      } catch (err) {
        if (cancelled) return;
        setError(reportUserFacingError(err, {
          code: "SETTINGS_NOTIFICATIONS_FETCH_FAILED",
          userMessage: "通知設定の取得に失敗しました。",
        }, "SettingsPage:fetchNotifications"));
      }
    };

    fetchProfile();
    fetchNotificationSettings();

    return () => {
      cancelled = true;
    };
  }, [isAuthLoading, isAuthenticated]);

  const saveProfile = async (showToast = true) => {
    if (!name.trim()) {
      setError("名前を入力してください");
      return false;
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
        throw await parseApiErrorResponse(response, {
          code: "SETTINGS_PROFILE_UPDATE_FAILED",
          userMessage: "プロフィールを保存できませんでした。",
        }, "SettingsPage:saveProfile");
      }

      const data = await response.json();
      setProfile(data.profile);
      if (showToast) {
        notifySuccess({ title: "プロフィールを保存しました" });
      }
      return true;
    } catch (err) {
      setError(reportUserFacingError(err, {
        code: "SETTINGS_PROFILE_UPDATE_FAILED",
        userMessage: "プロフィールを保存できませんでした。",
      }, "SettingsPage:saveProfile"));
      return false;
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

  const saveNotificationSettings = async (showToast = true) => {
    if (!notificationSettings) return true;

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
        throw await parseApiErrorResponse(response, {
          code: "SETTINGS_NOTIFICATIONS_UPDATE_FAILED",
          userMessage: "通知設定を保存できませんでした。",
        }, "SettingsPage:saveNotifications");
      }

      const data = await response.json();
      setNotificationSettings({
        ...data.settings,
        dailySummaryHourJst: data.settings.dailySummaryHourJst ?? 9,
      });
      if (showToast) {
        notifySuccess({ title: "通知設定を保存しました" });
      }
      return true;
    } catch (err) {
      setError(reportUserFacingError(err, {
        code: "SETTINGS_NOTIFICATIONS_UPDATE_FAILED",
        userMessage: "通知設定を保存できませんでした。",
      }, "SettingsPage:saveNotifications"));
      return false;
    } finally {
      setIsSavingNotifications(false);
    }
  };

  const handleSaveAll = async () => {
    if (isSaving || isSavingNotifications) return;
    const profileSaved = await saveProfile(false);
    if (!profileSaved) return;
    const notificationsSaved = await saveNotificationSettings(false);
    if (!notificationsSaved) return;
    notifySuccess({ title: "設定を保存しました" });
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

  const handleOpenBillingPortal = async () => {
    setIsOpeningPortal(true);
    setError(null);

    try {
      const response = await fetch("/api/stripe/portal", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw await parseApiErrorResponse(response, {
          code: "STRIPE_PORTAL_CREATE_FAILED",
          userMessage: "請求管理ページを開けませんでした。",
          action: "時間をおいて、もう一度お試しください。",
        }, "SettingsPage:openBillingPortal");
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (err) {
      setError(reportUserFacingError(err, {
        code: "STRIPE_PORTAL_CREATE_FAILED",
        userMessage: "請求管理ページを開けませんでした。",
      }, "SettingsPage:openBillingPortal"));
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
        throw await parseApiErrorResponse(response, {
          code: "SETTINGS_ACCOUNT_DELETE_FAILED",
          userMessage: "アカウント削除に失敗しました。",
        }, "SettingsPage:deleteAccount");
      }

      // Redirect to login page after successful deletion
      router.push("/login");
    } catch (err) {
      setError(reportUserFacingError(err, {
        code: "SETTINGS_ACCOUNT_DELETE_FAILED",
        userMessage: "アカウント削除に失敗しました。",
      }, "SettingsPage:deleteAccount"));
      setIsDeleting(false);
    }
  };

  if (isAuthLoading || (isAuthenticated && isLoading)) {
    return (
      <div className="min-h-screen bg-background">
        <main>
          <SettingsPageSkeleton />
        </main>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <LoginRequiredForAi
            title="アカウント設定"
            description="プラン管理、プロフィール編集、通知設定はログイン後に利用できます。"
            fallbackAction={{ label: "ダッシュボードへ", href: "/dashboard" }}
          />
        </main>
      </div>
    );
  }

  const billingProfile = profile
    ? {
        plan: profile.plan,
        creditsBalance: profile.creditsBalance ?? 0,
        subscriptionStatus: profile.subscriptionStatus ?? null,
        cancelAtPeriodEnd: profile.cancelAtPeriodEnd ?? false,
        currentPeriodEnd: profile.currentPeriodEnd ?? null,
      }
    : null;

  const isSavingAny = isSaving || isSavingNotifications;

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full max-w-[96rem] px-4 py-8 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:px-6 lg:px-8">
        <ProductPageHeader
          title="設定"
          description="プロフィールや通知設定を管理"
          descriptionMode="always"
          variant="form"
          backLink={{ href: "/dashboard", label: "ダッシュボードへ戻る" }}
          actions={
            <Button onClick={() => void handleSaveAll()} disabled={isSavingAny} className="min-w-32">
              {isSavingAny ? (
                <>
                  <LoadingSpinner />
                  <span className="ml-2">保存中...</span>
                </>
              ) : (
                "保存する"
              )}
            </Button>
          }
        />

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] xl:items-start">
          <div className="min-w-0 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">プロフィール</CardTitle>
                <CardDescription>基本情報を編集</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex min-w-0 items-center gap-4">
                  {profile?.image ? (
                    <img
                      src={profile.image}
                      alt=""
                      className="h-14 w-14 rounded-full ring-2 ring-border"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted">
                      <span className="text-xl font-medium text-muted-foreground">
                        {name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{profile?.email}</p>
                    <p className="text-sm text-muted-foreground">
                      {profile?.plan === "pro"
                        ? "Proプラン"
                        : profile?.plan === "standard"
                        ? "Standardプラン"
                        : "Freeプラン"}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">名前 *</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="プロフィールに表示する名前（任意）"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="university">大学</Label>
                    <Input
                      id="university"
                      value={university}
                      onChange={(e) => setUniversity(e.target.value)}
                      placeholder="〇〇大学"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="faculty">学部・学科</Label>
                    <Input
                      id="faculty"
                      value={faculty}
                      onChange={(e) => setFaculty(e.target.value)}
                      placeholder="〇〇学部 〇〇学科"
                    />
                  </div>
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
                </div>
              </CardContent>
            </Card>

            <BillingSection
              profile={billingProfile}
              isOpeningPortal={isOpeningPortal}
              onOpenBillingPortal={handleOpenBillingPortal}
              className="mt-0"
              compact
            />

            <Card className="border-red-200 bg-red-50/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-red-700">アカウント削除</CardTitle>
                <CardDescription className="text-red-600">
                  この操作は取り消せません。すべてのデータが完全に削除されます。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => setShowDeleteModal(true)}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  アカウントを削除
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="min-w-0 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">志望業界・志望職種</CardTitle>
                <CardDescription>興味のある業界・職種を選択（複数可）</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <section>
                  <p className="mb-2 text-sm font-medium text-foreground">志望業界</p>
                  <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto pr-1">
                    {INDUSTRIES.map((industry) => {
                      const selected = selectedIndustries.includes(industry);
                      return (
                        <button
                          key={industry}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggleIndustry(industry)}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-xs font-medium transition-all sm:text-sm",
                            selected
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          )}
                        >
                          {industry}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <div className="border-t border-border/60 pt-4">
                  <p className="mb-2 text-sm font-medium text-foreground">志望職種</p>
                  <div className="flex flex-wrap gap-2">
                    {PROFILE_JOB_TYPES.map((jobType) => {
                      const selected = selectedJobTypes.includes(jobType);
                      return (
                        <button
                          key={jobType}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggleJobType(jobType)}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-xs font-medium transition-all sm:text-sm",
                            selected
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          )}
                        >
                          {jobType}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">通知設定</CardTitle>
                <CardDescription>受け取る通知の種類を選択</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {notificationSettings ? (
                  <>
                    {NOTIFICATION_SETTING_ITEMS.map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <Label htmlFor={item.id}>{item.label}</Label>
                          <p className="text-sm text-muted-foreground">{item.description}</p>
                        </div>
                        <Switch
                          id={item.id}
                          className="shrink-0"
                          checked={Boolean(notificationSettings[item.key])}
                          onCheckedChange={() => toggleNotificationSetting(item.key)}
                        />
                      </div>
                    ))}

                    {notificationSettings.dailySummary && (
                      <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
                          <SelectTrigger id="daily-summary-hour" className="w-full sm:w-40">
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
                  </>
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <LoadingSpinner />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Delete Confirmation Modal */}

        {showDeleteModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-lg bg-card p-6 text-card-foreground shadow-xl">
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
                  variant="outline"
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
