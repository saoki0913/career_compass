# プラン実行順序

**最終更新**: 2026-04-14
**進捗追跡**: [docs/review/TRACKER.md](../review/TRACKER.md)

---

## Phase 0: セキュリティ（最優先）

**計画書**: [SECURITY_HOTFIX_PLAN.md](SECURITY_HOTFIX_PLAN.md), [LLM_COST_CONTROL_PLAN.md](LLM_COST_CONTROL_PLAN.md)

```
Phase 0a: SECURITY_HOTFIX
  S-1 (Plan POST削除+CSRF) ┓
  S-2 (Legacy checkout削除) ┣━ 並列可 ━━> S-5 Priority B (D-6→D-1→D-3→D-7)
  S-4 (V-3 Unicode+V-4 IP) ┛

Phase 0b: LLM_COST_CONTROL（HOTFIX から分離）
  Next.js Upstash 活用のトークン上限 ← Phase 0a と独立、並列着手可
```

**Phase 0a は必ず他の全 Phase より先に完了する。Phase 0b は Phase 0a 完了後が望ましいが必須ではない。**

---

## Phase 1: 機能品質

```
ES_REVIEW ━━━━━━━> MOTIVATION ━━> (後続Phase2が安全に着手可能)
                    GAKUCHIKA  ━━> 
                    INTERVIEW  ━━> 
```

| 計画書 | 依存 | 並列 |
|--------|------|------|
| [ES_REVIEW_QUALITY_IMPROVEMENT_PLAN](ES_REVIEW_QUALITY_IMPROVEMENT_PLAN.md) | なし（Phase 1 の起点） | — |
| [MOTIVATION_QUALITY_IMPROVEMENT_PLAN](MOTIVATION_QUALITY_IMPROVEMENT_PLAN.md) | ES_REVIEW 完了後 | GAKUCHIKA / INTERVIEW と並列可 |
| [GAKUCHIKA_QUALITY_IMPROVEMENT_PLAN](GAKUCHIKA_QUALITY_IMPROVEMENT_PLAN.md) | ES_REVIEW 完了後 | MOTIVATION / INTERVIEW と並列可 |
| [INTERVIEW_QUALITY_IMPROVEMENT_PLAN](INTERVIEW_QUALITY_IMPROVEMENT_PLAN.md) | ES_REVIEW 完了後（弱い依存） | MOTIVATION / GAKUCHIKA と並列可 |

---

## Phase 2: 保守性（Phase 1 完了後）

**計画書**: [MAINTAINABILITY_IMPROVEMENT_PLAN.md](MAINTAINABILITY_IMPROVEMENT_PLAN.md)

```
M-4 (gakuchika thin wrapper) ──────────────────────────> M-5 (view model分離)

M-1 (stream統一) ━━> M-2 (route移行) ━━> M-3 (FastAPI整理)
```

M-4 は即座に着手可。M-1 は M-4 と並列可。M-5 は M-4 完了後、M-2/M-3 と並列可。
Phase 1 の機能変更と同時に進めると blast radius が大きいため、Phase 1 完了後に着手する。

---

## Phase 3: ハーネス（Phase 1/2 と並列可）

**計画書**: [HARNESS_IMPROVEMENT_PLAN.md](HARNESS_IMPROVEMENT_PLAN.md)

```
H-1 (スキル実在性+MCP) ━━> H-2 (Cursor/Codex) ━━> H-3 (モデル配分)
```

開発効率改善のため、Phase 1/2 と並列で進行可能。早期着手が望ましい。

---

## Phase 4: 基盤（最後）

| 計画書 | 備考 |
|--------|------|
| [DB_REDESIGN_PLAN](DB_REDESIGN_PLAN.md) | blast radius 最大。Phase 1〜2 完了後に別スプリントで実施 |
| [LP_IMPROVEMENT_PLAN](LP_IMPROVEMENT_PLAN.md) | 独立。フロントのみで他と干渉しないため、いつでも着手可 |

---

## 依存根拠

### ES_REVIEW → MOTIVATION → GAKUCHIKA の順序

- `backend/app/prompts/es_templates.py` を 3 プランとも変更する。これが最大の競合点
  - ES_REVIEW: 敬称統一、grounding 強化
  - MOTIVATION: P1-6 `es_templates.py` 構成ガイド追加 + P2-1 RAGグラウンディング有効化
  - GAKUCHIKA: AI 臭除外追加
- MOTIVATION P2-1 が `es_review_grounding.py` を再利用
- この順序で `es_templates.py` への変更を積み重ねることでマージ競合を回避する
- **注記 (2026-04-14):** MOTIVATION P1-7（バリデーション緩和）は `motivation.py` 内のみの変更で `es_templates.py` に触れないため、ES_REVIEW との依存なく P1-4 完了後に独立着手可能

### INTERVIEW は独立

- 新規 `backend/app/prompts/interview_prompts.py` 作成が中心
- `es_templates.py` 競合がないため、ES_REVIEW 完了後であれば他と並列可能

### DB_REDESIGN は最後

- 他計画の前提になっていない（本文に依存記述なし）
- 変更範囲が最大: `src/lib/db/schema.ts`, `drizzle_pg/`, 多数の API/loader
- 品質改善群を収束させた後に別スプリントで実施するのが最も安全

---

## 新しい Phase の追加

末尾に Phase N として追加するか、Phase N.5 で既存 Phase 間に挿入する。
計画書を追加したら [TRACKER.md](../review/TRACKER.md) にも行を追加すること。
