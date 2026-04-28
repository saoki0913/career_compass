---
description: Codex CLI に GPT Image 2 での高品質画像生成を委譲する
---

Codex CLI (GPT-5.5) に $imagegen (GPT Image 2) を使った画像生成を委譲する。
品質ガイドラインは `.codex/skills/imagegen/` と awesome-gpt-image-2 から統合済み。

手順:
1. ユーザーから画像の要件を受け取る（用途、サイズ、雰囲気、配置場所）
2. Use-Case Taxonomy で分類:
   - ui-mockup / product-mockup / stylized-concept / infographic-diagram / illustration-story / logo-brand
   - Edit: precise-object-edit / background-extraction / style-transfer
3. DESIGN.md と docs/marketing/LP.md から就活Pass デザインシステム仕様を抽出
4. 既存アセット参照:
   - public/marketing/screenshots/ (5 production screenshots)
   - public/marketing/LP/shukatsupass_separated_assets/ (158 reference assets)
5. Prompt Augmentation Rules に従い構造化プロンプトを構築:
   ```
   Use case: <taxonomy slug>
   Asset type: <where used>
   Primary request: <description>
   Style/medium: <...>
   Composition/framing: <...>
   Color palette: navy #000666, red #B7131A, surface #f6f9fc
   Avoid: stock-photo vibe; cheesy lens flare; oversaturated neon; clutter
   ```
6. コンテキストファイルを /tmp/codex-ctx-<timestamp>.md に書き出す（umask 077）
7. wrapper を実行: bash scripts/codex/delegate.sh imagegen --context-file <path>
8. .claude/state/codex-handoffs/ の最新 imagegen ディレクトリから結果を読み取る:
   a. meta.json の status と image_count で成否を判定
   b. images.json で生成されたファイルパスを確認
   c. result.md で使用プロンプト全文とデザイン判断を確認
9. 生成された画像を Read で視覚確認する（Claude は画像ファイルを読める）
10. AskUserQuestion でユーザーに提示:
    - 承認 → LP 正式アセットへの昇格検討
    - リテイク → prompt の targeted single change で再生成
    - 修正 → 具体的なフィードバックを次のコンテキストに反映

反復ルール（imagegen skill ベスト・プラクティス）:
- 一度に一つの変更だけ行う
- Avoid 行と invariants は毎回再指定する（ドリフト防止）
- quality=high はテキスト重視 or ディテール重要時のみ

Fallback パス:
- $imagegen が利用不可の場合: ~/.codex/skills/imagegen/scripts/image_gen.py CLI を直接使用（OPENAI_API_KEY 必要）
- 参照: ~/.codex/skills/imagegen/references/cli.md

注意:
- Codex は workspace-write sandbox で実行。post-run で `public/generated_images/`, `public/marketing/`, `.codex/cache/`, `.codex/tmp/` 配下の画像候補を収集し、正式アセット化は Claude の視覚確認とユーザー承認後に行う
- LP 正式アセットは public/marketing/screenshots/ + src/lib/marketing/landing-media.ts が SSOT。generated_images/ は作業バッファ
- 日本語テキストは品質不安定。テキストなし or 英語テキストを推奨
