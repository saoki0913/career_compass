/** Cookie セッション + guest cookie 前提の fetch 用ヘッダー */
export function buildAuthFetchHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
  };
}

export function notificationsListUrl(limit?: number, unreadOnly?: boolean): string {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  if (unreadOnly) params.set("unreadOnly", "true");
  const q = params.toString();
  return q ? `/api/notifications?${q}` : "/api/notifications";
}
