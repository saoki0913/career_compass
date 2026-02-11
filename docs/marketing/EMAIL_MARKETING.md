# メールマーケティング設計書

> 作成日: 2026-02-11
> 対象: 就活Pass (Career Compass)
> 目的: メールを通じたオンボーディング、リテンション、アップセル、リエンゲージメントの体系的設計

---

## 目次

1. [メールマーケティング概要](#1-メールマーケティング概要)
2. [インフラ設計](#2-インフラ設計)
3. [DB設計](#3-db設計)
4. [オンボーディングシーケンス](#4-オンボーディングシーケンス)
5. [リテンションキャンペーン](#5-リテンションキャンペーン)
6. [リエンゲージメント](#6-リエンゲージメント)
7. [アップセルシーケンス](#7-アップセルシーケンス)
8. [トランザクショナルメール](#8-トランザクショナルメール)
9. [紹介プログラムメール](#9-紹介プログラムメール)
10. [テンプレート設計](#10-テンプレート設計)
11. [A/Bテスト計画](#11-abテスト計画)
12. [KPIと効果測定](#12-kpiと効果測定)
13. [ウェイトリスト活用](#13-ウェイトリスト活用)
14. [実装ロードマップ](#14-実装ロードマップ)
15. [関連ドキュメント](#15-関連ドキュメント)

---

## 1. メールマーケティング概要

### 1.1 現状分析

**現状**: メールインフラ未構築

| 項目 | 状態 |
|------|------|
| ESP (Email Service Provider) | 未導入 |
| メールテンプレート | なし |
| オンボーディングメール | なし |
| トランザクショナルメール | Stripe自動メールのみ |
| ウェイトリスト | 126件のメールアドレス（`waitlistSignups`テーブル、未送信） |
| メール配信設定UI | なし（`notificationSettings`テーブルはアプリ内通知用のみ） |

### 1.2 メールマーケティングの目的

```
┌─────────────────────────────────────────────────────────┐
│               メールマーケティング4つの柱               │
├─────────────┬─────────────┬─────────────┬──────────────┤
│ オンボーディ │ リテンション │ アップセル   │ リエンゲージ │
│ ング        │             │             │ メント       │
├─────────────┼─────────────┼─────────────┼──────────────┤
│ 新規→活性化 │ 活性化→継続 │ Free→有料   │ 離脱→復帰   │
│ Time to     │ DAU/WAU     │ ARPU向上    │ チャーン回復 │
│ Value短縮   │ 維持        │             │              │
└─────────────┴─────────────┴─────────────┴──────────────┘
```

### 1.3 期待効果

| 指標 | 現状 | 3ヶ月後目標 | 6ヶ月後目標 |
|------|------|------------|------------|
| アクティベーション率 | 未計測 | 55% | 65% |
| 7日リテンション | 未計測 | 40% | 55% |
| Free→Standard転換率 | 未計測 | 4% | 6% |
| 離脱ユーザー復帰率 | 0% | 8% | 15% |
| ウェイトリスト→登録 | 0/126 | 40人 (32%) | - |

---

## 2. インフラ設計

### 2.1 ESP選定

**推奨: Resend**

| ESP | 月額 | 送信数 | React Email | 日本語 | 判定 |
|-----|------|--------|-------------|--------|------|
| **Resend** | 無料〜$20 | 3,000/月〜50,000/月 | ネイティブ対応 | ○ | **推奨** |
| SendGrid | 無料〜$20 | 100/日〜50,000/月 | 非対応 | ○ | 代替 |
| Amazon SES | ~$0.10/1000通 | 無制限 | 非対応 | ○ | 大規模向け |
| Postmark | $15/月 | 10,000/月 | 非対応 | ○ | トランザクション特化 |

**Resend選定理由**:
- React Emailネイティブ対応（Next.jsスタックと親和性が高い）
- 無料枠で初期十分（3,000通/月）
- Webhook対応（開封・クリックトラッキング）
- SDK品質が高い（TypeScript first）
- ドメイン認証（SPF/DKIM/DMARC）容易

### 2.2 技術構成

```
┌─────────────────────────────────────────────────┐
│                   Next.js App                    │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐ │
│  │ Resend   │  │ React    │  │ Supabase      │ │
│  │ SDK      │  │ Email    │  │ (PostgreSQL)  │ │
│  │          │  │ Templates│  │               │ │
│  └────┬─────┘  └────┬─────┘  └───────┬───────┘ │
│       │              │                │          │
│  ┌────▼──────────────▼────────────────▼───────┐ │
│  │         API Routes / Server Actions         │ │
│  │  src/app/api/email/route.ts                 │ │
│  └────────────────────┬───────────────────────┘ │
│                       │                          │
│  ┌────────────────────▼───────────────────────┐ │
│  │         Cron Jobs (Vercel Cron)             │ │
│  │  - 締切リマインダー (毎朝9時 JST)          │ │
│  │  - リエンゲージメント (毎日12時 JST)        │ │
│  │  - ウィークリーダイジェスト (毎週月曜)      │ │
│  └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### 2.3 送信ドメイン設定

```
送信元: noreply@shukatsu-pass.com
返信先: support@shukatsu-pass.com

DNS設定:
  SPF:   v=spf1 include:resend.com ~all
  DKIM:  resend._domainkey.shukatsu-pass.com
  DMARC: v=DMARC1; p=quarantine; rua=mailto:dmarc@shukatsu-pass.com
```

### 2.4 ファイル構成

```
src/
├── lib/
│   └── email/
│       ├── client.ts          # Resend SDK初期化
│       ├── send.ts            # 汎用送信関数
│       └── templates/
│           ├── layout.tsx     # 共通レイアウト
│           ├── welcome.tsx    # ウェルカムメール
│           ├── onboarding/
│           │   ├── day1.tsx
│           │   ├── day3.tsx
│           │   ├── day7.tsx
│           │   └── day14.tsx
│           ├── retention/
│           │   ├── deadline-reminder.tsx
│           │   ├── credit-warning.tsx
│           │   └── weekly-digest.tsx
│           ├── upsell/
│           │   ├── credit-depleted.tsx
│           │   └── feature-limit.tsx
│           ├── re-engagement/
│           │   ├── day7-inactive.tsx
│           │   ├── day14-inactive.tsx
│           │   └── day30-inactive.tsx
│           ├── referral/
│           │   ├── invite-sent.tsx
│           │   └── reward-earned.tsx
│           └── transactional/
│               ├── subscription-created.tsx
│               ├── payment-failed.tsx
│               └── credits-renewed.tsx
├── app/
│   └── api/
│       └── email/
│           ├── send/route.ts       # メール送信API
│           └── webhook/route.ts    # Resend Webhook受信
```

---

## 3. DB設計

### 3.1 メール配信設定テーブル

```typescript
// src/lib/db/schema.ts に追加

export const emailPreferences = pgTable("email_preferences", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  // カテゴリ別opt-in/opt-out
  onboarding: boolean("onboarding").notNull().default(true),
  retention: boolean("retention").notNull().default(true),
  marketing: boolean("marketing").notNull().default(true),
  transactional: boolean("transactional").notNull().default(true),
  // グローバルopt-out
  unsubscribedAll: boolean("unsubscribed_all").notNull().default(false),
  unsubscribedAt: timestamptz("unsubscribed_at"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});
```

### 3.2 メール送信ログテーブル

```typescript
export const emailLogs = pgTable(
  "email_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    templateId: text("template_id").notNull(),
    subject: text("subject").notNull(),
    // Resendレスポンス
    resendId: text("resend_id"),
    status: text("status", {
      enum: ["queued", "sent", "delivered", "opened", "clicked", "bounced", "complained"],
    }).notNull().default("queued"),
    // トラッキング
    openedAt: timestamptz("opened_at"),
    clickedAt: timestamptz("clicked_at"),
    bouncedAt: timestamptz("bounced_at"),
    // メタデータ
    metadata: text("metadata"), // JSON: campaign, sequence, variant
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("email_logs_user_id_idx").on(t.userId),
    index("email_logs_template_id_idx").on(t.templateId),
    index("email_logs_status_idx").on(t.status),
    index("email_logs_created_at_idx").on(t.createdAt),
  ]
);
```

### 3.3 メールシーケンス進行テーブル

```typescript
export const emailSequenceProgress = pgTable(
  "email_sequence_progress",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sequenceId: text("sequence_id").notNull(), // "onboarding", "re-engagement", "upsell"
    currentStep: integer("current_step").notNull().default(0),
    status: text("status", {
      enum: ["active", "completed", "cancelled", "paused"],
    }).notNull().default("active"),
    startedAt: timestamptz("started_at").notNull().defaultNow(),
    nextSendAt: timestamptz("next_send_at"),
    completedAt: timestamptz("completed_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("email_seq_user_sequence_ux").on(t.userId, t.sequenceId),
    index("email_seq_next_send_idx").on(t.nextSendAt),
    index("email_seq_status_idx").on(t.status),
  ]
);
```

---

## 4. オンボーディングシーケンス

### 4.1 シーケンス概要

ユーザーがアカウント作成した直後から30日間にわたり、段階的に機能紹介と価値体験を促進する。

```
Day 0: ウェルカムメール（即時）
Day 1: 初回アクション促進（ES添削お試し案内）
Day 3: ガクチカ機能紹介
Day 7: 企業研究＆締切管理の紹介
Day 14: 成果確認＆クレジット残量通知
Day 21: アップセル（Free限界への気づき）
Day 30: まとめ＆次ステップ提案
```

### 4.2 Day 0: ウェルカムメール（即時送信）

**トリガー**: アカウント作成完了（`users`テーブル INSERT）

| 項目 | 内容 |
|------|------|
| 件名 | 「就活Pass へようこそ！今日からAIと就活を始めましょう」 |
| 送信タイミング | 登録直後（0分以内） |
| 目的 | 初回ログインの促進、クレジット確認、最初の1アクション |
| CTA | 「ESを添削してみる →」 |

**コンテンツ構成**:

```
1. 歓迎メッセージ（2行）
   「就活Pass へのご登録ありがとうございます！
    AIと一緒に、迷わず効率的に就活を進めましょう。」

2. 利用可能リソースの確認
   ┌──────────────────────────────────┐
   │ 🎁 今すぐ使える無料クレジット    │
   │                                  │
   │    30 クレジット（月額リセット）  │
   │                                  │
   │ ES添削: 約6回分                  │
   │ ガクチカ生成: 3回分              │
   │ 企業情報取得: 5社分              │
   └──────────────────────────────────┘

3. クイックスタート3ステップ
   ① 受ける企業を登録する（1分）
   ② ESを貼り付けてAI添削する（3分）
   ③ 締切をカレンダーに追加する（1分）

4. CTA ボタン
   [ESを添削してみる →]

5. フッター
   ヘルプ・配信停止リンク
```

**心理学的根拠**:
- **Goal-Gradient Effect**: 「3ステップ」で完了イメージを具体化
- **Endowment Effect**: 「今すぐ使える30クレジット」で所有感を強化
- **Activation Energy低減**: 最小アクションを明確に提示

### 4.3 Day 1: 初回アクション促進

**トリガー**: 登録後24時間＋未添削

| 項目 | 内容 |
|------|------|
| 件名 | 「ESを書いてみたけど不安...そんな時はAI添削を試してみませんか？」 |
| 送信条件 | 登録後24時間 AND ES添削未利用 |
| 除外条件 | 既にES添削を1回以上利用済み |
| CTA | 「無料でES添削を試す →」 |

**コンテンツ構成**:
```
1. 共感メッセージ
   「ES、何から書けばいいか分からない...
    そんな不安を感じていませんか？」

2. Before/After事例
   ┌────────────────┬────────────────┐
   │  添削前        │  添削後        │
   │  「貴社を...」 │  「データ分析」│
   │  抽象的な表現  │  具体的な根拠  │
   │  スコア: 52点  │  スコア: 85点  │
   └────────────────┴────────────────┘

3. 使い方ガイド（3ステップ図解）

4. CTA
   [無料でES添削を試す →]
```

### 4.4 Day 3: ガクチカ機能紹介

**トリガー**: 登録後72時間
**送信条件**: ガクチカ未作成
**除外条件**: ガクチカ作成済み

| 項目 | 内容 |
|------|------|
| 件名 | 「ガクチカに自信がない？AIが質問しながら一緒に作ります」 |
| CTA | 「ガクチカを作り始める →」 |

**コンテンツ**:
- ガクチカ壁打ち機能の価値説明
- STAR法テンプレート紹介
- AI対話形式の図解
- 「ガクチカは就活の土台。早めに固めると後が楽です」

### 4.5 Day 7: 企業研究＆締切管理

**トリガー**: 登録後7日
**送信条件**: 企業登録0-2社
**除外条件**: 3社以上登録済み

| 項目 | 内容 |
|------|------|
| 件名 | 「気になる企業、まだ登録していませんか？締切を逃さないために」 |
| CTA | 「企業を登録する →」 |

**コンテンツ**:
- 企業登録→締切自動追跡の価値
- 「締切を落とさない」安心感の訴求
- ダッシュボードの今日のタスク画面キャプチャ
- 就活シーズンカレンダーの季節別アドバイス

### 4.6 Day 14: 成果確認＆進捗

**トリガー**: 登録後14日

| 項目 | 内容 |
|------|------|
| 件名 | 「就活Pass 2週間の成果をご確認ください」 |
| CTA | 「ダッシュボードを見る →」 |

**コンテンツ**:
```
パーソナライズされた成果サマリー:

┌─────────────────────────────────┐
│  あなたの2週間の成果            │
│                                 │
│  ✅ ES添削: X回                 │
│  ✅ 企業登録: X社               │
│  ✅ 締切管理: X件               │
│  ✅ ガクチカ: X本               │
│                                 │
│  残りクレジット: XX / 30        │
└─────────────────────────────────┘
```

- 利用状況に応じたメッセージ分岐
  - 活発利用者: 「素晴らしいペースです！この調子で」
  - 低利用者: 「まだ始めていない機能がありますよ」
- クレジット残量が少ない場合、Standard プランのソフト紹介

### 4.7 Day 21: Free限界への気づき

**トリガー**: 登録後21日 AND Freeプラン
**送信条件**: AI機能を1回以上利用済み

| 項目 | 内容 |
|------|------|
| 件名 | 「Freeプランで足りていますか？Standard で就活を加速」 |
| CTA | 「プラン詳細を見る →」 |

**コンテンツ**:
- Free vs Standard 比較表
- 「月額980円 = 就活塾の1/100以下」の価格フレーミング
- Standard限定機能のハイライト
- 「今月中のアップグレードでクレジット即時付与」

### 4.8 Day 30: まとめ＆次ステップ

**トリガー**: 登録後30日

| 項目 | 内容 |
|------|------|
| 件名 | 「就活Pass 1ヶ月間お疲れさまでした」 |
| CTA | プラン別分岐 |

**コンテンツ**:
- 1ヶ月の成果サマリー（パーソナライズ）
- 次月の就活アドバイス（季節連動）
- 有料ユーザー: 「来月もよろしくお願いします」
- 無料ユーザー: Standard提案（最終）
- 紹介プログラム案内（`REFERRAL_PROGRAM.md`連携）

### 4.9 行動トリガー型（シーケンス外）

| トリガー | 件名 | タイミング |
|----------|------|-----------|
| 初回ES添削完了 | 「ES添削の結果はいかがでしたか？次はガクチカも」 | 添削完了後1時間 |
| 初回ガクチカ完了 | 「ガクチカが完成！ESに組み込んでみましょう」 | 完了後1時間 |
| 企業3社登録 | 「3社登録完了！締切アラートを設定しました」 | 登録直後 |

---

## 5. リテンションキャンペーン

### 5.1 締切リマインダーメール

**トリガー**: `deadlines`テーブルの`dueDate`に基づく

| タイミング | 件名パターン | 緊急度 |
|-----------|-------------|--------|
| 7日前 | 「[企業名] ES提出まであと7日です」 | 低 |
| 3日前 | 「[企業名] ES提出まであと3日！準備は大丈夫？」 | 中 |
| 1日前 | 「[企業名] ES提出は明日です！最終確認を」 | 高 |
| 当日朝 | 「【本日締切】[企業名] ESの提出をお忘れなく」 | 最高 |

**実装**:
- Vercel Cron: 毎朝9:00 JST実行
- `deadlines`テーブルを`dueDate`でフィルタ
- `emailPreferences.retention = true`のユーザーのみ

**コンテンツ**:
```
[企業名] [締切タイプ] まであと [N日]

┌─────────────────────────────┐
│ 📋 締切詳細                 │
│                             │
│ 企業: [company.name]        │
│ 種類: [deadline.type]       │
│ 日時: [deadline.dueDate]    │
│ 状態: [deadline.status]     │
└─────────────────────────────┘

[ダッシュボードで確認 →]
```

### 5.2 クレジット残量警告メール

**トリガー**: `credits.balance`が月間配分の20%以下になった時点

| プラン | 閾値 | 件名 |
|--------|------|------|
| Free (30cr) | 6cr以下 | 「クレジット残りわずか。今月のES添削を計画的に」 |
| Standard (300cr) | 60cr以下 | 「今月のクレジットが残り20%です」 |
| Pro (800cr) | 160cr以下 | 「クレジット残量のお知らせ」 |

**コンテンツ**:
- 現在の残量と消費ペース
- 今月残りで可能な操作数の目安
- Freeユーザー: Standard提案（「月300crで心配なし」）
- Standardユーザー: Pro提案またはクレジット追加購入（将来機能）

### 5.3 ウィークリーダイジェストメール

**トリガー**: 毎週月曜 9:00 JST（Vercel Cron）
**送信条件**: 過去7日間にアクティビティがあるユーザー

| 項目 | 内容 |
|------|------|
| 件名 | 「今週の就活ダッシュボード: [今週の締切数]件の締切」 |
| CTA | 「詳細を見る →」 |

**コンテンツ**:
```
━━━ 今週の就活サマリー ━━━

📅 今週の締切
  ・[企業A] ES提出 - 3/15(水)
  ・[企業B] Webテスト - 3/17(金)

✅ 先週の成果
  ・ES添削: X回
  ・企業登録: X社

💡 今週のヒント
  [季節に応じた就活アドバイス1文]

[ダッシュボードを開く →]
```

### 5.4 機能発見メール

登録後14日以降、未利用機能を段階的に紹介する。

| 未利用機能 | 件名 | タイミング |
|-----------|------|-----------|
| 志望動機AI | 「志望動機に悩んでいませんか？AIが壁打ちします」 | 登録14日後 |
| 企業RAG | 「企業研究をAIでもっと深く。企業分析機能のご紹介」 | 登録21日後 |
| カレンダー連携 | 「Googleカレンダーと連携して締切を自動管理」 | 登録28日後 |

---

## 6. リエンゲージメント

### 6.1 非アクティブ判定基準

| 非アクティブ期間 | 分類 | アプローチ |
|-----------------|------|-----------|
| 7日間 | 初期離脱 | ソフトリマインド |
| 14日間 | 中期離脱 | 価値再提示 |
| 30日間 | 長期離脱 | 最終オファー |
| 60日間以上 | 休眠 | リスト除外（サンセット） |

### 6.2 7日間非アクティブ

**トリガー**: 最終ログインから7日経過

| 項目 | 内容 |
|------|------|
| 件名 | 「就活の進捗、最近どうですか？」 |
| トーン | カジュアル、プレッシャーなし |
| CTA | 「ダッシュボードを見る →」 |

**コンテンツ**:
```
お久しぶりです！

就活Pass を少しお休みされているようですね。
就活は一人で進めると不安になりがちですが、
小さな一歩から始めてみませんか？

💡 今すぐできる3分アクション:
  ① 気になる企業を1社追加する
  ② ESの下書きを貼り付けて添削する
  ③ 今週の締切を確認する

[ダッシュボードに戻る →]
```

### 6.3 14日間非アクティブ

**トリガー**: 最終ログインから14日経過
**除外**: 7日メール未開封者は除外（メール疲労防止）

| 項目 | 内容 |
|------|------|
| 件名 | 「就活のピーク、準備は大丈夫ですか？」 |
| トーン | 季節感を入れた緊急感 |
| CTA | 「今すぐ確認する →」 |

**コンテンツ**:
- 季節に応じた就活状況のリマインド
- 「3月〜6月は本選考ラッシュ」等の時期情報
- 新機能や改善点の紹介（最近のアップデート）
- クレジット残量表示（「まだXクレジット残っています」— Endowment Effect）

### 6.4 30日間非アクティブ

**トリガー**: 最終ログインから30日経過
**除外**: 14日メール未開封者

| 項目 | 内容 |
|------|------|
| 件名 | 「就活Pass から最後のお知らせです」 |
| トーン | 最後の連絡感、Loss Aversion活用 |
| CTA | 「アカウントを継続する →」 |

**コンテンツ**:
```
しばらく就活Passをお使いいただいていないようです。

┌───────────────────────────────┐
│ あなたのアカウント状況        │
│                               │
│ 登録企業: X社（データ保持中） │
│ 残クレジット: XX              │
│ 作成ES: X本                   │
│                               │
│ ※ これらのデータは引き続き   │
│   保持されています            │
└───────────────────────────────┘

もしご不要でしたら、この下のリンクから
メール配信を停止できます。

[もう一度使ってみる →]
[メールの配信を停止する]
```

### 6.5 サンセットポリシー

- 60日以上非アクティブかつ最後3通のメール未開封 → メール配信停止
- 配信停止でもアカウントは維持（ログインで自動再開）
- メール配信停止ユーザーへのリターゲティング広告は継続

---

## 7. アップセルシーケンス

### 7.1 トリガーマップ

```
┌────────────────────────────────────────────────┐
│            アップセルトリガー                    │
├────────────────────────────────────────────────┤
│                                                 │
│  Free → Standard                                │
│  ├─ クレジット枯渇（残量0 or 20%以下）         │
│  ├─ ES添削5回到達（「もっと添削したい」需要）   │
│  ├─ 企業登録5社制限到達                         │
│  └─ 登録21日後（Day 21オンボーディング連動）    │
│                                                 │
│  Standard → Pro                                 │
│  ├─ クレジット消費ペースが速い（月200cr超）     │
│  ├─ ES添削10回/月超（パワーユーザー）          │
│  └─ 登録企業10社以上（本格就活ユーザー）       │
│                                                 │
└────────────────────────────────────────────────┘
```

### 7.2 Free → Standard: クレジット枯渇メール

**トリガー**: `credits.balance = 0` AND `plan = 'free'`

| 項目 | 内容 |
|------|------|
| 件名 | 「今月のクレジットを使い切りました — Standard で続けませんか？」 |
| CTA | 「Standard プランを見る →」 |

**コンテンツ**:
```
今月の無料クレジット（30cr）を使い切りました。

あなたの就活は順調に進んでいます！
この調子で続けるために、Standardプランはいかがですか？

┌─────────────────────────────────┐
│ Standard プラン - ¥980/月       │
│                                 │
│ ✅ 月300クレジット（10倍）      │
│ ✅ 企業登録無制限               │
│ ✅ 全機能アクセス               │
│                                 │
│ 月980円 = 1日あたり約33円       │
│ （コンビニコーヒー1杯以下）     │
│                                 │
│ 就活塾の平均: 月30,000〜80,000円│
│ 就活Pass Standard: 月980円      │
└─────────────────────────────────┘

[Standard にアップグレード →]
```

**心理学的根拠**:
- **Anchoring**: 就活塾価格との比較で割安感
- **Mental Accounting**: 「1日33円」のリフレーミング
- **Loss Aversion**: 「就活のペースを落とさない」

### 7.3 Standard → Pro: パワーユーザー向け

**トリガー**: 月間クレジット消費200cr超 AND `plan = 'standard'`

| 項目 | 内容 |
|------|------|
| 件名 | 「就活本気モードですね！Pro で制限なく使いませんか？」 |
| CTA | 「Pro プランの詳細 →」 |

**コンテンツ**:
- 今月の利用量ハイライト
- Standard vs Pro 比較
- 「月2,980円で800cr。1crあたりの単価は最安」
- Pro限定機能（将来: リライト3本、優先サポート等）

---

## 8. トランザクショナルメール

### 8.1 一覧

| メール | トリガー | 優先度 |
|--------|---------|--------|
| サブスクリプション開始 | `subscription.created` Stripe webhook | P0 |
| 支払い完了 | `invoice.payment_succeeded` | P0 |
| 支払い失敗 | `invoice.payment_failed` | P0 |
| クレジット月次リセット | `monthly_grant` creditTransaction | P1 |
| プラン変更完了 | `customer.subscription.updated` | P1 |
| サブスクリプション解約 | `customer.subscription.deleted` | P0 |

### 8.2 支払い失敗メール

**トリガー**: Stripe `invoice.payment_failed` webhook

| 項目 | 内容 |
|------|------|
| 件名 | 「【要対応】お支払いに失敗しました — カード情報をご確認ください」 |
| CTA | 「カード情報を更新する →」 |

**コンテンツ**:
```
[プラン名]プランのお支払い（¥[金額]/月）に失敗しました。

┌───────────────────────────────┐
│ 次のお支払い試行日:            │
│ [retry_date]                  │
│                               │
│ 3回失敗するとプランがFreeに   │
│ ダウングレードされます。      │
└───────────────────────────────┘

カード情報を更新して、サービスの中断を防いでください。

[カード情報を更新する →]
```

**リトライスケジュール**:
- 1回目失敗: 即時メール
- 2回目失敗（3日後）: 緊急度上げたメール
- 3回目失敗（7日後）: 最終警告メール + ダウングレード通知

### 8.3 サブスクリプション解約メール（オフボーディング）

**トリガー**: ユーザーが解約操作を実行

| 項目 | 内容 |
|------|------|
| 件名 | 「[プラン名]プランの解約を受け付けました」 |
| CTA | 「やっぱり続ける →」（1クリック復帰） |

**コンテンツ**:
- 解約確認（現期間終了日まで利用可能）
- これまでの利用サマリー
- 「30日以内なら1クリックで復帰できます」
- 簡易アンケート（解約理由: 価格/機能不足/就活終了/他サービス）

### 8.4 クレジット月次リセット通知

**トリガー**: 毎月1日のクレジットリセット処理後

| 項目 | 内容 |
|------|------|
| 件名 | 「今月のクレジットが付与されました（[プラン名]: [N]cr）」 |
| CTA | 「今月の就活プランを立てる →」 |

**コンテンツ**:
- 今月の付与クレジット数
- 先月の利用サマリー
- 今月の就活ヒント（季節連動 — `CONTENT_CALENDAR.md`参照）

---

## 9. 紹介プログラムメール

> `REFERRAL_PROGRAM.md`と連携

### 9.1 紹介送信確認メール

**トリガー**: ユーザーが紹介リンクをシェアした時

| 項目 | 内容 |
|------|------|
| 件名 | 「紹介リンクを送りました！友達が登録したら50crプレゼント」 |
| CTA | 「紹介ダッシュボードを見る →」 |

### 9.2 紹介成功報酬メール

**トリガー**: 被紹介者がAha Moment達成（ES添削1回完了）

| 項目 | 内容 |
|------|------|
| 件名 | 「友達が就活Passを使い始めました！50cr獲得 🎉」 |
| CTA | 「クレジットを確認する →」 |

**コンテンツ**:
```
おめでとうございます！

[被紹介者名]さんが就活Passで
初めてのES添削を完了しました。

┌───────────────────────────────┐
│ 🎁 紹介報酬                   │
│                               │
│ +50 クレジット獲得！          │
│                               │
│ 現在の残高: [N] クレジット    │
│ 紹介人数: [M]人              │
│                               │
│ [あと X人で Silver ランク達成]│
└───────────────────────────────┘

もっと友達を招待して、さらにボーナスを獲得しましょう！

[友達を招待する →]
```

### 9.3 被紹介者向けウェルカムメール

**トリガー**: 紹介リンク経由でアカウント作成

| 項目 | 内容 |
|------|------|
| 件名 | 「[紹介者名]さんからの招待で就活Passへようこそ！+50cr プレゼント」 |
| CTA | 「ESを添削してみる →」 |

**コンテンツ**:
- 通常ウェルカムメール + 紹介ボーナス50crの案内
- 「30cr（通常）+ 50cr（紹介ボーナス）= 80cr でスタート」
- ES添削が約16回分可能と訴求

---

## 10. テンプレート設計

### 10.1 ブランドガイドライン

```
カラーパレット:
  Primary:    #2563EB (Blue-600)     — CTA、ヘッダー
  Secondary:  #7C3AED (Violet-600)   — アクセント
  Background: #F8FAFC (Slate-50)     — メール背景
  Text:       #1E293B (Slate-800)    — 本文
  Muted:      #64748B (Slate-500)    — サブテキスト
  Success:    #10B981 (Emerald-500)  — 成功メッセージ
  Warning:    #F59E0B (Amber-500)    — 警告
  Error:      #EF4444 (Red-500)      — エラー

フォント:
  和文: "Noto Sans JP", sans-serif
  英文: "Inter", sans-serif

ロゴ:
  ヘッダーロゴ: 横180px × 縦40px
  フッターロゴ: 横120px × 縦30px
```

### 10.2 共通レイアウト構造

```
┌────────────────────────────────────────┐
│  [ロゴ]  就活Pass                      │  ← ヘッダー (背景: white)
├────────────────────────────────────────┤
│                                        │
│  [メインコンテンツ]                    │  ← 本文 (max-width: 600px)
│                                        │
│  ┌──────────────────────────────────┐ │
│  │  [CTAボタン]                     │ │  ← Primary CTA (Blue-600)
│  └──────────────────────────────────┘ │
│                                        │
├────────────────────────────────────────┤
│  就活Pass | ヘルプ | 配信設定          │  ← フッター
│  配信停止はこちら                      │
│  © 2026 就活Pass                       │
└────────────────────────────────────────┘
```

### 10.3 モバイル最適化

- **最大幅**: 600px（メールクライアント標準）
- **フォントサイズ**: 本文16px、見出し20-24px
- **CTAボタン**: 幅100%、高さ48px以上（タッチターゲット）
- **画像**: retina対応（2x）、alt属性必須
- **ダークモード**: `@media (prefers-color-scheme: dark)` 対応

### 10.4 React Email テンプレート例

```tsx
// src/lib/email/templates/layout.tsx
import {
  Body, Container, Head, Html, Preview,
  Section, Text, Link, Img, Hr
} from "@react-email/components";

interface LayoutProps {
  preview: string;
  children: React.ReactNode;
}

export function EmailLayout({ preview, children }: LayoutProps) {
  return (
    <Html lang="ja">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#F8FAFC", fontFamily: "'Noto Sans JP', sans-serif" }}>
        <Container style={{ maxWidth: "600px", margin: "0 auto", padding: "20px" }}>
          {/* Header */}
          <Section style={{ padding: "20px 0" }}>
            <Img src="https://shukatsu-pass.com/logo.png"
                 width="180" height="40" alt="就活Pass" />
          </Section>
          {/* Content */}
          <Section style={{
            backgroundColor: "#FFFFFF",
            borderRadius: "8px",
            padding: "32px",
          }}>
            {children}
          </Section>
          {/* Footer */}
          <Section style={{ padding: "20px 0", textAlign: "center" }}>
            <Text style={{ color: "#64748B", fontSize: "12px" }}>
              就活Pass | <Link href="https://shukatsu-pass.com/help">ヘルプ</Link>
              {" | "}<Link href="{{unsubscribe_url}}">配信停止</Link>
            </Text>
            <Text style={{ color: "#94A3B8", fontSize: "11px" }}>
              © 2026 就活Pass. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

---

## 11. A/Bテスト計画

### 11.1 テスト優先順位

| テスト | 対象 | 指標 | 最小サンプル | 優先度 |
|--------|------|------|-------------|--------|
| ウェルカムメール件名 | 新規全員 | 開封率 | 200人/variant | P0 |
| Day 1 CTA文言 | Day 1対象者 | クリック率 | 150人/variant | P0 |
| クレジット枯渇メール件名 | 枯渇者 | CVR（アップグレード率） | 100人/variant | P1 |
| 締切リマインダー送信時刻 | 全締切ユーザー | 開封率 | 200人/variant | P1 |
| リエンゲージメント件名 | 7日非アクティブ | 復帰率 | 150人/variant | P2 |

### 11.2 テスト設計テンプレート

```
テスト名: ウェルカムメール件名テスト
仮説: 「今日からAIと就活」より「30クレジットプレゼント」の方が開封率が高い
  （具体的な数字は抽象的なメッセージより開封を促す）

Variant A (Control):
  件名: 「就活Pass へようこそ！今日からAIと就活を始めましょう」

Variant B (Treatment):
  件名: 「就活Passへようこそ！30クレジット（ES添削6回分）をプレゼント」

指標: 開封率
成功基準: Variant Bが10%以上の改善
サンプルサイズ: 200人/variant（計400人）
信頼度: 95%
テスト期間: サンプルサイズ到達まで
```

### 11.3 テスト運用ルール

- 同時に実施するテストは最大2つ（干渉防止）
- テスト期間中はシーケンス変更禁止
- 統計的有意差（p < 0.05）到達前にテスト終了しない
- 全テスト結果を`emailLogs`メタデータに記録

---

## 12. KPIと効果測定

### 12.1 メール全体KPI

| KPI | 目標値 | 業界平均 | 計測方法 |
|-----|--------|---------|---------|
| 配信到達率 | >98% | 97% | Resend Dashboard |
| 平均開封率 | >35% | 25-30% (教育) | `emailLogs.openedAt` |
| 平均クリック率 | >5% | 3-4% | `emailLogs.clickedAt` |
| バウンス率 | <2% | <3% | `emailLogs.bouncedAt` |
| 配信停止率 | <0.5% | <0.3% | `emailPreferences.unsubscribedAll` |
| スパム報告率 | <0.01% | <0.01% | Resend Dashboard |

### 12.2 シーケンス別KPI

| シーケンス | 主要KPI | 目標 |
|-----------|---------|------|
| オンボーディング | アクティベーション率（7日以内にAI利用） | 55% |
| リテンション（締切） | 締切遵守率 | 85% |
| リエンゲージメント | 7日後復帰率 | 15% |
| アップセル | Free→Standard転換率 | 4% |
| 紹介プログラム | 紹介メール→登録転換率 | 25% |

### 12.3 Resend Webhook活用

```typescript
// src/app/api/email/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const payload = await req.json();

  switch (payload.type) {
    case "email.delivered":
      await db.update(emailLogs)
        .set({ status: "delivered" })
        .where(eq(emailLogs.resendId, payload.data.email_id));
      break;
    case "email.opened":
      await db.update(emailLogs)
        .set({ status: "opened", openedAt: new Date() })
        .where(eq(emailLogs.resendId, payload.data.email_id));
      break;
    case "email.clicked":
      await db.update(emailLogs)
        .set({ status: "clicked", clickedAt: new Date() })
        .where(eq(emailLogs.resendId, payload.data.email_id));
      break;
    case "email.bounced":
      await db.update(emailLogs)
        .set({ status: "bounced", bouncedAt: new Date() })
        .where(eq(emailLogs.resendId, payload.data.email_id));
      break;
    case "email.complained":
      await db.update(emailLogs)
        .set({ status: "complained" })
        .where(eq(emailLogs.resendId, payload.data.email_id));
      break;
  }

  return NextResponse.json({ received: true });
}
```

### 12.4 GA4連携

メール内リンクにUTMパラメータを付与:

```
https://shukatsu-pass.com/dashboard
  ?utm_source=email
  &utm_medium=lifecycle
  &utm_campaign=onboarding_day1
  &utm_content=cta_primary
```

**UTM命名規則**:

| パラメータ | 値 | 例 |
|-----------|-----|-----|
| `utm_source` | `email` | 常に`email` |
| `utm_medium` | `lifecycle` / `transactional` / `campaign` | メール種別 |
| `utm_campaign` | `{sequence}_{step}` | `onboarding_day1`, `reengage_day7` |
| `utm_content` | `{element}` | `cta_primary`, `link_feature` |

---

## 13. ウェイトリスト活用

### 13.1 現状

既存の`waitlistSignups`テーブルに**126件**のメールアドレスが蓄積されている。

```
waitlistSignups テーブル構造:
  - id: text (PK)
  - email: text (NOT NULL, unique lower)
  - graduationYear: integer (nullable)
  - targetIndustry: text (nullable)
  - source: text (nullable)
  - userAgent: text
  - ipAddress: text
  - createdAt: timestamptz
```

### 13.2 ウェイトリスト→登録 転換キャンペーン

**P0アクション**（`STRATEGIC_ANALYSIS_REPORT.md` P0-2参照）

**ステップ1: 初回メール（Day 0）**

| 項目 | 内容 |
|------|------|
| 件名 | 「お待たせしました！就活Pass がオープンしました」 |
| 送信対象 | waitlistSignups 全126件 |
| CTA | 「今すぐ無料で始める →」 |

**コンテンツ**:
```
就活Pass にウェイトリスト登録いただき、
ありがとうございました。

お待たせしました！
サービスが正式オープンしました。

┌──────────────────────────────────┐
│ 🎁 ウェイトリスト特典           │
│                                  │
│ 通常30クレジットのところ、      │
│ ウェイトリスト登録者限定で      │
│                                  │
│    50 クレジットプレゼント！    │
│                                  │
│ ※ 先着順のため、お早めに       │
└──────────────────────────────────┘

[今すぐ無料で始める →]
```

**ステップ2: フォローアップ（Day 3）**

- 未登録者にのみ送信
- 件名: 「残り枠わずか — ウェイトリスト特典のご案内」
- 機能紹介（ES添削、締切管理、企業研究）
- 成功事例（匿名化）

**ステップ3: 最終リマインド（Day 7）**

- 未登録者にのみ送信
- 件名: 「ウェイトリスト特典は本日まで」
- Scarcity + Loss Aversion
- 期限切れ後は通常30crで案内

### 13.3 実装方法

```typescript
// ウェイトリスト→usersテーブル照合
const waitlistEmails = await db.select().from(waitlistSignups);
const registeredEmails = await db.select({ email: users.email }).from(users);
const registeredSet = new Set(registeredEmails.map(u => u.email.toLowerCase()));

const unregistered = waitlistEmails.filter(
  w => !registeredSet.has(w.email.toLowerCase())
);

// unregistered に対してメール送信
for (const user of unregistered) {
  await resend.emails.send({
    from: "就活Pass <noreply@shukatsu-pass.com>",
    to: user.email,
    subject: "お待たせしました！就活Pass がオープンしました",
    react: WaitlistLaunchEmail({
      graduationYear: user.graduationYear,
      targetIndustry: user.targetIndustry,
    }),
  });
}
```

### 13.4 期待転換率

| メール | 送信数 | 予想開封率 | 予想登録率 | 予想登録数 |
|--------|--------|-----------|-----------|-----------|
| Day 0 | 126 | 45% | 30% | 17人 |
| Day 3 | ~109 | 35% | 20% | 8人 |
| Day 7 | ~101 | 30% | 15% | 5人 |
| **合計** | - | - | - | **~30人** |

---

## 14. 実装ロードマップ

### Phase 1: MVP（P0 — 即時）

| タスク | 工数 | 成果 |
|--------|------|------|
| Resend アカウント作成・ドメイン認証 | 0.5日 | メール送信基盤 |
| `emailPreferences`テーブル作成 | 0.5日 | 配信設定DB |
| `emailLogs`テーブル作成 | 0.5日 | 送信ログDB |
| ウェイトリスト転換メール送信 | 1日 | ~30人の新規登録 |
| ウェルカムメール実装 | 1日 | 新規ユーザーへの即時メール |
| **合計** | **3.5日** | **基盤 + 即時効果** |

### Phase 2: オンボーディング強化（Month 1）

| タスク | 工数 | 成果 |
|--------|------|------|
| `emailSequenceProgress`テーブル | 0.5日 | シーケンス管理 |
| Day 1/3/7 メール実装 | 2日 | オンボーディング自動化 |
| Resend Webhook連携 | 1日 | 開封/クリック計測 |
| 配信停止UI（設定画面） | 1日 | CAN-SPAM準拠 |
| **合計** | **4.5日** | **オンボーディング完了** |

### Phase 3: リテンション＆アップセル（Month 2）

| タスク | 工数 | 成果 |
|--------|------|------|
| 締切リマインダーメール | 1.5日 | 締切遵守率向上 |
| クレジット残量警告 | 1日 | アップセルトリガー |
| Day 14/21/30 メール | 1.5日 | フルオンボーディング |
| アップセルメール（Free→Standard） | 1日 | 転換率向上 |
| **合計** | **5日** | **リテンション＆収益化** |

### Phase 4: 高度な自動化（Month 3-4）

| タスク | 工数 | 成果 |
|--------|------|------|
| リエンゲージメントシーケンス | 2日 | 離脱ユーザー復帰 |
| ウィークリーダイジェスト | 1.5日 | 継続的エンゲージメント |
| 紹介プログラムメール連携 | 1日 | K-factor向上 |
| A/Bテスト基盤 | 1.5日 | 継続的最適化 |
| トランザクショナルメール強化 | 1.5日 | 支払い失敗回復 |
| **合計** | **7.5日** | **フル自動化** |

### 総工数サマリー

| Phase | 工数 | 累積 |
|-------|------|------|
| Phase 1 (MVP) | 3.5日 | 3.5日 |
| Phase 2 (Onboarding) | 4.5日 | 8日 |
| Phase 3 (Retention) | 5日 | 13日 |
| Phase 4 (Advanced) | 7.5日 | 20.5日 |

---

## 15. 関連ドキュメント

| ドキュメント | 関連セクション |
|-------------|---------------|
| [STRATEGIC_ANALYSIS_REPORT.md](./STRATEGIC_ANALYSIS_REPORT.md) | P0-2: ウェイトリストメール即時送信 |
| [KPI_METRICS_DASHBOARD.md](./KPI_METRICS_DASHBOARD.md) | メールKPIの全体KPI体系への統合 |
| [REFERRAL_PROGRAM.md](./REFERRAL_PROGRAM.md) | Section 9: 紹介プログラムメール連携 |
| [CONTENT_CALENDAR.md](./CONTENT_CALENDAR.md) | 季節連動メールコンテンツ |
| [FUNNEL_DESIGN.md](./FUNNEL_DESIGN.md) | AARRR各ステージのメール設計根拠 |
| [PRICING_ANALYSIS.md](./PRICING_ANALYSIS.md) | アップセルメールの価格フレーミング |
| [CREDIT_PROFITABILITY_ANALYSIS.md](./CREDIT_PROFITABILITY_ANALYSIS.md) | クレジットコスト構造（アップセル根拠） |
| [USER_PERSONAS.md](./USER_PERSONAS.md) | ペルソナ別メッセージング |
| [CHANNEL_PLAYBOOK.md](./CHANNEL_PLAYBOOK.md) | メールチャネルの位置付け |
