---
description: タスク完了後にdevelopブランチへ変更を論理グループ別に分割コミットしてリモートにプッシュする。
user-invocable: true
---

# Commit to Develop (Multi-Commit)

タスク完了後にdevelopブランチへ変更を**論理的なグループ別に分割コミット**し、リモートにプッシュするスキル。
1つの巨大コミットではなく、意味のある単位で複数コミットを作成する。

## 引数: $ARGUMENTS

- **コミットメッセージ**: `/commit-develop "機能を追加"` - 全変更を指定メッセージで単一コミット（分割しない）
- **引数なし**: 対話的に変更を分析し、論理グループ別に分割コミット

**引数ありの場合は従来どおり単一コミットを行い、以下の分割フローはスキップする。**

---

## 処理フロー

### 1. ブランチ確認と安全チェック

```bash
git branch --show-current
```

- `develop`ブランチにいない場合は警告を表示し、ユーザーに確認
- 必要であれば`develop`にチェックアウト

**セキュリティチェック**:
変更ファイル一覧から以下のパターンを検出し、該当ファイルがあれば**警告して除外を提案**:
- `.env`, `.env.*`
- `credentials.json`, `service-account*.json`
- `*secret*`, `*token*` (設定ファイル以外)
- `*.pem`, `*.key`

### 2. 全変更内容の把握

```bash
git status --short
git diff --stat
git diff --staged --stat
```

- ステージング済みの変更がある場合は一旦解除する:
  ```bash
  git reset HEAD
  ```
- 変更がない場合は「コミットする変更がありません」と通知して終了

**全変更ファイルのリストとdiffを読み取る。** 各ファイルについて以下を把握する:
- ファイルパス
- 変更種別（M: 変更、A/??: 新規、D: 削除、R: リネーム）
- 差分の概要（何が変わったか）

### 3. 少量変更の判定

**変更ファイルが3つ以下**の場合:
- 分割せず**単一コミット**として処理する（ステップ6へスキップ）
- ただし、明らかに無関係な変更（例: ドキュメント修正 + バグ修正）が混在する場合は分割してもよい

### 4. 論理グループへの分類

全ファイルのdiffを読み取った上で、以下の手順で論理グループに分類する。

#### 4a. 機能ドメインの特定

各ファイルがどの機能ドメインに属するか判定する:

| ドメイン | ファイルパターン |
|---------|----------------|
| **ガクチカ** | `**/gakuchika/**`, `backend/app/routers/gakuchika.py` |
| **ES添削** | `**/es/**`, `**/documents/**`, `backend/app/routers/es_review.py`, `backend/app/prompts/es_templates.py` |
| **志望動機** | `**/motivation/**`, `backend/app/routers/motivation.py` |
| **企業検索** | `**/companies/**`, `**/company_info/**`, `backend/app/routers/company_info.py`, `backend/app/utils/web_search.py` |
| **RAG基盤** | `backend/app/utils/hybrid_search.py`, `backend/app/utils/vector_store.py`, `backend/app/utils/bm25_store.py`, `backend/app/utils/reranker.py`, `backend/app/utils/content_*.py` |
| **決済/クレジット** | `**/stripe/**`, `**/credits/**`, `**/pricing/**`, `**/webhooks/stripe/**` |
| **認証** | `**/auth/**`, `src/middleware.ts`, `src/proxy.ts` |
| **カレンダー** | `**/calendar/**`, `**/deadlines/**` |
| **ダッシュボード** | `**/dashboard/**` |
| **共通UI** | `src/components/ui/**`, `src/hooks/**` |
| **LLM基盤** | `backend/app/utils/llm.py`, `backend/app/prompts/**` (es_templates以外) |
| **設定/インフラ** | `Makefile`, `package.json`, `tailwind.config.*`, `tsconfig.*`, `backend/app/config.py`, `backend/app/main.py`, `.kiro/steering/**` |
| **ドキュメント** | `docs/**`, `README.md`, `CLAUDE.md` |
| **データ** | `backend/data/**` |
| **テスト** | `**/tests/**`, `**/*.test.*`, `**/*.spec.*` |

#### 4b. 意味的グルーピング

ファイルパターンだけでなく、**diffの内容を読んで意味的に関連するものをグループ化**する:

1. **クロススタック結合**: 同じ機能のフロントエンド（API route + page + component）とバックエンド（router + util）は同一グループにする
   - 例: `src/app/api/gakuchika/` の変更 + `backend/app/routers/gakuchika.py` の変更 → 「ガクチカ」グループ
2. **共有ユーティリティの帰属**: `llm.py`や`vector_store.py`の変更が特定機能のために行われた場合（diffの内容から判断）、その機能グループに含める。複数機能に影響する汎用的な変更の場合は独立グループにする
3. **データファイルの帰属**: `backend/data/chroma/**`や`backend/data/bm25/**`の変更は、同時に変更されたRAG/検索関連のグループに含める。単独の場合は「data」グループ
4. **ドキュメントの帰属**: 特定機能のドキュメント（例: `docs/features/ES_REVIEW.md`）がその機能のコード変更と同時に存在する場合、同一グループに含める。ドキュメントのみの変更は「docs」グループ

#### 4c. 変更種別（prefix）の決定

各グループについて、diffの内容からprefixを決定する:

| Prefix | 判定基準 |
|--------|---------|
| `feat` | 新しいファイルの追加、新しいAPIエンドポイント、新しいUI要素 |
| `fix` | バグ修正、エラーハンドリング追加、既存動作の修正 |
| `refactor` | 動作を変えずにコードを整理、ファイル分割、リネーム |
| `perf` | パフォーマンス改善（並列化、キャッシュ、最適化） |
| `style` | フォーマット変更のみ、UIスタイル微調整 |
| `docs` | ドキュメントのみの変更 |
| `test` | テストの追加・修正のみ |
| `chore` | 設定ファイル、ビルド設定、依存関係更新 |
| `security` | セキュリティ脆弱性の修正、入力検証追加 |

#### 4d. グループ統合ルール

分割が細かすぎないよう、以下のルールで統合する:

- **1ファイルのみのグループ**は、最も関連性の高い他グループに統合する（ただし、意味的に独立した修正は1ファイルでも単独コミットOK）
- **同一ドメイン・同一prefix**のグループは統合する
- **最終的なグループ数は2~6個**を目安とする（7個以上になる場合は関連グループを統合）

### 5. グルーピング計画の提示と承認

以下のフォーマットでユーザーに提示する:

```
## コミット分割計画

### コミット 1/N: [prefix] 日本語の説明
対象ファイル:
  - path/to/file1 (変更種別)
  - path/to/file2 (新規)

### コミット 2/N: [prefix] 日本語の説明
対象ファイル:
  - path/to/file3 (変更種別)
  - path/to/file4 (削除)

...

---
実行順序: コミット1 → コミット2 → ... → git push origin develop

この計画で実行しますか？
- **y**: このまま実行
- **修正指示**: グループの統合・分割・ファイル移動を指示（例: 「コミット1と2を統合して」「file3はコミット1に移動して」）
- **n**: 中止
```

ユーザーの修正指示があれば計画を調整し、再度提示する。

### 6. コミットの実行

承認後、計画された順序でコミットを実行する。

**実行順序の優先度**（計画時にこの順序で並べる）:
1. `chore` / `security` - インフラ・設定・セキュリティ
2. `refactor` - リファクタリング（他の変更の前提となることが多い）
3. `feat` / `fix` / `perf` - 機能変更（バックエンド → フロントエンドの順）
4. `style` / `test` - スタイル・テスト
5. `docs` - ドキュメント

各コミットについて:

```bash
# 1. 対象ファイルのみステージング
git add path/to/file1 path/to/file2 ...

# 2. コミット作成
git commit -m "[prefix] 日本語の説明"
```

**コミットメッセージの形式**:
- 1行目: `[prefix] 変更内容の簡潔な説明（日本語）`
- 説明は具体的に書く。良い例: `[feat] ガクチカ会話ストリーミング対応`、悪い例: `[feat] ガクチカ更新`
- 複数の関連変更がある場合: `[feat] ガクチカ会話ストリーミング対応・STAR進捗改善`
- 変更が多い場合のみ本文を追加（箇条書きで主要変更を列挙）

**データファイルの取り扱い**:
- `backend/data/chroma/**` と `backend/data/bm25/**` はバイナリ/大容量ファイル
- 関連する機能コミットに含めるか、最後にまとめて `[chore] データファイル更新` としてコミット
- `.gitignore`されていないか確認する

### 7. プッシュ

全コミット完了後、一括でプッシュする:

```bash
git push origin develop
```

### 8. 結果の報告

以下を報告する:

```
## コミット完了

### 作成されたコミット:
1. <hash> [prefix] 説明 (N files)
2. <hash> [prefix] 説明 (N files)
3. <hash> [prefix] 説明 (N files)

### プッシュ: origin/develop
### 合計: N コミット, M ファイル変更
```

---

## 分割例

### 例1: 大規模機能開発後

変更内容:
- ガクチカ: 新API + ページ更新 + コンポーネント追加
- ES添削: UIコンポーネント修正
- ドキュメント: 3ファイル更新
- Makefile: コマンド追加

分割結果:
1. `[chore] Makefileにdev-allコマンド追加` (1 file)
2. `[feat] ガクチカ会話ストリーミング・STAR進捗改善` (8 files)
3. `[fix] ES添削ReviewPanel表示崩れ修正` (2 files)
4. `[docs] ARCHITECTURE・GAKUCHIKA_DEEP_DIVE更新` (3 files)

### 例2: セキュリティ修正 + リファクタ

変更内容:
- 入力検証追加（backend 3ファイル + frontend 2ファイル）
- プロンプト分離リファクタ（backend 6ファイル）

分割結果:
1. `[security] API入力検証・XSS対策追加` (5 files)
2. `[refactor] プロンプトをルーターから専用モジュールに分離` (6 files)

### 例3: 少量変更

変更内容:
- README.md更新
- 1つのバグ修正

分割結果:
→ 3ファイル以下のため単一コミット: `[fix] RAGクエリ展開修正・README更新`

---

## 注意事項

- **機密情報チェック**: `.env`、`credentials`等がステージングされていないか必ず確認
- **コンフリクト対応**: コンフリクトが発生した場合はユーザーに報告して手動解決を促す
- **`main`ブランチ禁止**: `main`ブランチへの直接コミットは禁止（警告を表示）
- **バイナリファイル**: ChromaDB/BM25のバイナリファイルは差分表示できないため、関連コミットに含めるか最後にまとめる
- **失敗時のリカバリ**: コミット途中で失敗した場合、すでに作成されたコミットの状態を報告し、残りの処理方法をユーザーに確認する
