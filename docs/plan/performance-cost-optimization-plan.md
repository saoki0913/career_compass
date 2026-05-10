# パフォーマンス改善・コスト最適化 戦略計画書

> **作成日**: 2026-05-05
> **ステータス**: 作成完了
> **対象**: career_compass (就活Pass) 全体 — LLM API / Frontend / DB / RAG
> **成果物**: 戦略レベル計画書（4領域 × 20施策、フェーズ別実行計画）
> **調査手法**: Explore agent ×3 (Frontend / Backend / Infrastructure) + Plan agent ×3 (LLM-RAG / Frontend-Infra / ROI-Phasing) + Codex plan_review ×2 (PASS_WITH_CONCERNS, 全13件反映)
> **前提規模**: 現在〜1,000ユーザー (ローンチ直後)
> **インフラ予算制約**: 月5,000円以内

---

## 完了条件

以下の全条件を満たした時点で本計画書の作成は完了とする:

1. ✅ **全4領域の現状分析が数値根拠付きで記載されている** — ファイルパス・行番号レベルの根拠
2. ✅ **優先度マトリクス（P0-P3）で全施策がランク付けされている** — Impact × Effort × Urgency の3軸評価
3. ✅ **ROI 分析（工数 vs 削減額）が各施策に付与されている** — low/base/high の3ケース感度分析
4. ✅ **フェーズ別実行戦略（Phase 1-4）が明確に定義されている** — ユーザー規模に対応
5. ✅ **成功指標（KPI）が各領域に定義されている** — 計測方法と目標値
6. ✅ **既存10計画書との依存関係が整理されている** — 統合ポイントと相互排他
7. ✅ **リスク評価が含まれている** — NOT最適化リスク / 早期最適化リスク / 実装リスク
8. ✅ **インフラ予算制約（月5,000円以内）に適合する提案になっている** — 追加固定費の明示

---

## タスクリスト

| # | タスク | 担当 | 状態 | 備考 |
|---|--------|------|------|------|
| 1 | LLM API コスト構造の現状分析 | Explore (Backend) | ✅ 完了 | 6モデル、retry 7-9x、prompt caching 未活用 |
| 2 | フロントエンド性能の現状分析 | Explore (Frontend) | ✅ 完了 | ISR 0/21、画像 102MB、memo 未適用4件 |
| 3 | DB / インフラの現状分析 | Explore (Infrastructure) | ✅ 完了 | index 欠損、creditTransactions 肥大化、cold start |
| 4 | RAG パイプラインの現状分析 | Explore (Backend) | ✅ 完了 | 2 extra LLM calls/search、cache 揮発性 |
| 5 | LLM コスト最適化戦略設計 | Plan (LLM-RAG) | ✅ 完了 | 6 strategies、phase 1-3 |
| 6 | フロントエンド・インフラ戦略設計 | Plan (Frontend-Infra) | ✅ 完了 | 5+5 strategies、priority matrix |
| 7 | ROI 分析・フェーズ計画設計 | Plan (Cross-cutting) | ✅ 完了 | 3-case 感度分析、dependency map |
| 8 | Codex plan review (Round 1) | Codex architect | ✅ 完了 | PASS_WITH_CONCERNS: 5件反映 |
| 9 | Codex plan review (Round 2) | Codex architect | ✅ 完了 | PASS_WITH_CONCERNS: 6件追加反映 |
| 10 | 最終計画書執筆 | Orchestrator | ✅ 完了 | 全知見統合 |

---

## エグゼクティブサマリー

### 調査対象と全体像

就活Pass の全アーキテクチャレイヤー（Next.js 16 Frontend / FastAPI Backend / Supabase PostgreSQL / ChromaDB RAG）を横断的に調査し、パフォーマンスボトルネックとコスト非効率を特定した。

### 主要発見 (Top 5)

1. **Anthropic prompt caching 未活用** — ES Review の 2273行システムプロンプト (es_templates/) が毎回フル送信。`_call_claude_raw` (llm_providers.py L898-926) に `cache_control` 未設定。入力トークンの 90% 削減機会を逸失
2. **ES Review retry の指数的コスト増幅** — `REWRITE_MAX_ATTEMPTS=3` + JSON repair chain + provider fallback で最悪 7-9x のコスト増（retry.py L36-37, llm.py L653-725）
3. **Marketing 21ページの ISR 未設定** — 全ページが毎リクエスト SSR。`export const revalidate` が 0/21 ページで未定義
4. **LP 画像 102MB が全て PNG / bare `<img>`** — next/image 未使用 (27箇所)、WebP/AVIF 変換なし。LCP に直接影響
5. **LLM コスト監視基盤の未有効化** — `llm_usage_cost.py` に集計機構が実装済みだが本番で `llm_usage_cost_log=false`。データ駆動の最適化判断が不可能

### 総合コスト削減予測

| フェーズ | 規模 | 現状推定月額 | 最適化後推定月額 | 削減率 | 投資工数 |
|---|---|---|---|---|---|
| Phase 1 | ~1K users | 710K 円 | 550-600K 円 | 15-22% | 20-40h |
| Phase 2 | ~5K users | 3,500K 円 | 2,500-2,800K 円 | 20-29% | 52-84h |
| Phase 3 | ~10K users | 7,100K 円 | 4,000-5,000K 円 | 30-44% | 52-80h |

---

## 1. 現状分析

### 1.1 LLM API コスト構造

#### モデル別単価 (backend/app/config.py L150-227, llm_usage_cost.py L19-50)

| モデル | Input/M tokens | Cached Input/M | Output/M tokens | 主な用途 |
|---|---|---|---|---|
| Claude Sonnet 4.6 | $3.00 | $0.30 | $15.00 | ES 添削 (最高額) |
| Claude Haiku 4.5 | $1.00 | $0.10 | $5.00 | ガクチカ / 面接 / 志望動機 |
| GPT-5.4 | $2.50 | $0.25 | $15.00 | 面接計画 |
| GPT-5.4-mini | $0.75 | $0.075 | $4.50 | スケジュール / 企業情報 / RAG |
| GPT-5.4-nano | $0.20 | $0.02 | $1.25 | RAG 分類のみ |
| Gemini 3.1 Pro | $2.00 | - | $12.00 | 代替 ES 添削 |

#### コスト増幅メカニズム

**最悪ケースの呼び出し連鎖** (ES Review):
1. Primary call (Claude Sonnet)
2. REWRITE attempt 2 (retry.py L36: `REWRITE_MAX_ATTEMPTS=3`)
3. REWRITE attempt 3
4. LENGTH_FIX pass (retry.py L37: `LENGTH_FIX_REWRITE_ATTEMPTS=1`)
5. JSON repair: GPT-mini (llm.py L653-725)
6. JSON repair fallback: Claude Sonnet (llm.py L687)
7. Cross-provider fallback (llm_model_routing.py L169-194)

**理論最悪**: 9 LLM calls / 1操作 | **実測推定平均**: 1.5-2.5 calls

#### Prompt Caching 現状

- **有効**: OpenAI ES Review text call のみ (llm_providers.py L1062)
- **未実装**: Anthropic 全呼び出し — `system=system_prompt` (文字列) で毎回フル送信

| プロンプトファイル | 行数 | 推定トークン |
|---|---|---|
| es_templates/ | 2,273 | 5,000-7,000 |
| gakuchika_prompts.py | 536 | 1,200-1,500 |
| interview_prompts.py | 449 | 1,000-1,200 |
| motivation_prompts.py | 317 | 700-900 |

---

### 1.2 フロントエンド性能

#### Marketing ページの SSR 問題

- ISR/revalidate 設定: **0/21 ページ** (全て毎リ���エスト SSR)
- 制約: `(marketing)/layout.tsx` が `headers()` で CSP nonce を読む → layout は dynamic。ISR は page 単位で設定が必要
- 影響: ISR (revalidate=3600) で invocations ~97% 削減可能

#### LP 画像の非最適化

- `public/marketing/` 配下: **102MB** の PNG (WebP 0個)
- bare `<img>` タグ: **27箇所** (next/image: HeroSection 1箇所のみ)
- 最大ファイル: 5.3MB (features/card-company-application-management.png)
- PainPointsSection.test.ts が next/image をブロック → **意図的ではない**

#### 大規模コンポーネントの memo 未適用

| ファイル | 行数 | memo 状態 |
|---|---|---|
| ReviewPanel.tsx | 1,400 | 未適用 |
| CompanyDetailPageClient.tsx | 1,178 | 未適用 |
| ESEditorPageClient.tsx | 1,155 | 未適用 |
| FetchInfoButton.tsx | 1,034 | 未適用 |

#### 強み (対応不要)

- RSC 89%、SWR dedup 3s、batch queries (company-loaders.ts)、streaming (18 loading.tsx)

---

### 1.3 Database / Infrastructure

#### インデックス状況

- 欠損: `companies` テーブルの owner+status 複合 (既存クエリは常に owner 条件を含む)
- 冗長候補: 4件 (pg_stat 確認後に削除)

#### 高成長テーブル

| テーブル | 成長率 (10K users) | アーカイブ | 現状 |
|---|---|---|---|
| creditTransactions | ~100K rows/月 | なし | 肥大化中 |
| processedStripeEvents | ~1K rows/月 | TTL なし | BCI-16 指摘済み |

#### Railway Cold Start

- Hotchpotch Reranker (130M params, ~500MB): lazy load で初回 10-30秒
- `healthcheckTimeout = 120` で cold start を許容する設計

#### 予算制約: 月5,000円以内

| サービス | プラン | 月額 |
|---|---|---|
| Supabase | Free | 0 円 |
| Upstash Redis | Free | 0 円 |
| Railway | Hobby | ~$5 |
| Vercel | Pro | ~$20 |
| **合計** | | **~$25 (~3,750 円)** ✅ |

---

### 1.4 RAG パイプライン

#### 処理フロー (hybrid_search.py)

1. Semantic search → 2. Short-circuit → 3. Query expansion (GPT-nano) → 4. HyDE (GPT-nano) → 5. RRF → 6. BM25 → 7. MMR → 8. Cross-encoder rerank

**LLM calls/search**: 2 (expansion + HyDE) — コスト ~0.1円/search、**レイテンシ 2-4秒追加**が主問題

#### キャッシュ状況

| キャッシュ | TTL | 容量 | 問題 |
|---|---|---|---|
| Query expansion (in-memory) | 7日 | 500 entries | コンテナ再起動で消失 |
| HyDE (in-memory) | 7日 | 500 entries | コンテナ再起動で消失 |
| RAG context (Redis) | 12時間 | REDIS_URL 依存 | **未有効化** |

---

## 2. 優先度マトリクス

| ID | 施策 | 領域 | Impact | Effort | Urgency | Priority |
|----|------|------|--------|--------|---------|----------|
| O-01 | Anthropic prompt caching 全面展開 | LLM | **High** | Low | Now | **P0** |
| O-03 | companies owner+status 複合 index | DB | Medium | Low | Now | **P0** |
| O-05 | Marketing 21ページ ISR 化 | FE | Medium | Low | Now | **P0** |
| O-06 | LLM コスト監視基盤 (structured log) | 横断 | **High** | Medium | Now | **P0** |
| O-02 | ES Review retry 最適化 | LLM | **High** | Medium | Soon | **P1** |
| O-04 | 冗長インデックス 4件削除 | DB | Low | Low | Soon | **P1** |
| O-07 | RAG conditional skip | RAG | Medium | Medium | Soon | **P1** |
| O-08 | LP 画像 next/image 移行 | FE | Medium | Medium | Soon | **P1** |
| O-09 | processedStripeEvents TTL | DB | Low | Low | Soon | **P1** |
| O-10 | Reranker 起動最適化 | RAG | Medium | Low | Soon | **P1** |
| O-11 | RAG Redis cache (Upstash 無料枠) | RAG | Medium | Medium | Later | **P2** |
| O-12 | creditTransactions アーカイバル | DB | Medium | High | Later | **P2** |
| O-13 | ES Review モデル routing | LLM | **High** | High | Later | **P2** |
| O-14 | Reranker ライトモデル | RAG | Low | Low | Later | **P2** |
| O-15 | Landing コンポーネント memo/分割 | FE | Low | Medium | Later | **P3** |
| O-16 | Connection pooling 最適化 | DB | Low | Medium | Later | **P3** |
| O-17 | SWR グローバル設定統一 | FE | Low | Low | Later | **P3** |
| O-18 | Core Web Vitals 計測導入 | FE | Low | Low | Now | **P3** |
| O-19 | Cache-Control + CDN | FE | Low | Low | Now | **P3** |
| O-20 | Circuit breaker half-open | LLM | Low | Medium | Later | **P3** |

---

## 3. 戦略的改善計画

### 3.1 LLM コスト最適化

#### S1: Anthropic Prompt Caching 全面展開 [O-01, P0]

**根本原因**: `_call_claude_raw` (llm_providers.py L898-926) は `system=system_prompt` を文字列で毎回送信。Anthropic の prompt caching は system を content block array 化し `cache_control: {"type": "ephemeral"}` 付与で有効化。

**改善方向**:
- `system` パラメータを文字列 → block array に変更 (stream/non-stream 両パス)
- `cache_creation_input_tokens` / `cache_read_input_tokens` を O-06 で集計
- 損益分岐: cache hit 率 12% 以上で通常料金を下回る

**期待コスト影響**:

| ケース | Cache Hit率 | Input Cost 削減率 | 月額削減 (1K users) |
|---|---|---|---|
| Low | 30% | ~27% | ~80K 円 |
| Base | 60% | ~54% | ~160K 円 |
| High | 80% | ~72% | ~210K 円 |

**複雑度**: Low | **リスク**: なし (cache miss でも通常料金)

---

#### S2: ES Review Retry 最適化 [O-02, P1]

**根本原因**: `REWRITE_MAX_ATTEMPTS=3` + `LENGTH_FIX_REWRITE_ATTEMPTS=1` で最大 4 full LLM calls。

**改善方向** (O-06 データ取得後):
- Per-request cost cap (`get_request_total_tokens()` L245-254 で閾値判定)
- Attempt 2+ のモデルダウングレード (Sonnet → Haiku)
- 計測 → A/B → 適用の順序

**複雑度**: Medium | **前提**: O-06 計測完了

---

#### S3: モデルティアリング精緻化 [O-13, P2]

- 短答 ES Review (≤150字): Sonnet → Haiku で十分な可能性
- Draft 生成: Sonnet → Haiku + multipass_refinement
- **前提**: eval infrastructure での品質比較、A/B テスト基盤

---

#### S5: コスト監視基盤 [O-06, P0]

**根本原因**: `llm_usage_cost_log` (config.py L229) が本番で false。集計機構は実装済み。

**改善方向**:
- `llm_usage_cost_log=true` を production 環境変数で有効化 (即日)
- Structured log 集約 (Railway ログ → 外部)
- **FastAPI→Supabase 直書き不可** (責務境界違反。config.py L65-68)

---

### 3.2 フロントエンド性能改善

#### F1: Marketing ISR 導入 [O-05, P0]

- 全 21 page に `export const revalidate = 3600` 追加
- **事前確認**: marketing layout.tsx の headers() と ISR の両立 (`next build` で検証)
- pricing のみ `revalidate = 600`

#### F2: LP 画像最適化 [O-08, P1]

- next/image 移行推奨 (テストブロック解除後)
- 代替: pre-build WebP 変換 + `<picture>` タグ
- 期待: 画像転送量 102MB → 20-30MB (70-80% 削減)

---

### 3.3 DB / インフラ最適化

#### D1: インデックス最適化 [O-03/O-04, P0/P1]

- 追加: `(user_id, status)` / `(guest_id, status)` 複合 (EXPLAIN ANALYZE で比較)
- 削除: pg_stat_user_indexes 確認後に P1 で実施

#### D3: Reranker 起動最適化 [O-10, P1]

- Option A: startup preload (cold start 解消、500MB 常駐)
- Option B: lazy + timeout 120s 維持 (低トラフィック推奨)
- Railway メモリ使用率で判断

---

### 3.4 RAG パイプライン最適化

#### R2: Redis Cache 段階的導入 [O-11, P2]

- Upstash 無料枠 (10K commands/day, 256MB) で有効化
- **Security Prerequisites**: tenant_key + company_id + content_version を key に、LLM生成クエリ validate、private PDF 非cache、source更新時 invalidate

#### R3: Conditional Skip [O-07, P1]

- In-memory cache hit 時に expansion/HyDE LLM call をスキップ
- 効果: RAG latency 2-4秒削減

---

## 4. フェーズ別実行戦略

### Phase 1: 計測基盤 + 即効施策 (Now, 0-500 users)

| 施策 | ID | 工数 | 効果 |
|---|---|---|---|
| LLM コスト監視有効化 | O-06 | 4-8h | 全施策の判断基盤 |
| Anthropic prompt caching | O-01 | 8-16h | Input cost 50-70% 削減 |
| Marketing ISR 化 | O-05 | 4-8h | SSR 97% 削減 |
| Owner+status index | O-03 | 4-8h | クエリ高速化 |

**合計**: 20-40h | **月額削減 (Base)**: ~160K 円 | **追加固定費**: 0 円

### Phase 2: コスト最適化 (Growth, 500-2K users)

| 施策 | ID | 工数 | 効果 |
|---|---|---|---|
| ES Review retry 最適化 | O-02 | 16-24h + eval | Retry cost 30-50% 削減 |
| 冗長 index 削除 | O-04 | 4-8h | Write 性能改善 |
| RAG conditional skip | O-07 | 8-12h | Latency 2-4s 削減 |
| LP 画像 next/image | O-08 | 16-24h | 画像 70-80% 削減 |
| processedStripeEvents TTL | O-09 | 4-8h | 肥大化防止 |
| Reranker 起動最適化 | O-10 | 4-8h | Cold start 解消 |

**合計**: 52-84h | **月額削減 (Base)**: ~350K 円 | **追加固定費**: 0 円

### Phase 3: インフラ強化 (Scale, 2K-10K users)

| 施策 | ID | 工数 | 効果 |
|---|---|---|---|
| RAG Redis cache | O-11 | 16-24h | Latency 50% 削減 |
| creditTransactions archive | O-12 | 16-24h | テーブル 70% 削減 |
| ES Review モデル routing | O-13 | 16h + eval | 短答コスト 60% 削減 |
| Reranker ライトモデル | O-14 | 4-8h | Memory 500→100MB |

**合計**: 52-80h | **月額削減 (Base)**: ~800K 円 | **追加固定費**: ~2,000 円/月

### Phase 4: 高度最適化 (10K+ users)

O-15 (Landing memo) / O-16 (Pooling) / O-17 (SWR) / O-18 (CWV) / O-19 (CDN) / O-20 (Circuit breaker)

**合計**: 42-76h | **追加固定費**: Supabase Pro + Railway upgrade (~8,250 円/月)

---

## 5. ROI 分析

### 感度分析パラメータ

| パラメータ | Low | Base | High |
|---|---|---|---|
| 月間 ES Review 操作数 / 1K users | 5,000 | 15,000 | 30,000 |
| ES Review 平均入力トークン | 4,000 | 6,000 | 8,000 |
| Prompt cache hit 率 | 30% | 60% | 80% |
| ES Review retry 率 | 10% | 20% | 30% |
| USD/JPY | 145 | 150 | 155 |

### Phase 1 ROI

| ケース | 現状月額 | 施策後 | 削減額 | 投資回収 |
|---|---|---|---|---|
| Low | 420K 円 | 360K 円 | 60K 円 | 4-6日 |
| Base | 710K 円 | 550K 円 | 160K 円 | 2-3日 |
| High | 950K 円 | 650K 円 | 300K 円 | 1-2日 |

### 運用費内訳 (予算適合確認)

| サービス | Phase 1-2 | Phase 3 | Phase 4 |
|---|---|---|---|
| Supabase | Free (0円) | Free (0円) | Pro ($25) |
| Upstash Redis | Free (0円) | Free (0円) | Pro ($10) |
| Railway | Hobby ($5) | Hobby ($5) | Pro ($20) |
| Vercel | Pro ($20) | Pro ($20) | Pro ($20) |
| **合計** | **~3,750円 ✅** | **~3,750円 ✅** | **~11,250円 ⚠️** |

Phase 1-3 は月5,000円以内に収まる。Phase 4 (10K+) で予算見直し必要。

---

## 6. 依存関係マップ

### 施策間の依存

```
O-06 (計測基盤) ──→ O-02 (retry最適化) ──→ O-13 (model routing)
     │
     └──→ O-07 (RAG skip) ──→ O-11 (Redis cache)
     
O-01 (prompt caching) ── 独立、即着手可能
O-03 (index) ── 独立、即着手可能  
O-05 (ISR) ── 独立、即着手可能
O-08 (next/image) ── O-05 完了後が理想的
O-09 (TTL) ── BCI-01 修正後
O-12 (archive) ── BCI-01 修正後
O-11 (Redis) ── Security prerequisites 完了後
```

### 既存計画書との統合

| 本計画の施策 | 依存先計画書 | 統合方法 |
|---|---|---|
| O-03/O-04 | db-design-optimization-rls.md (1.5節) | 同一 migration |
| O-09 | billing-credit-integrity-report.md (BCI-16) | 同一 cron |
| O-12 | billing-credit-integrity-report.md (BCI-01) | BCI-01 **後** |
| O-11 | llm-rag-security-owasp-audit.md (4.1節) | sanitize 前提 |
| O-13 | maintainability-clean-architecture-roadmap.md | provider 抽象化後 |

---

## 7. リスク評価

### 7.1 NOT 最適化のリスク

| 領域 | 崖の発生点 | 影響度 | 説明 |
|---|---|---|---|
| LLM コスト | 3K-5K users | **Critical** | 月額 LLM > SaaS 収益 |
| ES Review retry | 全規模 | **High** | retry 分は純損失 (成功時のみ消費) |
| Marketing SSR | SEO 依存増大時 | **Medium** | CWV 悪化で検索順位低下 |
| creditTransactions | 10K × 12ヶ月 | **Medium** | 1.2M rows でクエリ劣化 |

### 7.2 早期最適化のリスク

| 施策 | リスク | 判断基準 |
|---|---|---|
| O-13 (モデル routing) | 品質低下 → ユーザー離脱 | eval + A/B テスト後 |
| O-14 (ライト reranker) | 精度 0.893→0.870 影響不明 | RAG 品質評価後 |
| O-04 (index 削除) | 使用中 index 削除 → 劣化 | pg_stat 確認後 |

### 7.3 実装リスクと軽減策

| 施策 | リスク | 軽減策 |
|---|---|---|
| O-01 | SDK system 形式変更でテスト破壊 | バージョン固定 + 統合テスト |
| O-02 | retry 削減で品質低下 | O-06 で監視。段階的に max 3→2 |
| O-05 | CSP nonce と ISR 非互換 | `next build` route output で事前検証 |
| O-11 | Cache poisoning / tenant 分離 | 4 prerequisites (tenant_key, validate, policy, invalidation) |

---

## 8. 成功指標 (KPI)

### LLM コスト

| 指標 | 計測方法 | Phase 1 目標 | Phase 2 目標 |
|---|---|---|---|
| 月間コスト / user | O-06 structured log | ~550 円 | ~400 円 |
| Anthropic cache hit 率 | cache_read / total | 50-70% | 70-85% |
| ES Review 平均 call 数 | retry loop count | 測定確立 | ≤ 1.8 |
| Retry 率 | retry / 総操作 | 測定確立 | ≤ 25% |

### Frontend

| 指標 | 計測方法 | Phase 1 目標 | Phase 2 目標 |
|---|---|---|---|
| Marketing TTFB | Vercel logs | 50-100ms (ISR) | 50-100ms |
| LP 画像転送量 | Lighthouse | 102MB (現状) | 20-30MB |
| LCP (LP) | @vercel/speed-insights | 測定開始 | ≤ 2.5s |

### Database

| 指標 | 計測方法 | 目標 |
|---|---|---|
| Pipeline クエリ p95 | EXPLAIN ANALYZE | ≤ 50ms |
| creditTransactions 行数 | pg_total_relation_size | 90日分のみ (Phase 3) |

### RAG

| 指標 | 計測方法 | Phase 1 目標 | Phase 2 目標 |
|---|---|---|---|
| 検索 e2e latency | rag/telemetry.py | 3-6s (計測) | 2-4s |
| Cold start | Railway logs | 10-30s | ≤ 5s |

---

## 9. 予算制約との適合性

### 結論

**Phase 1-3 (0-10K users) の全施策は追加固定費ゼロで実現可能。**

- O-01 (prompt caching): コード変更のみ
- O-03 (index): Drizzle migration のみ
- O-05 (ISR): `revalidate` 1行追加
- O-06 (監視): 環境変数 1つ
- O-11 (Redis): Upstash 無料枠 (10K commands/day)

月5,000円以内の予算制約は Phase 3 まで完全に満たされる。Phase 4 (10K+ users) で予算増が必要だが、その時点で SaaS 収益も大幅増加しているため制約緩和が期待できる。

---

## Appendix: Codex Plan Review 全指摘事項 (13件)

| Round | # | Severity | 指摘 | 対応 |
|---|---|---|---|---|
| 1 | 1 | Medium | O-04 index 削除が P0 は早い | P0→P1 降格 |
| 1 | 2 | Medium | O-02 retry 削減は成功率影響を ROI に含めよ | P0→P1、計測後判断 |
| 1 | 3 | Medium | O-11 Redis の cache poisoning リスク | Security prerequisites 4件明記 |
| 1 | 4 | Low | O-01 の agent routing 未定義 | prompt-engineer + architect |
| 1 | 5 | Low | O-10 warm-up は低トラフィック時オーバーキル | 両案記載 |
| 2 | 6 | Medium | O-01 の system 文字列渡しは cache_control 非互換 | block array 化必須を明記 |
| 2 | 7 | Medium | O-05 の layout headers() で dynamic 強制 | 事前検証手順追加 |
| 2 | 8 | Medium | O-06 の FastAPI→Supabase は責務境界違反 | structured log 集約に変更 |
| 2 | 9 | Medium | O-06 の consume_* は None を返す | ログ sink 設計明記 |
| 2 | 10 | Low | O-03 は owner 複合 index が適切 | (user_id, status) に変更 |
| 2 | 11 | Low | O-11 cache key は HMAC tenant_key 使用 | tenant_key + company_id + version |
| 2 | 12 | Low | O-09 は BCI-01 修正後の依存を明記 | 依存関係マップに反映 |
| 2 | 13 | - | ROI に変数定義式を含めよ | 感度分析パラメータ追加 |
