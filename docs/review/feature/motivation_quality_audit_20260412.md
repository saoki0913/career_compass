# 志望動機作成機能 品質監査レポート

**監査日:** 2026-04-12
**監査レベル:** 外部コンサルレビューレベル（プロンプト品質重点 + 競合比較 + 実API検証の3軸）
**対象Git SHA:** cbf9de8
**対象モデル:** gpt-5.4-mini (質問/評価), claude-sonnet-4-6 (ドラフト生成)
**プロンプトバージョン:** motivation.evaluation v1, motivation.question v1, motivation.draft_generation v1, motivation.deepdive_question v1
**Temperature:** 0.3 (評価/ドラフト), 0.5 (質問生成)

---

## 1. エグゼクティブサマリー

### 6軸評価マトリクス

| 軸 | 評価 | 判定根拠 |
|---|:---:|---|
| **プロンプト設計** | **C** | 4プロンプトに同一ルールブロック4本をコピペ。slot_status 出力スキーマに3-state/4-state混在。Notionプロンプトがslot_status_v2を要求するがコードが読み捨てる設計ドリフト。ロールペルソナが評価プロンプトに欠如 |
| **判定精度** | **D** | 実API検証で4ケース全て全スロットmissingを返却（LLM呼出失敗時のサイレント200 OK）。コード上もslot_status_v2無視により4-state判定が3-stateに劣化するリスク。_compute_draft_gate()は設計上堅牢だが、入力のslot_status_v2精度に依存 |
| **質問UX** | **B** | フォールバック質問18問は多様。バリデーションチェーン11項目は網羅的。ただし80文字制限とステージ別キーワード必須で過剰フォールバック発火のリスク。実API検証では全件503エラー |
| **ドラフト品質** | **C** | has_rag=False, grounding_mode="none"が固定ハードコード。RAGで企業情報を取得しているにもかかわらずドラフト生成プロンプトに注入されない。normalize_es_draft_single_paragraph()による後処理は存在するが、AI臭抑制は未検証 |
| **安全性** | **B** | グラウンディングルールは4プロンプト全てに展開。_compute_draft_gate()のself_connection因果リンク検査は健全な安全弁。ただし評価LLM失敗時の200 OK返却は危険（クライアントが成功と誤認） |
| **仕様整合性** | **D** | motivation.py:1002とmotivation_planner.py:56に同一関数が独立定義。motivation.py:700とmotivation_context.py:458にも重複。importなしのため片方が改修されても他方に反映されず、ドリフト必至 |

### 総合スコア: 35/100 (グレード D)

| 評価領域 | 配点 | 得点 | 根拠 |
|---------|---:|---:|---|
| プロンプト設計 | 20 | 8 | ドラフトプロンプトがデッドコード、重複コスト、スキーマ不整合、ロール欠如 |
| 判定精度 | 25 | 6 | slot_status_v2無視 + conversation_context未到達 + LLM失敗サイレント200 |
| 質問UX | 15 | 9 | 設計は良好だが過剰フォールバックリスク・confirmed偽陽性・計装不足 |
| ドラフト品質 | 20 | 6 | Notionプロンプト未使用 + RAG無注入 + AI臭未対応 |
| 安全性 | 20 | 6 | グラウンディングルール健全だが200 OKサイレント障害 + JST違反 |

### 最重要改善5点

1. **slot_status_v2 読み捨て問題 [致命的]** — `motivation.py:2704` が `data.get("slot_status")` のみ読み、Notionプロンプトが返す `slot_status_v2` を無視。4-state設計の根幹が機能していない可能性
2. **LLM失敗時のサイレント200 OK [致命的]** — 評価エンドポイントがLLM呼出失敗時に全スロットmissingのデフォルト値を200 OKで返す。クライアントは障害を検知できず、ユーザーは永遠にready_for_draft=falseのまま
3. **Notion版ドラフトプロンプトがデッドコード [致命的]** — `notion_prompts.json` の `motivation.draft_generation` は一切 import/使用されていない。実際は `es_templates.py` の `build_template_draft_generation_prompt()` 経由で生成。Notion管理による版管理・A/Bテストがドラフト生成に効かない
4. **ドラフト生成のRAG無視 [重大]** — `has_rag=False, grounding_mode="none"` がハードコード（`motivation.py:3614-3615`）。企業情報取得は実行しているのにドラフト生成プロンプトへの構造的注入がない
5. **約30個の重複helper定義 [重大]** — `motivation.py` と `motivation_context.py` / `motivation_planner.py` 間でローカル再定義が残存。import を上書きしており、片方だけの改修でサイレントドリフトが発生する

---

## 2. プロンプト品質分析

### 2-1. プロンプト構造分析

#### motivation.evaluation (スロット判定)

| 項目 | 評価 |
|------|------|
| テンプレート部分推定トークン数 | ~800 tokens (fallback), ~1,200 tokens (Notion版) |
| 動的コンテンツ込み最大推定 | ~3,500 tokens (長い会話 + 企業情報) |
| ロールペルソナ | **なし** — 評価者としてのアイデンティティが未定義 |
| グラウンディングルール | 4ブロック全展開（重複コスト ~400 tokens） |
| 出力スキーマ | Fallback: 3-state (filled/partial/missing), Notion: 4-state + slot_status_v2 |
| 評価 | **C** |

**問題点:**
- ロールペルソナ不在。質問プロンプトには「就活生向けの志望動機作成アドバイザー」があるが、評価プロンプトにはない。LLMの応答品質はロール設定に依存する
- Fallbackは3-state (`filled/partial/missing`) だがNotionは4-state (`filled_strong/filled_weak/partial/missing`)。切り替え時に出力スキーマが変わる
- `motivation.py:2628-2637` で追加評価ルールをプロンプト末尾にハードコード付加しており、Notion管理版の変更だけでは完結しない
- evaluationプロンプトに不要な反復防止ルール（~200トークン）が含まれる。評価は質問生成しないため反復防止は不要

#### motivation.question (質問生成)

| 項目 | 評価 |
|------|------|
| テンプレート部分推定トークン数 | ~1,200 tokens |
| 動的コンテンツ込み最大推定 | ~4,500 tokens (ガクチカ + プロフィール + 会話 + 企業情報) |
| ロールペルソナ | **あり** — 「就活生向けの志望動機作成アドバイザー」 |
| 特筆事項 | Notion版のみ「ガクチカ・プロフィール・企業情報に接点があるときだけ質問に反映」ルールあり |
| 評価 | **B** |

**問題点:**
- 4ルールブロック全展開で ~400 tokens のオーバーヘッド。gpt-5.4-mini のコンテキスト効率を圧迫
- Notion版にのみ存在するルールがFallbackに反映されないため、Fallback使用時に挙動が変わる

#### motivation.draft_generation (ドラフト生成)

| 項目 | 評価 |
|------|------|
| テンプレート部分推定トークン数 | ~950 tokens (es_templates.py経由の実プロンプト) / ~1,500 tokens (Notion版: 未使用) |
| 使用モデル | claude-sonnet-4-6 |
| ロールペルソナ | **なし**（ビルダー関数経由のため構造が異なる） |
| 重大問題 | Notion版プロンプトが**デッドコード**。`has_rag=False, grounding_mode="none"` 固定 |
| 評価 | **D** |

**致命的問題: Notion版ドラフトプロンプトは使われていない**

`motivation.py:3600-3616` の `generate_draft` エンドポイントは `build_template_draft_generation_prompt()` を呼んでおり、`MOTIVATION_DRAFT_GENERATION_PROMPT` は一切 import されていない。`notion_prompts.json` に存在する `motivation.draft_generation` プロンプトは**デッドコード**である。

Notion版には「だ・である調で統一」「構成比率 (15/70/15)」「可能なら why now が伝わる一節を入れる」等の有益な指示があるが、実際のドラフトは `es_templates.py` のテンプレートシステム経由で生成され、これらの指示は到達しない。Notion管理によるA/Bテストや版管理がドラフト生成に効かない。

**その他の問題点:**
- `motivation.py:3592` で `_get_company_context()` を呼び RAG情報を取得しているが、`motivation.py:3614-3615` で `has_rag=False, grounding_mode="none"` をハードコードしてドラフト生成プロンプトに渡す。`grounding_mode="none"` により `_format_company_guidance()` が企業ガイダンスブロック全体をスキップ（`es_templates.py:894`）。企業情報は `company_reference_body` として素材は存在するが、「どう使うか」の指示がない
- `es_templates.py` のグラウンディングルールに「質問の前提として断定せず」等の質問生成用ルールがドラフト生成にもコピーされており不適切

#### motivation.deepdive_question (深掘り質問)

| 項目 | 評価 |
|------|------|
| テンプレート部分推定トークン数 | ~900 tokens |
| 構造 | Fallbackとほぼ同一。Notion版は反復防止ルールが独自 |
| 評価 | **B** |

**問題点:**
- target_area の名前空間が planner の gap_id と異なる（例: `company_reason_specificity` vs `company_reason_strengthening`）。コード内でマッピング関数（`_deepdive_area_to_stage()`, `_deepdive_area_to_weakness_tag()`）で吸収しているが、プロンプト上は target_area 名のみでgap_idとの対応が不透明

### 2-2. slot_status_v2 読み捨て問題 [Priority 1]

**コードトレース:**

```
LLM出力 → data = llm_result.data
       → data.get("slot_status")     ← motivation.py:2704 ★ここでslot_statusのみ読む
       → _normalize_slot_status_v2() → 各スロットに _normalize_slot_state()
       → "filled" → "filled_strong" にマッピング
```

**Notionプロンプトの出力スキーマ:**
```json
{
  "slot_status": { ... },      // 3-state互換
  "slot_status_v2": { ... }    // 4-state (filled_strong/filled_weak/partial/missing)
}
```

**リスク分析:**

| シナリオ | 発生条件 | 影響 |
|---------|---------|------|
| LLMがslot_statusとslot_status_v2を両方返す | 正常系（Notionプロンプト） | slot_statusの3-stateが`_normalize_slot_state()`で4-stateに変換される。"filled"は"filled_strong"に昇格 → filled_weakが検出されない |
| LLMがslot_status_v2のみ返す | Notionプロンプトの指示に従った場合 | `data.get("slot_status")` が None → `_normalize_slot_status_v2({})` → 全スロットmissing |
| Fallback使用時 | Notion障害時 | 3-state出力のみ → "filled"が全てfilled_strongに昇格 → filled_weakの区別が消失 |

**結論:** 4-state設計の最大の価値である `filled_weak` の検出が、正常系でも機能しない可能性が高い。`_normalize_slot_state()` は "filled" → "filled_strong" にマッピングするため、LLMが3-stateの `slot_status` に "filled" を返すと無条件で `filled_strong` に昇格する。`filled_weak` が返される唯一の経路は、LLMが `slot_status` キー内に明示的に "filled_weak" 文字列を返す場合のみ。

### 2-3. 重複helper定義のドリフト [Priority 1]

**重複ペア一覧（主要なもの）:**

| 関数名 | motivation.py | 他ファイル | import関係 |
|--------|-------------|-----------|-----------|
| `_compute_deterministic_causal_gaps()` | L1002-1053 (52行) | motivation_planner.py:56-107 | import後にローカル再定義で上書き |
| `_normalize_conversation_context()` | L700-835 (136行) | motivation_context.py:458-593 | import後にローカル再定義で上書き |
| `_answer_is_confirmed_for_stage()` | L665-693 (29行) | motivation_context.py:375-403 | import後にローカル再定義で上書き |
| `_normalize_slot_state()` | L509-515 | motivation_context.py:219-225 | import後にローカル再定義で上書き |
| `_normalize_slot_status_v2()` | L525-534 | motivation_context.py:235-244 | import後にローカル再定義で上書き |

**さらに以下を含む約30個の関数/定数が重複:**
`_default_slot_states()`, `_default_slot_summaries()`, `_default_slot_evidence_sentences()`, `_default_slot_intents_asked()`, `_default_reask_budget_by_slot()`, `_clean_short_phrase()`, `_coerce_string_list()`, `_default_confirmed_facts()`, `_default_weak_slot_retries()`, `_normalize_weak_slot_retries()`, `_legacy_slot_state()`, 定数群 (`CONVERSATION_MODE_SLOT_FILL`, `CONVERSATION_MODE_DEEPDIVE`, `SLOT_STATE_VALUES`, `SLOT_FILL_INTENTS`, `DEEPDIVE_INTENT_BY_GAP_ID`, `CONTRIBUTION_*_TOKENS` 等)

**importトレース:**
- `motivation.py` は `motivation_context.py` および `motivation_planner.py` から import している（L83, L109, L125-128）
- しかし `motivation.py` 内にローカル再定義があり、Pythonのスコープルールによりimportを上書きする
- これはリファクタリング途中で残った重複と推測される: `motivation_context.py` への切り出しは行われたが、`motivation.py` 側の旧定義が削除されていない

**ドリフトリスク:** 極めて高。3,784行の `motivation.py` 内に約30個の重複定義が散在しており、片方にバグ修正やロジック変更を入れても他方に反映されない。呼出元によって異なる挙動が発生するサイレントバグの温床。

### 2-4. 質問バリデーションチェーン分析

`_validate_or_repair_question()` (`motivation.py:1963-2024`) は11段階のバリデーションを実行:

| # | チェック | 失敗時 |
|---|---------|--------|
| 1 | 空文字チェック | fallback |
| 2 | `GENERIC_QUESTION_BLOCKLIST` (4項目) | fallback |
| 3 | 指示文・UI文言コピー検出 | fallback |
| 4 | 複合質問検出 | fallback |
| 5 | 他社名言及チェック (company_reason/differentiation/closing限定) | fallback |
| 6 | 未確認前提使用チェック | fallback |
| 7 | 80文字上限 | fallback |
| 8 | ステージ別キーワード必須チェック (`QUESTION_KEYWORDS_BY_STAGE`) | fallback |
| 9 | industry_reason: "業界"必須 | fallback |
| 10 | desired_work: "入社後"必須 | fallback |
| 11 | ステージ固有の追加キーワードチェック | fallback |

**`GENERIC_QUESTION_BLOCKLIST` の網羅性:**

現在の4項目: `"もう少し詳しく"`, `"具体的に説明"`, `"他にありますか"`, `"先ほど"`

**不足パターン:**
- `"教えてください"` の単独使用（「○○を教えてください」は許容すべきだが「教えてください」単独は曖昧）
- `"どう思いますか"` — 論点が不明確
- `"いかがですか"` — 同上
- `"なぜですか"` 単独使用 — コンテキストなしの詰問

**80文字制限の妥当性:**
日本語で1〜2文の質問は通常30〜60文字。80文字は妥当な上限だが、企業名を含む質問（例: 「株式会社リクルートホールディングスの...」）で超過しやすい。企業名の長さを考慮した動的上限が望ましい。

**過剰フォールバック発火リスク:**
ステージ別キーワード必須チェック（#8-11）が厳しすぎる。例えば `desired_work` ステージで "入社後" を含まない質問（「チームでどんな課題に取り組みたいですか？」）は全てフォールバックに置換される。LLMが自然な日本語で質問を生成しても、特定キーワードがないだけで棄却される。

**フォールバック発火率:** `candidate_validation_summary` (`motivation.py:3209-3212`) は `total_candidates: 0` の情報しか返さず、フォールバック使用率の外形的計測が不可能。計装追加が必要。

**フォールバック質問18問の多様性:**
`QUESTION_WORDING_BY_STAGE` (`motivation.py:245-275`) は各ステージ3問。質問パターンは: (1) 最も近いものを1つ選ぶ型、(2) きっかけ・理由型、(3) 二択型。3パターンはユーザーが連続使用しない限り十分だが、同一ステージで再質問が発生した場合にローテーションが不足する。

### 2-5. コンテキスト管理とターンプランナー

**会話8メッセージ切り詰め + conversation_context 未到達 [Priority 1]:**
`_trim_conversation_for_evaluation()` (`motivation.py:150-155`) が評価時に会話を末尾8メッセージに切り詰める。6スロットフレームワークで最低12メッセージ（質問6問+回答6問）必要なため、スロットフィル完了時点で最初の4スロット（industry_reason, company_reason等）の原文が切り捨てられる。

**重大:** evaluation プロンプトは `{conversation}` 変数のみを参照し、`conversation_context`（各スロットのサマリ）は注入されていない。つまり切り詰められた部分のスロット情報は evaluation LLM に到達しない。`industry_reason` は通常最初に聞かれるため、8メッセージ切り詰めではほぼ確実に脱落し、`missing` と誤判定されるリスクが高い。

**ターンプランナー unlock条件:**
- `_determine_next_turn()` (`motivation.py:1056-1068`): `turnCount >= 7` または `deepdiveTurnCount >= 10` で unlock
- `eval_ready_for_draft` (`motivation.py:2721-2725`): LLMの`ready_for_draft` AND `_compute_draft_gate()`

**2系統の整合性問題:**
planner_unlockはターン数ベースの安全弁、eval_ready_for_draftは品質ゲート。ターン上限でunlockされても品質ゲートを通過しない場合、ユーザーはドラフトに進めない。逆に、品質ゲートを通過してもプランナーがunlockしていない場合、質問が続行される。2系統の優先度がコード上不明確。

### 2-6. ドラフト後処理とAI臭

**`has_rag=False, grounding_mode="none"` 固定の影響:**

`build_template_draft_generation_prompt()` に `has_rag=False` を渡すことで、プロンプト内の企業情報グラウンディング強制指示が無効化される。`company_reference_body` として企業情報テキストは渡されるが、「RAGで取得した企業情報に基づいて」という強制力のあるグラウンディング指示がプロンプトに含まれない。

結果として、ドラフト生成モデル（claude-sonnet-4-6）は企業参考情報を任意に使用する/しないを自己判断する。ES添削機能では `has_rag=True` でグラウンディングを強制しているのに対し、志望動機機能では強制なし。

**AI臭リスク:**
ドラフト生成プロンプト（Notion版）には10の作成ルールが含まれるが、AI臭抑制の明示的指示は確認できない。ES添削では `ai-writing-auditor` の Tier 1/2/3 ルーブリックが適用されているが、志望動機ドラフトには未適用。

### 2-7. 6スロットフレームワーク妥当性

**`why_now` がスロットにない影響:**
deepdiveでは `why_now_strengthening` が target_area として存在するが、6スロットに `why_now` は含まれない。`_deepdive_area_to_stage()` は `why_now_strengthening` を `company_reason` にマッピングしている（`motivation.py:3021`）。「なぜ今この会社か」は就活の志望動機で頻出する問いだが、独立スロットでないためevaluation時にこの観点が評価対象外。

**`differentiation` と `company_reason` の重複リスク:**
company_reasonが「トヨタのWoven Cityに惹かれた」、differentiationが「Woven Cityがある唯一の会社」の場合、本質的に同じ情報を2スロットで聞くことになる。`_compute_deterministic_causal_gaps()` の `differentiation_missing` チェックは「他社」「違い」等のトークン存在のみで判定しており、company_reasonとの意味的重複は検出できない。

---

## 3. 周辺ロジック品質分析

### 3-1. ドラフトゲート (_compute_draft_gate)

```python
# motivation.py:2357-2377
必須条件:
  - company_reason: filled_strong or filled_weak
  - desired_work: filled_strong or filled_weak
  - differentiation: filled_strong or filled_weak
  - self_connection: filled_strong or filled_weak AND 因果リンクあり
```

**設計評価: A**
draft_gateの4条件は合理的。特にself_connectionの因果リンク検査（`_self_connection_has_causal_link()`）は、経験と志望理由の論理的接続を検証する安全弁として有効。

**依存リスク:**
ただし入力の `slot_status_v2` 精度に全面依存。2-2節で指摘した通り、slot_status_v2が正確に4-stateを反映していない場合、ゲートの判定も不正確になる。

### 3-2. 回答確認関数 (_answer_is_confirmed_for_stage)

```python
# motivation.py:665-693
industry_reason: len >= 18 AND ("業界"|"関心"|"理由"|"ため"|"から"|"惹かれ")
company_reason:  len >= 18 AND ("理由"|"ため"|"から"|"惹かれ"|"魅力"|"合う")
self_connection: len >= 18 AND ("経験"|"価値観"|"強み"|"きっかけ"|"つなが"|"活か")
desired_work:    len >= 16 AND ("したい"|"挑戦"|"関わりたい"|"担いたい"|"取り組みたい")
value_contribution: len >= 16 AND ("価値"|"貢献"|"役立"|"前に進め"|"支え"|"実現")
differentiation: len >= 16 AND ("他社"|"違い"|"だからこそ"|"最も"|"ならでは"|"合う")
```

**否定表現偽陽性リスク:**
「業界に関心はありません」→ "関心" トークンが含まれるため confirmed と判定される。否定表現の検出がない。

**最小文字数の妥当性:**
18文字/16文字は日本語の1文（20-40文字）の約半分。短すぎる回答の排除には有効だが、「グローバルだから」(7文字) は < 10 で即 False、「自動車業界に関心がある」(11文字) は < 18 で False。閾値は概ね妥当。

### 3-3. 深掘り名前空間マッピング

| planner gap_id | API target_area | weakness_tag | 対象slot |
|---------------|----------------|-------------|---------|
| `company_reason_specificity` | `company_reason_strengthening` | `company_reason_generic` | company_reason |
| `self_connection_gap` | `origin_background` | `self_connection_weak` | self_connection |
| `role_reason_missing` | `desired_work_clarity` | `desired_work_too_abstract` | desired_work |
| `value_contribution_vague` | `value_contribution_clarity` | `value_contribution_vague` | value_contribution |
| `differentiation_missing` | `differentiation_strengthening` | `differentiation_missing` | differentiation |
| (なし) | `why_now_strengthening` | `why_now_missing` | company_reason |

3つの名前空間が独立に存在し、変換は `_deepdive_area_to_stage()` と `_deepdive_area_to_weakness_tag()` で行われる。マッピングテーブルが3箇所（プランナー、LLM出力、コード変換）に分散しており、新しいgap追加時の整合性維持が困難。

---

## 4. 競合比較

### 4-1. 志望動機AI支援ツール比較表

| 機能 | **就活Pass** | **ChatGPT直接利用** | **一般的なES AIツール** | **就活塾（人手）** |
|------|:---:|:---:|:---:|:---:|
| 対話型ヒアリング | **6スロット構造化** | 自由形式 | テンプレ入力 | 対面カウンセリング |
| 企業情報連携 | RAG (ChromaDB) | なし | なし〜限定的 | カウンセラーの知識 |
| ドラフト生成 | 300/400/500字選択 | 自由 | 固定テンプレ | 人手添削 |
| 品質ゲート | slot_status_v2 + draft_gate | なし | なし | カウンセラー判断 |
| 深掘りフェーズ | 因果ギャップ検出 + 10ターン | なし | なし | 対面フィードバック |
| 価格帯 | フリーミアム | 月$20 (Plus) | 無料〜月500円 | 月1-3万円 |
| AI検出リスク | 中（AI臭抑制未実装） | 高 | 高 | 低 |

### 4-2. 就活Passの構造的優位点

1. **6スロット構造化ヒアリング** — ChatGPT直接利用では学生が「志望動機書いて」と丸投げしがちだが、就活Passは6要素を順次ヒアリングすることで素材の網羅性を担保。これは就活塾のカウンセリングフローに近い
2. **企業情報RAG連携** — ChromaDBによる企業固有情報の注入は、「どの企業でも通る志望動機」になるリスクを低減する設計意図。ただし現状 `grounding_mode="none"` によりドラフト生成時に実効的な強制力がない
3. **品質ゲート二重構造** — eval_ready_for_draft（品質）+ planner_unlock（ターン制限）の二重構造は、早すぎるドラフト生成を防ぐ安全弁として競合にない仕組み

### 4-3. 就活Passの構造的弱点

1. **AI臭抑制の欠如** — ES添削機能と異なり、志望動機ドラフトにai-writing-auditorのルーブリックが適用されていない。就活市場でAI生成ES検出の動きが加速しており（2025年以降、大手企業の人事部門がAIライティング検知ツールを導入する事例が増加）、AI臭の高い出力は選考で不利になるリスク
2. **企業固有性の構造的限界** — RAGで企業情報を取得してもドラフト生成に構造的に注入されない（`has_rag=False`）。結果として「御社の○○」が具体的な事業名ではなく抽象的表現になりやすい
3. **深掘りの非可視性** — 深掘りフェーズで得た補強情報がドラフトに反映される仕組みが不明確。ユーザーが深掘り質問に答えても、再ドラフト時にその情報がどう活用されるかの透明性がない

### 4-4. 人事・カウンセラー視点の品質基準

就活塾や人事担当者が志望動機ESで評価するポイント:

| 基準 | 就活Passの対応状況 |
|------|-----------------|
| 結論先行（PREP構造） | ドラフト生成プロンプトで指示あり |
| 企業固有性（「御社でなければならない理由」） | RAG設計はあるがドラフト注入が無効 |
| 原体験との接続 | self_connectionスロットで収集、因果リンク検査あり |
| 具体的なアクション（入社後何をしたいか） | desired_workスロットで収集 |
| 一貫性（論理の飛躍がないか） | draft_gateの因果リンク検査で部分的に対応 |
| 文字数遵守 | 300/400/500字の3段階選択あり |
| 自分の言葉で書かれているか（AI臭なし） | **未対応** |

---

## 5. 実API検証結果

### 5-1. テスト環境

```
FastAPI: localhost:8000 (uvicorn --reload)
認証: 内部JWT (HS256, iss=next-bff, aud=career-compass-fastapi)
LLMバックエンド: ローカル環境のAPI key設定に依存
```

### 5-2. Evaluationエンドポイント (/api/motivation/evaluate)

**テスト結果概要:**

| ケース | 期待 | 実結果 | 判定 |
|--------|------|--------|------|
| Case1: 充足完了（6スロット具体的回答） | 複数filled_strong, ready_for_draft=true | 全スロットmissing, ready_for_draft=false | **FAIL** |
| Case2: 初期段階（1回答のみ） | industry_reason=filled, 他missing | 全スロットmissing | **FAIL** |
| Case3: 曖昧回答（全て「成長したい」系） | 複数partial/filled_weak | 全スロットmissing | **FAIL** |
| Case7: 一言回答（全10文字以下） | 複数missing/partial | 全スロットmissing | **FAIL** |

**全ケースで同一の応答:**
```json
{
  "slot_status": { "industry_reason": "missing", ... (全6スロットmissing) },
  "slot_status_v2": { "industry_reason": "missing", ... (全6スロットmissing) },
  "ready_for_draft": false,
  "draft_readiness_reason": "評価に失敗したため骨格未確認",
  "draft_blockers": ["company_reason", "desired_work", "differentiation", "self_connection"]
}
```

**根本原因:** `draft_readiness_reason: "評価に失敗したため骨格未確認"` は `motivation.py:2696` のLLM呼出失敗時フォールバック。LLM APIの呼出が失敗しており（API key未設定またはネットワーク問題）、全ケースでデフォルト値が返されている。

**致命的問題:** HTTPステータスコードは **200 OK** で返される。クライアント側はレスポンスのJSONを解析しない限り障害を検知できない。`draft_readiness_reason` フィールドに障害情報が含まれるが、これはUI表示用ではなくデバッグ用と思われる。

### 5-3. Questionエンドポイント (/api/motivation/next-question)

**テスト結果:**

| ケース | HTTPステータス | 結果 |
|--------|:---:|--------|
| Case2: 初期段階 | 503 | `{"detail":{"error":"志望動機作成の処理中にエラーが発生しました。","error_type":"unknown"}}` |
| Case3: 曖昧回答 | 503 | 同上 |
| Case7: 一言回答 | 503 | 同上 |

**evaluateとの非対称性:** evaluateは200 OK + デフォルト値、next-questionは503エラー。同じLLM呼出失敗でもエラーハンドリングが異なる。next-questionの503のほうが正しいエラー通知。

### 5-4. API検証の制約事項

ローカル環境のLLM API設定により、LLM依存の機能（評価、質問生成、ドラフト生成）が全て失敗した。以下は検証不可:

- [ ] スロット判定精度（4-state判定の正確性）
- [ ] 質問生成の自然性・ターゲット正確性
- [ ] ドラフト生成の企業固有性・文字数遵守
- [ ] AI臭の定量評価
- [ ] 2回実行時の判定揺れ
- [ ] RAG-rich vs RAG-empty-corpus の挙動差

**本番環境またはstaging環境での再検証を強く推奨。**

---

## 6. 改善提案

### P1: 即時対応（致命的リスク）

#### P1-1. slot_status_v2 読み取りの修正

**問題:** `motivation.py:2704` が `data.get("slot_status")` のみ読む
**修正案:**
```python
# Before
slot_status_v2 = _normalize_slot_status_v2(data.get("slot_status") or {})

# After
raw_v2 = data.get("slot_status_v2") or data.get("slot_status") or {}
slot_status_v2 = _normalize_slot_status_v2(raw_v2)
```
`slot_status_v2` を優先的に読み、存在しない場合のみ `slot_status` にフォールバック。

#### P1-2. LLM失敗時の非200応答

**問題:** LLM呼出失敗時に200 OKで全スロットmissing返却
**修正案:** `llm_result.success == False` の場合は503を返す。または応答に `"evaluation_status": "llm_failure"` を追加しクライアント側で検知可能にする。

#### P1-3. Notion版ドラフトプロンプトの接続

**問題:** `motivation.draft_generation` プロンプトがデッドコード。`generate_draft` は `build_template_draft_generation_prompt()` を直接呼ぶ
**修正案:** Notion版プロンプトを `build_template_draft_generation_prompt()` のシステムプロンプトとして注入するか、またはNotion版の有益な指示（構成比率15/70/15、だ・である調統一、why now一節）を `es_templates.py` のmotivation固有テンプレートに移植する

#### P1-4. evaluationプロンプトへのconversation_context注入

**問題:** 8メッセージ切り詰め後、初期スロット情報がevaluation LLMに到達しない
**修正案:** evaluationプロンプトテンプレートに `{conversation_context}` セクションを追加し、`_evaluate_motivation_internal()` で `normalized_context` のスロットサマリをプロンプトに注入する

#### P1-5. 重複関数の統合（約30個）

**問題:** `motivation.py` 内に `motivation_context.py` / `motivation_planner.py` と同一の関数/定数が約30個ローカル再定義
**修正案:** `motivation_context.py` / `motivation_planner.py` を正本とし、`motivation.py` 内の重複定義を全て削除。importのみで参照する

#### P1-6. JST基準への修正

**問題:** `motivation.py:2862` で `datetime.utcnow()` 使用
**修正案:** `datetime.now(ZoneInfo("Asia/Tokyo"))` に変更（ビジネスルール「JST基準」の遵守）

### P2: 次スプリント（重大リスク）

#### P2-1. ドラフト生成のRAGグラウンディング有効化

**問題:** `has_rag=False, grounding_mode="none"` ハードコード
**修正案:** RAGで企業情報が取得できた場合は `has_rag=True, grounding_mode="strict"` に設定。企業情報なしの場合のみ現行の `has_rag=False`。

#### P2-2. AI臭抑制の導入

**問題:** ES添削にはai-writing-auditorルーブリックが適用されているが、志望動機ドラフトには未適用
**修正案:** ドラフト生成プロンプトにTier 1禁止語リスト（「〜したいと考える」連続文末、「関係者」等）を追加。後処理にnormalize_es_draft_single_paragraph()相当のAI臭検出を追加。

#### P2-3. フォールバック発火率の計装

**問題:** `_validate_or_repair_question()` のフォールバック使用率が観測不可能
**修正案:** `candidate_validation_summary` に `fallback_used: true/false`, `fallback_reason: "keyword_missing"` 等を追加し、ログおよびAPIレスポンスで計測可能にする。

#### P2-4. _answer_is_confirmed_for_stage() への否定表現検出

**問題:** 「理由が見つからないため」等の否定的回答がキーワード一致でconfirmed判定
**修正案:** `_answer_signals_unresolved()` / `_answer_signals_contradiction()` の結果を `_answer_is_confirmed_for_stage()` 内でも参照し、否定・未解決シグナルがある場合は False を返す

#### P2-5. eval vs planner 2系統の優先度明確化

**問題:** `ready_for_draft` (eval) と `draftReady` (planner) が独立判定され矛盾しうる
**修正案:** planner_unlockはevalのready_for_draftの前提条件としてのみ機能するよう統合。またはフロントに対して単一の `draft_ready` フィールドのみを返す

#### P2-6. 80文字制限の動的化

**修正案:** `max_length = 80 + len(company_name)` のように企業名長を考慮した動的上限に変更。

### P3: 中期（改善項目）

#### P3-1. 4プロンプトのルール重複解消
4ブロック（grounding/question_design/repetition/slot_completeness）を共通テンプレートに抽出し、各プロンプトから参照する形に変更。保守コスト低減。

#### P3-2. why_nowスロットの検討
deepdiveでは `why_now_strengthening` が存在するが、slot_fillでは独立スロットがない。「なぜ今この会社か」は面接でも頻出する質問であり、7つ目のスロットとして追加を検討。

#### P3-3. 否定表現検出の追加
`_answer_is_confirmed_for_stage()` にキーワードマッチに加え、否定表現（「〜ではない」「〜ありません」）の検出を追加。

#### P3-4. ステージ別キーワード必須チェックの緩和
現在の厳格なキーワード必須チェック（desired_work="入社後"必須等）を、OR条件の拡張またはセマンティック類似度ベースに移行。

#### P3-5. 深掘り名前空間の統一
planner gap_id、API target_area、weakness_tagの3名前空間をenumベースの単一定義に統合し、マッピングテーブルの分散を解消。

---

## 7. リスク分析

### 放置時の具体的ユーザー影響

| リスク | 影響 | 発生確率 | 深刻度 |
|--------|------|---------|--------|
| slot_status_v2読み捨て | filled_weakスロットがfilled_strongに昇格 → 品質不足のドラフト生成許可 | 高 | **致命** |
| LLMサイレント200 OK | ユーザーが「全スロット未入力」表示を見続け、機能が壊れていると認識 → 離脱 | 環境依存 | **致命** |
| Notionドラフトプロンプト未使用 | Notion管理の版管理・A/Bテストがドラフト生成に一切効かない | 確定 | **致命** |
| evaluation会話切り詰め | 8msg切り詰め + conversation_context未注入 → 初期スロットが常にmissing判定 | 高 | **致命** |
| RAGドラフト未注入 | 「御社の事業に惹かれ」等の企業名不問テンプレが生成 → AI生成バレ | 高 | **重大** |
| helper重複ドリフト (~30個) | 片方だけ改修 → 呼出経路で判定結果が異なるサイレントバグ | 中 | **重大** |
| _answer_is_confirmed偽陽性 | 否定表現（「理由が見つからないため」）がキーワード一致でconfirmed判定 | 中 | **重大** |
| eval vs planner不整合 | ready_for_draftとdraftReadyが独立判定され矛盾 → フロントの信頼先で挙動分岐 | 中 | **重大** |
| JST違反 | `motivation.py:2862` で `datetime.utcnow()` 使用 → `draftReadyUnlockedAt` がUTC | 確定 | **中** |
| 過剰フォールバック | 自然な質問が棄却され、テンプレ質問のみ → 会話の画一化 | 中 | **中** |
| AI臭未対応 | 人事がAI生成と見抜き不採用 → ユーザーの就活に実害 | 中 | **重大** |

---

## 8. 総合所見

志望動機作成機能は、6スロット構造化ヒアリング + 品質ゲート二重構造 + 因果ギャップ検出という、就活AI市場で最も構造化されたアーキテクチャを持つ。設計思想はES添削機能と同水準で高度。

しかし、実装レベルでは以下の構造的問題が品質を大きく毀損しており、**設計の意図が実装に到達していない**状態にある:

1. **4-state設計が3-stateに劣化** — slot_status_v2の読み捨てにより、filled_weak/filled_strongの区別が事実上機能しない
2. **Notion管理がドラフト生成に到達しない** — Notion版ドラフトプロンプトがデッドコード。A/Bテスト・版管理の恩恵がない
3. **RAG投資が未回収** — 企業情報のRAG取得パイプラインは構築済みだが、最終出力（ドラフト）への構造的注入がない（`has_rag=False`ハードコード）
4. **evaluation精度の構造的限界** — 8メッセージ切り詰め + conversation_context未注入により、初期スロットが常にmissing判定されるリスク
5. **エラー処理の非対称性** — evaluate=200 OK, next-question=503という非一貫なエラーハンドリング
6. **コード重複によるドリフトリスク** — 3,784行のmotivation.pyに約30個の重複定義が散在し、改修時のサイレントドリフトが不可避

**致命的/重大の発見件数:** P1（即時対応）6件、P2（次スプリント）6件、P3（中期）5件

P1の6項目のうち、slot_status_v2修正（1行）、evaluation conversation_context注入（テンプレ追加）、JST修正（1行）は極めて少量のコード変更で修正可能。Notionドラフトプロンプト接続と重複関数統合はやや大きいがリスクは低い。即時対応を強く推奨する。

P2のRAGグラウンディング有効化とAI臭抑制は、ドラフト品質を市場競争力のあるレベルに引き上げるために不可欠。就活塾との最大のギャップは「意味検証の精度」と「ES文章レベルのフィードバック」であり、後者はES添削機能との統合で実現可能な範囲にある。

**次回監査推奨時期:** P1修正後、本番/staging環境でのLLM呼出成功を確認した上で、ゴールドセット10ケースによる再検証を実施（推奨: 2026-04-25頃）。
