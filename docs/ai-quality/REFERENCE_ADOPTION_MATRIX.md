# Reference Adoption Matrix

対象資料: `/Users/saoki/work/references/gakuchika_QA_guide.md`

## 反映方針
- 参考資料の良い点を「質問設計」「評価軸」「根拠提示」「優先度説明」に分解し、4機能へ横展開する。
- 反映は `Prompt -> Backend schema -> API -> UI` の順でエンドツーエンドに実施する。

## 採用マトリクス
| 観点 (資料由来) | 実装先 | 反映内容 | ステータス |
|---|---|---|---|
| STAR要素ごとの不足把握と追質問 | `backend/app/prompts/gakuchika_prompts.py` | STAR別不足観点を厳密化し、フォローアップを役割分担・根拠確認まで要求 | 完了 |
| 評価理由の可視化 | `backend/app/prompts/gakuchika_prompts.py`, `backend/app/routers/gakuchika.py`, `src/app/api/gakuchika/[id]/conversation*.ts`, `src/app/gakuchika/[id]/page.tsx` | `quality_rationale`/`qualityRationale` を生成・伝播し、入力欄上で「この質問の狙い」を表示 | 完了 |
| 企業情報の根拠を伴う質問設計 | `backend/app/prompts/motivation_prompts.py`, `backend/app/routers/motivation.py`, `src/app/api/motivation/[companyId]/conversation*.ts`, `src/app/companies/[id]/motivation/page.tsx` | `evidence_summary`/`evidenceSummary` を生成・伝播し、サイドバーに根拠サマリー表示 | 完了 |
| 直近で直すべき理由の明示 (優先順位づけ) | `backend/app/prompts/es_review_prompts.py`, `backend/app/prompts/es_templates.py`, `backend/app/routers/es_review.py`, `src/hooks/useESReview.ts`, `src/components/es/ImprovementList.tsx`, `src/app/api/documents/[id]/review/route.ts` | `top3.why_now` を必須運用化し、UIで理由を表示 | 完了 |
| 検索意図に応じたRAG取得最適化 | `backend/app/utils/hybrid_search.py`, `backend/app/utils/vector_store.py` | 意図/長さベースの adaptive retrieval (weight, fetch_k, query数, rerank閾値, HyDE) を導入 | 完了 |
| 出典抜粋の可読性改善 | `backend/app/utils/hybrid_search.py` | 見出し付与・文境界トリムを行う excerpt 整形関数を導入 | 完了 |

## 残課題
- 資料が現状1ファイルのみのため、他資料追加時は同マトリクスに行追加して追跡する。
- A/B検証 (回答完了率・生成ES採用率・再質問率) の計測設計は別ドキュメント化が必要。
