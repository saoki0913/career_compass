-- D-4: OAuth refresh token 年齢追跡
-- 新規 refresh token を受信した時点の timestamp を記録し、
-- `getValidGoogleCalendarAccessToken()` が 365 日超過で reconnect を要求する。
-- NULL 許容。既存行は初回の refresh 時に storeGoogleCalendarTokens で埋まる。

ALTER TABLE "calendar_settings"
  ADD COLUMN IF NOT EXISTS "google_refresh_token_issued_at" timestamp with time zone;
