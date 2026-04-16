# 改善トラッカー

最終更新: 2026-04-17

## 凡例
未着手 / 進行中 / 検証待ち / 完了 / superseded

## トラッカー

| topic | latest_review | latest_plan | status | notes |
|-------|--------------|-------------|--------|-------|
| security | [2026-04-14](security/security_audit_2026-04-14.md) | [SECURITY_HOTFIX](../plan/SECURITY_HOTFIX_PLAN.md) | 完了 | Phase 1+2 完了 (2026-04-14) / A-1・D-2・D-4・D-10・D-11・D-12・V-1 完了 (2026-04-16) |
| llm-cost-control | — | [LLM_COST_CONTROL](../plan/LLM_COST_CONTROL_PLAN.md) | 実装済み | C-1〜C-4 全タスク完了 (2026-04-14)。14ルート統合済み |
| es-review | [2026-04-14](feature/es_review_quality_audit_20260414.md) | [ES_REVIEW_QUALITY_IMPROVEMENT v10](../plan/ES_REVIEW_QUALITY_IMPROVEMENT_PLAN.md) | 検証待ち | Phase 1-10 実装確認済み。Phase 10 の prompt/reference 更新と専用テスト整合を確認 (2026-04-17)。`test_reference_es_quality.py` の非Phase10起因の既存失敗は別件で継続管理 |
| motivation | [2026-04-12](feature/motivation_quality_audit_20260412.md) | [MOTIVATION_QUALITY_IMPROVEMENT](../plan/MOTIVATION_QUALITY_IMPROVEMENT_PLAN.md) | 進行中 | Grade D(42) → 目標 A(92)。P1 全7項目実装完了 (2026-04-14) |
| gakuchika | [2026-04-12](feature/gakuchika_quality_audit_20260412.md) | [GAKUCHIKA_QUALITY_IMPROVEMENT v4](../plan/GAKUCHIKA_QUALITY_IMPROVEMENT_PLAN.md) | 未着手 | Grade C(52) → 目標 A-(85+), v4: フルスタック拡張+判定緩和+フロントUX刷新 |
| interview | [2026-04-12](feature/interview_quality_audit_20260412.md) | [INTERVIEW_QUALITY_IMPROVEMENT](../plan/INTERVIEW_QUALITY_IMPROVEMENT_PLAN.md) | 未着手 | Grade C |
| maintainability | [2026-04-12](maintainability-architecture/2026-04-12-strict-maintainability-review-current-working-tree.md) | [MAINTAINABILITY_IMPROVEMENT](../plan/MAINTAINABILITY_IMPROVEMENT_PLAN.md) | 未着手 | Phase 3/5/6 残件 |
| harness | [2026-04-14](harness/2026-04-14-harness-strict-review.md) | [HARNESS_IMPROVEMENT](../plan/HARNESS_IMPROVEMENT_PLAN.md) | 進行中 | H-1a〜H-1d 完了 (2026-04-12 既) / H-2a・H-2b・H-1e 完了 (2026-04-17) / H-3a 方針転換でスキップ |
| db-redesign | — | [DB_REDESIGN](../plan/DB_REDESIGN_PLAN.md) | 未着手 | blast radius 最大 |
| lp | — | [LP_IMPROVEMENT](../plan/LP_IMPROVEMENT_PLAN.md) | 未着手 | |

## 運用
- 新しい review / plan を作ったら該当行を更新。行がなければ追加。
- 検証: `npm run test:review-tracker`
