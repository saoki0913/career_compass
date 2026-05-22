# 法務・商取引・サポート整備計画

> **Task state SSOT**: 実装フェーズのタスク状態は `docs/plan/plan-tasks.json` を正本とする。更新は `node scripts/plan/update-plan-task-status.mjs --id <task-id> --status <status> --source-plan <plan.md>`（または統合 JSON の完全な `id`）で行う。Markdown 内の Task Board / Task Tracker は計画本文として残すが、最新状態は統合 JSON を優先する。


> **作成日**: 2026-05-05
> **ステータス**: Phase 0 実装完了（2026-05-06）
> **対象**: 就活Pass（Career Compass）本番リリース前の法的整備
> **調査手法**: security-auditor, nextjs-developer, product-strategist, database-engineer + Web 調査（文化庁/消費者庁/総務省ガイダンス）+ Codex plan review
> **前提**: 個人事業主（青木 駿介）による自己完結運用、弁護士なし（将来的に検討）

---

## 1. 概要

就活Pass の本番リリース前に、法務・商取引・サポートの 3 領域で法的リスクを最小化する。

**重点領域**:
- 消費者保護・返金対応
- 個人情報保護・データ権利
- サポート体制構築
- 免責条項の強化・AI 生成物の著作権明記

**設計判断**:
- 返金ポリシー: 原則返金なし（現行維持、消費者契約法との整合性を強化）
- Cookie 同意: opt-in バナー（保守的選択。法令上は通知・公表方式も可）
- サポート規模: 個人運営前提のセルフサービス中心
- AI 著作権: 「利用許諾 / 非主張 / 非保証」の 3 分構成（権利帰属の断定を避ける）

---

## 2. 完了条件

1. `docs/plan/legal-commercial-support-plan.md` が存在する
2. タスクボードに全タスクが Status / Priority / Area / Owner / Risk / Complexity / Dependencies / Ref 付きで記載されている
3. 法務 8 件・商取引 9 件・サポート 8 件の各ギャップに設計判断が記述されている
4. 法的根拠セクションに 2024-2025 年の最新情報が反映されている
5. 既存計画書（personal-data, security, billing-credit-integrity）との参照マッピングが完備し矛盾がない
6. ロードマップが Phase 0 / 1 / 2 の 3 段階で整理されている

---

## 3. ステータス管理ルール

実装フェーズでは、完了条件を満たすまで次のループを繰り返す。

1. タスクボードから最上位 Priority の `Todo` を 1 件選ぶ
2. 着手時に `Status` を `Doing` に変更する
3. 外部判断・法務判断・環境制約で進められない場合は `Blocked` にし、必要な判断を明記する
4. 実装と自己検証が完了したら `Review` にする
5. 受け入れ条件を満たしたら `Done` にする
6. `Todo / Doing / Blocked / Review` が残っている場合は 1 に戻る

Status: `Todo` → `Doing` → `Review` → `Done`（`Blocked` は任意の状態から遷移可能）

---

## 4. タスクボード

### Phase 0: 即時・ローンチブロッカー

状態管理の正本は `docs/plan/plan-tasks.json`。更新は `node scripts/plan/update-plan-task-status.mjs --source-plan legal-commercial-support-plan.md --id <task-id> --status <status>` で行う。旧 `scripts/plan/update-legal-commercial-task-status.mjs` は互換 wrapper として統合 JSON を更新する。

| Status | Priority | Area | ID | Task | Risk | Owner | Complexity | Dependencies | Ref | Updated |
|--------|----------|------|----|------|------|-------|------------|--------------|-----|---------|
| Done | P0 | 商取引 | T-04a | BCI-01/02/03 トランザクション整合性修正 | Critical | security-auditor | M | - | BCI-01,02,03 | 2026-05-06 |
| Done | P0 | 商取引 | T-03 | past_due 即時 free 制限 | High | security-auditor | M | - | BCI-10, F-1 | 2026-05-06 |
| Done | P0 | 商取引 | T-01 | charge.refunded webhook 実装 | Critical | security-auditor | M | - | BCI-11 | 2026-05-06 |
| Done | P0 | 商取引 | T-02 | charge.dispute.* webhook 実装 | Critical | security-auditor | M | T-01 | BCI-11 | 2026-05-06 |
| Done | P0 | 法務 | L-01 | AI 生成物の著作権・知的財産条項追加 | Critical | nextjs-developer | S | - | - | 2026-05-06 |
| Done | P0 | 法務 | L-05 | AI 免責条項の強化 | High | nextjs-developer | S | - | - | 2026-05-06 |
| Done | P0 | 法務 | L-03 | 消費者契約法との整合性（返金例外条項） | High | nextjs-developer | S | - | - | 2026-05-06 |

### Phase 1: ローンチ前

| Status | Priority | Area | ID | Task | Risk | Owner | Complexity | Dependencies | Ref | Updated |
|--------|----------|------|----|------|------|-------|------------|--------------|-----|---------|
| Todo | P1 | 商取引 | T-08 | 問い合わせ PII 最小化 | Medium | nextjs-developer | S | - | PII-plan | 2026-05-05 |
| Todo | P1 | サポート | S-01 | 自動受領確認メール | High | nextjs-developer | S | T-08 | - | 2026-05-05 |
| Todo | P1 | 法務 | L-02 | Cookie 同意バナー（外部送信規律） | High | ui-designer | M | - | - | 2026-05-05 |
| Todo | P1 | 法務 | L-04 | AI 外部送信先の開示 | High | nextjs-developer | S | - | PII-plan | 2026-05-05 |
| Todo | P1 | 法務 | L-07 | アカウント削除の完全化 | Medium | nextjs-developer | L | - | PII-plan P0 | 2026-05-05 |
| Todo | P1 | サポート | S-04 | データ削除リクエストワークフロー | Medium | nextjs-developer | L | L-07 | PII-plan P0 | 2026-05-05 |
| Todo | P1 | 商取引 | T-05 | 最終確認画面の証拠保全 | Medium | security-auditor | S | - | - | 2026-05-05 |
| Todo | P1 | 商取引 | T-07 | 請求紛争解決 SOP | Medium | ドキュメント | S | T-01,T-02 | - | 2026-05-05 |
| Todo | P1 | サポート | S-02 | 最小限のチケット管理 | Medium | database-engineer | M | - | - | 2026-05-05 |
| Todo | P1 | サポート | S-03 | ヘルプセンター Phase 1（静的 FAQ） | Medium | ui-designer | M | - | - | 2026-05-05 |
| Todo | P1 | サポート | S-05 | エスカレーション基準 | Medium | ドキュメント | S | T-07 | - | 2026-05-05 |
| Todo | P1 | サポート | S-08 | 定型回答テンプレート | Low | ドキュメント | S | S-05 | - | 2026-05-05 |

### Phase 2: ローンチ後 1 ヶ月

| Status | Priority | Area | ID | Task | Risk | Owner | Complexity | Dependencies | Ref | Updated |
|--------|----------|------|----|------|------|-------|------------|--------------|-----|---------|
| Todo | P2 | 法務 | L-06 | データエクスポート API | Medium | nextjs-developer | M | L-07 | PII-plan P1 | 2026-05-05 |
| Todo | P2 | 商取引 | T-04b | BCI-04/05/06/07 修正 | High | security-auditor | M | T-04a | BCI-04~07 | 2026-05-05 |
| Todo | P2 | 商取引 | T-06 | subscription.updated トランザクション化 | Medium | security-auditor | S | - | BCI-12 | 2026-05-05 |
| Todo | P2 | サポート | S-06 | SLA 定義（ToS 反映） | Medium | nextjs-developer | S | - | - | 2026-05-05 |
| Todo | P2 | サポート | S-07 | 障害通知メカニズム | Low | ui-designer | S | - | - | 2026-05-05 |
| Todo | P2 | 法務 | L-08 | 規約変更通知メカニズム | Medium | nextjs-developer | S | - | - | 2026-05-05 |

---

## 5. 法務（Legal）

### 5.1 現状評価

**実装済み**:
- 利用規約 (`/terms`) — 適用、アカウント、禁止事項、AI 注意事項、料金・決済、免責、変更、連絡先。最終更新 2026-03-31
- プライバシーポリシー (`/privacy`) — 取得情報、利用目的、第三者提供・委託、保管期間、ユーザー権利。最終更新 2026-03-20
- 特定商取引法に基づく表記 (`/legal`) — 必須 15 項目を網羅。住所・電話は請求時開示方式
- 公開情報取得ポリシー (`/data-source-policy`) — スクレイピング範囲、robots.txt 準拠
- GA4 に `anonymize_ip: true` 設定
- `source-compliance.ts` による自動 robots.txt / ToS 準拠チェック
- マーケティングコピー制御（内定率・通過率・無制限無料の記載禁止）

**未実装**:
- AI 生成物の著作権・知的財産に関する条項なし
- Cookie 同意バナーなし（GA 無条件ロード）
- AI 外部送信先の具体名未記載（プライバシーポリシーが抽象的）
- AI 免責条項が基本レベル（類似性・ハルシネーション・選考結果への言及なし）
- データエクスポート機能なし
- アカウント削除カスケードが不完全（Google revoke / Stripe 匿名化 / contact 匿名化 / RAG 削除）
- 規約変更通知の具体的メカニズムなし

### 5.2 ギャップ分析

| ID | ギャップ | リスク | 法的根拠 |
|----|---------|--------|----------|
| L-01 | AI 生成物の著作権・知的財産条項なし | Critical | 著作権法 2条, 文化庁 AI ガイダンス (2024) |
| L-02 | Cookie 同意バナーなし | High | 改正電気通信事業法 §27-12 (2023/6 施行) |
| L-03 | 「返金なし」条項の消費者契約法リスク | High | 消費者契約法 8-10 条 |
| L-04 | AI 外部送信先の具体名未開示 | High | 個人情報保護法 27 条, 外部送信規律 |
| L-05 | AI 免責条項の深さ不足 | High | 民法 不法行為, 景表法 |
| L-06 | データエクスポート機能なし | Medium | 個人情報保護法 33 条 |
| L-07 | アカウント削除カスケード不完全 | Medium | 個人情報保護法 34 条 |
| L-08 | 規約変更通知メカニズムなし | Medium | 民法 548-4 条（定型約款変更） |

### 5.3 各ギャップの設計判断

#### L-01: AI 生成物の著作権・知的財産条項（Critical, P0）

**現状**: ToS Section 4 に AI の正確性・完全性に関する基本的な注意事項のみ。著作権・知的財産の帰属に関する記載なし。

**法的背景**:
- 著作権法 2 条 1 項 2 号: 「著作者」は思想又は感情を創作的に表現した者。AI 自体は著作者になれない
- 文化庁「AI と著作権に関する考え方について」(2024-03-15 取りまとめ): AI 生成物の著作物性は人間の「創作的寄与」の程度に依存。単純なプロンプトでは著作権は発生しない
- OpenAI / Anthropic / Google の API TOS: いずれも出力の権利をユーザーに帰属させるが、独占性は保証しない

**設計方針**: 「利用許諾 / 非主張 / 非保証」の 3 分構成で、権利帰属の断定を回避する。

1. **ユーザー入力の所有権**: ユーザーが入力した原文（ES 本文、志望動機の回答等）の著作権はユーザーに帰属する旨を明記
2. **AI 出力の利用許諾**: 運営者は AI 出力に対して権利を主張しない。ユーザーは自己責任で利用可能
3. **著作物性の非保証**: AI 出力が著作物として保護されるかは保証しない（文化庁ガイダンスに基づく）
4. **非独占性**: 同一または類似の出力が他のユーザーにも生成される可能性がある
5. **第三者権利の非保証**: AI 出力が第三者の著作物に類似しないことは保証しない。最終的な利用・提出はユーザーの判断と責任
6. **サービスライセンス**: ユーザーは運営者に対し、サービス提供に必要な範囲で入力データを処理・AI プロバイダに送信する限定的ライセンスを付与
7. **トレーニング不使用**: API 経由での利用のため、ユーザーデータは AI プロバイダのモデルトレーニングに使用されない

**対象ファイル**: `src/app/(marketing)/terms/page.tsx` — 新規 Section 4-2「AI 生成物の権利と責任」
**受け入れ条件**: 7 項目すべてが ToS に明記されていること
**工数見積**: 2h
**弁護士レビュー推奨**: はい（AI 著作権法は発展途上のため）

---

#### L-02: Cookie 同意バナー / 外部送信規律（High, P1）

**現状**: `GoogleAnalytics.tsx` が `afterInteractive` で無条件ロード。consent チェックなし。

**法的背景**:
- 改正電気通信事業法 §27-12 (2023-06 施行): 外部送信規律。ユーザー情報を第三者に送信する場合、通知・公表・同意・オプトアウトのいずれかが必要
- 就活Pass は情報提供サービスとして第三種電気通信事業者の範疇に入る可能性あり
- 3 つの準拠方式が存在: (a) 同意取得, (b) 通知・公表, (c) オプトアウト
- opt-in は最も保守的な選択。法令上は通知・公表方式でも可

**設計方針**: opt-in 同意バナー

1. **Cookie 同意バナーコンポーネント**: 初回訪問時に表示。「同意する」「詳細を確認」の 2 ボタン
2. **同意状態の SSOT**: `cookie_consent` を localStorage に保存（`accepted` / `rejected` / 未設定）
3. **条件付き GA ロード**: 同意状態が `accepted` の場合のみ GA script を挿入。拒否時は script 自体を DOM に追加しない
4. **既存 Cookie の削除**: 拒否時に既存の GA Cookie (`_ga`, `_ga_*`) を削除
5. **再同意メカニズム**: フッターに「Cookie 設定」リンクを追加し、いつでも設定変更可能に
6. **外部送信先一覧**: プライバシーポリシーに外部送信先一覧セクションを追加（L-04 と統合）

**対象ファイル**:
- `src/components/analytics/GoogleAnalytics.tsx` — 条件付きロードに変更
- 新規: `src/components/analytics/CookieConsentBanner.tsx`
- 新規: `src/lib/cookie-consent.ts` — 同意状態管理
- `src/app/(marketing)/layout.tsx` — バナー配置
- `src/components/landing/LandingFooter.tsx` — Cookie 設定リンク追加

**受け入れ条件**: (1) 初回訪問時にバナー表示, (2) 同意前に GA が発火しない, (3) 拒否時に GA Cookie が削除される, (4) 設定変更が可能
**工数見積**: 8h
**弁護士レビュー推奨**: いいえ（公開ガイダンスに基づく技術実装）

---

#### L-03: 消費者契約法との整合性（High, P0）

**現状**: ToS Section 5 に「デジタルサービスの性質上、法令上必要な場合を除き、支払済み料金の返金は行いません」と記載。特商法ページの「不具合時」欄に簡潔な記載あり。

**法的背景**:
- 消費者契約法 8 条 1 項 1 号: 事業者の債務不履行による損害賠償責任の全部免除条項は無効
- 消費者契約法 8 条 1 項 3 号: 故意・重過失による損害賠償責任の免除は条項の形態を問わず無効
- 消費者契約法 10 条: 消費者の権利を一方的に害する条項は無効（キャッチオール）
- 2023 年改正: 解約料の根拠説明の努力義務、解約権行使に必要な情報提供義務

**リスク評価**: 現行の「返金なし」条項自体は「法令上必要な場合を除き」の留保があり直ちに無効ではない。ただし、サービス提供不能時の対応が不明確なため 10 条リスクが残る。

**設計方針**: 返金ポリシーは現行維持しつつ、例外条件を明確化する。

1. **サービス不能時の対応明記**: 運営者の責めに帰すべき事由でサービスの全部又は重要な一部を相当期間提供できなかった場合の日割り返金検討を明記
2. **二重課金・誤課金の対応**: 明確な過誤請求の場合は全額返金する旨を追加
3. **免責範囲の限定**: 「軽過失の場合に限り、損害賠償額の上限を直近 12 ヶ月の支払額とする」を追加（8 条 2 項対応）
4. **故意・重過失の除外**: 損害賠償制限から故意・重過失を明示的に除外（8 条 1 項 3 号対応）
5. **解約方法の明記**: Stripe カスタマーポータルまたはアプリ設定からの解約手順を具体的に記載

**対象ファイル**: `src/app/(marketing)/terms/page.tsx` — Section 5 の強化
**受け入れ条件**: 5 項目すべてが ToS に反映されていること
**工数見積**: 2h
**弁護士レビュー推奨**: はい（消費者契約法の適用範囲判断。30 分相談で可）

---

#### L-04: AI 外部送信先の開示（High, P1）

**現状**: プライバシーポリシー Section 3 に「外部サービス（例: 認証、決済、AI、ホスティング等）を利用する場合があります」と抽象的な記載のみ。

**法的背景**:
- 個人情報保護法 27 条: 第三者提供時のオプトアウト/同意取得義務
- 改正電気通信事業法 外部送信規律: 送信先の名称・データ種別・利用目的の開示
- 抽象的な記載は外部送信規律の要件を満たさない可能性

**設計方針**: 外部送信先一覧をプライバシーポリシーに追加。

| 送信先 | 目的 | 送信データ | 保持方針 |
|--------|------|-----------|---------|
| Anthropic (Claude API) | ES 添削, 志望動機, ガクチカ, 面接 | ユーザー入力テキスト, 会話コンテキスト | API: データ保持なし |
| OpenAI (GPT API) | ES 添削, 志望動機, RAG 抽出 | ユーザー入力テキスト, 企業情報 | API: データ保持なし |
| Google (Gemini API) | ES 添削, RAG, Embedding | ユーザー入力テキスト, 企業情報 | API: データ保持なし |
| Stripe | 決済処理 | メールアドレス, 顧客メタデータ | Stripe DPA に準拠 |
| Google (OAuth, Calendar) | 認証, カレンダー連携 | アカウント情報, カレンダーイベント | Google TOS に準拠 |
| Supabase | データベース | 全ユーザーデータ | Supabase DPA に準拠 |
| Vercel | ホスティング | アクセスログ, IP アドレス | Vercel DPA に準拠 |
| Resend | メール送信 | 問い合わせ内容 | Resend TOS に準拠 |
| Google Analytics | アクセス解析 | 閲覧行動, デバイス情報 | Cookie 同意時のみ送信 |

**対象ファイル**: `src/app/(marketing)/privacy/page.tsx` — Section 3 に外部送信先一覧を追加
**受け入れ条件**: 上記 9 件の送信先が個別に列挙されていること
**工数見積**: 2h
**弁護士レビュー推奨**: いいえ

---

#### L-05: AI 免責条項の強化（High, P0）

**現状**: ToS Section 4 に「AI の内容の正確性・完全性・適合性を保証するものではありません」と基本的な記載のみ。

**法的背景**:
- 民法 不法行為（709 条）: AI 出力に基づく損害の責任範囲
- 景表法 5 条 1 号（優良誤認）: AI の効果を過大に表示するリスク
- 消費者契約法 8 条: 全部免除は無効。「軽過失に限り」の限定が必要

**設計方針**: 以下 7 項目を ToS に追加する。

1. **正確性**: AI 出力には事実誤認、古い情報、ハルシネーション（事実に基づかない生成）が含まれる可能性がある
2. **類似性**: AI は他のユーザーや第三者の著作物と類似した内容を生成する可能性があり、独自性は保証しない
3. **選考結果**: AI 機能の利用が選考通過やその他の就職活動の結果を保証するものではない
4. **企業情報**: スクレイピングにより取得した企業情報は最新でない場合がある。応募前に公式情報源で確認すること
5. **可用性**: AI 機能は外部プロバイダに依存しており、一時的に利用できない場合がある
6. **利用範囲**: AI 出力は参考情報として提供する。最終的な利用判断はユーザーの責任
7. **専門助言代替**: 本サービスはキャリアカウンセリング、法務相談、その他の専門サービスの代替ではない

**対象ファイル**: `src/app/(marketing)/terms/page.tsx` — 新規 Section 4-3「AI 機能の免責」
**受け入れ条件**: 7 項目すべてが ToS に明記されていること
**工数見積**: 2h
**弁護士レビュー推奨**: いいえ（業界標準パターンに基づく）

---

#### L-06: データエクスポート（Medium, P2）

**現状**: データエクスポート機能なし。アカウント削除は存在するが「データを持ち出す」手段がない。

**法的背景**:
- 個人情報保護法 33 条: 保有個人データの開示請求権。電磁的記録による提供を含む
- 2022 年改正で電子的提供が明確化

**設計方針**:

1. **対象ユーザー**: ログインユーザー専用。ゲストユーザーは対象外（cookie 由来の一時データのため）
2. **エクスポート範囲**: ユーザープロフィール、ES ドキュメント全版、企業一覧、締切、ガクチカ会話、志望動機会話、面接記録、クレジット履歴、通知設定
3. **フォーマット**: JSON ファイルを ZIP で圧縮
4. **エンドポイント**: `GET /api/settings/data-export`
5. **レート制限**: 24 時間に 1 回
6. **配信方法**: ブラウザ直接ダウンロード（メール送信は PII 転送リスクのため不可）

**対象ファイル**: 新規 `src/app/api/settings/data-export/route.ts`
**受け入れ条件**: (1) 全対象データが JSON に含まれる, (2) 24h レート制限が動作, (3) ゲストユーザーには 403
**工数見積**: 8h
**弁護士レビュー推奨**: いいえ

---

#### L-07: アカウント削除の完全化（Medium, P1）

**現状**: `DELETE /api/settings/account` で Stripe 解約 → DB CASCADE 削除。ただし Google OAuth revoke、Stripe 顧客匿名化、contact_messages 匿名化、RAG データ削除が未実装。

**法的背景**:
- 個人情報保護法 34 条: 利用停止・消去請求権。「遅滞なく」対応義務
- 既存 personal-data-confidential-information-protection-plan で P0 タスクとして指定済み

**設計方針**:

1. **Google OAuth revoke**: `accounts` テーブルの `accessToken` を使って Google revoke endpoint を呼び出し、トークンを無効化
2. **Stripe 顧客匿名化**: `stripe.customers.update()` で email / name をハッシュ値に置換。`stripe.customers.del()` は Stripe 推奨外（税務記録保持のため）
3. **contact_messages 匿名化**: userId を null に設定、email をハッシュ値に置換
4. **RAG データ削除**: Chroma collection からユーザー所有企業の embedding を削除、BM25 store からドキュメント削除、Redis cache をクリア
5. **Google Calendar 連携解除**: calendar_settings / calendar_events のカスケード削除（既存 FK で対応済みか検証）
6. **削除確認メール**: 登録メールアドレスに削除完了通知を送信（PII を含めない）
7. **監査ログ**: `account_deletion_completed` イベントに削除スコープ（DB / OAuth / Stripe / RAG / contact）の成否を記録

**対象ファイル**: `src/app/api/settings/account/route.ts`
**受け入れ条件**: 7 項目すべてが実装され、削除後に残存データがないこと
**工数見積**: 16h（L-07 + S-04 の合計）
**弁護士レビュー推奨**: いいえ
**既存計画参照**: personal-data-confidential-information-protection-plan P0

---

#### L-08: 規約変更通知メカニズム（Medium, P2）

**現状**: ToS に「当社は、本規約を変更する場合、事前に通知するものとします」と記載があるが、具体的な通知方法が未定義。

**法的背景**:
- 民法 548-4 条（定型約款変更）: 変更内容の「周知」が必要。不利益変更の場合は「相当な期間を置いた周知」

**設計方針**:

1. **通知方法**: アプリ内通知（notifications テーブル、type: `terms_updated`）+ メール通知
2. **表示方法**: ログイン後のダッシュボードにバナー表示。「同意して続ける」ボタン
3. **周知期間**: 不利益変更は 30 日前通知。軽微な変更は 7 日前
4. **ToS 記載**: 通知方法と周知期間を ToS Section 7 に明記

**対象ファイル**: `src/app/(marketing)/terms/page.tsx`, 新規通知ロジック
**受け入れ条件**: (1) 規約変更時にアプリ内通知とメールが送信される, (2) ToS に通知方法が明記
**工数見積**: 4h
**弁護士レビュー推奨**: いいえ

---

## 6. 商取引（Commercial）

### 6.1 現状評価

**実装済み**:
- 特商法ページ (`/legal`) 必須 15 項目完備
- Stripe Checkout: 改正特商法 §12-6 準拠の最終確認画面（`custom_text`, `consent_collection`, `locale: "ja"`）
- Webhook 処理: 5 イベント（checkout.session.completed, subscription.updated/deleted, invoice.payment_succeeded/failed）
- べき等性: `processedStripeEvents` テーブルによる重複排除
- カスタマーポータル: 解約、支払方法変更、プラン変更、請求書履歴
- 住所・電話の請求時開示方式（消費者庁 Q17-18 準拠）
- 価格表示の整合性（`/pricing`, `/legal`, Stripe Checkout）

**未実装**:
- `charge.refunded` webhook（返金後もプラン・クレジット維持）
- `charge.dispute.*` webhook（チャージバック未対応）
- `past_due` 時のクレジット制限（支払い失敗後もサービス継続）
- BCI-01〜13 の課金整合性問題
- 最終確認画面の consent 証拠保全
- `subscription.updated` の非トランザクション処理
- 請求紛争解決プロセス（SOP）
- 問い合わせメールの PII 最小化

### 6.2 ギャップ分析

| ID | ギャップ | リスク | 既存計画参照 |
|----|---------|--------|-------------|
| T-01 | charge.refunded webhook 未実装 | Critical | BCI-11 |
| T-02 | charge.dispute.* webhook 未実装 | Critical | BCI-11 |
| T-03 | past_due でクレジット利用継続 | High | BCI-10, F-1 |
| T-04a | BCI-01/02/03 トランザクション整合性 | Critical | BCI-01,02,03 |
| T-04b | BCI-04/05/06/07 修正 | High | BCI-04~07 |
| T-05 | consent 証拠保全なし | Medium | - |
| T-06 | subscription.updated 非トランザクション | Medium | BCI-12 |
| T-07 | 請求紛争解決 SOP なし | Medium | - |
| T-08 | 問い合わせメールの PII 過剰送信 | Medium | PII-plan |

### 6.3 各ギャップの設計判断

#### T-01: charge.refunded webhook（Critical, P0）

**現状**: Stripe Dashboard から手動返金を行っても、ユーザーのプラン・クレジットは変更されない。返金後も有料プランのサービスを享受し続ける。

**設計方針**:

1. `managed-config.json` の webhook 登録イベントに `charge.refunded` を追加
2. Webhook ハンドラの処理フロー:
   - charge から subscription と user を特定
   - 全額返金の場合: free プランにダウングレード、クレジットを free 割当にリセット
   - 部分返金の場合: ログ記録のみ（手動対応）。自動ダウングレードしない
   - アプリ内通知をユーザーに送信（プラン変更の旨）
   - 構造化監査イベントを記録

**対象ファイル**: `src/app/api/webhooks/stripe/route.ts`, `src/lib/stripe/managed-config.json`
**受け入れ条件**: (1) 全額返金時に free ダウングレードが実行される, (2) 部分返金はログのみ, (3) べき等性が維持される
**工数見積**: 4h

---

#### T-02: charge.dispute.* webhooks（Critical, P0）

**現状**: チャージバック発生時の自動対応なし。

**設計方針**:

1. `managed-config.json` に `charge.dispute.created`, `charge.dispute.closed` を追加
2. `charge.dispute.created` ハンドラ:
   - アカウントにフラグを設定（即時停止はしない。Stripe は証拠提出を推奨）
   - 運営者に通知メール送信（support@shupass.jp）
   - dispute 中はクレジット消費を制限（新規の reserve/consume をブロック）
   - 構造化監査イベントを記録
3. `charge.dispute.closed` ハンドラ:
   - 敗訴: free ダウングレード + クレジットリセット
   - 勝訴: フラグ解除、通常運用に復帰
4. **証拠準備**: IP アドレス、ログインタイムスタンプ、機能利用ログ、ToS 同意記録（T-05 で保全）

**対象ファイル**: `src/app/api/webhooks/stripe/route.ts`
**受け入れ条件**: (1) dispute 中にクレジット消費がブロックされる, (2) 敗訴時に free ダウングレード, (3) 勝訴時にフラグ解除
**工数見積**: 6h

---

#### T-03: past_due 即時クレジット制限（High, P0）

**現状**: `invoice.payment_failed` で subscription status が `past_due` になるが、クレジット消費は継続。Stripe 自動キャンセル（7-30+ 日後）まで有料サービスが提供される。

**既存計画との整合**: security-vulnerability-hardening-plan では即時 downgrade を High としている。猶予期間は設けない。

**設計方針**: 即時 free 相当制限

1. `getCreditsInfo()` と `consumeCredits()` / `reserveCredits()` の冒頭で subscription status をチェック
2. `status === "past_due"` の場合: free プランの月間割当（50 クレジット）を上限とし、超過分の消費をブロック
3. `invoice.payment_succeeded` で `past_due` → `active` に復帰した場合: 即時に有料プランの割当を復元
4. ユーザーへの通知: `invoice.payment_failed` 時に「お支払い方法の更新が必要です」通知を送信。Stripe カスタマーポータルへのリンクを含める

**対象ファイル**: `src/lib/credits/reservations.ts`, `src/app/api/webhooks/stripe/route.ts`
**受け入れ条件**: (1) past_due 状態で free 上限を超えるクレジット消費がブロックされる, (2) payment_succeeded で即時復帰
**工数見積**: 6h

---

#### T-04a: BCI-01/02/03 トランザクション整合性（Critical, P0）

**現状**: `billing-credit-integrity-report.md` で詳細に文書化済み。

- **BCI-01**: `consumeCredits` / `reserveCredits` の UPDATE と INSERT（監査ログ）が非トランザクション
- **BCI-02**: RAG 無料枠の `SELECT` + `UPDATE` が非アトミック。Lost Update で無料枠バイパス
- **BCI-03**: `updatePlanAllocation` が残高を絶対値で上書き。同時操作で余剰クレジット生成

**法的影響**:
- BCI-01: クレジット消費 + 監査ログ欠損 = 紛争時の立証困難（ユーザー不利）
- BCI-02: 収益損失（運営者不利）
- BCI-03: 余剰クレジット生成（ユーザー有利だが悪用リスク）

**設計方針**:
1. BCI-01: `db.transaction()` でラップ
2. BCI-02: `UPDATE ... SET count = count + 1 WHERE count < limit` のアトミックインクリメントに変更
3. BCI-03: `UPDATE ... SET balance = balance + (newAllocation - oldAllocation)` の差分計算に変更

**対象ファイル**: `src/lib/credits/reservations.ts`, `src/lib/company-info/usage.ts`, `src/lib/credits/monthly-reset.ts`
**受け入れ条件**: 並行リクエストテストで整合性が維持されること
**工数見積**: 5h
**既存計画参照**: billing-credit-integrity-report BCI-01, BCI-02, BCI-03

---

#### T-04b: BCI-04/05/06/07 修正（High, P2）

**現状**: billing-credit-integrity-report で P1 として文書化済み。Phase 0 完了後に着手。

**対象ファイル**: `src/lib/credits/monthly-reset.ts`, `src/lib/credits/reservations.ts`, `src/app/api/webhooks/stripe/route.ts`
**工数見積**: 10h
**既存計画参照**: billing-credit-integrity-report BCI-04, BCI-05, BCI-06, BCI-07

---

#### T-05: 最終確認画面の証拠保全（Medium, P1）

**現状**: Stripe Checkout で改正特商法 §12-6 準拠の最終確認画面を表示しているが、consent 証拠を DB に保存していない。

**設計方針**:
1. `checkout.session.completed` webhook で Stripe session の `consent` オブジェクトを DB に保存
2. session metadata（plan, period, price, 同意日時）を `subscriptions` テーブルの JSON カラムに格納
3. `custom_text` の内容バージョンを管理（ソースコード内の定数 + git hash で追跡可能）

**対象ファイル**: `src/app/api/webhooks/stripe/route.ts`
**受け入れ条件**: checkout 完了時に consent 記録が DB に保存されること
**工数見積**: 2h

---

#### T-06: subscription.updated トランザクション化（Medium, P2）

**現状**: webhook 内の 3 つの DB 操作が非トランザクション。

**設計方針**: `db.transaction()` でラップ。

**対象ファイル**: `src/app/api/webhooks/stripe/route.ts`
**工数見積**: 1h
**既存計画参照**: billing-credit-integrity-report BCI-12

---

#### T-07: 請求紛争解決 SOP（Medium, P1）

**現状**: 請求紛争の解決プロセスが文書化されていない。

**設計方針**: 内部 SOP ドキュメントを作成 + 問い合わせフォームにカテゴリ追加。

**SOP 内容**:
1. 紛争タイプの特定: 過剰請求、二重請求、不正利用、サービス未提供
2. Stripe Dashboard で確認: 決済履歴、サブスクリプション状態、webhook ログ
3. 解決方針の決定: 返金（全額/部分）、クレジット付与、説明
4. 対応 SLA: 請求紛争は 24 時間以内に初期回答
5. エスカレーション: 紛争額が月額超過、チャージバック発生、法的通知受領時

**成果物**: `docs/operations/production/BILLING_DISPUTE_SOP.md`, 問い合わせフォームにカテゴリ追加
**工数見積**: 3h

---

#### T-08: 問い合わせ PII 最小化（Medium, P1）

**現状**: `contact-notifications.ts` が Resend 送信メールに `userId`, IP アドレス, User-Agent を含めている。

**設計方針**:
1. `userId` を除去（DB で照合可能）
2. IP アドレスをマスク（最終オクテットを `***` に置換）
3. User-Agent を除去
4. HTML メール本文も同様に修正

**対象ファイル**: `src/lib/mail/contact-notifications.ts`
**受け入れ条件**: Resend 送信メールに raw PII が含まれないこと
**工数見積**: 2h

---

## 7. サポート体制（Support）

### 7.1 現状評価

**実装済み**:
- 問い合わせフォーム (`/contact`) — Zod バリデーション、レート制限、DB 保存
- Resend 経由の運営者宛メール通知
- 応答目標「2 営業日以内」の記載
- ランディングページ FAQ（10 項目）、料金ページ FAQ
- アプリ内通知システム（6 タイプ、サイドバーウィジェット）
- 通知設定（種別別 ON/OFF、日次サマリー時刻）
- 日次 Cron ジョブ（締切リマインダー、90 日クリーンアップ）
- アカウント削除（Settings > Danger Zone）
- Snackbar/Toast 通知

**未実装**:
- 問い合わせ受領の自動返信メール
- チケット管理（ステータス追跡、カテゴリ分類、優先度設定）
- ヘルプセンター / ナレッジベース
- データ削除リクエストの外部ワークフロー
- エスカレーション基準
- SLA 定義（アップタイム、データ復旧）
- 障害通知メカニズム
- 定型回答テンプレート

### 7.2 ギャップ分析

| ID | ギャップ | リスク | 影響 |
|----|---------|--------|------|
| S-01 | 問い合わせ受領の自動返信なし | High | ユーザーが受付確認を得られず再送 / 信頼低下 |
| S-02 | チケット管理なし | Medium | 対応漏れ。特商法開示請求への応答遅延リスク |
| S-03 | ヘルプセンターなし | Medium | 全問い合わせが手動対応。個人運営で持続不可能 |
| S-04 | データ削除の外部ワークフローなし | Medium | 非ログインユーザーの削除請求に対応不可 |
| S-05 | エスカレーション基準なし | Medium | 法的対応が必要な問い合わせの判断基準が不明 |
| S-06 | SLA 定義なし | Medium | 期待値の不一致 |
| S-07 | 障害通知メカニズムなし | Low | ユーザーに障害を通知する手段がない |
| S-08 | 定型回答テンプレートなし | Low | 対応時間増加、品質不安定 |

### 7.3 各ギャップの設計判断

#### S-01: 自動受領確認メール（High, P1）

**現状**: 問い合わせ送信後、UI に成功トーストのみ。メール確認なし。

**設計方針**:
1. DB 保存成功後に Resend API で自動返信メール送信
2. メール内容: 受付番号（contactMessages.id の先頭 8 文字）、応答目標（2 営業日以内）、ヘルプセンターリンク
3. PII 最小化: メール本文にユーザーの問い合わせ内容は含めない
4. レート制限: 既存の問い合わせレート制限に従う

**依存**: T-08（PII 最小化）完了後に着手

**対象ファイル**: `src/lib/mail/contact-notifications.ts`, `src/app/api/contact/route.ts`
**受け入れ条件**: (1) 問い合わせ後に確認メールが届く, (2) 内容が含まれない, (3) 受付番号が記載
**工数見積**: 3h

---

#### S-02: 最小限のチケット管理（Medium, P1）

**現状**: `contactMessages` テーブルに status / category / priority なし。

**設計方針**: 個人運営前提の最小限管理。外部ツール不要。

1. **DB スキーマ追加**:
   - `status`: `open` | `in_progress` | `awaiting_user` | `resolved` | `closed`
   - `category`: `bug_report` | `billing` | `feature_request` | `legal_disclosure` | `data_deletion` | `account` | `other`
   - `priority`: `urgent` | `normal` | `low`
   - `respondedAt`: timestamp
2. **自動カテゴリ分類**: キーワード（「返金」「請求」→ billing、「削除」「退会」→ data_deletion、「住所」「開示」→ legal_disclosure）
3. **自動優先度**: `legal_disclosure`, `data_deletion` → urgent
4. **管理 UI**: 初期は Supabase Dashboard。月間 20 件超過時に管理画面構築

**対象ファイル**: `src/lib/db/schema.ts`, `src/app/api/contact/route.ts`
**工数見積**: 4h

---

#### S-03: ヘルプセンター Phase 1（Medium, P1）

**現状**: ランディングページと料金ページに FAQ のみ。

**設計方針**: `/help` ルートに 7 カテゴリ・約 38 記事の静的 FAQ。

| カテゴリ | 記事数 | 主なトピック |
|---------|--------|-------------|
| アカウント・ログイン | 5 | Google ログイン、ゲスト→登録、削除、セッション |
| 料金・プラン・解約 | 8 | プラン比較、クレジット、解約手順、領収書、支払い失敗 |
| ES 添削 | 6 | 使い方、モデル選択、費用、文字数制限 |
| ガクチカ・志望動機 | 5 | 会話フロー、下書き生成、費用 |
| 企業管理・締切 | 5 | 企業登録、情報取得、カレンダー連携 |
| 面接対策 | 4 | 使い方、費用、フィードバック |
| データ・プライバシー | 5 | エクスポート、削除、AI 処理範囲、Cookie |

**対象ファイル**: 新規 `src/app/(marketing)/help/` ルート群
**工数見積**: 12h

---

#### S-04: データ削除リクエストワークフロー（Medium, P1）

**現状**: アプリ内削除は存在するが、非ログインユーザーからの削除請求フローがない。

**設計方針**:
1. **リクエスト経路**: アプリ内（既存）、問い合わせフォーム（auto-categorize）、メール
2. **本人確認**: 登録メールに確認コード送信 → 一致で実行
3. **SLA**: 1 営業日以内に確認、2 営業日以内に削除
4. **ゲスト**: cookie 由来データは 90 日自動期限切れ。プライバシーポリシーに明記

**依存**: L-07（アカウント削除完全化）

**成果物**: `docs/operations/production/DATA_DELETION_SOP.md`, auto-categorize 連携
**工数見積**: L-07 と合わせて 16h

---

#### S-05: エスカレーション基準（Medium, P1）

**設計方針**: 内部 SOP ドキュメント。

| トリガー | 分類 | アクション |
|---------|------|----------|
| 「法的」「弁護士」「訴訟」「消費者センター」 | 法的 | 回答を一時停止。法的リソース確認後に回答 |
| category: data_deletion | コンプライアンス | 2 営業日以内に対応（S-04 フロー） |
| category: legal_disclosure | コンプライアンス | 同日中に開示テンプレートで回答 |
| 紛争額 > 月額 | 財務 | Stripe 確認。プロアクティブ返金を検討 |
| チャージバック通知 | 財務 + 法的 | 7 日以内に証拠提出。アカウント制限 |
| 「不具合」 + 金銭損失 | 財務 | 24h 以内に調査・解決 |
| 不正利用・規約違反報告 | 安全 | 24h 以内に調査。確認後にアカウント停止 |
| メディア / 規制当局 | PR / 法的 | 即答しない。回答準備 |

**成果物**: `docs/operations/production/SUPPORT_ESCALATION.md`
**工数見積**: 2h

---

#### S-06: SLA 定義（Medium, P2）

**設計方針**: 個人運営で過剰コミットメントを避ける。

1. **アップタイム**: 保証しない。ToS に「可用性を保証するものではない」と明記
2. **問い合わせ応答**: 2 営業日以内。legal_disclosure は同日
3. **データ復旧**: 「運営者の責めに帰すべき事由によるデータ損失は、最新バックアップからの復旧に努める」

**対象ファイル**: `src/app/(marketing)/terms/page.tsx`
**工数見積**: 2h

---

#### S-07: 障害通知メカニズム（Low, P2）

**設計方針**: 環境変数ドリブンのインシデントバナー。

1. `NEXT_PUBLIC_INCIDENT_ACTIVE=true` でダッシュボード上部にバナー表示
2. `NEXT_PUBLIC_INCIDENT_MESSAGE` でメッセージカスタマイズ
3. 重大障害時はメール通知

**対象ファイル**: 新規 `src/components/ui/incident-banner.tsx`
**工数見積**: 3h

---

#### S-08: 定型回答テンプレート（Low, P1）

**設計方針**: `docs/operations/production/support-templates/` に 8 テンプレート。

1. 特商法開示回答（住所・電話番号）
2. アカウント削除確認
3. 請求問題の受付確認
4. バグ報告の受付確認
5. 機能リクエストの受付確認
6. 返金不可の説明
7. 支払い失敗時の案内
8. プランダウングレード確認

**工数見積**: 3h

---

## 8. 法的根拠・調査結果まとめ

### 8.1 文化庁 AI 著作権ガイダンス（2024-03-15）

- **文書名**: 「AI と著作権に関する考え方について」（著作権分科会法制度小委員会取りまとめ）
- **要点**: AI 生成物の著作物性は人間の「創作的寄与」に依存。プロンプトの具体性・試行回数・出力の選択/編集行為で判断
- **就活Pass への適用**: ES 添削は「ユーザーの原文 + AI の修正案」。ユーザーの創作的寄与はあるが、AI 修正部分の著作物性は不確定
- **補足**: 2024-07-31 にチェックリスト＆ガイダンス追加公開（RAG / LoRA シナリオ）
- **参照**: https://www.bunka.go.jp/seisaku/chosakuken/aiandcopyright.html

### 8.2 改正電気通信事業法 外部送信規律（2023-06 施行）

- **条文**: 電気通信事業法 §27-12
- **対象**: 情報を提供するウェブサービス事業者（個人事業主を含む）
- **準拠方式**: (a) 同意取得, (b) 通知・公表, (c) オプトアウト
- **就活Pass の選択**: opt-in バナー（最も保守的）
- **参照**: https://www.soumu.go.jp/main_sosiki/joho_tsusin/d_syohi/gaibusoushin_kiritsu.html

### 8.3 消費者契約法のデジタルサービス適用（2023 改正）

- **条文**: 消費者契約法 8-10 条
- **要点**: 全部免除は無効（8 条 1 項 1 号）、故意・重過失免除は無効（8 条 1 項 3 号）、一方的不利益は無効（10 条）
- **就活Pass の対応**: 返金例外条項の明確化（L-03）、損害賠償上限の限定
- **参照**: https://www.caa.go.jp/policies/policy/consumer_system/consumer_contract_act/annotations

### 8.4 特商法 個人事業主の非公開運用

- **消費者庁 Q&A Q17-18**: 住所・電話番号は「請求があった場合に遅滞なく開示」で可
- **バーチャルオフィス**: 3 要件を満たせば有効
- **氏名**: 戸籍上の氏名が必要。屋号のみは不可
- **参照**: https://www.no-trouble.caa.go.jp/qa/advertising.html

### 8.5 経産省 電子商取引準則（R7 年 2 月版）

- **サブスクリプション**: 改正特商法 §12-6 の最終確認画面に 6 項目の表示義務
- **電子契約**: Stripe Checkout の同意チェックボックスは有効な契約成立
- **規約変更**: 民法 548-4 条に基づき周知が必要
- **参照**: https://www.meti.go.jp/policy/it_policy/ec/

---

## 9. 既存計画書との参照マッピング

| 本計画 ID | 既存計画書 | 既存 ID | 整合性 |
|----------|-----------|--------|--------|
| T-04a | billing-credit-integrity-report | BCI-01, BCI-02, BCI-03 | 同一スコープ。本計画は法的影響の視点を追加 |
| T-04b | billing-credit-integrity-report | BCI-04, BCI-05, BCI-06, BCI-07 | 同一スコープ |
| T-03 | billing-credit-integrity-report | BCI-10 | 同一。猶予期間なし（security 計画と整合） |
| T-01/02 | billing-credit-integrity-report | BCI-11 | 同一。本計画は dispute 対応を追加 |
| T-06 | billing-credit-integrity-report | BCI-12 | 同一 |
| T-03 | security-vulnerability-hardening-plan | F-1 | 同一方針（即時制限） |
| L-07 | personal-data-confidential-information-protection-plan | P0 タスク群 | Google revoke, Stripe 匿名化, RAG 削除 |
| S-04 | personal-data-confidential-information-protection-plan | P0 タスク群 | 削除ワークフローの外部チャネル対応を追加 |
| L-04 | personal-data-confidential-information-protection-plan | 外部送信先 | 送信先一覧が一致 |
| T-08 | personal-data-confidential-information-protection-plan | P1 | PII 最小化のスコープが一致 |

**矛盾なし**: 全参照で方針が整合していることを確認済み。

---

## 10. 依存関係と実装ロードマップ

### 依存関係図

```
Phase 0 (ローンチブロッカー)
  T-04a ──────────────────────────────────► T-04b (Phase 2)
  T-03 (独立)
  T-01 ──► T-02
  L-01, L-05, L-03 (各独立)

Phase 1 (ローンチ前)
  T-08 ──► S-01
  L-02, L-04 (各独立)
  L-07 ──► S-04, L-06 (Phase 2)
  T-05 (独立)
  T-07 ──► S-05 ──► S-08
  S-02, S-03 (各独立)

Phase 2 (ローンチ後 1 ヶ月)
  L-06 (L-07 完了後)
  T-04b (T-04a 完了後)
  T-06, S-06, S-07, L-08 (各独立)
```

### 工数見積サマリー

| Phase | タスク数 | 推定工数 |
|-------|---------|---------|
| Phase 0 | 7 | 27h |
| Phase 1 | 12 | 57h |
| Phase 2 | 6 | 28h |
| **合計** | **25** | **112h** |

---

## 11. 弁護士相談が推奨される項目

| 項目 | 理由 | 推奨相談方式 | 推定費用 |
|------|------|-------------|---------|
| L-01: AI 著作権条項 | AI 著作権法は発展途上。判例未成立 | IT 法務 / 知財専門弁護士 | 15,000-30,000 円 |
| L-03: 消費者契約法条項 | 10 条の適用範囲は事例依存 | 消費者取引専門弁護士 | 15,000-20,000 円 |

**コスト効率的アプローチ**: Phase 0 完了後に ToS / プライバシーポリシー全体を 1 時間でレビュー依頼（Bengo4.com、CoCounsel 等）。

---

## 12. 検証方法

1. タスクボードに全 25 件が記載されていること
2. 全タスクに Status / Priority / Area / Owner / Risk / Complexity / Dependencies / Ref が付与されていること
3. Section 8 に 5 つの法的根拠が記載されていること
4. Section 9 の参照マッピングで 10 件の対応が矛盾なく記載されていること
5. Phase 0 の先頭が BCI-01/02/03（T-04a）であること
6. T-03 に「即時制限（猶予なし）」が明記されていること
7. L-07/S-04 が Phase 1 に配置されていること

---

## 進捗ログ

| 日付 | ステータス | 内容 |
|------|-----------|------|
| 2026-05-05 | 計画策定完了 | 法務 8 + 商取引 9 + サポート 8 = 25 タスク。3 Phase ロードマップ策定。Codex plan review 指摘を反映済み |
