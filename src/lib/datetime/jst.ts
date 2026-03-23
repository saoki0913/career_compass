/**
 * JST (Asia/Tokyo) helpers for cron / notification batch logic.
 */

export const DAILY_SUMMARY_HOURS_JST = [7, 9, 12, 18] as const;
export type DailySummaryHourJst = (typeof DAILY_SUMMARY_HOURS_JST)[number];

export function isDailySummaryHourJst(n: number): n is DailySummaryHourJst {
  return (DAILY_SUMMARY_HOURS_JST as readonly number[]).includes(n);
}

/** YYYY-MM-DD in Asia/Tokyo */
export function getJstDateKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

/** Hour 0–23 in Asia/Tokyo */
export function getJstHour(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    hour: "numeric",
    hour12: false,
  }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value;
  return h ? parseInt(h, 10) : 0;
}

/** Start of calendar day in Tokyo, as a Date (UTC instant). */
export function startOfJstDayAsUtc(d: Date): Date {
  const key = getJstDateKey(d);
  return new Date(`${key}T00:00:00+09:00`);
}
