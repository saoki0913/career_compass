---
name: better-loading-ux
description: ローディングUXの4原則に基づくUI設計。フリッカー防止、段階的表示、長時間ローディング対応を実装する。
language: ja
---

# Better Loading UX

ローディング体験の4原則に基づく UI 設計・実装スキル。
出典: akfm_sato「ユーザーストレスを低減するローディング体験の4原則」

## 4 原則

### 原則 1: ローディング時間を最小化する

最適なローディング体験は「ローディングを体験しない」こと。

**閾値** (Nielsen Norman Group):
- **0.1s**: 瞬時反応の限界。0.1s 以内に消えるローディング UI はフリッカーの原因
- **1.0s**: 思考の流れが途切れない限界
- **10s**: 注意を維持できる限界

**アクション**:
- 実装の前にまず計測（Lighthouse, Web Vitals）
- 最適化の優先度: CDN / 静的最適化 → SQL チューニング → prefetch / cache
- "推測するな、計測せよ"

### 原則 2: 段階的ローディング（Multi-stage Loading）

準備ができた部分から順に表示する。

- Suspense 境界を独立したデータソースごとに分割する
- Layout Shift を防ぐため、スケルトンは実コンテンツと同じ寸法・レイアウトを維持する
- ポップコーン UI（頻繁な画面更新 + Layout Shift）は避ける

### 原則 3: フリッカーさせない

スケルトン → コンテンツの切り替えをスムーズにする。

- `useDelayedLoading(isLoading, { delayMs, minDisplayMs })` で表示タイミングを制御
- `<ViewTransition>` でアニメーション付き切り替え
- 既存 shimmer システム（`shimmerDelayMs`）との共存

### 原則 4: 長時間ローディングをケアする

10s 以上の操作にはフィードバックが必須。

| パターン | 正常系の所要時間 | 対応 |
|---------|---------------|------|
| (a) タイムアウト | ~1s | 10s でタイムアウトエラー + リトライ |
| (b) 通知 | ~数秒 | 10s 超過時に「時間がかかっています...」を表示 |
| (c) 多段フィードバック | ~数十秒〜分 | ステップ進捗表示（例: EnhancedProcessingSteps） |

`useLongLoadingFeedback(isLoading, { slowMs, timeoutMs })` で phase を管理。

---

## ワークフロー

### UI 新規作成・改修時

1. **計測**: Lighthouse / Web Vitals で現状のローディング時間を確認
2. **分類**: 操作のローディング時間を以下に分類
   - **即時** (<0.1s): ローディング UI 不要
   - **短時間** (0.1s〜1s): `useDelayedLoading` でフリッカー防止
   - **中時間** (1s〜10s): スケルトン + `<ViewTransition>`
   - **長時間** (>10s): `useLongLoadingFeedback` で段階フィードバック
3. **スケルトン設計**: 実コンテンツと寸法を一致させ、CLS を防ぐ
4. **Suspense 境界**: 独立データソースごとに Suspense を分割し段階表示を検討
5. **ViewTransition**: スケルトン→コンテンツ切り替えに `<ViewTransition>` を使用
6. **長時間ケア**: 必要に応じて timeout / feedback メッセージを追加

### チェックリスト

- [ ] 0.1s 以内に消えるローディング UI がない（`delayMs` でガード）
- [ ] スケルトンが実コンテンツと同じレイアウト・寸法を持つ
- [ ] CLS < 0.1（スケルトン→コンテンツの寸法差がない）
- [ ] 10s 超の操作にフィードバックメッセージがある
- [ ] `prefers-reduced-motion` でアニメーションが無効化される
- [ ] スケルトンの `shimmerDelayMs` が兄弟間でスタガーされている

---

## コードパターン

### Pattern A: クライアント操作のフリッカー防止

```tsx
import { useDelayedLoading } from "@/hooks/useDelayedLoading";

function SearchResults() {
  const [isLoading, setIsLoading] = useState(false);
  const { showLoading } = useDelayedLoading(isLoading, {
    delayMs: 150,   // 150ms 未満で解決すればローディング UI を出さない
    minDisplayMs: 300, // 一度出したら最低 300ms 維持
  });

  return showLoading ? <ResultsSkeleton /> : <Results />;
}
```

### Pattern B: ViewTransition によるスケルトン→コンテンツ遷移

```tsx
import { Suspense, ViewTransition } from "react";

function ProductPage() {
  return (
    <Suspense
      fallback={
        <ViewTransition exit="vt-skeleton-exit">
          <ProductSkeleton />
        </ViewTransition>
      }
    >
      <ViewTransition enter="vt-content-enter">
        <ProductContent />
      </ViewTransition>
    </Suspense>
  );
}
```

CSS クラス `vt-skeleton-exit` / `vt-content-enter` は `globals.css` に定義済み。
`prefers-reduced-motion: reduce` 時はアニメーションが自動無効化される。

### Pattern C: 長時間ローディングの段階フィードバック

```tsx
import { useLongLoadingFeedback } from "@/hooks/useLongLoadingFeedback";

function AIProcessing() {
  const { phase, elapsedMs } = useLongLoadingFeedback(isProcessing, {
    slowMs: 10_000,
    timeoutMs: 60_000,
  });

  if (phase === "idle") return null;
  if (phase === "loading") return <ProcessingUI />;
  if (phase === "slow")
    return <ProcessingUI message="通常より時間がかかっています..." />;
  if (phase === "timeout")
    return <TimeoutUI onRetry={handleRetry} />;
}
```

### Pattern D: ルート遷移 (loading.tsx) — 既存パターン維持

```tsx
// src/app/(product)/example/loading.tsx
import { ExampleSkeleton } from "@/components/skeletons/ExampleSkeleton";

export default function Loading() {
  return <ExampleSkeleton />;
}
```

`loading.tsx` は Next.js のルート遷移で自動表示されるため、`useDelayedLoading` は不要。

---

## 対象ファイル・コンポーネント

| ファイル | 用途 |
|---------|------|
| `src/hooks/useDelayedLoading.ts` | フリッカー防止フック |
| `src/hooks/useLongLoadingFeedback.ts` | 長時間ローディングフェーズフック |
| `src/components/ui/skeleton.tsx` | スケルトンプリミティブ（shimmerDelayMs） |
| `src/components/skeletons/` | ルート別スケルトン |
| `src/app/(product)/**/loading.tsx` | ルート遷移ローディング |
| `src/app/globals.css` | ViewTransition アニメーション CSS |

## 就活Pass 固有ルール

- スケルトンは `src/components/skeletons/` に配置（命名: `*Skeleton.tsx`）
- `shimmerDelayMs` によるスタガーパターンを維持
- `loading.tsx` は各ルートセグメントごとに用意し、汎用ローディングに頼らない
- 会話系ページ（志望動機・面接・ガクチカ）は `ConversationWorkspaceShellSkeleton` を共有基盤にする
- `EnhancedProcessingSteps` は原則4c（分単位の処理）の既存実装。ES添削等で使用中
- ViewTransition の採用はオプトイン。既存 Suspense 境界の遡及的ラップは不要

## 出力

- 日本語で記述。コード・パス・型名は英語
- 変更ファイルのパスとローディング分類（即時/短時間/中時間/長時間）を明記
