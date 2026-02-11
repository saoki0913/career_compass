# 紹介プログラム設計書

## 目次

1. [プログラム概要](#プログラム概要)
2. [インセンティブ設計](#インセンティブ設計)
3. [紹介メカニズム](#紹介メカニズム)
4. [DB設計提案](#db設計提案)
5. [紹介トリガー設計](#紹介トリガー設計)
6. [ペルソナ別戦略](#ペルソナ別戦略)
7. [実装ロードマップ](#実装ロードマップ)
8. [KPI目標](#kpi目標)
9. [不正防止策](#不正防止策)
10. [関連ドキュメント](#関連ドキュメント)

---

## プログラム概要

### 目的

就活Pass紹介プログラムは、既存ユーザーが友人・同級生を招待することで、**双方にクレジット報酬を提供**し、**低コストでの新規獲得**と**コミュニティ形成**を促進するグロースエンジンです。

### K-factor目標

紹介プログラムの成功指標として、**K-factor（バイラル係数）**を設定します。

```
K-factor = (紹介を送ったユーザー割合) × (紹介1件あたりの平均コンバージョン率)
```

**目標値**:
- **6ヶ月後**: K-factor = **0.30**
  - 紹介送信率: 20%
  - コンバージョン率: 1.5人/紹介者
- **12ヶ月後**: K-factor = **0.50**
  - 紹介送信率: 30%
  - コンバージョン率: 1.67人/紹介者

K-factor > 1.0 で自律的成長（バイラルループ）が成立しますが、現実的な初期目標として0.3→0.5を設定し、有機的成長の補完エンジンとして機能させます。

### ビジネスインパクト試算

**月間1,000人の新規登録ユーザーを想定**:

| 期間 | K-factor | 有機流入 | 紹介経由 | 合計 | 累積紹介 |
|------|----------|----------|----------|------|----------|
| 1ヶ月目 | 0.15 | 1,000 | 150 | 1,150 | 150 |
| 3ヶ月目 | 0.20 | 1,000 | 230 | 1,230 | 730 |
| 6ヶ月目 | 0.30 | 1,000 | 390 | 1,390 | 2,100 |
| 12ヶ月目 | 0.50 | 1,000 | 750 | 1,750 | 6,500 |

**12ヶ月で累計6,500人の紹介経由獲得 = CAC削減効果 約¥520万円（CAC ¥800想定）**

---

## インセンティブ設計

### 基本報酬構造

#### 双方向インセンティブ（Win-Win設計）

| 対象 | 報酬内容 | タイミング | 条件 |
|------|----------|------------|------|
| **紹介者** | **50クレジット** | 被紹介者が登録完了時 | 被紹介者がAha Moment達成（初回AI添削成功） |
| **被紹介者** | **50クレジット** | 登録完了時 | 通常の登録ボーナス（15cr）に加えて追加35cr |

#### 報酬の価値換算

**50クレジットの価値**:
- **Standardプラン換算**: ¥980/300cr = ¥3.27/cr → 50cr = **¥163**
- **Proプラン換算**: ¥2,980/800cr = ¥3.73/cr → 50cr = **¥186**
- **平均実効価値**: 約**¥175**

**紹介1件あたりのコスト**:
- 紹介者報酬: 50cr = ¥163
- 被紹介者報酬: 50cr = ¥163
- **合計**: 100cr = **¥326**

**有料広告CAC比較**:
- Google広告CAC: ¥800-1,200
- SNS広告CAC: ¥500-900
- **紹介プログラムCAC**: **¥326** → **約60-40%のコスト削減**

### 階層型報酬（Tiered Rewards）

長期的なエンゲージメント向上のため、累積紹介数に応じた追加報酬を設定します。

#### 報酬ティア

```
┌─────────────────────────────────────────────────────────┐
│  🥉 Bronze (1-2人紹介)                                   │
│  - 基本報酬: 50cr/人                                     │
│  - バッジ: Bronzeサポーター                              │
├─────────────────────────────────────────────────────────┤
│  🥈 Silver (3-5人紹介)                                   │
│  - 基本報酬: 50cr/人                                     │
│  - 3人目達成時ボーナス: +100cr                           │
│  - バッジ: Silverアンバサダー                            │
├─────────────────────────────────────────────────────────┤
│  🥇 Gold (6人以上紹介)                                   │
│  - 基本報酬: 60cr/人（20%アップ）                        │
│  - 6人目達成時ボーナス: +200cr                           │
│  - 10人目達成時ボーナス: +500cr                          │
│  - バッジ: Goldアンバサダー + プロフィール専用アイコン    │
│  - 特典: 月次限定イベント招待、新機能ベータアクセス       │
└─────────────────────────────────────────────────────────┘
```

#### ティア別LTV試算

| ティア | 想定人数割合 | 平均紹介数 | 総報酬cr | 報酬コスト | 獲得ユーザー価値* | ROI |
|--------|--------------|------------|----------|------------|-------------------|-----|
| Bronze | 70% | 1.5 | 75cr | ¥245 | ¥1,800 | 7.3x |
| Silver | 25% | 4.0 | 300cr | ¥981 | ¥4,800 | 4.9x |
| Gold | 5% | 10.0 | 900cr | ¥2,943 | ¥12,000 | 4.1x |

*獲得ユーザー価値 = 平均紹介数 × LTV（¥1,200想定）

### 期間限定キャンペーン

#### 就活シーズンブースト

| キャンペーン | 期間 | 内容 |
|-------------|------|------|
| **3月スタートダッシュ** | 3/1-3/31 | 紹介報酬1.5倍（75cr）、被紹介者も75cr |
| **10月インターン応援** | 10/1-10/31 | 3人紹介達成で追加200cr |
| **冬選考ラストスパート** | 1/15-2/15 | 紹介者＋被紹介者ペアで合計150cr |

---

## 紹介メカニズム

### 紹介フロー全体像

```
┌──────────────┐
│  紹介者      │
│  (既存ユーザー)│
└──────┬───────┘
       │
       │ 1. 紹介URLを生成
       │    /invite/ABC123
       ↓
┌──────────────────────────────┐
│  共有チャネル                  │
│  - LINE                       │
│  - Twitter                    │
│  - Instagram                  │
│  - QRコード                   │
│  - メール招待                  │
└──────┬───────────────────────┘
       │
       │ 2. 被紹介者がクリック
       ↓
┌──────────────────────────────┐
│  ランディングページ            │
│  /invite/ABC123               │
│  - 紹介者名表示                │
│  - 特典説明（50cr）            │
│  - CTAボタン                   │
└──────┬───────────────────────┘
       │
       │ 3. Cookie保存 (30日間有効)
       │    referral_code=ABC123
       ↓
┌──────────────────────────────┐
│  サインアップ                  │
│  - Google OAuth               │
│  - referral_codeを自動適用     │
└──────┬───────────────────────┘
       │
       │ 4. 登録完了
       ↓
┌──────────────────────────────┐
│  報酬付与（条件付き）           │
│  - 被紹介者: +50cr（即時）     │
│  - 紹介者: +50cr（Aha後）      │
└──────────────────────────────┘
```

### 紹介URL設計

#### URL形式

```
https://career-compass.app/invite/{REFERRAL_CODE}

例: https://career-compass.app/invite/K7M9P2
```

#### 紹介コード生成ルール

- **形式**: 6文字の英数字（大文字）
- **文字セット**: A-Z, 0-9（混同しやすいI/1, O/0を除外）
- **衝突回避**: ランダム生成 + DB uniqueインデックス
- **有効期限**: なし（永続）

**コード生成例**（TypeScript）:

```typescript
import { customAlphabet } from 'nanoid';

// 混同しやすい文字を除外: I, O, 1, 0
const alphabet = '234567892ACDEFGHJKLMNPQRSTUVWXYZ';
const generateReferralCode = customAlphabet(alphabet, 6);

async function createReferralCode(userId: string) {
  let code: string;
  let attempts = 0;
  const maxAttempts = 10;

  do {
    code = generateReferralCode();
    const existing = await db.query.referralCodes.findFirst({
      where: eq(referralCodes.code, code),
    });
    if (!existing) break;
    attempts++;
  } while (attempts < maxAttempts);

  if (attempts >= maxAttempts) {
    throw new Error('Failed to generate unique referral code');
  }

  return code;
}
```

### 共有UI実装

#### シェアボタン設計

```tsx
// src/components/referral/ShareButtons.tsx

interface ShareButtonsProps {
  referralCode: string;
  referralUrl: string;
}

export function ShareButtons({ referralCode, referralUrl }: ShareButtonsProps) {
  const shareText = `就活Passで一緒にES添削しよう！このリンクから登録すると50クレジットもらえるよ🎁`;

  const handleLineShare = () => {
    const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(
      `${shareText}\n${referralUrl}`
    )}`;
    window.open(lineUrl, '_blank');
  };

  const handleTwitterShare = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      shareText
    )}&url=${encodeURIComponent(referralUrl)}`;
    window.open(twitterUrl, '_blank');
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(referralUrl);
    toast.success('リンクをコピーしました');
  };

  return (
    <div className="flex gap-2">
      <Button onClick={handleLineShare} variant="outline" size="sm">
        <MessageCircle className="h-4 w-4 mr-2" />
        LINE
      </Button>
      <Button onClick={handleTwitterShare} variant="outline" size="sm">
        <Twitter className="h-4 w-4 mr-2" />
        Twitter
      </Button>
      <Button onClick={handleCopyLink} variant="outline" size="sm">
        <Copy className="h-4 w-4 mr-2" />
        コピー
      </Button>
    </div>
  );
}
```

#### QRコード生成

```tsx
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

export function ReferralQRCode({ referralUrl }: { referralUrl: string }) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    QRCode.toDataURL(referralUrl, {
      width: 200,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    }).then(setQrDataUrl);
  }, [referralUrl]);

  return (
    <div className="flex flex-col items-center gap-2">
      {qrDataUrl && <img src={qrDataUrl} alt="QRコード" className="w-48 h-48" />}
      <p className="text-xs text-muted-foreground">
        このQRコードを友達にスキャンしてもらおう
      </p>
    </div>
  );
}
```

### トラッキング実装

#### Cookie設定（クライアント側）

```typescript
// src/lib/referral-tracking.ts

import Cookies from 'js-cookie';

const REFERRAL_COOKIE_NAME = 'cc_referral_code';
const REFERRAL_COOKIE_DAYS = 30;

export function setReferralCookie(code: string) {
  Cookies.set(REFERRAL_COOKIE_NAME, code, {
    expires: REFERRAL_COOKIE_DAYS,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

export function getReferralCookie(): string | undefined {
  return Cookies.get(REFERRAL_COOKIE_NAME);
}

export function clearReferralCookie() {
  Cookies.remove(REFERRAL_COOKIE_NAME);
}
```

#### 招待ランディングページ

```tsx
// src/app/invite/[code]/page.tsx

import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { referralCodes, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ReferralLanding } from '@/components/referral/ReferralLanding';

interface InvitePageProps {
  params: { code: string };
}

export default async function InvitePage({ params }: InvitePageProps) {
  // 紹介コード検証
  const referral = await db.query.referralCodes.findFirst({
    where: eq(referralCodes.code, params.code),
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          image: true,
        },
      },
    },
  });

  if (!referral) {
    notFound();
  }

  return <ReferralLanding referralCode={params.code} referrer={referral.user} />;
}
```

```tsx
// src/components/referral/ReferralLanding.tsx
'use client';

import { useEffect } from 'react';
import { setReferralCookie } from '@/lib/referral-tracking';
import { Button } from '@/components/ui/button';
import { Gift, Check } from 'lucide-react';

interface ReferralLandingProps {
  referralCode: string;
  referrer: { name: string; image?: string };
}

export function ReferralLanding({ referralCode, referrer }: ReferralLandingProps) {
  useEffect(() => {
    // Cookie設定
    setReferralCookie(referralCode);
  }, [referralCode]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-6">
          <Gift className="h-16 w-16 mx-auto text-blue-600 mb-4" />
          <h1 className="text-2xl font-bold mb-2">
            {referrer.name}さんから招待が届いています
          </h1>
          <p className="text-muted-foreground">
            就活Passに登録して50クレジットをゲット
          </p>
        </div>

        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Check className="h-5 w-5 text-blue-600" />
            登録特典
          </h2>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <span>50クレジット（¥175相当）を即座にプレゼント</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <span>ES添削、ガクチカ深掘り、企業情報取得など全機能が使える</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <span>締切管理・通知機能で提出忘れゼロ</span>
            </li>
          </ul>
        </div>

        <Button asChild className="w-full" size="lg">
          <a href="/auth/signin">無料で始める（50cr付き）</a>
        </Button>

        <p className="text-xs text-center text-muted-foreground mt-4">
          登録後、{referrer.name}さんにも50クレジットがプレゼントされます
        </p>
      </div>
    </div>
  );
}
```

#### サインアップ時の紹介コード適用

```typescript
// src/app/api/auth/callback/google/route.ts

import { getReferralCookie, clearReferralCookie } from '@/lib/referral-tracking';
import { db } from '@/lib/db';
import { users, referrals, creditTransactions } from '@/lib/db/schema';

export async function GET(request: Request) {
  // ... Google OAuth認証処理 ...

  const referralCode = getReferralCookie();

  await db.transaction(async (tx) => {
    // ユーザー作成
    const [newUser] = await tx.insert(users).values({
      email: profile.email,
      name: profile.name,
      image: profile.picture,
    }).returning();

    if (referralCode) {
      // 紹介コードから紹介者を取得
      const referralCodeRecord = await tx.query.referralCodes.findFirst({
        where: eq(referralCodes.code, referralCode),
      });

      if (referralCodeRecord && referralCodeRecord.userId !== newUser.id) {
        // 自己紹介防止
        // 紹介レコード作成
        await tx.insert(referrals).values({
          referrerUserId: referralCodeRecord.userId,
          referredUserId: newUser.id,
          status: 'pending', // Aha Moment達成まで保留
          rewardCredits: 50,
        });

        // 被紹介者に50クレジット付与（即時）
        await tx.insert(creditTransactions).values({
          userId: newUser.id,
          amount: 50,
          type: 'referral_signup_bonus',
          description: '紹介登録ボーナス',
        });

        clearReferralCookie();
      }
    }
  });

  // ... リダイレクト処理 ...
}
```

#### Aha Moment達成時の紹介者報酬付与

```typescript
// src/app/api/es-review/route.ts

import { db } from '@/lib/db';
import { referrals, creditTransactions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(request: Request) {
  // ... ES添削処理 ...

  if (reviewSuccess) {
    // Aha Moment達成チェック（初回成功）
    const firstSuccessfulReview = await db.query.esSubmissions.findFirst({
      where: and(
        eq(esSubmissions.userId, userId),
        eq(esSubmissions.status, 'completed')
      ),
    });

    if (!firstSuccessfulReview || firstSuccessfulReview.id === currentReviewId) {
      // 初回成功 = Aha Moment達成
      // 保留中の紹介報酬を処理
      const pendingReferral = await db.query.referrals.findFirst({
        where: and(
          eq(referrals.referredUserId, userId),
          eq(referrals.status, 'pending')
        ),
      });

      if (pendingReferral) {
        await db.transaction(async (tx) => {
          // 紹介ステータス更新
          await tx.update(referrals)
            .set({
              status: 'completed',
              completedAt: new Date(),
            })
            .where(eq(referrals.id, pendingReferral.id));

          // 紹介者に50クレジット付与
          await tx.insert(creditTransactions).values({
            userId: pendingReferral.referrerUserId,
            amount: 50,
            type: 'referral_reward',
            description: '紹介報酬（被紹介者がAha Moment達成）',
            metadata: {
              referredUserId: userId,
              referralId: pendingReferral.id,
            },
          });
        });
      }
    }
  }

  // ... レスポンス返却 ...
}
```

---

## DB設計提案

### スキーマ定義（Drizzle ORM）

```typescript
// src/lib/db/schema.ts

import { pgTable, text, timestamp, integer, uuid, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// 紹介コードテーブル
export const referralCodes = pgTable('referral_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  code: text('code').notNull().unique(), // 6文字の英数字（例: K7M9P2）
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('referral_codes_user_id_idx').on(table.userId),
  codeIdx: index('referral_codes_code_idx').on(table.code),
}));

// 紹介ステータスEnum
export const referralStatusEnum = pgEnum('referral_status', [
  'pending',    // 被紹介者登録済み、Aha Moment未達成
  'completed',  // Aha Moment達成、報酬付与済み
  'expired',    // 有効期限切れ（将来的な拡張用）
  'cancelled',  // 不正検出などによる取り消し
]);

// 紹介レコードテーブル
export const referrals = pgTable('referrals', {
  id: uuid('id').primaryKey().defaultRandom(),
  referrerUserId: uuid('referrer_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  referredUserId: uuid('referred_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: referralStatusEnum('status').notNull().default('pending'),
  rewardCredits: integer('reward_credits').notNull().default(50),

  // タイムスタンプ
  createdAt: timestamp('created_at').notNull().defaultNow(), // 被紹介者登録日時
  completedAt: timestamp('completed_at'), // Aha Moment達成日時

  // 不正検出用メタデータ
  signupIp: text('signup_ip'),
  signupUserAgent: text('signup_user_agent'),
}, (table) => ({
  referrerUserIdIdx: index('referrals_referrer_user_id_idx').on(table.referrerUserId),
  referredUserIdIdx: index('referrals_referred_user_id_idx').on(table.referredUserId),
  statusIdx: index('referrals_status_idx').on(table.status),
  createdAtIdx: index('referrals_created_at_idx').on(table.createdAt),
}));

// リレーション定義
export const referralCodesRelations = relations(referralCodes, ({ one }) => ({
  user: one(users, {
    fields: [referralCodes.userId],
    references: [users.id],
  }),
}));

export const referralsRelations = relations(referrals, ({ one }) => ({
  referrer: one(users, {
    fields: [referrals.referrerUserId],
    references: [users.id],
    relationName: 'referrer',
  }),
  referred: one(users, {
    fields: [referrals.referredUserId],
    references: [users.id],
    relationName: 'referred',
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  referralCode: one(referralCodes),
  referralsSent: many(referrals, { relationName: 'referrer' }),
  referralsReceived: many(referrals, { relationName: 'referred' }),
}));
```

### マイグレーション例

```sql
-- Create referral_codes table
CREATE TABLE referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX referral_codes_user_id_idx ON referral_codes(user_id);
CREATE INDEX referral_codes_code_idx ON referral_codes(code);

-- Create referral_status enum
CREATE TYPE referral_status AS ENUM ('pending', 'completed', 'expired', 'cancelled');

-- Create referrals table
CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status referral_status NOT NULL DEFAULT 'pending',
  reward_credits INTEGER NOT NULL DEFAULT 50,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  signup_ip TEXT,
  signup_user_agent TEXT,
  UNIQUE(referred_user_id) -- 被紹介者は1回のみ
);

CREATE INDEX referrals_referrer_user_id_idx ON referrals(referrer_user_id);
CREATE INDEX referrals_referred_user_id_idx ON referrals(referred_user_id);
CREATE INDEX referrals_status_idx ON referrals(status);
CREATE INDEX referrals_created_at_idx ON referrals(created_at);
```

### K-factor計算クエリ

#### 月次K-factor計算

```sql
-- 指定月のK-factor計算
WITH referral_stats AS (
  SELECT
    DATE_TRUNC('month', created_at) AS month,
    COUNT(DISTINCT referrer_user_id) AS unique_referrers,
    COUNT(*) AS total_referrals,
    COUNT(*) FILTER (WHERE status = 'completed') AS completed_referrals
  FROM referrals
  WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '6 months')
  GROUP BY DATE_TRUNC('month', created_at)
),
user_stats AS (
  SELECT
    DATE_TRUNC('month', created_at) AS month,
    COUNT(*) AS total_users
  FROM users
  WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '6 months')
  GROUP BY DATE_TRUNC('month', created_at)
)
SELECT
  r.month,
  r.unique_referrers,
  r.total_referrals,
  r.completed_referrals,
  u.total_users,
  ROUND((r.unique_referrers::NUMERIC / u.total_users) * 100, 2) AS referrer_rate_pct,
  ROUND(r.completed_referrals::NUMERIC / NULLIF(r.unique_referrers, 0), 2) AS avg_conversions_per_referrer,
  ROUND(
    (r.unique_referrers::NUMERIC / u.total_users) *
    (r.completed_referrals::NUMERIC / NULLIF(r.unique_referrers, 0)),
    3
  ) AS k_factor
FROM referral_stats r
JOIN user_stats u ON r.month = u.month
ORDER BY r.month DESC;
```

**出力例**:
```
 month       | unique_referrers | total_referrals | completed_referrals | total_users | referrer_rate_pct | avg_conversions_per_referrer | k_factor
-------------+------------------+-----------------+---------------------+-------------+-------------------+------------------------------+----------
 2026-02-01  | 180              | 320             | 280                 | 1000        | 18.00             | 1.56                         | 0.281
 2026-01-01  | 150              | 250             | 210                 | 950         | 15.79             | 1.40                         | 0.221
```

#### ユーザー別紹介実績

```sql
-- トップ紹介者ランキング（Gold達成者）
SELECT
  u.id,
  u.name,
  u.email,
  COUNT(*) AS total_referrals,
  COUNT(*) FILTER (WHERE r.status = 'completed') AS successful_referrals,
  SUM(r.reward_credits) FILTER (WHERE r.status = 'completed') AS total_credits_earned,
  CASE
    WHEN COUNT(*) FILTER (WHERE r.status = 'completed') >= 6 THEN 'Gold'
    WHEN COUNT(*) FILTER (WHERE r.status = 'completed') >= 3 THEN 'Silver'
    WHEN COUNT(*) FILTER (WHERE r.status = 'completed') >= 1 THEN 'Bronze'
    ELSE 'None'
  END AS tier
FROM users u
JOIN referrals r ON u.id = r.referrer_user_id
GROUP BY u.id, u.name, u.email
HAVING COUNT(*) FILTER (WHERE r.status = 'completed') >= 1
ORDER BY successful_referrals DESC, total_credits_earned DESC
LIMIT 20;
```

---

## 紹介トリガー設計

### トリガーポイント一覧

紹介プログラムの成功は、**適切なタイミングでのプロンプト**に依存します。以下のトリガーポイントを実装します。

#### 1. Aha Moment直後（最重要）

**タイミング**: 初回ES添削が成功した直後

**心理状態**: 高い満足度、製品価値を実感

**UI実装**:
```tsx
// src/components/referral/AhaMomentReferralPrompt.tsx

export function AhaMomentReferralPrompt() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg p-6 mt-4"
    >
      <div className="flex items-start gap-4">
        <Gift className="h-8 w-8 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-lg font-bold mb-2">
            気に入ったらお友達にもシェアしませんか?
          </h3>
          <p className="text-sm mb-4 opacity-90">
            あなたにも、お友達にも<strong>50クレジット</strong>プレゼント
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => router.push('/referral')}
              variant="secondary"
              size="sm"
            >
              紹介リンクを取得
            </Button>
            <Button onClick={onDismiss} variant="ghost" size="sm">
              後で
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
```

**ロジック**:
```typescript
// ES添削成功後の処理
if (isFirstSuccessfulReview) {
  // Aha Moment達成フラグ
  await db.update(userProfiles)
    .set({ ahaMomentAchieved: true })
    .where(eq(userProfiles.userId, userId));

  // 紹介プロンプト表示フラグ
  setShowReferralPrompt(true);
}
```

#### 2. クレジット残量低下時

**タイミング**: クレジット残量が30%未満になったとき

**心理状態**: 追加クレジットの必要性を感じている

**UI実装**:
```tsx
// src/components/credits/LowCreditBanner.tsx

export function LowCreditBanner({ currentCredits, maxCredits }: Props) {
  const percentage = (currentCredits / maxCredits) * 100;

  if (percentage >= 30) return null;

  return (
    <Alert className="bg-amber-50 border-amber-200">
      <AlertCircle className="h-4 w-4 text-amber-600" />
      <AlertTitle>クレジット残量が少なくなっています</AlertTitle>
      <AlertDescription>
        友達を紹介して<strong>50クレジット</strong>をゲットしよう！
        <Button asChild variant="link" className="px-0 ml-2">
          <a href="/referral">紹介する</a>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
```

**表示条件**:
- クレジット残量 < 30%
- 1日1回まで表示（localStorage制御）
- 紹介実績が0-2件のユーザー優先

#### 3. 高満足度体験後

**タイミング**: 満足度評価で4-5星を付けた後

**UI実装**:
```tsx
// src/components/feedback/SatisfactionSurvey.tsx

export function SatisfactionSurvey({ onSubmit }: Props) {
  const [rating, setRating] = useState(0);
  const [showReferral, setShowReferral] = useState(false);

  const handleSubmit = async () => {
    await onSubmit(rating);

    if (rating >= 4) {
      // 高評価 → 紹介プロンプト
      setShowReferral(true);
    }
  };

  return (
    <>
      {/* 評価UI */}
      <StarRating value={rating} onChange={setRating} />
      <Button onClick={handleSubmit}>送信</Button>

      {/* 紹介プロンプト */}
      {showReferral && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-4 p-4 bg-blue-50 rounded-lg"
        >
          <p className="text-sm mb-2">
            高評価ありがとうございます！お友達にもシェアしませんか?
          </p>
          <Button asChild size="sm">
            <a href="/referral">紹介して50crゲット</a>
          </Button>
        </motion.div>
      )}
    </>
  );
}
```

#### 4. シーズン別トリガー

**就活カレンダーに基づく戦略的プロンプト**:

| 期間 | シーズン | トリガー内容 | 訴求ポイント |
|------|----------|-------------|-------------|
| 3月 | 本選考開始 | ダッシュボードバナー | 「友達と一緒に本選考を乗り切ろう」 |
| 6月 | 夏インターン | ES提出完了後 | 「インターン仲間を増やして情報共有」 |
| 10月 | 冬インターン | ログイン時モーダル | 「冬選考に向けて準備を始めよう」 |
| 1-2月 | ラストスパート | クレジット購入後 | 「最後の追い込み、友達も支援」 |

**実装例**:
```typescript
// src/lib/seasonal-triggers.ts

export function getSeasonalReferralMessage(): string | null {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12

  const campaigns: Record<number, string> = {
    3: '本選考シーズン到来！友達と一緒にES添削して50crゲット',
    6: '夏インターンのES、友達とシェアして乗り切ろう',
    10: '冬選考に向けて友達を招待！お互いに50crプレゼント',
    1: 'ラストスパート！友達も巻き込んで内定を掴もう',
    2: 'ラストスパート！友達も巻き込んで内定を掴もう',
  };

  return campaigns[month] || null;
}
```

#### 5. 支払い完了後（Thank Youページ）

**タイミング**: サブスクリプション購入直後

**心理状態**: 製品に価値を感じ、コミットメントが高い

**UI実装**:
```tsx
// src/app/checkout/success/page.tsx

export default function CheckoutSuccessPage() {
  return (
    <div className="max-w-2xl mx-auto py-12">
      <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
      <h1 className="text-2xl font-bold text-center mb-2">
        ありがとうございます！
      </h1>
      <p className="text-center text-muted-foreground mb-8">
        Proプランへのアップグレードが完了しました
      </p>

      {/* 紹介プロンプト */}
      <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            お友達にもProの価値をシェア
          </CardTitle>
          <CardDescription>
            紹介した友達もあなたも50クレジットゲット
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <a href="/referral">紹介リンクを取得</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## ペルソナ別戦略

各ペルソナの特性に合わせた紹介メッセージとチャネルを設計します。

### ペルソナ1: 情報弱者型

**特性**:
- 就活情報に疎い、周囲に相談相手が少ない
- SNSリテラシー中程度、LINEメイン

**紹介動機**:
- 「自分が助かったから友達も助けたい」という利他的動機
- 同じ悩みを持つ友達を支援したい

**メッセージング**:
```
「ESの書き方がわからない友達いない？
このアプリでAIが添削してくれて超助かった！
一緒に使うと50crもらえるから、シェアするね」
```

**推奨チャネル**:
- LINE（1対1共有）
- QRコード（対面で見せる）

**UI調整**:
- シンプルな説明、専門用語回避
- 「友達を助ける」フレーミング

### ペルソナ2: コスパ重視型

**特性**:
- 費用対効果を重視、無料・割引に敏感
- 紹介報酬のクレジット価値を正確に理解

**紹介動機**:
- 「自分のクレジットを増やしたい」という経済的インセンティブ
- 友達も得するWin-Win構造に納得

**メッセージング**:
```
「就活PassでES添削が1回¥150くらいでできる！
紹介リンク経由で登録すると50cr（¥175相当）もらえるから実質タダ。
俺にも50crくれるから紹介させて笑」
```

**推奨チャネル**:
- Twitter（コスパ情報をシェア）
- LINE（友人グループ）

**UI調整**:
- クレジット価値の明示（¥175相当）
- 累積報酬の可視化（「あと3人でSilver達成！+100cr」）

### ペルソナ3: 真面目コツコツ型

**特性**:
- 計画的、品質重視
- 信頼できる情報・ツールを厳選して使う

**紹介動機**:
- 「良いツールを共有して一緒に成長したい」
- 品質保証としての自己推薦

**メッセージング**:
```
「ES添削にこのアプリ使ってるんだけど、
AIの精度が高くて論理構成の改善提案が的確。
一緒に使って品質上げていこう。
紹介特典で50crもらえるからお得だよ」
```

**推奨チャネル**:
- メール招待（丁寧な説明文）
- LINE（親しい友人）

**UI調整**:
- 品質・機能の詳細説明
- 成功事例の紹介（「〜大学の先輩が内定獲得」）

### ペルソナ4: 締切ギリギリ型

**特性**:
- 行動が遅い、締切直前に焦る
- 即効性のあるソリューションを求める

**紹介動機**:
- 「締切管理機能が便利だから教えたい」
- 緊急時の助け合い

**メッセージング**:
```
「ES締切やばい？このアプリ使うと
AIが秒でES添削してくれるし、締切通知もしてくれる。
紹介リンクから登録すると50crもらえて、
すぐ使えるからマジで助かる」
```

**推奨チャネル**:
- LINE（即座に共有）
- Twitter（締切情報と一緒にシェア）

**UI調整**:
- 「今すぐ使える」強調
- 締切管理機能の訴求

### ペルソナ5: 部活・バイト忙しい型

**特性**:
- 時間がない、効率重視
- スマホでサクッと完結したい

**紹介動機**:
- 「時短ツールとして優秀だから共有」
- 同じく忙しい友達を助けたい

**メッセージング**:
```
「部活とバイトでES書く時間ない人向け。
このアプリならスマホで5分でAI添削終わる。
紹介リンク踏むだけで50crもらえるから、
隙間時間に使ってみて」
```

**推奨チャネル**:
- LINE（移動中にシェア）
- Instagram（ストーリーズ）

**UI調整**:
- モバイルファーストUI
- 「5分で完了」などの時短訴求

---

## 実装ロードマップ

### MVP（Month 1-2）

**目標**: 基本的な紹介フロー確立、K-factor 0.15達成

**実装項目**:
- [ ] DB設計（referral_codes, referrals）
- [ ] 紹介コード生成API
- [ ] 招待ランディングページ（/invite/[code]）
- [ ] Cookie追跡システム
- [ ] サインアップ時の紹介コード適用
- [ ] Aha Moment検出ロジック
- [ ] 報酬付与システム（紹介者・被紹介者）
- [ ] 紹介ダッシュボード（マイページ）
  - 紹介URL表示
  - 紹介実績表示（人数、獲得クレジット）
- [ ] LINEシェアボタン
- [ ] コピーリンクボタン

**成功指標**:
- 紹介送信率: 15%
- コンバージョン率: 1.0人/紹介者
- K-factor: 0.15

### Phase 2（Month 3-4）

**目標**: ソーシャル拡散強化、K-factor 0.25達成

**実装項目**:
- [ ] QRコード生成機能
- [ ] Twitter/Instagram共有ボタン
- [ ] メール招待機能（テンプレート付き）
- [ ] Aha Moment紹介プロンプト
- [ ] クレジット低下時バナー
- [ ] 紹介トラッキングダッシュボード
  - 紹介経路別内訳（LINE/Twitter/QR）
  - ステータス別内訳（pending/completed）

**成功指標**:
- 紹介送信率: 20%
- コンバージョン率: 1.25人/紹介者
- K-factor: 0.25

### Phase 3（Month 5-6）

**目標**: ゲーミフィケーション導入、K-factor 0.30達成

**実装項目**:
- [ ] 階層型報酬システム（Bronze/Silver/Gold）
- [ ] バッジ表示（プロフィール）
- [ ] 紹介ランキングページ
- [ ] 達成通知（「Silverアンバサダー達成！」）
- [ ] 紹介アナリティクスページ
  - K-factor推移グラフ
  - ユーザー別紹介実績
  - チャネル別効果分析
- [ ] 不正検出システム（IP/UA重複チェック）

**成功指標**:
- 紹介送信率: 20%
- コンバージョン率: 1.5人/紹介者
- K-factor: 0.30
- Gold達成者: 5-10人

### Phase 4（Month 7-12）

**目標**: 持続的成長エンジン化、K-factor 0.50達成

**実装項目**:
- [ ] シーズン別キャンペーン自動化
- [ ] リーダーボード（月次/累計）
- [ ] 紹介者限定イベント
- [ ] 新機能ベータアクセス（Gold特典）
- [ ] A/Bテスト基盤（トリガータイミング、メッセージング）
- [ ] ペルソナ別メッセージ最適化
- [ ] 紹介予測モデル（どのユーザーが紹介しやすいか）

**成功指標**:
- 紹介送信率: 30%
- コンバージョン率: 1.67人/紹介者
- K-factor: 0.50
- Gold達成者: 20-30人

---

## KPI目標

### 主要指標

#### 1. K-factor（バイラル係数）

**定義**: K = (紹介送信率) × (紹介1件あたり平均コンバージョン数)

**目標値**:
| 期間 | K-factor | 紹介送信率 | Avg Conversion |
|------|----------|------------|----------------|
| Month 1-2 | 0.15 | 15% | 1.0 |
| Month 3-4 | 0.25 | 20% | 1.25 |
| Month 5-6 | 0.30 | 20% | 1.5 |
| Month 12 | 0.50 | 30% | 1.67 |

**計測方法**:
```sql
-- 月次K-factor（前述のクエリ参照）
SELECT
  ROUND(
    (unique_referrers::NUMERIC / total_users) *
    (completed_referrals::NUMERIC / NULLIF(unique_referrers, 0)),
    3
  ) AS k_factor
FROM referral_stats
JOIN user_stats USING (month);
```

#### 2. 紹介アクティベーション率

**定義**: 紹介リンクを生成したユーザー / 全アクティブユーザー

**目標値**:
- Month 2: 15%
- Month 6: 20%
- Month 12: 30%

**計測方法**:
```sql
SELECT
  COUNT(DISTINCT rc.user_id) AS users_with_referral_code,
  COUNT(DISTINCT u.id) AS total_active_users,
  ROUND(
    COUNT(DISTINCT rc.user_id)::NUMERIC / COUNT(DISTINCT u.id) * 100,
    2
  ) AS activation_rate_pct
FROM users u
LEFT JOIN referral_codes rc ON u.id = rc.user_id
WHERE u.created_at >= CURRENT_DATE - INTERVAL '30 days';
```

#### 3. 紹介コンバージョン率

**定義**: Completed紹介 / 全紹介（送信された招待数）

**目標値**:
- Month 2: 15%
- Month 6: 20%
- Month 12: 25%

**計測方法**:
```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'completed') AS completed,
  COUNT(*) AS total,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC / COUNT(*) * 100,
    2
  ) AS conversion_rate_pct
FROM referrals
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days';
```

#### 4. 被紹介ユーザーLTV vs 有機流入LTV

**定義**: 紹介経由ユーザーの平均LTVと有機流入ユーザーの比較

**仮説**: 紹介経由ユーザーは友人がいるため継続率が高い → **LTV 1.5-2.0x**

**目標値**:
- Month 6: 1.3x
- Month 12: 1.5x

**計測方法**:
```sql
WITH user_ltv AS (
  SELECT
    u.id,
    CASE
      WHEN EXISTS (SELECT 1 FROM referrals WHERE referred_user_id = u.id)
      THEN 'referred'
      ELSE 'organic'
    END AS acquisition_channel,
    COALESCE(SUM(ct.amount), 0) AS total_credits_consumed,
    COUNT(DISTINCT s.id) AS subscription_months
  FROM users u
  LEFT JOIN credit_transactions ct ON u.id = ct.user_id AND ct.type IN ('es_review', 'company_info')
  LEFT JOIN subscriptions s ON u.id = s.user_id
  WHERE u.created_at >= CURRENT_DATE - INTERVAL '6 months'
  GROUP BY u.id
)
SELECT
  acquisition_channel,
  AVG(total_credits_consumed) AS avg_credits,
  AVG(subscription_months) AS avg_subscription_months,
  AVG(subscription_months * 980) AS avg_revenue
FROM user_ltv
GROUP BY acquisition_channel;
```

#### 5. 紹介経由CAC

**定義**: 紹介報酬コスト / 獲得ユーザー数

**目標値**: ¥326-500（有料広告CAC ¥800+の半分以下）

**計測方法**:
```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'completed') AS acquired_users,
  SUM(reward_credits) FILTER (WHERE status = 'completed') AS total_reward_credits,
  -- クレジット単価 ¥3.27（Standard換算）
  ROUND(
    (SUM(reward_credits) FILTER (WHERE status = 'completed') * 3.27) /
    NULLIF(COUNT(*) FILTER (WHERE status = 'completed'), 0),
    2
  ) AS cac_jpy
FROM referrals
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days';
```

### ダッシュボード実装例

```tsx
// src/app/admin/referrals/page.tsx

export default async function ReferralAnalyticsPage() {
  const kFactor = await calculateKFactor();
  const activationRate = await calculateActivationRate();
  const conversionRate = await calculateConversionRate();
  const cac = await calculateReferralCAC();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">紹介プログラム分析</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="K-factor"
          value={kFactor.toFixed(3)}
          target="0.30"
          trend={kFactor >= 0.30 ? 'up' : 'neutral'}
        />
        <MetricCard
          title="紹介送信率"
          value={`${activationRate.toFixed(1)}%`}
          target="20%"
          trend={activationRate >= 20 ? 'up' : 'neutral'}
        />
        <MetricCard
          title="コンバージョン率"
          value={`${conversionRate.toFixed(1)}%`}
          target="20%"
          trend={conversionRate >= 20 ? 'up' : 'neutral'}
        />
        <MetricCard
          title="紹介CAC"
          value={`¥${cac.toFixed(0)}`}
          target="¥500以下"
          trend={cac <= 500 ? 'up' : 'down'}
        />
      </div>

      {/* グラフ: K-factor推移 */}
      <Card>
        <CardHeader>
          <CardTitle>K-factor推移（月次）</CardTitle>
        </CardHeader>
        <CardContent>
          <KFactorChart />
        </CardContent>
      </Card>

      {/* テーブル: トップ紹介者 */}
      <Card>
        <CardHeader>
          <CardTitle>トップ紹介者（Goldアンバサダー）</CardTitle>
        </CardHeader>
        <CardContent>
          <TopReferrersTable />
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## 不正防止策

### 1. 自己紹介防止

**リスク**: ユーザーが複数アカウントを作成して自分を紹介

**対策**:

#### メール検証
```typescript
// サインアップ時
const referralCodeRecord = await db.query.referralCodes.findFirst({
  where: eq(referralCodes.code, referralCode),
  with: { user: true },
});

if (referralCodeRecord) {
  // 自己紹介チェック
  if (referralCodeRecord.user.email === newUserEmail) {
    throw new Error('自己紹介は無効です');
  }

  // 同一ドメインチェック（組織的不正防止）
  const referrerDomain = referralCodeRecord.user.email.split('@')[1];
  const newUserDomain = newUserEmail.split('@')[1];

  // 例外: 大学ドメイン（ac.jp）は許可
  if (
    referrerDomain === newUserDomain &&
    !newUserDomain.endsWith('.ac.jp')
  ) {
    // ログに記録、要手動レビュー
    await logSuspiciousReferral(referralCodeRecord.userId, newUserId, 'same_domain');
  }
}
```

#### IP重複チェック
```typescript
const signupIp = request.headers.get('x-forwarded-for') || request.ip;

const recentReferralsFromSameIp = await db.query.referrals.findMany({
  where: and(
    eq(referrals.signupIp, signupIp),
    gte(referrals.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // 7日以内
  ),
});

if (recentReferralsFromSameIp.length >= 3) {
  // 同一IPから3件以上の紹介 → 疑わしい
  await logSuspiciousReferral(referrerUserId, newUserId, 'ip_abuse');
  // 報酬をpendingに保留、手動レビュー待ち
  referralStatus = 'pending_review';
}
```

### 2. 最低アクティビティ要件

**リスク**: 登録だけして即離脱する捨てアカウント

**対策**: Aha Moment達成まで紹介者報酬を保留

```typescript
// 紹介者報酬はAha Moment達成時のみ
if (isFirstSuccessfulReview) {
  const pendingReferral = await db.query.referrals.findFirst({
    where: and(
      eq(referrals.referredUserId, userId),
      eq(referrals.status, 'pending')
    ),
  });

  if (pendingReferral) {
    // 被紹介者がAha Moment達成 → 紹介者に報酬付与
    await rewardReferrer(pendingReferral);
  }
}
```

**追加要件**（オプション）:
- 被紹介者が7日以内に3回以上ログイン
- 被紹介者が2件以上のES添削を実行

### 3. 紹介レート制限

**リスク**: ボットによる大量紹介

**対策**:

#### 1日あたりの紹介上限
```typescript
const today = new Date();
today.setHours(0, 0, 0, 0);

const todayReferrals = await db.query.referrals.findMany({
  where: and(
    eq(referrals.referrerUserId, userId),
    gte(referrals.createdAt, today)
  ),
});

const DAILY_REFERRAL_LIMIT = 10;

if (todayReferrals.length >= DAILY_REFERRAL_LIMIT) {
  throw new Error('1日の紹介上限に達しました。明日再度お試しください。');
}
```

#### 月間紹介上限（ティア別）
```typescript
const MONTHLY_LIMITS = {
  Bronze: 10,
  Silver: 20,
  Gold: 50,
};

const userTier = await getUserReferralTier(userId);
const monthlyReferrals = await getMonthlyReferralCount(userId);

if (monthlyReferrals >= MONTHLY_LIMITS[userTier]) {
  throw new Error(`${userTier}ティアの月間紹介上限（${MONTHLY_LIMITS[userTier]}件）に達しました。`);
}
```

### 4. 紹介コード生成レート制限

**リスク**: 大量のコード生成による負荷

**対策**:
```typescript
// 1ユーザー1コードのみ
const existingCode = await db.query.referralCodes.findFirst({
  where: eq(referralCodes.userId, userId),
});

if (existingCode) {
  return existingCode.code; // 既存コードを返す
}

// 新規生成（初回のみ）
const newCode = await createReferralCode(userId);
```

### 5. 監査ログ

**目的**: 不正パターンの検出と事後対応

**実装**:
```typescript
// src/lib/db/schema.ts

export const referralAuditLogs = pgTable('referral_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  referralId: uuid('referral_id').references(() => referrals.id),
  eventType: text('event_type').notNull(), // 'suspicious_ip', 'same_domain', 'rapid_signups'
  metadata: jsonb('metadata'), // 詳細情報
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

```typescript
async function logSuspiciousReferral(
  referrerId: string,
  referredId: string,
  reason: string
) {
  await db.insert(referralAuditLogs).values({
    referralId: referralId,
    eventType: reason,
    metadata: {
      referrerId,
      referredId,
      timestamp: new Date().toISOString(),
    },
  });

  // 管理者通知（3件以上で自動アラート）
  const suspiciousCount = await db.query.referralAuditLogs.findMany({
    where: and(
      eq(referralAuditLogs.eventType, reason),
      gte(referralAuditLogs.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
    ),
  });

  if (suspiciousCount.length >= 3) {
    await sendAdminAlert(`紹介不正の疑い: ${reason} (24h内に${suspiciousCount.length}件)`);
  }
}
```

### 6. 手動レビュープロセス

**フロー**:
1. 疑わしい紹介は `status = 'pending_review'` に設定
2. 管理ダッシュボードで一覧表示
3. 管理者が承認/却下
4. 承認時に報酬付与、却下時にキャンセル

```tsx
// src/app/admin/referrals/review/page.tsx

export default async function ReferralReviewPage() {
  const pendingReviews = await db.query.referrals.findMany({
    where: eq(referrals.status, 'pending_review'),
    with: {
      referrer: true,
      referred: true,
    },
  });

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>紹介者</TableHead>
          <TableHead>被紹介者</TableHead>
          <TableHead>疑わしい理由</TableHead>
          <TableHead>アクション</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pendingReviews.map((referral) => (
          <TableRow key={referral.id}>
            <TableCell>{referral.referrer.email}</TableCell>
            <TableCell>{referral.referred.email}</TableCell>
            <TableCell>
              {/* 監査ログから理由取得 */}
              <SuspiciousReasonBadge referralId={referral.id} />
            </TableCell>
            <TableCell>
              <Button onClick={() => approveReferral(referral.id)}>
                承認
              </Button>
              <Button variant="destructive" onClick={() => rejectReferral(referral.id)}>
                却下
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

---

## 関連ドキュメント

本紹介プログラム設計は、以下のドキュメントと連携して機能します。

### 戦略・分析系

- **[KPI_METRICS_DASHBOARD.md](./KPI_METRICS_DASHBOARD.md)**
  - K-factor、紹介コンバージョン率など主要KPIの定義と計測方法
  - 紹介プログラムの成功指標を包括的に管理

- **[CREDIT_PROFITABILITY_ANALYSIS.md](./CREDIT_PROFITABILITY_ANALYSIS.md)**
  - 紹介報酬（50cr）のコスト分析
  - クレジット単価とLTV試算

- **[PRICING_ANALYSIS.md](./PRICING_ANALYSIS.md)**
  - サブスクリプションプランとクレジット価値の関係
  - 紹介報酬がプラン選択に与える影響

### ユーザー理解系

- **[USER_PERSONAS.md](./USER_PERSONAS.md)**
  - 5つのペルソナ別特性と行動パターン
  - ペルソナ別紹介戦略の基礎データ

- **[FUNNEL_DESIGN.md](./FUNNEL_DESIGN.md)**
  - 紹介経由ユーザーのオンボーディングファネル
  - Aha Momentまでの導線最適化

### マーケティング戦略系

- **[MARKETING_STRATEGY.md](./MARKETING_STRATEGY.md)**
  - 紹介プログラムを含む総合的なグロース戦略
  - チャネル別CAC比較

### 実装参考系

- **[SPEC.md](../SPEC.md)**
  - データベーススキーマ（users, credits, subscriptionsなど）
  - 紹介システムと既存テーブルの統合仕様

- **[DEVELOPMENT.md](../DEVELOPMENT.md)**
  - 紹介機能の実装ガイドライン
  - API設計とセキュリティ考慮事項

---

## 付録: 実装チェックリスト

### Phase 1: MVP（Month 1-2）

#### バックエンド
- [ ] `referral_codes`テーブル作成（migration）
- [ ] `referrals`テーブル作成（migration）
- [ ] `referral_audit_logs`テーブル作成（migration）
- [ ] 紹介コード生成API実装（`POST /api/referrals/code`）
- [ ] 紹介統計取得API実装（`GET /api/referrals/stats`）
- [ ] サインアップ時の紹介コード適用ロジック
- [ ] Aha Moment検出と紹介者報酬付与ロジック
- [ ] 自己紹介防止チェック（email, IP）

#### フロントエンド
- [ ] 招待ランディングページ（`/invite/[code]`）
- [ ] 紹介ダッシュボード（`/referral`）
- [ ] 紹介URL表示コンポーネント
- [ ] LINEシェアボタン
- [ ] リンクコピーボタン
- [ ] 紹介実績表示（人数、獲得クレジット）

#### インフラ
- [ ] Cookie設定（30日間有効）
- [ ] 紹介トラッキングミドルウェア
- [ ] 監査ログ保存

### Phase 2: ソーシャル拡散（Month 3-4）

- [ ] QRコード生成機能
- [ ] Twitter共有ボタン
- [ ] Instagram共有機能
- [ ] メール招待テンプレート
- [ ] Aha Moment紹介プロンプト
- [ ] クレジット低下時バナー
- [ ] 紹介経路トラッキング（LINE/Twitter/QR）

### Phase 3: ゲーミフィケーション（Month 5-6）

- [ ] 階層型報酬ロジック（Bronze/Silver/Gold）
- [ ] バッジシステム
- [ ] 達成通知（プッシュ通知）
- [ ] 紹介ランキングページ
- [ ] アナリティクスダッシュボード
- [ ] K-factorグラフ
- [ ] 不正検出自動化

### Phase 4: 持続的成長（Month 7-12）

- [ ] シーズン別キャンペーン自動化
- [ ] リーダーボード
- [ ] 紹介者限定イベント
- [ ] A/Bテスト基盤
- [ ] ペルソナ別メッセージ最適化
- [ ] 紹介予測モデル

---

## まとめ

就活Pass紹介プログラムは、**低コストで高品質なユーザー獲得**を実現するグロースエンジンです。

### 成功の3要素

1. **Win-Win設計**: 紹介者・被紹介者双方に価値を提供（各50cr）
2. **適切なトリガー**: Aha Moment直後、クレジット低下時など心理的最適タイミング
3. **不正防止**: IP/メール検証、Aha要件、監査ログによる健全性維持

### 期待される成果

- **12ヶ月でK-factor 0.50達成**
- **累計6,500人の紹介経由獲得**
- **CAC約60%削減**（¥800 → ¥326）
- **コミュニティ形成による継続率向上**（LTV 1.5x）

本設計書に基づき段階的に実装を進め、データドリブンに改善を繰り返すことで、持続可能なグロースを実現します。

---

**作成日**: 2026-02-11
**バージョン**: 1.0
**次回レビュー**: MVP実装完了後（Month 2）
