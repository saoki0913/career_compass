# Career Compass (ウカルン) - Claude Code Instructions

## Project Overview
就活支援アプリ「ウカルン」- AIと進捗管理で「安価に、迷わず、締切を落とさず、ESの品質を上げる」

---

## 🚀 Quick Start - 開発を始める/再開する

```
/dev-continue
```

このコマンドを実行すると:
1. プロジェクトの現在状態を自動判定
2. 進行中のタスクがあれば再開
3. なければ次に取り組むべき機能を提案
4. 必要なコンテキストを自動ロード

---

## Quick Reference

### Key Documentation
- **仕様書**: `docs/SPEC.md` - 全機能の詳細仕様
- **開発ガイド**: `docs/DEVELOPMENT.md` - 開発手順
- **MCP設定**: `docs/MCP_SETUP.md` - MCPサーバー導入ガイド

### Tech Stack
- **Frontend**: Next.js 16 + React 19 + Tailwind CSS 4
- **Backend (API)**: Next.js App Router
- **Backend (AI)**: Python FastAPI
- **Database**: Turso (libSQL) + Drizzle ORM
- **Auth**: Better Auth (Google OAuth)
- **Payment**: Stripe
- **Storage**: Cloudflare R2

---

## AI-DLC and Spec-Driven Development

### Paths
- Steering: `.kiro/steering/`
- Specs: `.kiro/specs/`
- Skills: `.claude/skills/`

### Steering vs Specification
- **Steering** (`.kiro/steering/`) - プロジェクト全体のコンテキストとルール
- **Specs** (`.kiro/specs/`) - 個別機能の仕様と実装タスク

---

## Custom Commands (Skills)

### Main Command (最重要)
```
/dev-continue             # 開発を開始/再開（自動判定）
/dev-continue {feature}   # 特定機能の開発を再開
```

### Specification Commands
```
/ukarun:spec {section}    # SPEC.mdの仕様確認
/ukarun:spec list         # セクション一覧
/ukarun:impl {feature}    # 機能実装開始
/ukarun:status            # 開発状況確認
```

### Quick Commands
```
/ukarun:dev               # 開発サーバー起動
/ukarun:build             # ビルド
/ukarun:test              # テスト実行
/ukarun:db:push           # DBスキーマ反映
/ukarun:db:studio         # Drizzle Studio
```

### Kiro Workflow
```
/kiro:spec-init "description"     # 仕様初期化
/kiro:spec-requirements {feature} # 要件定義
/kiro:spec-design {feature}       # 設計
/kiro:spec-tasks {feature}        # タスク分解
/kiro:spec-impl {feature}         # 実装
/kiro:spec-status {feature}       # 進捗確認
/kiro:validate-impl {feature}     # 検証
```

---

## Development Rules

### Critical Rules
1. **成功時のみ消費**: クレジット/無料回数は成功時のみカウント
2. **JST基準**: 日次通知、リセットはJST（Asia/Tokyo）
3. **締切は承認必須**: 自動抽出した締切は必ずユーザー承認を挟む
4. **非同期UX**: 外部I/Oは「処理中→結果通知」のパターン

### Code Patterns
```typescript
// クレジット消費パターン
const result = await operation();
if (result.success) {
  await consumeCredits(userId, cost);
}

// 締切承認パターン
// LOW confidence = 初期チェックOFF
// 0件承認 = エラー

// 通知パターン
await createNotification({
  type: 'OPERATION_COMPLETED',
  success: result.success,
  creditsConsumed: cost,
});
```

### File Locations
```
src/app/api/{feature}/      # API Routes
src/app/{feature}/          # Pages
src/components/features/    # Feature components
src/lib/db/schema.ts        # Database schema
backend/app/routers/        # FastAPI routers
e2e/{feature}.spec.ts       # E2E tests
```

---

## Implementation Checklist

新機能実装時のチェックリスト:

### Database
- [ ] `src/lib/db/schema.ts` にスキーマ定義
- [ ] `npm run db:generate && npm run db:push`
- [ ] 型エクスポート (`$inferSelect`, `$inferInsert`)

### API
- [ ] `src/app/api/{feature}/route.ts` 作成
- [ ] 認証チェック (Better Auth)
- [ ] クレジット/制限チェック
- [ ] エラーハンドリング

### UI
- [ ] `src/app/{feature}/page.tsx` 作成
- [ ] ローディング状態
- [ ] エラー表示
- [ ] JST日付表示

### Tests
- [ ] `e2e/{feature}.spec.ts` 作成
- [ ] 成功パス
- [ ] エラーパス
- [ ] クレジット消費テスト

---

## External Services

### Stripe
- Products: Standard (¥980), Pro (¥2,980)
- Webhooks: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`

### Google Calendar
- Scopes: `calendar.readonly`, `calendar.freebusy`, `calendar.events`
- ウカルン作成予定は `[ウカルン]` 接頭辞で識別

### AI (FastAPI)
- ES添削: `ceil(文字数/800)` クレジット、上限5
- ガクチカ: 5問回答ごとに1クレジット

---

## Workflow

### 推奨: 自動開発フロー
```
/dev-continue                      # これだけでOK！自動判定して適切に開始/再開
```

### 手動開発フロー（詳細制御が必要な場合）
```
1. /ukarun:spec {section}          # 仕様確認
2. /kiro:spec-init "description"   # 仕様初期化
3. /kiro:spec-requirements         # 要件
4. /kiro:spec-design               # 設計
5. /kiro:spec-tasks                # タスク
6. /kiro:spec-impl                 # 実装
7. /kiro:validate-impl             # 検証
```

### Progress Check
```
/dev-continue                      # 状況確認 + 次のアクション提案
/ukarun:status                     # 全体状況のみ確認
/kiro:spec-status {feature}        # 機能別進捗のみ確認
```

---

## Language
- Think in English, generate responses in English
- All documentation and spec files: **日本語** (target language)
