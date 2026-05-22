# プロンプトレビュー用スナップショット

このディレクトリは、人間が就活Pass の AI 機能で使うプロンプトを読み、レビューし、改善方針を考えるための資料置き場です。**runtime 非連携**であり、ここを変更してもアプリ挙動は変わりません。

> runtime_linkage: forbidden
> may_be_imported_by_runtime: false

## 重要な前提

- ここにある文書は、アプリ内 LLM プロンプトの正本ではありません。
- このディレクトリを変更しても、アプリの挙動、FastAPI のプロンプト、LLM 呼び出し、テスト harness には直接影響しません。
- アプリで実際に使われるプロンプトは `backend/app/prompts/**` と関連 service / router 実装を確認してください。
- このディレクトリの文書をもとにアプリ内プロンプトを改善する場合は、別タスクとして実装ファイルを明示的に変更します。
- `docs/prompts/**` を runtime から import / read / codegen してはいけません。

## コピー禁止

以下は `docs/prompts/**` に貼り付けてはいけません。

- secrets、API key、OAuth client secret、Stripe webhook secret、Supabase service role key
- `.env` 実値、DB URL、session token、CSRF token、cookie、`guest_device_token`、`x-device-token`
- 実ユーザーの ES、プロフィール、会話ログ、メール、電話番号、住所、学生番号などの PII
- `docs/reference/es-review/**` の参考 ES 本文、特徴的な言い回し、細かな構成順
- `backend/tests/output/**` や live test output の実例文
- 著作権保護された ES 例文、企業資料、書籍、ブログ、競合サービスの出力全文

## 保存してよいもの

- 実装内に固定されている prompt 文字列、連結順、動的 placeholder
- JSON schema / enum / output contract の説明
- provider 追記、retry 追記、streaming schema hints などの実行時追記条件
- レビュー観点、成功基準、捏造・漏洩・AI 臭チェック
- 新規に作った短い合成例。ただし実在ユーザーや参考 ES に似せないこと

## 読み方

- `es-review/`: ES 添削の評価ドキュメントです。詳細は `es-review/README.md` を参照してください。
- `es-review/templates/`: ES 添削の設問タイプ別 prompt snapshot です。
- `es-review/support/`: ES 添削の共通 rewrite / fallback rewrite / draft / explanation などの prompt snapshot です。
- `gakuchika/`: ガクチカ作成・深掘りの prompt snapshot です。
- `motivation/`: 志望動機作成の prompt snapshot です。
- `interview/`: 模擬面接の prompt snapshot です。
- `company-info/`: 企業情報・選考スケジュール抽出の prompt snapshot です。
- `rag-search/`: RAG 検索補助の prompt snapshot です。
- `common/`: JSON 修復、provider 追記、安全ルールなど共通 prompt surface です。

## 各文書の標準構成

各文書は、可能な限り次の構成にそろえます。

- `Runtime Source`: 正本ファイル、builder、caller、feature 名
- `System Prompt`: 実装内の固定 system prompt または連結順
- `User Message`: 実装内の user message template
- `Dynamic Inputs`: placeholder と入力元
- `Output Contract`: JSON schema / text-only / Markdown など
- `Runtime Additions`: retry hints、provider append、streaming schema hints など
- `Review Criteria`: 人間レビュー時の確認観点
- `Related Eval References`: 後続で runtime prompt を改善する時のテスト候補
