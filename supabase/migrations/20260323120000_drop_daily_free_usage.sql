-- 選考スケジュール無料枠は company_info_monthly_usage.schedule_fetch_free_uses に移行済み。
-- daily_free_usage は未使用のため削除する。
DROP TABLE IF EXISTS public.daily_free_usage;
