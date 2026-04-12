"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useCalendarSettings } from "@/hooks/useCalendar";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";
import { notifyUserFacingAppError, reportUserFacingError } from "@/lib/client-error-ui";
import { notifySuccess } from "@/lib/notifications";

interface GoogleCalendar {
  id: string;
  name: string;
  isPrimary: boolean;
}

const ArrowLeftIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
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
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

export default function CalendarSettingsPage() {
  const router = useRouter();
  const { settings, isLoading, error, updateSettings, refresh } = useCalendarSettings();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [calendarsLoading, setCalendarsLoading] = useState(false);
  const [calendarMode, setCalendarMode] = useState<"existing" | "create">("existing");
  const [newCalendarName, setNewCalendarName] = useState("就活Pass");
  const [isCreating, setIsCreating] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [targetCalendarId, setTargetCalendarId] = useState<string>("");
  const [freebusyCalendarIds, setFreebusyCalendarIds] = useState<string[]>([]);

  const connectionStatus = settings?.connectionStatus;

  const fetchCalendars = async () => {
    setCalendarsLoading(true);
    try {
      const res = await fetch("/api/calendar/calendars", { credentials: "include" });
      if (!res.ok) {
        const uiError = await parseApiErrorResponse(
          res,
          {
            code: "CALENDAR_LIST_FETCH_FAILED",
            userMessage: "カレンダー一覧を読み込めませんでした。",
            action: "ページを再読み込みして、もう一度お試しください。",
            retryable: true,
          },
          "calendarSettings.fetchCalendars"
        );
        setSaveError(uiError.message);
        return;
      }
      const data = await res.json();
      setCalendars(data.calendars ?? []);
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "CALENDAR_LIST_FETCH_FAILED",
          userMessage: "カレンダー一覧を読み込めませんでした。",
          action: "ページを再読み込みして、もう一度お試しください。",
          retryable: true,
        },
        "calendarSettings.fetchCalendars"
      );
      setSaveError(uiError.message);
      notifyUserFacingAppError(uiError);
    } finally {
      setCalendarsLoading(false);
    }
  };

  useEffect(() => {
    if (!settings) return;
    const nextTarget = settings.targetCalendarId || "";
    setTargetCalendarId(nextTarget);
    setFreebusyCalendarIds(
      settings.freebusyCalendarIds.length > 0
        ? settings.freebusyCalendarIds
        : nextTarget
          ? [nextTarget]
          : []
    );
  }, [settings]);

  useEffect(() => {
    if (connectionStatus?.connected) {
      fetchCalendars();
    }
  }, [connectionStatus?.connected]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const callbackError = params.get("error");

    if (connected === "1") {
      notifySuccess({ title: "Googleカレンダーを連携しました" });
      refresh?.();
      router.replace("/calendar/settings");
      return;
    }

    if (callbackError) {
      setSaveError(callbackError);
      router.replace("/calendar/settings");
    }
  }, [refresh, router]);

  const handleProviderChange = async (provider: "google" | "app") => {
    if (provider === "google" && !connectionStatus?.connected) {
      router.push("/calendar/connect?returnTo=%2Fcalendar%2Fsettings");
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const payload: {
        provider: "google" | "app";
        targetCalendarId?: string;
        freebusyCalendarIds?: string[];
      } = { provider };

      if (provider === "google") {
        const selectedTarget = targetCalendarId;
        if (!selectedTarget) {
          throw new Error("追加先のGoogleカレンダーを選択してください");
        }
        payload.targetCalendarId = selectedTarget;
        payload.freebusyCalendarIds = freebusyCalendarIds.length > 0 ? freebusyCalendarIds : [selectedTarget];
      }

      await updateSettings(payload);
      notifySuccess({ title: "カレンダー設定を保存しました" });
    } catch (err) {
      setSaveError(
        reportUserFacingError(
          err,
          {
            code: "CALENDAR_SETTINGS_SAVE_FAILED",
            userMessage: "設定を保存できませんでした。",
          },
          "CalendarSettingsPage:save",
        ),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveGoogleSettings = async () => {
    if (!connectionStatus?.connected) return;

    const nextTarget = targetCalendarId;
    if (!nextTarget) {
      setSaveError("追加先のGoogleカレンダーを選択してください");
      return;
    }
    const nextFreebusy = freebusyCalendarIds.length > 0 ? freebusyCalendarIds : [nextTarget];

    setIsSaving(true);
    setSaveError(null);

    try {
      await updateSettings({
        targetCalendarId: nextTarget,
        freebusyCalendarIds: nextFreebusy,
      });
      notifySuccess({ title: "Googleカレンダー設定を保存しました" });
    } catch (err) {
      setSaveError(
        reportUserFacingError(
          err,
          {
            code: "CALENDAR_SETTINGS_GOOGLE_SAVE_FAILED",
            userMessage: "Googleカレンダー設定を保存できませんでした。",
          },
          "CalendarSettingsPage:saveGoogleSettings",
        ),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateCalendar = async () => {
    if (!newCalendarName.trim()) return;

    setIsCreating(true);
    setSaveError(null);

    try {
      const res = await fetch("/api/calendar/calendars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newCalendarName.trim() }),
      });

      if (!res.ok) {
        throw await parseApiErrorResponse(
          res,
          {
            code: "CALENDAR_CREATE_FAILED",
            userMessage: "カレンダーを作成できませんでした。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: res.status >= 500,
          },
          "calendarSettings.createCalendar"
        );
      }

      const data = await res.json();
      const createdCalendar = data.calendar as GoogleCalendar;
      setCalendars((prev) => [...prev, createdCalendar]);
      setTargetCalendarId(createdCalendar.id);
      setFreebusyCalendarIds((prev) => Array.from(new Set([...prev, createdCalendar.id])));
      setCalendarMode("existing");
      notifySuccess({ title: "Googleカレンダーを作成しました" });
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "CALENDAR_CREATE_FAILED",
          userMessage: "カレンダーを作成できませんでした。",
          action: "時間を置いて、もう一度お試しください。",
          retryable: true,
        },
        "calendarSettings.createCalendar"
      );
      setSaveError(uiError.message);
      notifyUserFacingAppError(uiError);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/calendar/disconnect", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "CALENDAR_DISCONNECT_FAILED",
            userMessage: "Googleカレンダー連携を解除できませんでした。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: response.status >= 500,
          },
          "calendarSettings.disconnect"
        );
      }

      await refresh?.();
      notifySuccess({ title: "Googleカレンダー連携を解除しました" });
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "CALENDAR_DISCONNECT_FAILED",
          userMessage: "Googleカレンダー連携を解除できませんでした。",
          action: "時間を置いて、もう一度お試しください。",
          retryable: true,
        },
        "calendarSettings.disconnect"
      );
      setSaveError(uiError.message);
      notifyUserFacingAppError(uiError);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleReconnect = () => {
    router.push("/calendar/connect?returnTo=%2Fcalendar%2Fsettings");
  };

  const toggleFreebusyCalendar = (calendarId: string, checked: boolean) => {
    setFreebusyCalendarIds((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, calendarId]));
      }
      return prev.filter((id) => id !== calendarId);
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/calendar" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeftIcon />
          カレンダーに戻る
        </Link>

        <h1 className="text-2xl font-bold mb-8">カレンダー設定</h1>

        {(error || saveError) && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 mb-6">
            <p className="text-sm text-red-800">{error || saveError}</p>
            {(error || saveError)?.includes("ログイン") && (
              <Button variant="outline" className="mt-4" asChild>
                <Link href="/login">ログイン</Link>
              </Button>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : settings ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Googleカレンダー連携</CardTitle>
                <CardDescription>
                  Googleでログインしただけでは連携されません。ここで明示的に連携した場合のみ、カレンダー権限を要求します。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className={cn(
                  "rounded-xl border p-4",
                  connectionStatus?.connected ? "border-emerald-200 bg-emerald-50/70" : "border-border"
                )}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-medium">
                        <GoogleIcon />
                        <span>{connectionStatus?.connected ? "Googleカレンダー連携中" : "Googleカレンダー未連携"}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {connectionStatus?.connected
                          ? `${connectionStatus.connectedEmail ?? "接続済みアカウント"}${connectionStatus.connectedAt ? ` ・ ${new Date(connectionStatus.connectedAt).toLocaleString("ja-JP")}` : ""}`
                          : "設定画面のボタンからだけ Google カレンダー権限を付与します。"}
                      </p>
                      {connectionStatus?.needsReconnect && (
                        <p className="text-sm text-amber-700">権限更新が必要です。再連携してください。</p>
                      )}
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {connectionStatus?.connected ? (
                        <>
                          <Button variant="outline" onClick={handleReconnect}>
                            再連携する
                          </Button>
                          <Button variant="outline" onClick={handleDisconnect} disabled={isDisconnecting}>
                            {isDisconnecting ? "解除中..." : "連携を解除"}
                          </Button>
                        </>
                      ) : (
                        <Button onClick={handleReconnect}>
                          連携する
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {settings.syncSummary.failedCount > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center justify-between gap-3">
                    <div>
                      同期失敗: {settings.syncSummary.failedCount}件
                      {settings.syncSummary.lastFailureReason ? ` — ${settings.syncSummary.lastFailureReason}` : ""}
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await fetch("/api/calendar/sync-retry", { method: "POST" });
                          if (res.ok) {
                            refresh();
                          }
                        } catch {
                          // best-effort
                        }
                      }}
                      className="shrink-0 text-xs font-medium px-3 py-1 rounded-md bg-red-100 hover:bg-red-200 transition-colors"
                    >
                      再試行
                    </button>
                  </div>
                )}

                {settings.syncSummary.pendingCount > 0 && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    同期待ち: {settings.syncSummary.pendingCount}件
                  </div>
                )}

                <div className="grid gap-4">
                  <button
                    onClick={() => handleProviderChange("app")}
                    disabled={isSaving}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left",
                      settings.provider === "app" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    )}
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">就活Passカレンダー</p>
                      <p className="text-sm text-muted-foreground">アプリ内でのみ管理</p>
                    </div>
                    {settings.provider === "app" && <span className="text-primary"><CheckIcon /></span>}
                  </button>

                  <button
                    onClick={() => handleProviderChange("google")}
                    disabled={isSaving}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left",
                      settings.provider === "google" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    )}
                  >
                    <div className="w-10 h-10 rounded-full bg-white border flex items-center justify-center">
                      <GoogleIcon />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Googleカレンダー</p>
                      <p className="text-sm text-muted-foreground">
                        {connectionStatus?.connected ? "連携済み。追加先カレンダーを選べます" : "まだ権限は付与されていません"}
                      </p>
                    </div>
                    {settings.provider === "google" && connectionStatus?.connected && <span className="text-primary"><CheckIcon /></span>}
                    {!connectionStatus?.connected && (
                      <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">明示連携</span>
                    )}
                  </button>
                </div>
              </CardContent>
            </Card>

            {connectionStatus?.connected && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Googleカレンダー設定</CardTitle>
                  <CardDescription>
                    予定の追加先と、空き時間計算に使うカレンダーをここで管理します。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div
                      className={cn(
                        "p-4 rounded-lg border-2 cursor-pointer transition-all",
                        calendarMode === "existing" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                      )}
                      onClick={() => setCalendarMode("existing")}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                          calendarMode === "existing" ? "border-primary" : "border-muted-foreground"
                        )}>
                          {calendarMode === "existing" && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                        <Label className="cursor-pointer font-medium">既存のカレンダーを選択</Label>
                      </div>
                      {calendarMode === "existing" && (
                        <select
                          value={targetCalendarId}
                          onChange={(e) => setTargetCalendarId(e.target.value)}
                          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                          disabled={calendarsLoading}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {calendarsLoading ? (
                            <option>読み込み中...</option>
                          ) : calendars.length > 0 ? (
                            <>
                              <option value="">追加先カレンダーを選択</option>
                              {calendars.map((cal) => (
                                <option key={cal.id} value={cal.id}>
                                  {cal.name}{cal.isPrimary ? " (メイン)" : ""}
                                </option>
                              ))}
                            </>
                          ) : (
                            <option value="">利用可能なカレンダーがありません</option>
                          )}
                        </select>
                      )}
                    </div>

                    <div
                      className={cn(
                        "p-4 rounded-lg border-2 cursor-pointer transition-all",
                        calendarMode === "create" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                      )}
                      onClick={() => setCalendarMode("create")}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                          calendarMode === "create" ? "border-primary" : "border-muted-foreground"
                        )}>
                          {calendarMode === "create" && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                        <Label className="cursor-pointer font-medium">新しいカレンダーを作成</Label>
                      </div>
                      {calendarMode === "create" && (
                        <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                          <Input
                            value={newCalendarName}
                            onChange={(e) => setNewCalendarName(e.target.value)}
                            placeholder="カレンダー名を入力"
                          />
                          <Button onClick={handleCreateCalendar} disabled={isCreating || !newCalendarName.trim()} className="w-full">
                            {isCreating ? "作成中..." : "作成して候補に追加"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <h3 className="font-medium">空き時間計算に使うカレンダー</h3>
                      <p className="text-sm text-muted-foreground">
                        複数選択できます。選択したカレンダーの予定をまとめて見て空き時間を計算します。
                      </p>
                    </div>
                    <div className="space-y-2 rounded-lg border p-4">
                      {calendars.map((calendar) => (
                        <label key={calendar.id} className="flex items-center gap-3 text-sm">
                          <Checkbox
                            checked={freebusyCalendarIds.includes(calendar.id)}
                            onCheckedChange={(checked) => toggleFreebusyCalendar(calendar.id, checked === true)}
                          />
                          <span>{calendar.name}{calendar.isPrimary ? " (メイン)" : ""}</span>
                        </label>
                      ))}
                      {calendars.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          空き時間計算に使うGoogleカレンダーがありません。先にGoogle側でカレンダーを作成するか、この画面から新規作成してください。
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button onClick={handleSaveGoogleSettings} disabled={isSaving}>
                      {isSaving ? "保存中..." : "Google設定を保存"}
                    </Button>
                    {settings.provider !== "google" && (
                      <Button variant="outline" onClick={() => handleProviderChange("google")} disabled={isSaving}>
                        この設定でGoogleを使う
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">
                就活Passで作成した予定には「[就活Pass]」が付きます。Googleカレンダーから直接編集・削除した内容は、カレンダー画面の読み込み時に同期されます。
              </p>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
