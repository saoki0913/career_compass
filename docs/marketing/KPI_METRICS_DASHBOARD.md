# KPIメトリクスダッシュボード設計書

> 作成日: 2026-02-11
> 対象: 就活Pass (Career Compass)
> 目的: データ駆動型成長のための包括的KPI計測・ダッシュボード設計

---

## 目次

1. [KPI分類体系](#1-kpi分類体系)
2. [収益KPI](#2-収益kpi)
3. [獲得KPI](#3-獲得kpi)
4. [活性化KPI](#4-活性化kpi)
5. [リテンションKPI](#5-リテンションkpi)
6. [紹介KPI](#6-紹介kpi)
7. [ダッシュボード設計](#7-ダッシュボード設計)
8. [計測インフラ現状と改善](#8-計測インフラ現状と改善)
9. [実装ロードマップ](#9-実装ロードマップ)
10. [関連ドキュメント](#10-関連ドキュメント)

---

## 1. KPI分類体系

### 1.1 North Star Metric

**NSM: 月間AI利用アクティブユーザー数 (AI-Powered MAU)**

```
AI-Powered MAU = 月内に1回以上AI機能（ES添削/ガクチカ/志望動機）を利用したユニークユーザー数
```

**選定理由:**
- **価値提供の中核**: 本プロダクトの差別化要素はAI機能
- **収益との相関**: AI利用ユーザーは有料転換率が高い
- **チーム共通指標**: エンジニア・デザイナー・マーケター全員が理解しやすい
- **Leading Indicator**: 収益の先行指標として機能

**目標値:**
- 3ヶ月: 120人/月
- 6ヶ月: 600人/月
- 12ヶ月: 1,800人/月

### 1.2 Primary Metrics (最重要5指標)

| 指標 | 定義 | 目標 (12ヶ月後) | 測定頻度 |
|------|------|-----------------|---------|
| **AI-Powered MAU** | 月間AI利用アクティブユーザー | 1,800人 | 日次 |
| **Paying Users** | 有料プラン契約中ユーザー数 | 119人 (Standard 98, Pro 21) | 日次 |
| **MRR** | 月次経常収益 | ¥121,150 | 日次 |
| **Free→Paid転換率** | Free登録後30日以内の有料転換率 | 6% | 週次 |
| **Monthly Churn率** | 有料ユーザーの月次解約率 | <5% | 月次 |

### 1.3 Secondary Metrics (AARRR分類)

#### Acquisition (獲得)
- 新規登録数（Free/Guest）
- チャネル別流入数（Organic/Paid/Referral/Direct）
- ランディングページCVR
- チャネル別CAC

#### Activation (活性化)
- Aha Moment到達率（企業登録 or ES添削完了）
- オンボーディング完了率
- Time to First Value（初回AI利用までの時間）
- 機能別初回利用率

#### Retention (継続)
- DAU/WAU/MAU
- コホート別リテンション曲線
- 機能別エンゲージメント頻度
- クレジット残高分布

#### Referral (紹介)
- K-factor（バイラル係数）
- 紹介コード発行数
- 紹介経由登録率

#### Revenue (収益)
- ARPU/ARPPU
- クレジット利用率
- プランミックス比率
- LTV/CAC比

### 1.4 Leading vs Lagging Indicators

| Leading Indicators (先行指標) | Lagging Indicators (遅行指標) |
|------------------------------|------------------------------|
| 新規登録数 | MRR/ARR |
| Aha Moment到達率 | LTV |
| D7/D30リテンション | Annual Churn |
| クレジット利用率 | Unit Economics |
| 機能利用頻度 | Net Revenue Retention |
| アクティベーションチェックリスト進捗 | CAC Payback Period |

---

## 2. 収益KPI

### 2.1 基本収益指標

#### MRR (Monthly Recurring Revenue)

```sql
-- Supabase SQL
SELECT
  DATE_TRUNC('month', current_period_end) AS month,
  COUNT(DISTINCT user_id) AS paying_users,
  SUM(
    CASE
      WHEN stripe_price_id LIKE '%standard_monthly%' THEN 980
      WHEN stripe_price_id LIKE '%standard_yearly%' THEN 817  -- 9800/12
      WHEN stripe_price_id LIKE '%pro_monthly%' THEN 2980
      WHEN stripe_price_id LIKE '%pro_yearly%' THEN 2483  -- 29800/12
    END
  ) AS mrr
FROM subscriptions
WHERE status = 'active'
  AND current_period_end > CURRENT_DATE
GROUP BY month
ORDER BY month DESC;
```

**目標トラッキング:**
- Month 1: ¥15,760
- Month 3: ¥43,090
- Month 6: ¥74,930
- Month 12: ¥121,150

#### ARR (Annual Recurring Revenue)

```
ARR = MRR × 12
```

**目標値 (Year 1末):** ¥1,453,800

#### MRR成長率 (MoM Growth Rate)

```
MoM Growth = ((今月MRR - 先月MRR) / 先月MRR) × 100
```

**目標値:**
- 初期3ヶ月: 20-30% MoM成長
- 4-6ヶ月: 15-20% MoM成長
- 7-12ヶ月: 10-15% MoM成長

### 2.2 ユーザー単価指標

#### ARPU (Average Revenue Per User)

```sql
-- 全ユーザー対象（Free含む）
SELECT
  DATE_TRUNC('month', created_at) AS month,
  COUNT(DISTINCT id) AS total_users,
  COALESCE(SUM(mrr), 0) / COUNT(DISTINCT users.id) AS arpu
FROM users
LEFT JOIN (
  SELECT user_id,
    CASE
      WHEN stripe_price_id LIKE '%standard_monthly%' THEN 980
      WHEN stripe_price_id LIKE '%standard_yearly%' THEN 817
      WHEN stripe_price_id LIKE '%pro_monthly%' THEN 2980
      WHEN stripe_price_id LIKE '%pro_yearly%' THEN 2483
    END AS mrr
  FROM subscriptions
  WHERE status = 'active'
) AS sub ON users.id = sub.user_id
GROUP BY month;
```

**目標値 (Year 1末):**
- ARPU: ¥50-70（全ユーザー平均）

#### ARPPU (Average Revenue Per Paying User)

```sql
-- 有料ユーザーのみ
SELECT
  DATE_TRUNC('month', current_period_end) AS month,
  COUNT(DISTINCT user_id) AS paying_users,
  SUM(mrr) / COUNT(DISTINCT user_id) AS arppu
FROM subscriptions
WHERE status = 'active'
GROUP BY month;
```

**目標値:**
- Standard比率: 82% (¥980平均)
- Pro比率: 18% (¥2,980平均)
- ブレンドARPPU: ¥1,160-1,300

### 2.3 クレジット利用率

#### クレジット消費率

```sql
-- 月間クレジット消費率
SELECT
  u.id AS user_id,
  up.plan,
  c.monthly_allocation,
  c.balance,
  ROUND((c.monthly_allocation - c.balance) * 100.0 / c.monthly_allocation, 2) AS utilization_rate,
  DATE_TRUNC('month', c.last_reset_at) AS month
FROM users u
JOIN user_profiles up ON u.id = up.user_id
JOIN credits c ON u.id = c.user_id
WHERE up.plan IN ('standard', 'pro')
ORDER BY utilization_rate DESC;
```

**目標分布:**
- 0-30%消費: 30%のユーザー（軽量ユーザー）
- 30-70%消費: 50%のユーザー（標準ユーザー）
- 70-100%消費: 20%のユーザー（ヘビーユーザー）

**アクション:**
- 0-30%層: アップセルよりリテンション重視
- 70-100%層: Proプランへのアップセル訴求

#### オペレーション別クレジット消費

```sql
SELECT
  type,
  COUNT(*) AS transaction_count,
  SUM(ABS(amount)) AS total_credits_consumed,
  AVG(ABS(amount)) AS avg_credits_per_operation
FROM credit_transactions
WHERE type IN (
  'company_fetch', 'es_review', 'gakuchika', 'gakuchika_draft',
  'motivation', 'motivation_draft'
)
  AND created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY type
ORDER BY total_credits_consumed DESC;
```

**ベンチマーク:**
- ES添削: 全体の50-60%
- 企業取得: 15-20%
- ガクチカ: 15-20%
- 志望動機: 10-15%

### 2.4 プランミックス比率

#### プラン別ユーザー分布

```sql
SELECT
  plan,
  COUNT(*) AS user_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS percentage
FROM user_profiles
WHERE plan IN ('free', 'standard', 'pro')
GROUP BY plan;
```

**目標比率 (Year 1末):**
- Free: 95.0% (2,281人)
- Standard: 4.1% (98人)
- Pro: 0.9% (21人)

#### プラン別収益貢献度

```sql
SELECT
  CASE
    WHEN stripe_price_id LIKE '%standard%' THEN 'Standard'
    WHEN stripe_price_id LIKE '%pro%' THEN 'Pro'
  END AS plan_type,
  COUNT(DISTINCT user_id) AS users,
  SUM(mrr) AS total_mrr,
  ROUND(SUM(mrr) * 100.0 / (SELECT SUM(mrr) FROM subscriptions WHERE status = 'active'), 2) AS revenue_contribution
FROM subscriptions
WHERE status = 'active'
GROUP BY plan_type;
```

**目標比率 (Year 1末):**
- Standard: 66%の収益貢献
- Pro: 34%の収益貢献

### 2.5 オペレーション別収益性

#### API Cost vs Revenue (オペレーション別)

```sql
-- 疑似テーブル（実際はcredit_transactionsとAPI costデータを結合）
SELECT
  type,
  COUNT(*) AS operations,
  SUM(ABS(amount)) AS credits_consumed,
  -- APIコストは外部データとして結合必要
  SUM(ABS(amount)) * 3.27 AS revenue_standard_monthly,  -- Standard月額ベース
  SUM(ABS(amount)) * 3.73 AS revenue_pro_monthly,  -- Pro月額ベース
  -- API costカラムが必要（別途トラッキング）
  0 AS estimated_api_cost  -- プレースホルダー
FROM credit_transactions
WHERE type IN ('company_fetch', 'es_review', 'gakuchika', 'motivation')
  AND created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY type;
```

**粗利率ベンチマーク（参照: CREDIT_PROFITABILITY_ANALYSIS.md）:**
- 企業取得: 79-81% (優秀)
- ガクチカQ: 67-71% (優秀)
- 志望動機Q: 68-72% (優秀)
- ES添削(1x): 5-17% (薄利、要注意)

### 2.6 LTV (Lifetime Value)

#### LTV計算式

```
LTV = ARPU × 平均継続月数 × 粗利率
```

**シナリオ別LTV:**

| プラン | ARPU | 平均継続月数 | 粗利率 | LTV |
|--------|------|-------------|--------|-----|
| Standard月額 | ¥980 | 6ヶ月 | 68% | ¥4,000 |
| Standard年額 | ¥817 | 12ヶ月 | 51% | ¥5,000 |
| Pro月額 | ¥2,980 | 6ヶ月 | 62% | ¥11,100 |
| Pro年額 | ¥2,483 | 12ヶ月 | 55% | ¥16,400 |
| **ブレンドLTV** | - | - | - | **¥4,500-5,000** |

#### LTVトラッキングSQL

```sql
-- コホート別LTV
SELECT
  DATE_TRUNC('month', u.created_at) AS cohort_month,
  COUNT(DISTINCT u.id) AS cohort_size,
  SUM(total_revenue) / COUNT(DISTINCT u.id) AS avg_ltv
FROM users u
LEFT JOIN (
  SELECT
    user_id,
    SUM(
      CASE
        WHEN stripe_price_id LIKE '%standard_monthly%' THEN 980
        WHEN stripe_price_id LIKE '%standard_yearly%' THEN 9800
        WHEN stripe_price_id LIKE '%pro_monthly%' THEN 2980
        WHEN stripe_price_id LIKE '%pro_yearly%' THEN 29800
      END
    ) AS total_revenue
  FROM subscriptions
  GROUP BY user_id
) AS rev ON u.id = rev.user_id
WHERE u.created_at >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY cohort_month
ORDER BY cohort_month DESC;
```

### 2.7 Revenue per Credit (クレジット単価別収益)

#### オペレーション別収益性

| オペレーション | クレジット単価 | APIコスト | Standard月額収益 | 粗利率 |
|--------------|-------------|---------|-----------------|--------|
| 企業取得 | 1 | ¥0.70 | ¥3.27 | 79% |
| ES添削(1x) | 3.5平均 | ¥10.90 | ¥11.45 | 5% |
| ガクチカ質問 | 1 | ¥1.08 | ¥3.27 | 67% |
| ガクチカ下書 | 1 | ¥1.31 | ¥3.27 | 60% |
| 志望動機質問 | 1 | ¥1.05 | ¥3.27 | 68% |
| 志望動機下書 | 1 | ¥1.31 | ¥3.27 | 60% |

**粗利率改善アクション:**
- ES添削のmax_tokens削減（既実装）
- RAG HyDEモデルをHaikuに変更（提案中）
- 年額プラン割引率見直し（提案中）

---

## 3. 獲得KPI

### 3.1 新規登録数

#### 全体登録数

```sql
-- 日次新規登録数
SELECT
  DATE(created_at) AS date,
  COUNT(*) AS new_signups,
  SUM(COUNT(*)) OVER (ORDER BY DATE(created_at)) AS cumulative_signups
FROM users
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

**目標値:**
- Month 1-3: 200人/月
- Month 4-6: 300人/月
- Month 7-12: 350人/月
- Year 1累計: 2,400-4,300人

#### チャネル別登録数

```sql
-- utm_sourceベースのチャネル分類
SELECT
  COALESCE(
    CASE
      WHEN referrer LIKE '%google%' THEN 'Organic Search'
      WHEN referrer LIKE '%twitter%' THEN 'Social - Twitter'
      WHEN referrer LIKE '%tiktok%' THEN 'Social - TikTok'
      WHEN referrer LIKE '%instagram%' THEN 'Social - Instagram'
      ELSE 'Direct'
    END, 'Direct'
  ) AS channel,
  COUNT(*) AS signups
FROM users
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY channel
ORDER BY signups DESC;
```

**注意**: 現状はreferrer情報がusersテーブルに保存されていないため、GA4イベントデータとの結合が必要

### 3.2 チャネル別CAC

#### CAC計算式

```
CAC = チャネル別マーケティング費用 / チャネル別新規登録数
```

**目標CAC（チャネル別）:**

| チャネル | 目標CAC | 期待登録数/月 | 予算/月 (Month 4-6) |
|---------|---------|--------------|-------------------|
| Google広告 | ¥800 | 250人 | ¥200,000 |
| Twitter広告 | ¥750 | 200人 | ¥150,000 |
| TikTok広告 | ¥667 | 150人 | ¥100,000 |
| Instagram広告 | ¥833 | 60人 | ¥50,000 |
| SEO/コンテンツ | ¥667 | 150人 | ¥100,000 |
| 大学連携 | ¥500 | 100人 | ¥50,000 |
| リファラル | ¥429 | 70人 | ¥30,000 |

**許容CAC計算:**
```
LTV = ¥4,000（保守的見積）
目標LTV/CAC = 3:1
許容CAC = ¥4,000 ÷ 3 = ¥1,333
```

#### CACトラッキングSQL (データソース結合必要)

```sql
-- GA4イベントデータとマーケティング費用を結合
-- この例は概念的なもの（実際はGA4 BigQuery Exportと結合）
SELECT
  channel,
  SUM(marketing_spend) AS total_spend,
  COUNT(DISTINCT user_id) AS signups,
  SUM(marketing_spend) / COUNT(DISTINCT user_id) AS cac
FROM marketing_attribution  -- 仮想テーブル
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY channel
ORDER BY cac ASC;
```

### 3.3 ランディングページCVR

#### トップページCVR

```
CVR = (新規登録数 / ランディングページ訪問数) × 100
```

**GA4イベント:**
- `page_view` (landing_page = '/')
- `sign_up` (新規登録完了)

**目標CVR:**
- トップページ: 3-5%
- 比較ページ: 5-8%
- 緊急LP（締切直前向け）: 8-12%

#### CVRトラッキング (GA4)

```javascript
// Google Analytics 4 - Conversion Rate計算
// GA4管理画面で以下のカスタムメトリクスを作成
Metric Name: Landing Page CVR
Calculation: (sign_up events) / (page_view events on '/') * 100
```

### 3.4 Guest→Login転換率

#### 転換率計算

```sql
-- Guest登録後7日以内のLogin転換
SELECT
  COUNT(DISTINCT g.id) AS total_guests,
  COUNT(DISTINCT g.migrated_to_user_id) AS converted_to_users,
  ROUND(COUNT(DISTINCT g.migrated_to_user_id) * 100.0 / COUNT(DISTINCT g.id), 2) AS conversion_rate
FROM guest_users g
WHERE g.created_at >= CURRENT_DATE - INTERVAL '30 days'
  AND g.created_at <= CURRENT_DATE - INTERVAL '7 days';  -- 7日間の追跡期間
```

**目標値:**
- D7転換率: 25-35%
- D30転換率: 40-50%

**改善施策:**
- ログインプロンプト最適化（login_prompts テーブル活用）
- Guest限定機能制限（カレンダー連携等）

### 3.5 ウェイトリスト→登録転換率

#### 転換率計算

```sql
-- ウェイトリストユーザーの実登録率
SELECT
  COUNT(DISTINCT w.id) AS waitlist_signups,
  COUNT(DISTINCT u.id) AS converted_users,
  ROUND(COUNT(DISTINCT u.id) * 100.0 / COUNT(DISTINCT w.id), 2) AS conversion_rate
FROM waitlist_signups w
LEFT JOIN users u ON LOWER(w.email) = LOWER(u.email)
WHERE w.created_at >= CURRENT_DATE - INTERVAL '90 days';
```

**目標値:**
- 3ヶ月以内転換率: 60-80%（プレローンチ時）
- ローンチ後転換率: 20-30%

---

## 4. 活性化KPI

### 4.1 Aha Moment到達率

#### Aha Moment定義

**Primary Aha Moment:**
- 企業情報を1社取得 **OR**
- ES添削を1回完了

**Secondary Aha Moment:**
- 締切を1件登録 + AI添削を1回完了

#### 到達率計算

```sql
-- D7 Aha Moment到達率
WITH user_cohort AS (
  SELECT id, created_at
  FROM users
  WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
    AND created_at <= CURRENT_DATE - INTERVAL '7 days'
),
company_fetch AS (
  SELECT DISTINCT user_id
  FROM companies
  WHERE user_id IN (SELECT id FROM user_cohort)
    AND created_at <= (SELECT created_at FROM user_cohort WHERE id = companies.user_id) + INTERVAL '7 days'
),
es_review AS (
  SELECT DISTINCT ct.user_id
  FROM credit_transactions ct
  WHERE ct.user_id IN (SELECT id FROM user_cohort)
    AND ct.type = 'es_review'
    AND ct.created_at <= (SELECT created_at FROM user_cohort WHERE id = ct.user_id) + INTERVAL '7 days'
)
SELECT
  COUNT(DISTINCT uc.id) AS total_users,
  COUNT(DISTINCT cf.user_id) + COUNT(DISTINCT er.user_id) AS aha_users,
  ROUND((COUNT(DISTINCT cf.user_id) + COUNT(DISTINCT er.user_id)) * 100.0 / COUNT(DISTINCT uc.id), 2) AS aha_rate
FROM user_cohort uc
LEFT JOIN company_fetch cf ON uc.id = cf.user_id
LEFT JOIN es_review er ON uc.id = er.user_id;
```

**目標値:**
- D1 Aha到達率: 40-50%
- D7 Aha到達率: 60-70%
- D30 Aha到達率: 75-85%

### 4.2 オンボーディング完了率

#### 完了率計算

```sql
-- オンボーディング完了率
SELECT
  COUNT(*) AS total_users,
  SUM(CASE WHEN onboarding_completed = true THEN 1 ELSE 0 END) AS completed_users,
  ROUND(SUM(CASE WHEN onboarding_completed = true THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS completion_rate
FROM user_profiles
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days';
```

**目標値:**
- オンボーディング完了率: 80-90%

**オンボーディングステップ:**
1. プロフィール登録（大学・学部・卒業年）
2. 志望業界・職種選択
3. 企業1社登録
4. AI機能デモ体験

### 4.3 Time to First Value

#### 初回AI利用までの時間

```sql
-- 登録からAI機能初回利用までの時間
SELECT
  AVG(EXTRACT(EPOCH FROM (ct.created_at - u.created_at)) / 3600) AS avg_hours_to_first_ai,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ct.created_at - u.created_at)) / 3600) AS median_hours
FROM users u
JOIN credit_transactions ct ON u.id = ct.user_id
WHERE ct.type IN ('es_review', 'gakuchika', 'motivation', 'company_fetch')
  AND ct.created_at = (
    SELECT MIN(created_at)
    FROM credit_transactions
    WHERE user_id = u.id
      AND type IN ('es_review', 'gakuchika', 'motivation', 'company_fetch')
  )
  AND u.created_at >= CURRENT_DATE - INTERVAL '30 days';
```

**目標値:**
- Median Time to First Value: 15-30分
- 75th Percentile: 1-2時間

### 4.4 アクティベーションチェックリスト進捗

#### チェックリスト項目

**チェックリスト構成（5項目）:**
1. プロフィール完了
2. 企業1社登録
3. AI添削1回体験
4. 締切1件登録
5. カレンダー連携 (任意)

#### 進捗率計算

```sql
-- アクティベーションチェックリスト進捗
SELECT
  u.id,
  u.email,
  CASE WHEN up.university IS NOT NULL THEN 1 ELSE 0 END AS profile_completed,
  CASE WHEN c.company_count > 0 THEN 1 ELSE 0 END AS company_added,
  CASE WHEN ct.ai_usage_count > 0 THEN 1 ELSE 0 END AS ai_used,
  CASE WHEN d.deadline_count > 0 THEN 1 ELSE 0 END AS deadline_added,
  CASE WHEN cs.id IS NOT NULL THEN 1 ELSE 0 END AS calendar_connected,
  (
    CASE WHEN up.university IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN c.company_count > 0 THEN 1 ELSE 0 END +
    CASE WHEN ct.ai_usage_count > 0 THEN 1 ELSE 0 END +
    CASE WHEN d.deadline_count > 0 THEN 1 ELSE 0 END
  ) AS checklist_progress
FROM users u
LEFT JOIN user_profiles up ON u.id = up.user_id
LEFT JOIN (SELECT user_id, COUNT(*) AS company_count FROM companies GROUP BY user_id) c ON u.id = c.user_id
LEFT JOIN (SELECT user_id, COUNT(*) AS ai_usage_count FROM credit_transactions WHERE type IN ('es_review', 'gakuchika', 'motivation') GROUP BY user_id) ct ON u.id = ct.user_id
LEFT JOIN (SELECT company_id, COUNT(*) AS deadline_count FROM deadlines GROUP BY company_id) d ON c.user_id = u.id
LEFT JOIN calendar_settings cs ON u.id = cs.user_id
WHERE u.created_at >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY checklist_progress DESC;
```

**目標分布:**
- 0-2項目: 20%
- 3項目: 30%
- 4項目: 35%
- 5項目: 15%

**GA4イベント（既存）:**
- `activation_checklist_progress` (progress: number)

### 4.5 機能別Adoption Rate

#### 機能別初回利用率

```sql
-- 登録後30日以内の機能別利用率
WITH user_cohort AS (
  SELECT id, created_at
  FROM users
  WHERE created_at >= CURRENT_DATE - INTERVAL '60 days'
    AND created_at <= CURRENT_DATE - INTERVAL '30 days'
)
SELECT
  COUNT(DISTINCT uc.id) AS cohort_size,
  COUNT(DISTINCT c.user_id) AS company_users,
  COUNT(DISTINCT es.user_id) AS es_users,
  COUNT(DISTINCT gk.user_id) AS gakuchika_users,
  COUNT(DISTINCT mt.user_id) AS motivation_users,
  COUNT(DISTINCT dl.user_id) AS deadline_users,
  ROUND(COUNT(DISTINCT c.user_id) * 100.0 / COUNT(DISTINCT uc.id), 2) AS company_adoption,
  ROUND(COUNT(DISTINCT es.user_id) * 100.0 / COUNT(DISTINCT uc.id), 2) AS es_adoption,
  ROUND(COUNT(DISTINCT gk.user_id) * 100.0 / COUNT(DISTINCT uc.id), 2) AS gakuchika_adoption,
  ROUND(COUNT(DISTINCT mt.user_id) * 100.0 / COUNT(DISTINCT uc.id), 2) AS motivation_adoption,
  ROUND(COUNT(DISTINCT dl.user_id) * 100.0 / COUNT(DISTINCT uc.id), 2) AS deadline_adoption
FROM user_cohort uc
LEFT JOIN companies c ON uc.id = c.user_id AND c.created_at <= uc.created_at + INTERVAL '30 days'
LEFT JOIN (SELECT DISTINCT user_id FROM credit_transactions WHERE type = 'es_review') es ON uc.id = es.user_id
LEFT JOIN (SELECT DISTINCT user_id FROM credit_transactions WHERE type IN ('gakuchika', 'gakuchika_draft')) gk ON uc.id = gk.user_id
LEFT JOIN (SELECT DISTINCT user_id FROM credit_transactions WHERE type IN ('motivation', 'motivation_draft')) mt ON uc.id = mt.user_id
LEFT JOIN (SELECT DISTINCT user_id FROM deadlines d JOIN companies c ON d.company_id = c.id) dl ON uc.id = dl.user_id;
```

**目標Adoption Rate (D30):**
- 企業登録: 85-90%
- ES添削: 70-80%
- 締切管理: 60-70%
- ガクチカ: 40-50%
- 志望動機: 40-50%

---

## 5. リテンションKPI

### 5.1 DAU/WAU/MAU

#### アクティブユーザー数

```sql
-- DAU/WAU/MAU計算
-- DAU (Daily Active Users)
SELECT
  DATE(created_at) AS date,
  COUNT(DISTINCT user_id) AS dau
FROM sessions
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- WAU (Weekly Active Users)
SELECT
  DATE_TRUNC('week', created_at) AS week,
  COUNT(DISTINCT user_id) AS wau
FROM sessions
WHERE created_at >= CURRENT_DATE - INTERVAL '4 weeks'
GROUP BY week
ORDER BY week DESC;

-- MAU (Monthly Active Users)
SELECT
  DATE_TRUNC('month', created_at) AS month,
  COUNT(DISTINCT user_id) AS mau
FROM sessions
WHERE created_at >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY month
ORDER BY month DESC;
```

**目標値 (Year 1末):**
- DAU: 120-180人
- WAU: 400-600人
- MAU: 1,000-1,500人

### 5.2 DAU/MAU比率 (Stickiness)

#### Stickiness計算

```
Stickiness = (DAU / MAU) × 100
```

**目標値:**
- Stickiness: 12-18%（就活アプリは季節性あり）
- ピーク期（3-6月）: 20-25%
- 閑散期（8-9月）: 5-10%

```sql
-- 月別Stickiness
WITH dau_calc AS (
  SELECT
    DATE_TRUNC('month', created_at) AS month,
    AVG(daily_dau) AS avg_dau
  FROM (
    SELECT
      DATE(created_at) AS date,
      COUNT(DISTINCT user_id) AS daily_dau
    FROM sessions
    WHERE created_at >= CURRENT_DATE - INTERVAL '12 months'
    GROUP BY DATE(created_at)
  ) d
  GROUP BY DATE_TRUNC('month', date)
),
mau_calc AS (
  SELECT
    DATE_TRUNC('month', created_at) AS month,
    COUNT(DISTINCT user_id) AS mau
  FROM sessions
  WHERE created_at >= CURRENT_DATE - INTERVAL '12 months'
  GROUP BY DATE_TRUNC('month', created_at)
)
SELECT
  d.month,
  d.avg_dau,
  m.mau,
  ROUND((d.avg_dau / m.mau) * 100, 2) AS stickiness
FROM dau_calc d
JOIN mau_calc m ON d.month = m.month
ORDER BY d.month DESC;
```

### 5.3 コホート別リテンション曲線

#### リテンションSQL

```sql
-- 登録月別のD7/D30/D90リテンション
WITH cohorts AS (
  SELECT
    id AS user_id,
    DATE_TRUNC('month', created_at) AS cohort_month,
    created_at
  FROM users
  WHERE created_at >= CURRENT_DATE - INTERVAL '12 months'
)
SELECT
  c.cohort_month,
  COUNT(DISTINCT c.user_id) AS cohort_size,
  COUNT(DISTINCT CASE WHEN s.created_at BETWEEN c.created_at + INTERVAL '6 days' AND c.created_at + INTERVAL '8 days' THEN c.user_id END) AS d7_retained,
  COUNT(DISTINCT CASE WHEN s.created_at BETWEEN c.created_at + INTERVAL '29 days' AND c.created_at + INTERVAL '31 days' THEN c.user_id END) AS d30_retained,
  COUNT(DISTINCT CASE WHEN s.created_at BETWEEN c.created_at + INTERVAL '89 days' AND c.created_at + INTERVAL '91 days' THEN c.user_id END) AS d90_retained,
  ROUND(COUNT(DISTINCT CASE WHEN s.created_at BETWEEN c.created_at + INTERVAL '6 days' AND c.created_at + INTERVAL '8 days' THEN c.user_id END) * 100.0 / COUNT(DISTINCT c.user_id), 2) AS d7_retention,
  ROUND(COUNT(DISTINCT CASE WHEN s.created_at BETWEEN c.created_at + INTERVAL '29 days' AND c.created_at + INTERVAL '31 days' THEN c.user_id END) * 100.0 / COUNT(DISTINCT c.user_id), 2) AS d30_retention,
  ROUND(COUNT(DISTINCT CASE WHEN s.created_at BETWEEN c.created_at + INTERVAL '89 days' AND c.created_at + INTERVAL '91 days' THEN c.user_id END) * 100.0 / COUNT(DISTINCT c.user_id), 2) AS d90_retention
FROM cohorts c
LEFT JOIN sessions s ON c.user_id = s.user_id
GROUP BY c.cohort_month
ORDER BY c.cohort_month DESC;
```

**目標リテンション:**
- D7: 40-50%
- D30: 25-35%
- D90: 15-20%（就活終了による自然離脱含む）

### 5.4 機能別エンゲージメント頻度

#### 週間利用頻度

```sql
-- ユーザーあたり週間AI利用回数
SELECT
  ct.user_id,
  COUNT(*) AS weekly_ai_usage,
  ARRAY_AGG(DISTINCT ct.type) AS used_features
FROM credit_transactions ct
WHERE ct.type IN ('es_review', 'gakuchika', 'motivation', 'company_fetch')
  AND ct.created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY ct.user_id
ORDER BY weekly_ai_usage DESC;
```

**セグメント別平均利用頻度:**
- Power Users (週5回以上): 5-10%
- Active Users (週2-4回): 30-40%
- Casual Users (週1回): 40-50%
- Dormant (週0回): 10-20%

### 5.5 チャーン率

#### Monthly Churn Rate

```sql
-- 月次チャーン率（有料プランのみ）
WITH monthly_active AS (
  SELECT
    DATE_TRUNC('month', current_period_end) AS month,
    COUNT(DISTINCT user_id) AS active_users
  FROM subscriptions
  WHERE status = 'active'
  GROUP BY month
),
churned_users AS (
  SELECT
    DATE_TRUNC('month', updated_at) AS churn_month,
    COUNT(DISTINCT user_id) AS churned
  FROM subscriptions
  WHERE status IN ('canceled', 'expired')
    AND updated_at >= CURRENT_DATE - INTERVAL '12 months'
  GROUP BY churn_month
)
SELECT
  ma.month,
  ma.active_users,
  COALESCE(cu.churned, 0) AS churned,
  ROUND(COALESCE(cu.churned, 0) * 100.0 / NULLIF(ma.active_users, 0), 2) AS churn_rate
FROM monthly_active ma
LEFT JOIN churned_users cu ON ma.month = cu.churn_month
ORDER BY ma.month DESC;
```

**目標チャーン率:**
- Month 1-3: <15%/月（初期は高め）
- Month 4-6: <10%/月
- Month 7-12: <5%/月

**チャーン理由分析（要実装）:**
- 就活終了（内定獲得）: 50-60%
- 価格/価値不一致: 20-30%
- 機能不足: 10-15%
- その他: 5-10%

### 5.6 Expansion Revenue Rate

#### アップグレード率

```sql
-- Standard→Proアップグレード率
SELECT
  COUNT(DISTINCT user_id) AS standard_users,
  COUNT(DISTINCT CASE WHEN upgraded_to_pro = true THEN user_id END) AS upgraded_users,
  ROUND(COUNT(DISTINCT CASE WHEN upgraded_to_pro = true THEN user_id END) * 100.0 / COUNT(DISTINCT user_id), 2) AS upgrade_rate
FROM (
  SELECT
    user_id,
    stripe_price_id,
    LAG(stripe_price_id) OVER (PARTITION BY user_id ORDER BY created_at) AS prev_plan,
    CASE WHEN LAG(stripe_price_id) OVER (PARTITION BY user_id ORDER BY created_at) LIKE '%standard%' AND stripe_price_id LIKE '%pro%' THEN true ELSE false END AS upgraded_to_pro
  FROM subscriptions
  WHERE created_at >= CURRENT_DATE - INTERVAL '12 months'
) upgrades;
```

**目標値:**
- Standard→Pro年間アップグレード率: 10-15%

---

## 6. 紹介KPI

### 6.1 K-factor (Viral Coefficient)

#### K-factor計算式

```
K-factor = (紹介コード発行ユーザー数 / 全ユーザー数) × (紹介経由登録数 / 紹介コード発行ユーザー数)
```

**目標値:**
- K-factor: 0.15-0.25（1ユーザーが0.15-0.25人を紹介）

**K-factor > 1 の場合はバイラル成長（理想）**

#### K-factorトラッキング (要実装)

```sql
-- 紹介プログラムテーブル（要実装）
CREATE TABLE referrals (
  id TEXT PRIMARY KEY,
  referrer_user_id TEXT NOT NULL REFERENCES users(id),
  referred_user_id TEXT REFERENCES users(id),
  referral_code TEXT NOT NULL UNIQUE,
  status TEXT CHECK (status IN ('pending', 'completed', 'rewarded')),
  reward_credits INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- K-factor計算
WITH referrers AS (
  SELECT COUNT(DISTINCT referrer_user_id) AS total_referrers
  FROM referrals
  WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
),
referred AS (
  SELECT COUNT(DISTINCT referred_user_id) AS total_referred
  FROM referrals
  WHERE status = 'completed'
    AND completed_at >= CURRENT_DATE - INTERVAL '30 days'
),
total_users AS (
  SELECT COUNT(*) AS users
  FROM users
  WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
)
SELECT
  r.total_referrers,
  rf.total_referred,
  tu.users,
  ROUND((r.total_referrers::DECIMAL / tu.users) * (rf.total_referred::DECIMAL / r.total_referrers), 3) AS k_factor
FROM referrers r, referred rf, total_users tu;
```

### 6.2 紹介コード発行数

#### 発行率

```sql
-- 紹介コード発行ユーザー率
SELECT
  COUNT(DISTINCT u.id) AS total_users,
  COUNT(DISTINCT r.referrer_user_id) AS referrers,
  ROUND(COUNT(DISTINCT r.referrer_user_id) * 100.0 / COUNT(DISTINCT u.id), 2) AS referral_activation_rate
FROM users u
LEFT JOIN referrals r ON u.id = r.referrer_user_id
WHERE u.created_at >= CURRENT_DATE - INTERVAL '30 days';
```

**目標値:**
- 紹介コード発行率: 20-30%

### 6.3 紹介経由登録率

#### 転換率

```sql
-- 紹介コードから実登録までの転換率
SELECT
  COUNT(*) AS referral_codes_issued,
  COUNT(DISTINCT referred_user_id) AS referred_signups,
  ROUND(COUNT(DISTINCT referred_user_id) * 100.0 / COUNT(*), 2) AS referral_conversion_rate
FROM referrals
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days';
```

**目標値:**
- 紹介リンククリック→登録転換率: 15-25%

### 6.4 紹介経由LTV vs オーガニックLTV

#### LTV比較

```sql
-- 紹介経由ユーザーとオーガニックユーザーのLTV比較
WITH user_revenue AS (
  SELECT
    u.id AS user_id,
    CASE WHEN r.referred_user_id IS NOT NULL THEN 'Referral' ELSE 'Organic' END AS acquisition_type,
    SUM(
      CASE
        WHEN s.stripe_price_id LIKE '%standard_monthly%' THEN 980
        WHEN s.stripe_price_id LIKE '%standard_yearly%' THEN 9800
        WHEN s.stripe_price_id LIKE '%pro_monthly%' THEN 2980
        WHEN s.stripe_price_id LIKE '%pro_yearly%' THEN 29800
      END
    ) AS total_revenue
  FROM users u
  LEFT JOIN referrals r ON u.id = r.referred_user_id
  LEFT JOIN subscriptions s ON u.id = s.user_id
  WHERE u.created_at >= CURRENT_DATE - INTERVAL '12 months'
  GROUP BY u.id, acquisition_type
)
SELECT
  acquisition_type,
  COUNT(*) AS users,
  AVG(total_revenue) AS avg_ltv,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_revenue) AS median_ltv
FROM user_revenue
GROUP BY acquisition_type;
```

**仮説:**
- 紹介経由ユーザーのLTVは1.5-2倍高い（信頼性の高い紹介元）

### 6.5 Net Promoter Score (NPS)

#### NPS計算式

```
NPS = (Promoters% - Detractors%) × 100
```

**スコア分類:**
- Promoters (9-10点): 推奨者
- Passives (7-8点): 中立
- Detractors (0-6点): 批判者

#### NPSアンケート（要実装）

**タイミング:**
- 初回AI利用後1週間
- 有料プラン契約後1ヶ月
- 3ヶ月ごと

**質問:**
「就活Passを友人に勧める可能性は10点満点で何点ですか？」

**目標NPS:**
- Year 1: NPS 30-50（Good）
- Year 2: NPS 50-70（Excellent）

---

## 7. ダッシュボード設計

### 7.1 エグゼクティブダッシュボード

**対象**: 経営層、投資家向け
**更新頻度**: 日次
**画面構成**: 1画面

#### KPI配置

```
┌─────────────────────────────────────────────────────────────┐
│  就活Pass エグゼクティブダッシュボード         2026-02-11   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📊 Key Metrics (今月)                                       │
│  ┌─────────────┬─────────────┬─────────────┬──────────────┐│
│  │ MRR         │ Paying Users│ MAU         │ Churn Rate   ││
│  │ ¥121,150    │ 119人       │ 1,500人     │ 4.8%         ││
│  │ ↑ 12.5%     │ ↑ 8人       │ ↑ 15.2%     │ ↓ 0.3pp      ││
│  └─────────────┴─────────────┴─────────────┴──────────────┘│
│                                                             │
│  📈 MRR推移 (過去12ヶ月)                                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ¥150k─┐                                           ┌─  │  │
│  │       │                                         ┌─┘   │  │
│  │       │                                     ┌───┘     │  │
│  │ ¥100k─┤                               ┌─────┘         │  │
│  │       │                         ┌─────┘               │  │
│  │  ¥50k─┤                   ┌─────┘                     │  │
│  │       │             ┌─────┘                           │  │
│  │    ¥0─┴─────────────┴─────────────────────────────────│  │
│  │      2月  4月  6月  8月 10月 12月 2月                 │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  👥 ユーザー成長                                             │
│  ┌──────────────────────────────────────────────┐          │
│  │ 累計登録: 2,400人                            │          │
│  │ Free: 2,281 (95.0%) │ Std: 98 (4.1%) │ Pro: 21 (0.9%) │          │
│  └──────────────────────────────────────────────┘          │
│                                                             │
│  💰 収益内訳                                                 │
│  ┌──────────────────────────────────────────────┐          │
│  │ Standard: ¥80,360 (66%) │ Pro: ¥40,790 (34%)│          │
│  │ 月額: ¥89,840 (74%)    │ 年額: ¥31,310 (26%)│          │
│  └──────────────────────────────────────────────┘          │
│                                                             │
│  🎯 目標達成率                                               │
│  MRR目標: ¥121,150 / ¥121,150 (100%) ✅                     │
│  Paying目標: 119 / 119 (100%) ✅                             │
│  Churn目標: 4.8% / 5.0% (達成) ✅                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 実装ツール

**推奨**: Metabase or Superset (オープンソース) + Supabase接続

**SQL View作成例**:

```sql
-- エグゼクティブKPIビュー
CREATE OR REPLACE VIEW executive_kpi AS
SELECT
  -- MRR
  (SELECT SUM(
    CASE
      WHEN stripe_price_id LIKE '%standard_monthly%' THEN 980
      WHEN stripe_price_id LIKE '%standard_yearly%' THEN 817
      WHEN stripe_price_id LIKE '%pro_monthly%' THEN 2980
      WHEN stripe_price_id LIKE '%pro_yearly%' THEN 2483
    END
  ) FROM subscriptions WHERE status = 'active') AS mrr,

  -- Paying Users
  (SELECT COUNT(DISTINCT user_id) FROM subscriptions WHERE status = 'active') AS paying_users,

  -- MAU (過去30日)
  (SELECT COUNT(DISTINCT user_id) FROM sessions WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') AS mau,

  -- Churn Rate (過去30日)
  (SELECT
    ROUND(
      COUNT(CASE WHEN status IN ('canceled', 'expired') THEN 1 END) * 100.0 /
      COUNT(*), 2
    )
   FROM subscriptions
   WHERE updated_at >= CURRENT_DATE - INTERVAL '30 days'
  ) AS churn_rate,

  -- 累計登録
  (SELECT COUNT(*) FROM users) AS total_users,

  -- プラン別分布
  (SELECT COUNT(*) FROM user_profiles WHERE plan = 'free') AS free_users,
  (SELECT COUNT(*) FROM user_profiles WHERE plan = 'standard') AS standard_users,
  (SELECT COUNT(*) FROM user_profiles WHERE plan = 'pro') AS pro_users;
```

### 7.2 成長ダッシュボード (Acquisition & Activation)

**対象**: マーケティング・営業チーム
**更新頻度**: 日次
**画面構成**: 2-3画面

#### 画面1: 獲得ファネル

```
┌─────────────────────────────────────────────────────────────┐
│  成長ダッシュボード - 獲得ファネル             2026-02-11   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🎯 獲得ファネル (過去30日)                                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ サイト訪問                                      15,000 │ │
│  │   ↓ CVR 5.3%                                           │ │
│  │ 新規登録                                           800 │ │
│  │   ↓ Aha Rate 68%                                       │ │
│  │ Aha Moment到達                                     544 │ │
│  │   ↓ 有料転換 6%                                        │ │
│  │ 有料転換                                            48 │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  📊 チャネル別獲得 (今月)                                     │
│  ┌──────────────┬────────┬────────┬──────┬────────────────┐│
│  │ チャネル     │ 登録数 │ CAC    │ CVR  │ LTV/CAC        ││
│  ├──────────────┼────────┼────────┼──────┼────────────────┤│
│  │ Organic SEO  │ 150    │ ¥667   │ 8.5% │ 6.0x ✅        ││
│  │ Google広告   │ 250    │ ¥800   │ 4.2% │ 5.0x ✅        ││
│  │ Twitter広告  │ 200    │ ¥750   │ 5.1% │ 5.3x ✅        ││
│  │ TikTok広告   │ 150    │ ¥667   │ 6.8% │ 6.0x ✅        ││
│  │ 大学連携     │ 100    │ ¥500   │ 12%  │ 8.0x ⭐        ││
│  │ リファラル   │  70    │ ¥429   │ 15%  │ 9.3x ⭐        ││
│  └──────────────┴────────┴────────┴──────┴────────────────┘│
│                                                             │
│  📈 週別新規登録トレンド                                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  300─┐                                            ┌─  │  │
│  │      │                                        ┌───┘   │  │
│  │  200─┤                                    ┌───┘       │  │
│  │      │                                ┌───┘           │  │
│  │  100─┤                            ┌───┘               │  │
│  │      │                        ┌───┘                   │  │
│  │    0─┴────────────────────────┴───────────────────────│  │
│  │      W1   W2   W3   W4   W5   W6   W7   W8           │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 画面2: アクティベーション

```
┌─────────────────────────────────────────────────────────────┐
│  成長ダッシュボード - アクティベーション         2026-02-11 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ⚡ Aha Moment到達率 (D7)                                     │
│  ┌──────────────────────────────────────────────┐          │
│  │ 今週登録コホート: 200人                      │          │
│  │ D7 Aha到達: 136人 (68%) ✅ 目標65%超え       │          │
│  │                                              │          │
│  │ 企業登録: 120人 (60%)                        │          │
│  │ ES添削利用: 100人 (50%)                      │          │
│  │ 両方達成: 84人 (42%)                         │          │
│  └──────────────────────────────────────────────┘          │
│                                                             │
│  ✅ アクティベーションチェックリスト進捗                      │
│  ┌──────────────────────────────────────────────┐          │
│  │ 0-2項目: ████░░░░░░ 18%                      │          │
│  │ 3項目:   ████████░░ 32%                      │          │
│  │ 4項目:   ██████████ 38%                      │          │
│  │ 5項目:   ████░░░░░░ 12%                      │          │
│  └──────────────────────────────────────────────┘          │
│                                                             │
│  🕐 Time to First Value                                     │
│  ┌──────────────────────────────────────────────┐          │
│  │ Median: 18分 ✅ 目標30分以内                  │          │
│  │ 75th: 1.2時間 ✅                              │          │
│  │                                              │          │
│  │ 0-15分:  ████████░░ 42%                      │          │
│  │ 15-60分: ██████░░░░ 35%                      │          │
│  │ 1-4時間: ███░░░░░░░ 18%                      │          │
│  │ 4時間+:  █░░░░░░░░░  5%                      │          │
│  └──────────────────────────────────────────────┘          │
│                                                             │
│  📊 機能別Adoption Rate (D30)                                │
│  ┌──────────────┬─────────┬──────────────────────┐        │
│  │ 機能         │ 利用率  │ バー                 │        │
│  ├──────────────┼─────────┼──────────────────────┤        │
│  │ 企業登録     │ 88%     │ ████████████████████ │ ✅     │
│  │ ES添削       │ 76%     │ ███████████████░░░░░ │ ✅     │
│  │ 締切管理     │ 65%     │ █████████████░░░░░░░ │ ✅     │
│  │ ガクチカ     │ 48%     │ █████████░░░░░░░░░░░ │ ✅     │
│  │ 志望動機     │ 44%     │ ████████░░░░░░░░░░░░ │ ○      │
│  └──────────────┴─────────┴──────────────────────┘        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 プロダクトダッシュボード (Feature Usage & AI Quality)

**対象**: プロダクト・エンジニアリングチーム
**更新頻度**: 日次
**画面構成**: 3-4画面

#### 画面1: 機能利用状況

```
┌─────────────────────────────────────────────────────────────┐
│  プロダクトダッシュボード - 機能利用         2026-02-11     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🎨 機能別利用頻度 (過去30日)                                 │
│  ┌──────────────┬─────────┬──────────┬──────────────────┐  │
│  │ 機能         │ 利用回数│ ユーザー │ 平均回数/User    │  │
│  ├──────────────┼─────────┼──────────┼──────────────────┤  │
│  │ ES添削       │ 3,240   │ 540      │ 6.0回            │  │
│  │ 企業情報取得 │ 1,800   │ 600      │ 3.0回            │  │
│  │ ガクチカQ    │ 1,200   │ 300      │ 4.0回            │  │
│  │ 志望動機Q    │ 1,080   │ 270      │ 4.0回            │  │
│  │ ガクチカ下書 │   240   │ 120      │ 2.0回            │  │
│  │ 志望動機下書 │   216   │ 108      │ 2.0回            │  │
│  │ 締切登録     │ 2,400   │ 480      │ 5.0回            │  │
│  └──────────────┴─────────┴──────────┴──────────────────┘  │
│                                                             │
│  💳 クレジット利用状況                                        │
│  ┌──────────────────────────────────────────────┐          │
│  │ 総消費クレジット: 45,000 / 90,000 (50%)      │          │
│  │                                              │          │
│  │ プラン別利用率:                              │          │
│  │ Standard: ████████░░ 58%平均消費             │          │
│  │ Pro:      ███████░░░ 52%平均消費             │          │
│  │                                              │          │
│  │ オペレーション別消費割合:                    │          │
│  │ ES添削:   ██████████ 55%                     │          │
│  │ 企業取得: ███░░░░░░░ 18%                     │          │
│  │ ガクチカ: ███░░░░░░░ 16%                     │          │
│  │ 志望動機: ██░░░░░░░░ 11%                     │          │
│  └──────────────────────────────────────────────┘          │
│                                                             │
│  🔥 ユーザーセグメント別利用パターン                          │
│  ┌──────────────┬─────────┬──────────┬──────────────────┐  │
│  │ セグメント   │ ユーザー│ Avg利用  │ クレジット消費率 │  │
│  ├──────────────┼─────────┼──────────┼──────────────────┤  │
│  │ Power Users  │  12 (8%)│ 週12回   │ 95%              │  │
│  │ Active       │  60(40%)│ 週4回    │ 68%              │  │
│  │ Casual       │  72(48%)│ 週1回    │ 35%              │  │
│  │ Dormant      │   6 (4%)│ 週0回    │ 15%              │  │
│  └──────────────┴─────────┴──────────┴──────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 画面2: AI品質メトリクス

```
┌─────────────────────────────────────────────────────────────┐
│  プロダクトダッシュボード - AI品質           2026-02-11     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🤖 ES添削品質スコア (ユーザーフィードバック)                 │
│  ┌──────────────────────────────────────────────┐          │
│  │ 平均満足度: 4.2 / 5.0 ⭐⭐⭐⭐☆                │          │
│  │                                              │          │
│  │ 5つ星: ████████░░ 42%                        │          │
│  │ 4つ星: ██████████ 38%                        │          │
│  │ 3つ星: ███░░░░░░░ 15%                        │          │
│  │ 2つ星: █░░░░░░░░░  3%                        │          │
│  │ 1つ星: █░░░░░░░░░  2%                        │          │
│  └──────────────────────────────────────────────┘          │
│                                                             │
│  ⚡ API品質メトリクス (過去7日)                               │
│  ┌──────────────┬─────────┬──────────┬──────────────────┐  │
│  │ オペレーション│ 成功率  │ 平均速度 │ エラー率         │  │
│  ├──────────────┼─────────┼──────────┼──────────────────┤  │
│  │ ES添削       │ 98.5%   │ 8.2秒    │ 1.5% ✅          │  │
│  │ 企業情報     │ 95.2%   │ 12.5秒   │ 4.8% ⚠️         │  │
│  │ ガクチカ     │ 99.1%   │ 4.5秒    │ 0.9% ✅          │  │
│  │ 志望動機     │ 99.3%   │ 4.8秒    │ 0.7% ✅          │  │
│  └──────────────┴─────────┴──────────┴──────────────────┘  │
│                                                             │
│  💰 APIコスト効率                                             │
│  ┌──────────────────────────────────────────────┐          │
│  │ 今月総APIコスト: ¥55,460                      │          │
│  │ 収益: ¥121,150                                │          │
│  │ 粗利率: 54% ✅ 目標50%超え                     │          │
│  │                                              │          │
│  │ オペレーション別粗利率:                      │          │
│  │ 企業取得: ████████░░ 79% (優秀)              │          │
│  │ ガクチカ:  ███████░░░ 67% (優秀)              │          │
│  │ 志望動機: ███████░░░ 68% (優秀)              │          │
│  │ ES添削:   █░░░░░░░░░  5% (要改善)            │          │
│  └──────────────────────────────────────────────┘          │
│                                                             │
│  🔄 JSONパースエラー率 (ES添削)                               │
│  ┌──────────────────────────────────────────────┐          │
│  │ 今週: 0.8% ✅ (先週: 1.2%)                    │          │
│  │                                              │          │
│  │ リカバリ成功率: 95.5%                        │          │
│  │ - 直接パース成功: 92%                        │          │
│  │ - マークダウン除去: 5%                       │          │
│  │ - カンマ除去: 2%                             │          │
│  │ - ブラケット修復: 1%                         │          │
│  └──────────────────────────────────────────────┘          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 画面3: リテンションコホート

```
┌─────────────────────────────────────────────────────────────┐
│  プロダクトダッシュボード - リテンション     2026-02-11     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📊 コホート別リテンション (%)                                │
│  ┌────────┬────┬────┬────┬────┬────┬────┬────┬────┬────┐   │
│  │ 登録月 │ D0 │ D7 │D14 │D30 │D60 │D90 │    │    │    │   │
│  ├────────┼────┼────┼────┼────┼────┼────┼────┼────┼────┤   │
│  │ 2025-08│100%│ 45%│ 38%│ 28%│ 18%│ 12%│  8%│  5%│  3%│   │
│  │ 2025-09│100%│ 48%│ 42%│ 32%│ 22%│ 15%│ 10%│  7%│    │   │
│  │ 2025-10│100%│ 52%│ 45%│ 35%│ 25%│ 18%│ 12%│    │    │   │
│  │ 2025-11│100%│ 50%│ 43%│ 33%│ 24%│    │    │    │    │   │
│  │ 2025-12│100%│ 55%│ 48%│ 38%│    │    │    │    │    │   │
│  │ 2026-01│100%│ 58%│ 50%│    │    │    │    │    │    │   │
│  │ 2026-02│100%│ 60%│    │    │    │    │    │    │    │   │
│  └────────┴────┴────┴────┴────┴────┴────┴────┴────┴────┘   │
│                                                             │
│  📈 リテンション改善トレンド                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  70%─┐                        D7 Retention        ┌─  │  │
│  │      │                                        ┌───┘   │  │
│  │  60%─┤                                    ┌───┘       │  │
│  │      │                                ┌───┘           │  │
│  │  50%─┤                            ┌───┘               │  │
│  │      │                        ┌───┘                   │  │
│  │  40%─┤                    ┌───┘                       │  │
│  │      │                ┌───┘                           │  │
│  │  30%─┴────────────────┴───────────────────────────────│  │
│  │      8月  9月 10月 11月 12月  1月  2月               │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  🔍 離脱理由分析 (過去30日の有料チャーン)                      │
│  ┌──────────────────────────────────────────────┐          │
│  │ 就活終了（内定）: ████████░░ 58%              │          │
│  │ 価格/価値不一致: ████░░░░░░ 24%              │          │
│  │ 機能不足:        ██░░░░░░░░ 12%              │          │
│  │ その他:          █░░░░░░░░░  6%              │          │
│  └──────────────────────────────────────────────┘          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. 計測インフラ現状と改善

### 8.1 既存GA4イベント一覧

#### 現在トラッキング中のイベント (15個)

| イベント名 | パラメータ | トリガー箇所 | 目的 |
|-----------|----------|------------|------|
| `company_create` | なし | `useCompanies.ts:139` | 企業登録数 |
| `es_create` | なし | `useDocuments.ts:150` | ES作成数 |
| `deadline_create` | `type` | `useCompanyDeadlines.ts:139` | 締切登録数・タイプ別 |
| `ai_review_start` | `templateType`, `charCount`, `gakuchikaId`, `creditCost` | `useESReview.ts:329` | AI添削開始 |
| `ai_review_complete` | `templateType`, `charCount`, `creditCost`, `duration` | `useESReview.ts:424` | AI添削成功 |
| `ai_review_error` | `status` | `useESReview.ts:371, 443, 465` | AI添削エラー |
| `pricing_view` | なし | `pricing/page.tsx:136` | プライシングページ表示 |
| `checkout_intent_login` | `plan` | `pricing/page.tsx:156` | チェックアウト意図（未ログイン） |
| `checkout_start` | `plan` | `pricing/page.tsx:185` | チェックアウト開始 |
| `checkout_error` | なし | `pricing/page.tsx:191` | チェックアウトエラー |
| `tool_es_counter_view` | なし | `EsCounterClient.tsx:52` | ES文字数カウンター表示 |
| `activation_checklist_progress` | `completed`, `total`, `progress` | `ActivationChecklistCard.tsx:48` | アクティベーション進捗 |
| `contact_submit_success` | なし | `ContactForm.tsx:38` | お問い合わせ送信成功 |
| `contact_submit_error` | なし | `ContactForm.tsx:43` | お問い合わせ送信エラー |
| (自動) `page_view` | `page_path`, `page_title` | GA4自動 | ページビュー |

### 8.2 Stripe Dashboard

#### 利用可能なメトリクス

- **収益指標**: MRR, ARR, 新規収益, アップグレード収益
- **顧客指標**: アクティブサブスクリプション数, チャーン数
- **支払い**: 成功率, 失敗率, 失敗理由
- **プラン別分布**: プラン別収益・ユーザー数

**アクセス**: Stripe Dashboard > Analytics

### 8.3 Database-level Metrics (SQL例)

#### 日次アクティブユーザー (DAU)

```sql
-- DAU計算（セッションベース）
SELECT
  DATE(created_at) AS date,
  COUNT(DISTINCT user_id) AS dau
FROM sessions
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

#### プラン別MRR

```sql
-- プラン・支払い頻度別MRR
SELECT
  CASE
    WHEN stripe_price_id LIKE '%standard_monthly%' THEN 'Standard Monthly'
    WHEN stripe_price_id LIKE '%standard_yearly%' THEN 'Standard Yearly'
    WHEN stripe_price_id LIKE '%pro_monthly%' THEN 'Pro Monthly'
    WHEN stripe_price_id LIKE '%pro_yearly%' THEN 'Pro Yearly'
  END AS plan_type,
  COUNT(DISTINCT user_id) AS users,
  SUM(
    CASE
      WHEN stripe_price_id LIKE '%standard_monthly%' THEN 980
      WHEN stripe_price_id LIKE '%standard_yearly%' THEN 817
      WHEN stripe_price_id LIKE '%pro_monthly%' THEN 2980
      WHEN stripe_price_id LIKE '%pro_yearly%' THEN 2483
    END
  ) AS mrr
FROM subscriptions
WHERE status = 'active'
GROUP BY plan_type;
```

#### コホート別転換率

```sql
-- 登録月別のFree→Paid転換率
WITH cohorts AS (
  SELECT
    DATE_TRUNC('month', created_at) AS cohort_month,
    id AS user_id
  FROM users
  WHERE created_at >= CURRENT_DATE - INTERVAL '12 months'
),
conversions AS (
  SELECT
    user_id,
    MIN(created_at) AS first_paid_at
  FROM subscriptions
  WHERE status = 'active'
  GROUP BY user_id
)
SELECT
  c.cohort_month,
  COUNT(DISTINCT c.user_id) AS cohort_size,
  COUNT(DISTINCT conv.user_id) AS converted_users,
  ROUND(COUNT(DISTINCT conv.user_id) * 100.0 / COUNT(DISTINCT c.user_id), 2) AS conversion_rate,
  ROUND(AVG(EXTRACT(EPOCH FROM (conv.first_paid_at - u.created_at)) / 86400), 1) AS avg_days_to_convert
FROM cohorts c
LEFT JOIN conversions conv ON c.user_id = conv.user_id
LEFT JOIN users u ON c.user_id = u.id
GROUP BY c.cohort_month
ORDER BY c.cohort_month DESC;
```

#### 機能別利用頻度

```sql
-- オペレーション別月次利用統計
SELECT
  type,
  DATE_TRUNC('month', created_at) AS month,
  COUNT(*) AS operations,
  COUNT(DISTINCT user_id) AS unique_users,
  ROUND(COUNT(*) * 1.0 / COUNT(DISTINCT user_id), 2) AS avg_per_user
FROM credit_transactions
WHERE type IN ('company_fetch', 'es_review', 'gakuchika', 'gakuchika_draft', 'motivation', 'motivation_draft')
  AND created_at >= CURRENT_DATE - INTERVAL '6 months'
GROUP BY type, month
ORDER BY month DESC, operations DESC;
```

#### チャーン予測スコア

```sql
-- チャーンリスクスコア（最終利用から経過日数ベース）
SELECT
  u.id,
  u.email,
  up.plan,
  c.balance,
  c.monthly_allocation,
  ROUND((c.monthly_allocation - c.balance) * 100.0 / c.monthly_allocation, 2) AS utilization_rate,
  MAX(s.created_at) AS last_session,
  EXTRACT(DAY FROM (CURRENT_DATE - MAX(s.created_at)::date)) AS days_since_last_use,
  CASE
    WHEN EXTRACT(DAY FROM (CURRENT_DATE - MAX(s.created_at)::date)) > 14 THEN 'High Risk'
    WHEN EXTRACT(DAY FROM (CURRENT_DATE - MAX(s.created_at)::date)) > 7 THEN 'Medium Risk'
    ELSE 'Low Risk'
  END AS churn_risk
FROM users u
JOIN user_profiles up ON u.id = up.user_id
JOIN credits c ON u.id = c.user_id
LEFT JOIN sessions s ON u.id = s.user_id
WHERE up.plan IN ('standard', 'pro')
GROUP BY u.id, u.email, up.plan, c.balance, c.monthly_allocation
HAVING EXTRACT(DAY FROM (CURRENT_DATE - MAX(s.created_at)::date)) > 7
ORDER BY days_since_last_use DESC;
```

### 8.4 ギャップ分析（不足イベント・指標）

#### 不足しているGA4イベント

| カテゴリ | 不足イベント | 推奨実装箇所 | 優先度 |
|---------|------------|------------|--------|
| **Acquisition** | `sign_up` | 新規登録完了時 | P0 |
| | `guest_create` | Guest登録時 | P1 |
| | `referral_code_generate` | 紹介コード生成時 | P2 |
| | `referral_link_click` | 紹介リンククリック | P2 |
| **Activation** | `onboarding_step_complete` | プロフィール登録各ステップ | P0 |
| | `aha_moment_reached` | 企業登録 or AI添削完了 | P0 |
| | `first_company_added` | 初回企業登録 | P1 |
| | `first_deadline_added` | 初回締切登録 | P1 |
| **Engagement** | `company_info_fetch_success` | 企業情報取得成功 | P1 |
| | `gakuchika_start` | ガクチカ開始 | P1 |
| | `motivation_start` | 志望動機開始 | P1 |
| | `calendar_connect` | カレンダー連携 | P2 |
| **Monetization** | `plan_change` | プラン変更（アップグレード/ダウングレード） | P0 |
| | `checkout_complete` | チェックアウト完了 | P0 |
| | `credit_purchase` | クレジット追加購入（将来機能） | P2 |
| | `subscription_cancel` | サブスクリプション解約 | P0 |
| **Retention** | `daily_login` | 日次ログイン | P1 |
| | `feature_usage` | 機能別利用（汎用） | P1 |
| **Referral** | `referral_invite_sent` | 紹介招待送信 | P2 |

#### 計測できていない指標

| 指標 | 現状 | 推奨対応 | 優先度 |
|------|------|---------|--------|
| **チャネル別流入** | GA4で計測可能だがusersテーブルに保存されていない | utm_source/utm_campaignをusersテーブルに保存 | P0 |
| **K-factor** | referralsテーブル未実装 | referralsテーブル作成 + トラッキング | P1 |
| **NPS** | 未計測 | アンケート機能実装 | P2 |
| **API Cost/Revenue** | 手動計算のみ | api_cost_logsテーブル作成 | P1 |
| **エラー率** | バックエンドログのみ | error_logsテーブル + ダッシュボード連携 | P2 |
| **JSONパース成功率** | バックエンドログのみ | llm_requestsテーブル作成 | P2 |

---

## 9. 実装ロードマップ

### Phase 1: 基盤構築（1-4週間）

**目標**: 最低限のKPI計測とエグゼクティブダッシュボード立ち上げ

#### Week 1-2: 不足イベント追加 (P0)

```typescript
// 追加すべきGA4イベント実装例

// 1. Sign Up完了
trackEvent('sign_up', {
  method: 'google',  // google, email
  user_type: 'free'
});

// 2. Onboarding完了
trackEvent('onboarding_step_complete', {
  step: 'profile',  // profile, industry, first_company
  step_number: 1
});

// 3. Aha Moment到達
trackEvent('aha_moment_reached', {
  type: 'company_fetch',  // company_fetch, es_review
  days_since_signup: 2
});

// 4. プラン変更
trackEvent('plan_change', {
  from_plan: 'free',
  to_plan: 'standard',
  billing_cycle: 'monthly'
});

// 5. Checkout完了
trackEvent('checkout_complete', {
  plan: 'standard',
  billing_cycle: 'monthly',
  amount: 980,
  currency: 'JPY'
});

// 6. Subscription解約
trackEvent('subscription_cancel', {
  plan: 'standard',
  reason: 'job_search_completed',  // job_search_completed, price, feature_lack, other
  lifetime_days: 45
});
```

#### Week 2-3: チャネルアトリビューション保存

```typescript
// src/lib/db/schema.ts に追加
export const userAcquisition = pgTable("user_acquisition", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  utmSource: text("utm_source"),  // google, twitter, tiktok, referral, direct
  utmMedium: text("utm_medium"),  // cpc, organic, social, referral
  utmCampaign: text("utm_campaign"),
  utmTerm: text("utm_term"),
  utmContent: text("utm_content"),
  referrer: text("referrer"),
  landingPage: text("landing_page"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

// 登録時にUTMパラメータを保存
// src/app/api/auth/[...all]/route.ts
import { userAcquisition } from "@/lib/db/schema";

// 登録処理後
await db.insert(userAcquisition).values({
  id: nanoid(),
  userId: newUser.id,
  utmSource: request.query.utm_source,
  utmMedium: request.query.utm_medium,
  // ...
});
```

#### Week 3-4: SQLダッシュボード構築

**ツール選定**: Metabase or Redash (両方オープンソース、Supabase対応)

**セットアップ手順**:

1. **Metabase Dockerインストール**
```bash
docker run -d -p 3000:3000 \
  --name metabase \
  -e "MB_DB_TYPE=postgres" \
  -e "MB_DB_DBNAME=metabase" \
  -e "MB_DB_PORT=5432" \
  -e "MB_DB_USER=metabase" \
  -e "MB_DB_PASS=<password>" \
  -e "MB_DB_HOST=<supabase-host>" \
  metabase/metabase
```

2. **Supabase接続設定**
- Database Type: PostgreSQL
- Host: <project-ref>.supabase.co
- Port: 5432
- Database: postgres
- User: postgres
- Password: <your-password>

3. **ダッシュボードテンプレート作成**
- Executive Dashboard (5-6カード)
- Growth Dashboard (8-10カード)
- Product Dashboard (10-12カード)

### Phase 2: Analytics Platform統合（4-8週間）

**目標**: プロダクト分析ツール導入、ファネル・コホート分析の自動化

#### Week 5-6: Mixpanel or Amplitude統合

**推奨**: Mixpanel (就活アプリ向け、無料枠1,000 MTU/月)

**実装手順**:

1. **Mixpanelセットアップ**
```bash
npm install mixpanel-browser
```

2. **初期化**
```typescript
// src/lib/analytics/mixpanel.ts
import mixpanel from 'mixpanel-browser';

mixpanel.init(process.env.NEXT_PUBLIC_MIXPANEL_TOKEN!, {
  debug: process.env.NODE_ENV === 'development',
  track_pageview: true,
  persistence: 'localStorage'
});

export function identifyUser(userId: string, properties: Record<string, unknown>) {
  mixpanel.identify(userId);
  mixpanel.people.set(properties);
}

export function trackMixpanelEvent(eventName: string, properties?: Record<string, unknown>) {
  mixpanel.track(eventName, properties);
}
```

3. **既存trackEvent関数を拡張**
```typescript
// src/lib/analytics/client.ts
import { trackMixpanelEvent } from './mixpanel';

export function trackEvent(eventName: string, params?: Record<string, unknown>) {
  // GA4トラッキング（既存）
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, params ?? {});
  }

  // Mixpanelトラッキング（追加）
  trackMixpanelEvent(eventName, params);
}
```

4. **ユーザープロパティ設定**
```typescript
// src/app/api/auth/[...all]/route.ts
import { identifyUser } from '@/lib/analytics/mixpanel';

// ログイン成功後
identifyUser(user.id, {
  email: user.email,
  plan: userProfile.plan,
  signup_date: user.createdAt,
  university: userProfile.university,
  graduation_year: userProfile.graduationYear
});
```

#### Week 7-8: ファネル・コホート設定

**Mixpanelで作成するファネル**:

1. **登録ファネル**
```
Landing Page View → Sign Up → Onboarding Complete → First Company Added → Aha Moment
```

2. **有料転換ファネル**
```
Pricing View → Checkout Intent → Checkout Start → Checkout Complete
```

3. **AI機能ファネル**
```
Company Added → ES Created → AI Review Start → AI Review Complete → Satisfied (4-5 stars)
```

**コホート分析**:
- 登録月別リテンション（D1, D7, D30, D90）
- チャネル別リテンション比較
- プラン別チャーン率

### Phase 3: カスタムダッシュボード開発（8-12週間）

**目標**: アプリ内KPIダッシュボード実装（管理者向け）

#### Week 9-10: バックエンドAPI実装

```typescript
// src/app/api/admin/kpi/route.ts
import { db } from '@/lib/db';
import { sessions, users, subscriptions, creditTransactions } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

export async function GET(request: Request) {
  // 権限チェック（管理者のみ）
  const session = await auth();
  if (session?.user?.email !== 'admin@example.com') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // North Star Metric: AI-Powered MAU
  const aiPoweredMau = await db.select({
    count: sql<number>`count(distinct user_id)`
  })
    .from(creditTransactions)
    .where(sql`type IN ('es_review', 'gakuchika', 'motivation')`)
    .where(sql`created_at >= current_date - interval '30 days'`);

  // MRR
  const mrr = await db.select({
    total: sql<number>`sum(case
      when stripe_price_id like '%standard_monthly%' then 980
      when stripe_price_id like '%standard_yearly%' then 817
      when stripe_price_id like '%pro_monthly%' then 2980
      when stripe_price_id like '%pro_yearly%' then 2483
    end)`
  })
    .from(subscriptions)
    .where(sql`status = 'active'`);

  // Paying Users
  const payingUsers = await db.select({
    count: sql<number>`count(distinct user_id)`
  })
    .from(subscriptions)
    .where(sql`status = 'active'`);

  // MAU
  const mau = await db.select({
    count: sql<number>`count(distinct user_id)`
  })
    .from(sessions)
    .where(sql`created_at >= current_date - interval '30 days'`);

  return Response.json({
    aiPoweredMau: aiPoweredMau[0].count,
    mrr: mrr[0].total,
    payingUsers: payingUsers[0].count,
    mau: mau[0].count,
    timestamp: new Date().toISOString()
  });
}
```

#### Week 11-12: フロントエンド実装

```typescript
// src/app/admin/kpi/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Users, DollarSign, Activity } from 'lucide-react';

interface KPIData {
  aiPoweredMau: number;
  mrr: number;
  payingUsers: number;
  mau: number;
}

export default function KPIDashboard() {
  const [kpi, setKpi] = useState<KPIData | null>(null);

  useEffect(() => {
    fetch('/api/admin/kpi')
      .then(res => res.json())
      .then(data => setKpi(data));
  }, []);

  if (!kpi) return <div>Loading...</div>;

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">就活Pass KPIダッシュボード</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI-Powered MAU</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi.aiPoweredMau.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">月間AI利用アクティブユーザー</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MRR</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥{kpi.mrr.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">月次経常収益</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paying Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi.payingUsers}</div>
            <p className="text-xs text-muted-foreground">有料ユーザー数</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MAU</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi.mau.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">月間アクティブユーザー</p>
          </CardContent>
        </Card>
      </div>

      {/* MRR推移グラフ、コホート分析など追加 */}
    </div>
  );
}
```

### Phase 4: 高度な分析（12週間以降）

#### 予測モデル実装

1. **チャーン予測モデル**
```python
# backend/ml/churn_prediction.py
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

# 特徴量
# - days_since_last_use
# - credit_utilization_rate
# - feature_usage_diversity
# - signup_age_days
# - plan_type

# 学習・推論ロジック実装
```

2. **LTV予測モデル**
```python
# backend/ml/ltv_prediction.py
# コホート別LTV予測
```

3. **レコメンデーションエンジン**
```python
# backend/ml/feature_recommendation.py
# ユーザーの行動パターンから次に使うべき機能を推奨
```

---

## 10. 関連ドキュメント

### 内部ドキュメント

- **マーケティング戦略**: `docs/marketing/MARKETING_STRATEGY.md`
- **収益性分析**: `docs/marketing/CREDIT_PROFITABILITY_ANALYSIS.md`
- **価格戦略**: `docs/marketing/PRICING_ANALYSIS.md`
- **ファネル設計**: `docs/marketing/FUNNEL_DESIGN.md`
- **チャネルプレイブック**: `docs/marketing/CHANNEL_PLAYBOOK.md`
- **SEO戦略**: `docs/marketing/SEO_STRATEGY.md`

### 外部リファレンス

- **GA4公式ドキュメント**: https://support.google.com/analytics/answer/9267735
- **Mixpanel Best Practices**: https://mixpanel.com/blog/product-analytics-best-practices/
- **SaaS Metrics Guide (Baremetrics)**: https://baremetrics.com/academy/saas-metrics
- **Stripe Reporting API**: https://stripe.com/docs/reports

---

## Appendix: Quick Reference

### KPI一覧表（優先度順）

| カテゴリ | KPI | 計算式 | 目標 (Year 1末) | 測定頻度 |
|---------|-----|--------|----------------|---------|
| **North Star** | AI-Powered MAU | 月間AI利用ユニークユーザー | 1,800人 | 日次 |
| **収益** | MRR | サブスク収益合計/月 | ¥121,150 | 日次 |
| | ARPU | MRR / 全ユーザー | ¥50-70 | 週次 |
| | ARPPU | MRR / 有料ユーザー | ¥1,200 | 週次 |
| | LTV | ARPU × 継続月数 × 粗利率 | ¥4,500 | 月次 |
| **獲得** | 新規登録数 | 月間新規ユーザー | 200-350人/月 | 日次 |
| | CAC | マーケ費用 / 新規登録数 | <¥1,000 | 週次 |
| | LTV/CAC比 | LTV ÷ CAC | >3:1 | 月次 |
| **活性化** | Aha Moment到達率 | 企業 or ES完了 / 新規ユーザー | D7: 65% | 週次 |
| | オンボーディング完了率 | 完了 / 新規ユーザー | 85% | 週次 |
| **リテンション** | D7リテンション | D7アクティブ / 新規コホート | 45-50% | 週次 |
| | D30リテンション | D30アクティブ / 新規コホート | 30-35% | 月次 |
| | Monthly Churn | 解約 / 期初有料ユーザー | <5% | 月次 |
| **紹介** | K-factor | 紹介率 × 転換率 | 0.2-0.3 | 月次 |
| | NPS | Promoters% - Detractors% | 40-50 | 四半期 |

---

**このドキュメントは生きたドキュメントです。**
四半期ごとに見直し、実績データを反映して更新してください。

最終更新: 2026-02-11
