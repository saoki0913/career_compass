import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a date string as relative time (e.g., "2時間前", "昨日", "3日前")
 * @param dateStr - ISO date string or Date object
 * @returns Relative time string in Japanese
 */
export function formatRelativeTime(dateStr: string | Date): string {
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return "たった今";
  }
  if (diffMin < 60) {
    return `${diffMin}分前`;
  }
  if (diffHour < 24) {
    return `${diffHour}時間前`;
  }
  if (diffDay === 1) {
    return "昨日";
  }
  if (diffDay < 7) {
    return `${diffDay}日前`;
  }
  if (diffDay < 30) {
    const weeks = Math.floor(diffDay / 7);
    return `${weeks}週間前`;
  }
  if (diffDay < 365) {
    const months = Math.floor(diffDay / 30);
    return `${months}ヶ月前`;
  }
  const years = Math.floor(diffDay / 365);
  return `${years}年前`;
}

/**
 * Format elapsed seconds as human-readable time (e.g., "15秒", "1分30秒")
 * @param seconds - Elapsed time in seconds
 * @returns Formatted time string in Japanese
 */
/**
 * Get a local date key string (YYYY-MM-DD) from a Date object or ISO string.
 * Uses local timezone (not UTC) to avoid JST midnight boundary issues.
 */
export function getLocalDateKey(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatElapsedTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}秒`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) {
    return `${minutes}分`;
  }
  return `${minutes}分${remainingSeconds}秒`;
}
