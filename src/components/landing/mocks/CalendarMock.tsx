"use client";

import { MOCK_COMPANIES } from "./mock-data";

/**
 * CalendarMock -- marketing mock of the calendar product page.
 * Rendered inside ScaleFit at fixed width 1040px.
 *
 * All styling uses Tailwind design-token classes to faithfully
 * reproduce the real product calendar UI.
 * Only the outermost div retains an inline `style={{ width: 1040 }}`.
 *
 * Matches: src/app/(product)/calendar/page.tsx
 *          src/components/calendar/CalendarSidebar.tsx
 *          src/components/ui/card.tsx (rounded-xl border border-border/50 shadow-sm)
 */

const DAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** Flat array of 35 day-numbers for the April 2026 grid. */
const GRID_DAYS = [
  30, 31, 1, 2, 3, 4, 5,
  6, 7, 8, 9, 10, 11, 12,
  13, 14, 15, 16, 17, 18, 19,
  20, 21, 22, 23, 24, 25, 26,
  27, 28, 29, 30, 1, 2, 3,
];

const esCompany = MOCK_COMPANIES[1].name;
const interviewCompany = MOCK_COMPANIES[2].name;

export function CalendarMock() {
  return (
    <div style={{ width: 1040 }} className="bg-card font-sans">
      {/* Header -- mirrors DashboardHeader + page title area */}
      <div className="border-b border-border bg-background px-5 py-4 flex items-center justify-between">
        <div>
          <div className="text-xl font-bold text-foreground tracking-tight">
            カレンダー
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            締切とタスクを管理
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm px-3 py-1.5 rounded-md text-muted-foreground">
            ホームに戻る
          </span>
          <span className="text-sm px-3 py-1.5 border border-border rounded-md bg-background text-muted-foreground flex items-center gap-1.5">
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            設定
          </span>
        </div>
      </div>

      {/* Calendar + Sidebar -- matches grid-cols-1 lg:grid-cols-4 at product width */}
      <div className="grid grid-cols-[3fr_1fr] gap-4 p-5">
        {/* Calendar Card -- matches <Card> (rounded-xl border border-border/50 shadow-sm) */}
        <div className="flex flex-col">
          <div className="rounded-xl border border-border/50 bg-card shadow-sm flex flex-col overflow-hidden">
            {/* Month Navigation -- matches CardHeader with nav buttons */}
            <div className="flex items-center gap-2 px-6 py-3">
              <span className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted/50">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </span>
              <span className="text-lg font-semibold tracking-tight text-foreground">
                2026年4月
              </span>
              <span className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted/50">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </div>

            {/* Weekday Headers -- matches sticky header in product */}
            <div className="grid grid-cols-7 gap-1 border-b border-border/40 pb-1 pt-0.5 mb-1 px-1">
              {DAYS.map((d, i) => (
                <div
                  key={d}
                  className={[
                    "py-2 text-center text-sm font-medium",
                    i === 0
                      ? "text-red-500"
                      : i === 6
                        ? "text-blue-500"
                        : "text-muted-foreground",
                  ].join(" ")}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day Grid -- flat grid matching product auto-rows-[minmax(4.5rem,auto)] */}
            <div className="grid auto-rows-[minmax(4.5rem,auto)] grid-cols-7 gap-1 px-1 pb-1">
              {GRID_DAYS.map((val, idx) => {
                const ri = Math.floor(idx / 7);
                const ci = idx % 7;
                const isToday = ri === 0 && val === 4;
                const isDim =
                  (ri === 0 && val > 28) || (ri === 4 && val <= 3);
                const hasDeadline = ri === 1 && ci === 5;
                const hasInterview = ri === 2 && ci === 3;
                const hasES = ri === 3 && ci === 1;

                const cellClasses = [
                  "p-1 rounded-lg border transition-colors text-left overflow-hidden",
                  isDim ? "bg-muted/30" : "bg-background",
                  isToday ? "ring-2 ring-primary" : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                const dayNumberColor = isDim
                  ? "text-muted-foreground"
                  : ci === 0
                    ? "text-red-500"
                    : ci === 6
                      ? "text-blue-500"
                      : "";

                return (
                  <div key={idx} className={cellClasses}>
                    {isToday ? (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                        {val}
                      </span>
                    ) : (
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-sm ${dayNumberColor}`}
                      >
                        {val}
                      </span>
                    )}
                    {hasDeadline && (
                      <div className="mt-1 rounded px-1 py-0.5 text-[10px] font-semibold leading-tight truncate bg-red-100 text-red-700">
                        ES提出
                      </div>
                    )}
                    {hasInterview && (
                      <div className="mt-1 rounded px-1 py-0.5 text-[10px] font-semibold leading-tight truncate bg-blue-100 text-blue-700">
                        面接対策
                      </div>
                    )}
                    {hasES && (
                      <div className="mt-1 rounded px-1 py-0.5 text-[10px] font-semibold leading-tight truncate bg-blue-100 text-blue-700">
                        ES下書き
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Calendar Legend -- outside the card, matching product mt-2 placement */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-red-100" />
              <span>締切</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-blue-100" />
              <span>タスク</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-green-100" />
              <span>Google予定</span>
            </div>
          </div>
        </div>

        {/* Sidebar -- matches CalendarSidebar spacing & card styles */}
        <div className="flex flex-col gap-4 overflow-hidden">
          {/* Google sync card -- matches Card + border-green-200 bg-green-50/50 */}
          <div className="rounded-xl border border-green-200 bg-green-50/50 shadow-sm p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {/* Google 4-color SVG */}
                <svg className="w-4 h-4" viewBox="0 0 24 24">
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
                <div>
                  <p className="text-sm text-green-700">
                    Googleカレンダー連携中
                  </p>
                </div>
              </div>
              {/* Check circle icon -- matches CalendarSidebar connected state */}
              <svg className="w-4 h-4 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>

          {/* Weekly deadlines card -- matches <Card> shadow-sm + CardHeader/CardContent structure */}
          <div className="rounded-xl border border-border/50 bg-card shadow-sm p-3.5">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                {/* Alert triangle icon */}
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                今週の締切
              </div>
              <span className="text-xs px-2 py-0.5 bg-secondary text-secondary-foreground rounded font-medium">
                2件
              </span>
            </div>

            {/* ES deadline item -- matches urgency card: red (daysLeft <= 7) */}
            <div className="p-2 rounded-lg bg-red-100 border border-red-300 mb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-700 truncate">ES提出</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {esCompany}
                  </p>
                </div>
                <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 border border-red-300 rounded shrink-0 font-medium">
                  あと6日
                </span>
              </div>
            </div>

            {/* Interview deadline item -- matches urgency card: orange (daysLeft <= 3) */}
            <div className="p-2 rounded-lg bg-orange-100 border border-orange-300">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-orange-700 truncate">面接対策</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {interviewCompany}
                  </p>
                </div>
                <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 border border-orange-300 rounded shrink-0 font-medium">
                  あと3日
                </span>
              </div>
            </div>
          </div>

          {/* Today's schedule card -- matches <Card> shadow-sm */}
          <div className="rounded-xl border border-border/50 bg-card shadow-sm p-3.5">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
              {/* Clock icon -- matches CalendarSidebar ClockIcon */}
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              今日の予定
            </div>
            <p className="text-sm text-muted-foreground">
              予定はありません
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
