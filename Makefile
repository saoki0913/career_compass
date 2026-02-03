.PHONY: dev build start lint test test-ui db-push db-generate db-studio clean \
	up down restart backend-test backend-test-search backend-lint backend-format logs check deps reset-db seed \
	db-migrate db-status db-check db-drop db-introspect db-fresh backend-install \
	backend-test-mappings backend-test-subsidiary backend-test-company \
	backend-test-comprehensive backend-test-comprehensive-quick backend-test-comprehensive-stats \
	backend-test-content-type backend-test-content-type-unit backend-test-content-type-integration \
	backend-test-es-char

# ===========================================
# フロントエンド (Next.js)
# ===========================================

## 開発サーバーを起動（ホットリロード有効）
dev:
	npm run dev

## 本番用にビルド
build:
	npm run build

## 本番サーバーを起動（要: make build）
start:
	npm run start

## ESLintでコードチェック
lint:
	npm run lint

# ===========================================
# E2Eテスト (Playwright)
# ===========================================

## Playwrightテストを実行（ヘッドレス）
test:
	npx playwright test

## PlaywrightのUIモードでテスト（インタラクティブ）
test-ui:
	npx playwright test --ui

## ブラウザを表示してテスト実行
test-headed:
	npx playwright test --headed

# ===========================================
# データベース (Drizzle + Turso)
# ===========================================

# 環境変数を.env.localから読み込む
ifneq (,$(wildcard .env.local))
    include .env.local
    export
endif

## スキーマをDBに反映（開発時によく使う）
db-push:
	@echo "Pushing schema to database..."
	npx drizzle-kit push

## マイグレーションファイルを生成
db-generate:
	@echo "Generating migration files..."
	npx drizzle-kit generate

## マイグレーションを実行
db-migrate:
	@echo "Running migrations..."
	npx drizzle-kit migrate

## Drizzle Studioを開く（DBをGUIで確認・編集）
db-studio:
	@echo "Opening Drizzle Studio..."
	npx drizzle-kit studio

## 未適用のスキーマ変更を確認
db-status:
	@echo "=== Database Status ==="
	@echo "Checking for pending schema changes..."
	npx drizzle-kit check || echo "No pending changes or check not available"

## スキーマ変更のドライラン（実際には適用しない）
db-check:
	@echo "=== Dry Run: Schema Changes ==="
	npx drizzle-kit push --dry-run 2>/dev/null || npx drizzle-kit generate --dry-run 2>/dev/null || echo "Dry run not supported in this version"

## 既存DBからスキーマを逆生成
db-introspect:
	@echo "Introspecting database schema..."
	npx drizzle-kit introspect

## 全テーブルを削除（⚠️ 危険：確認プロンプトあり）
db-drop:
	@echo "WARNING: This will drop all tables!"
	@read -p "Are you sure? (y/N): " confirm && [ "$$confirm" = "y" ] || exit 1
	@echo "Dropping tables..."
	npx drizzle-kit drop || echo "Drop command not available. Use reset-db instead."

## DBを完全リセットしてシードデータ投入
db-fresh: reset-db seed
	@echo "Database fresh install complete!"


# ===========================================
# 開発便利コマンド
# ===========================================

## バックエンドサーバーを起動（FastAPI）
up:
	@echo "Starting backend server..."
	cd backend && uvicorn app.main:app --reload --port 8000

## バックエンドサーバーを停止
down:
	@echo "Stopping backend server..."
	@-pkill -f "uvicorn app.main:app" 2>/dev/null || echo "No backend process found"

## バックエンドサーバーを再起動
restart: down
	@sleep 1
	@$(MAKE) up

## Python依存パッケージをインストール
backend-install:
	cd backend && pip install -r requirements.txt

# ===========================================
# バックエンドテスト (pytest)
# ===========================================

## 全バックエンドテストを実行
backend-test:
	cd backend && python -m pytest tests/ -v

## 検索精度テストを実行
backend-test-search:
	cd backend && python -m pytest tests/test_search_precision.py -v

## 企業マッピングテスト（1,613社分）
backend-test-mappings:
	@echo "Testing all 1,613 company mappings..."
	cd backend && python -m pytest tests/test_company_mappings.py -v

## 子会社・親会社判定テスト
backend-test-subsidiary:
	@echo "Testing subsidiary/parent detection..."
	cd backend && python -m pytest tests/test_subsidiary_detection.py -v

## 企業関連の全テストを実行
backend-test-company:
	@echo "Running all company-related tests..."
	cd backend && python -m pytest tests/test_company_mappings.py tests/test_subsidiary_detection.py -v

## 全企業包括的検索テスト（並列実行、約8-10分、推奨）
backend-test-comprehensive:
	@echo "Running full comprehensive search test (並列4ワーカー, 約8-10分)..."
	cd backend && python -m pytest tests/test_comprehensive_search.py -v -n 4

## 全企業包括的検索テスト（順次実行、約30分）
backend-test-comprehensive-seq:
	@echo "Running full comprehensive search test (順次実行, 約30分)..."
	cd backend && python -m pytest tests/test_comprehensive_search.py -v -s

## 包括テスト（クイック版：関係性検証のみ、API呼び出しなし）
backend-test-comprehensive-quick:
	@echo "Running quick comprehensive test (関係性検証のみ, API呼び出しなし)..."
	cd backend && python -m pytest tests/test_comprehensive_search.py -v -k "TestCompanyRelationships"

## 統計テストのみ実行
backend-test-comprehensive-stats:
	@echo "Running statistics tests only..."
	cd backend && python -m pytest tests/test_comprehensive_search.py -v -s -k "TestSearchStatistics"

## 統合テストのみ（実API使用）
backend-test-comprehensive-integration:
	@echo "Running integration tests only (実API呼び出し)..."
	cd backend && python -m pytest tests/test_comprehensive_search.py -v -s -m integration

## コンテンツタイプ検索テスト（全て）
backend-test-content-type:
	@echo "Running content type search tests..."
	cd backend && python -m pytest tests/test_content_type_search.py -v

## コンテンツタイプ単体テストのみ
backend-test-content-type-unit:
	@echo "Running content type unit tests only..."
	cd backend && python -m pytest tests/test_content_type_search.py -v -k "not Integration"

## コンテンツタイプ統合テスト（ネットワーク必要）
backend-test-content-type-integration:
	@echo "Running content type integration tests (requires network)..."
	cd backend && python -m pytest tests/test_content_type_search.py -v -m integration

## ES文字数制御テスト（添削結果の文字数が指定範囲内か検証）
backend-test-es-char:
	@echo "Running ES character control tests..."
	cd backend && python -m pytest tests/test_es_char_control.py -v

## Pythonコードをリント（ruff/flake8）
backend-lint:
	cd backend && python -m ruff check . || python -m flake8 .

## Pythonコードを自動フォーマット（black）
backend-format:
	cd backend && python -m black .

# ===========================================
# ログ・デバッグ
# ===========================================

## バックエンドログをリアルタイム表示
logs:
	@echo "Backend logs (tail -f)..."
	@tail -f backend/logs/*.log 2>/dev/null || echo "No log files found. Backend may not be logging to file."

# ===========================================
# 環境チェック
# ===========================================

## 開発環境の状態を確認
check:
	@echo "=== Environment Check ==="
	@echo ""
	@echo "Node.js:" && node --version || echo "Node.js not installed"
	@echo "npm:" && npm --version || echo "npm not installed"
	@echo "Python:" && python3 --version || echo "Python not installed"
	@echo "pip:" && pip3 --version || echo "pip not installed"
	@echo ""
	@echo "=== Dependencies ==="
	@echo "Frontend: " && (test -d node_modules && echo "installed" || echo "not installed - run 'make deps'")
	@echo "Backend: " && (test -d backend/.venv && echo "venv exists" || echo "venv not found")
	@echo ""
	@echo "=== Database ==="
	@echo "Turso CLI:" && (command -v turso >/dev/null && echo "installed" || echo "not installed")
	@echo ""
	@echo "=== Services ==="
	@echo "Backend (port 8000):" && (lsof -i :8000 >/dev/null 2>&1 && echo "running" || echo "not running")
	@echo "Frontend (port 3000):" && (lsof -i :3000 >/dev/null 2>&1 && echo "running" || echo "not running")

## 全依存パッケージをインストール（Frontend + Backend）
deps:
	@echo "Installing all dependencies..."
	npm install
	cd backend && pip install -r requirements.txt
	@echo "Dependencies installed!"

# ===========================================
# 開発ワークフロー
# ===========================================

## DBをリセット（強制push）
reset-db:
	@echo "Resetting database..."
	npx drizzle-kit push --force
	@echo "Database reset complete!"

## シードデータを投入（要: フロントエンド起動中）
seed:
	@echo "Seeding database..."
	curl -X POST http://localhost:3000/api/templates/seed || echo "Failed to seed. Is the frontend server running?"
	@echo "Seed complete!"

# ===========================================
# ユーティリティ
# ===========================================

## ビルド成果物を削除（.next, node_modules）
clean:
	rm -rf .next node_modules

## npm パッケージをインストール
install:
	npm install

## 初期セットアップ（install + db-push）
setup: install db-push
	@echo "Setup complete!"

# ===========================================
# ヘルプ
# ===========================================

## 使用可能なコマンド一覧を表示
help:
	@echo "Career Compass (ウカルン) - Makefile コマンド一覧"
	@echo ""
	@echo "  📦 開発サーバー:"
	@echo "    make dev          - フロントエンド開発サーバー起動"
	@echo "    make up           - バックエンドサーバー起動"
	@echo "    make down         - バックエンドサーバー停止"
	@echo "    make restart      - バックエンドサーバー再起動"
	@echo ""
	@echo "  🏗️  ビルド:"
	@echo "    make build        - 本番用ビルド"
	@echo "    make start        - 本番サーバー起動"
	@echo "    make lint         - ESLintチェック"
	@echo ""
	@echo "  🐍 バックエンド (FastAPI):"
	@echo "    make backend-install - Python依存パッケージインストール"
	@echo "    make backend-test    - 全テスト実行"
	@echo "    make backend-test-search - 検索精度テスト"
	@echo "    make backend-test-mappings - 企業マッピングテスト"
	@echo "    make backend-test-comprehensive - 全企業検索テスト（約30分）"
	@echo "    make backend-test-comprehensive-quick - クイック検索テスト"
	@echo "    make backend-lint    - Pythonリント"
	@echo "    make backend-format  - Python自動フォーマット"
	@echo ""
	@echo "  🧪 E2Eテスト (Playwright):"
	@echo "    make test         - ヘッドレスでテスト実行"
	@echo "    make test-ui      - UIモードでテスト"
	@echo "    make test-headed  - ブラウザ表示でテスト"
	@echo ""
	@echo "  🗄️  データベース:"
	@echo "    make db-push      - スキーマをDBに反映"
	@echo "    make db-generate  - マイグレーションファイル生成"
	@echo "    make db-migrate   - マイグレーション実行"
	@echo "    make db-studio    - Drizzle Studio起動"
	@echo "    make db-status    - 未適用変更を確認"
	@echo "    make db-fresh     - DBリセット＋シード投入"
	@echo "    make reset-db     - DBリセット（強制push）"
	@echo "    make seed         - シードデータ投入"
	@echo ""
	@echo "  📋 ログ・デバッグ:"
	@echo "    make logs         - バックエンドログ表示"
	@echo ""
	@echo "  🔧 環境・セットアップ:"
	@echo "    make check        - 開発環境の状態確認"
	@echo "    make deps         - 全依存パッケージインストール"
	@echo "    make setup        - 初期セットアップ"
	@echo "    make clean        - ビルド成果物削除"
	@echo ""
