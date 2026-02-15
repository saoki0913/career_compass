"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useCalendarSettings } from "@/hooks/useCalendar";

interface GoogleCalendar {
  id: string;
  name: string;
  isPrimary: boolean;
}

// Icons
const ArrowLeftIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
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

export default function CalendarSettingsPage() {
  const router = useRouter();
  const { settings, isLoading, error, updateSettings, refresh } = useCalendarSettings();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [calendarsLoading, setCalendarsLoading] = useState(false);
  const [calendarMode, setCalendarMode] = useState<"existing" | "create">("existing");
  const [newCalendarName, setNewCalendarName] = useState("就活Compass");
  const [isCreating, setIsCreating] = useState(false);

  // Fetch calendar list when connected
  const fetchCalendars = async () => {
    setCalendarsLoading(true);
    try {
      const res = await fetch("/api/calendar/calendars");
      const data = await res.json();
      if (data.calendars) {
        setCalendars(data.calendars);
      }
    } catch {
      // Silently fail - user can still use primary calendar
    } finally {
      setCalendarsLoading(false);
    }
  };

  useEffect(() => {
    if (settings?.isGoogleConnected) {
      fetchCalendars();
    }
  }, [settings?.isGoogleConnected]);

  const handleCreateCalendar = async () => {
    if (!newCalendarName.trim()) return;

    setIsCreating(true);
    setSaveError(null);
    setNeedsReconnect(false);

    try {
      const res = await fetch("/api/calendar/calendars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCalendarName.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data?.code === "NEED_RECONNECT") {
          setNeedsReconnect(true);
          setSaveError(
            data.error ||
              "Googleカレンダーの再連携が必要です。権限が更新されたため、もう一度Google連携してください。"
          );
          return;
        }
        throw new Error(data.error || "カレンダーの作成に失敗しました");
      }

      // Add the new calendar to the list
      setCalendars((prev) => [...prev, data.calendar]);

      // Switch to the new calendar
      await updateSettings({ targetCalendarId: data.calendar.id, provider: "google" });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);

      // Reset to existing mode
      setCalendarMode("existing");
      setNeedsReconnect(false);

      // Refetch settings
      refresh?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "カレンダーの作成に失敗しました");
    } finally {
      setIsCreating(false);
    }
  };

  const handleProviderChange = async (provider: "google" | "app") => {
    setIsSaving(true);
    setSaveError(null);
    setNeedsReconnect(false);
    setSaveSuccess(false);

    try {
      await updateSettings({ provider });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleGoogleConnect = () => {
    // If already connected via OAuth, just switch the provider
    if (settings?.isGoogleConnected) {
      handleProviderChange("google");
    } else {
      // If not connected, redirect to login page with return URL
      router.push("/login?callbackUrl=/calendar/settings");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back button */}
        <Link
          href="/calendar"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeftIcon />
          カレンダーに戻る
        </Link>

        <h1 className="text-2xl font-bold mb-8">カレンダー設定</h1>

        {/* Error */}
        {(error || saveError) && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 mb-6">
            <p className="text-sm text-red-800">{error || saveError}</p>
            {error?.includes("ログイン") && (
              <Button variant="outline" className="mt-4" asChild>
                <Link href="/login">ログイン</Link>
              </Button>
            )}
            {needsReconnect && (
              <Button variant="outline" className="mt-4" asChild>
                <Link href="/login?callbackUrl=/calendar/settings">再連携する</Link>
              </Button>
            )}
          </div>
        )}

        {/* Success */}
        {saveSuccess && (
          <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 mb-6">
            <p className="text-sm text-emerald-800 flex items-center gap-2">
              <CheckIcon />
              設定を保存しました
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : settings ? (
          <div className="space-y-6">
            {/* Provider selection */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">カレンダー連携</CardTitle>
                <CardDescription>
                  Googleカレンダーと連携すると、締切を自動で同期できます
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  {/* App calendar option */}
                  <button
                    onClick={() => handleProviderChange("app")}
                    disabled={isSaving}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left",
                      settings.provider === "app"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">就活Compassカレンダー</p>
                      <p className="text-sm text-muted-foreground">アプリ内でのみ管理</p>
                    </div>
                    {settings.provider === "app" && (
                      <span className="text-primary">
                        <CheckIcon />
                      </span>
                    )}
                  </button>

                  {/* Google calendar option */}
                  <button
                    onClick={() => settings.isGoogleConnected ? handleProviderChange("google") : handleGoogleConnect()}
                    disabled={isSaving}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left",
                      settings.provider === "google"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <div className="w-10 h-10 rounded-full bg-white border flex items-center justify-center">
                      <GoogleIcon />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Googleカレンダー</p>
                      <p className="text-sm text-muted-foreground">
                        {settings.isGoogleConnected
                          ? "連携済み"
                          : "締切を自動同期"}
                      </p>
                    </div>
                    {settings.provider === "google" && settings.isGoogleConnected && (
                      <span className="text-primary">
                        <CheckIcon />
                      </span>
                    )}
                    {!settings.isGoogleConnected && (
                      <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                        連携する
                      </span>
                    )}
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Google Calendar settings (shown when connected) */}
            {settings.isGoogleConnected && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Googleカレンダー設定</CardTitle>
                  <CardDescription>
                    締切やタスクを追加するカレンダーを選択または作成
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Calendar selection mode */}
                  <div className="space-y-4">
                    {/* Existing calendar option */}
                    <div
                      className={cn(
                        "p-4 rounded-lg border-2 cursor-pointer transition-all",
                        calendarMode === "existing"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => setCalendarMode("existing")}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                          calendarMode === "existing" ? "border-primary" : "border-muted-foreground"
                        )}>
                          {calendarMode === "existing" && (
                            <div className="w-2 h-2 rounded-full bg-primary" />
                          )}
                        </div>
                        <Label className="cursor-pointer font-medium">既存のカレンダーを選択</Label>
                      </div>
                      {calendarMode === "existing" && (
                        <select
                          value={settings.targetCalendarId || "primary"}
                          onChange={(e) => updateSettings({ targetCalendarId: e.target.value })}
                          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                          disabled={calendarsLoading}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {calendarsLoading ? (
                            <option>読み込み中...</option>
                          ) : calendars.length > 0 ? (
                            calendars.map((cal) => (
                              <option key={cal.id} value={cal.id}>
                                {cal.name}{cal.isPrimary ? " (メイン)" : ""}
                              </option>
                            ))
                          ) : (
                            <option value="primary">メインカレンダー</option>
                          )}
                        </select>
                      )}
                    </div>

                    {/* Create new calendar option */}
                    <div
                      className={cn(
                        "p-4 rounded-lg border-2 cursor-pointer transition-all",
                        calendarMode === "create"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => setCalendarMode("create")}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                          calendarMode === "create" ? "border-primary" : "border-muted-foreground"
                        )}>
                          {calendarMode === "create" && (
                            <div className="w-2 h-2 rounded-full bg-primary" />
                          )}
                        </div>
                        <Label className="cursor-pointer font-medium">新しいカレンダーを作成</Label>
                      </div>
                      {calendarMode === "create" && (
                        <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={newCalendarName}
                            onChange={(e) => setNewCalendarName(e.target.value)}
                            placeholder="カレンダー名を入力"
                            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                          />
                          <Button
                            onClick={handleCreateCalendar}
                            disabled={isCreating || !newCalendarName.trim()}
                            className="w-full"
                          >
                            {isCreating ? (
                              <>
                                <LoadingSpinner />
                                <span className="ml-2">作成中...</span>
                              </>
                            ) : (
                              "作成して選択"
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Note */}
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">
                就活Compassで作成した予定には「[就活Compass]」が付きます。
                Googleカレンダーから直接編集・削除すると就活Compassには反映されません。
              </p>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
