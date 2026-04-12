.PHONY: dev build start lint test test-ui test-ui-preflight test-ui-review test-major test-major-guest test-major-user test-major-live test-auth test-regression ai-live-local db-push db-generate db-studio clean \
	up down restart backend-test backend-test-search backend-lint backend-format logs check deps reset-db seed \
	backend-deadcode frontend-deadcode deadcode \
	db-migrate db-status db-check db-drop db-introspect db-fresh backend-install \
	backend-test-mappings backend-test-subsidiary backend-test-company \
	backend-test-comprehensive backend-test-comprehensive-quick backend-test-comprehensive-stats \
	backend-test-content-type backend-test-content-type-unit backend-test-content-type-integration \
	backend-test-es-char backend-test-live-search backend-test-live-search-hybrid backend-test-live-search-legacy \
	backend-test-live-es-review \
	deploy deploy-stage-all deploy-check deploy-migrate ops-status ops-auth-check ops-release-check \
	db-up db-down db-restart db-down-clean db-local-status \
	supabase-start supabase-stop supabase-stop-clean supabase-status

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

## UI実装前の preflight（例: make test-ui-preflight ROUTE=/pricing SURFACE=marketing AUTH=guest）
SURFACE ?=
test-ui-preflight:
	npm run ui:preflight -- $(ROUTE) --surface=$(SURFACE) $(if $(AUTH),--auth=$(AUTH),)

## UI変更後の対象ページ確認（例: make test-ui-review ROUTE=/pricing AUTH=guest）
ROUTE ?= /
AUTH ?=
test-ui-review:
	npm run test:ui:review -- $(ROUTE) $(if $(AUTH),--auth=$(AUTH),)

## 主要機能の横断 Playwright テスト
test-major:
	npm run test:e2e:major

## guest 主要機能の横断 Playwright テスト
test-major-guest:
	npm run test:e2e:major:guest

## logged-in 主要機能の横断 Playwright テスト
test-major-user:
	npm run test:e2e:major:user

## FastAPI を含む AI live major の Playwright テスト
test-major-live:
	npm run test:e2e:major:live

## localhost を対象に 6機能の AI Live を一括実行（既定: SUITE=extended）
SUITE ?= extended
ai-live-local:
	SUITE=$(SUITE) OUTPUT_DIR=$(OUTPUT_DIR) bash scripts/dev/run-ai-live-local.sh

## 認証・制限契約の Playwright テスト
test-auth:
	npm run test:e2e:auth

## focused regression の Playwright テスト
test-regression:
	npm run test:e2e:regression

# ===========================================
# データベース (Drizzle + Supabase/PostgreSQL)
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

## ローカル DB サーバー起動（Supabase on Docker。Docker Desktop 必須。詳細: docs/setup/DB_SUPABASE.md）
db-up:
	@command -v supabase >/dev/null 2>&1 || { echo "Supabase CLI が見つかりません: brew install supabase/tap/supabase"; exit 1; }
	supabase start

## ローカル DB サーバー停止（Postgres 等のデータは Docker ボリュームに保持）
db-down:
	@command -v supabase >/dev/null 2>&1 || { echo "Supabase CLI が見つかりません: brew install supabase/tap/supabase"; exit 1; }
	supabase stop

## ローカル DB サーバー再起動（db-down のあと db-up）
db-restart:
	@$(MAKE) db-down
	@$(MAKE) db-up

## ローカル DB 停止＋ローカル DB データ削除（supabase stop --no-backup）
db-down-clean:
	@command -v supabase >/dev/null 2>&1 || { echo "Supabase CLI が見つかりません: brew install supabase/tap/supabase"; exit 1; }
	supabase stop --no-backup

## ローカル Supabase / Postgres の稼働状況（supabase status）
db-local-status:
	@command -v supabase >/dev/null 2>&1 || { echo "Supabase CLI が見つかりません: brew install supabase/tap/supabase"; exit 1; }
	supabase status

## 互換エイリアス（make db-up と同じ）
supabase-start: db-up
supabase-stop: db-down
supabase-stop-clean: db-down-clean
supabase-status: db-local-status

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

LIVE_SEARCH_MODES ?= hybrid,legacy
LIVE_SEARCH_CACHE_MODE ?= bypass
LIVE_SEARCH_SAMPLE_SEED ?= 15
LIVE_SEARCH_SAMPLE_SIZE ?= 350
LIVE_SEARCH_MAX_RESULTS ?= 5
LIVE_SEARCH_TOKENS_PER_SECOND ?= 10
LIVE_SEARCH_MAX_TOKENS ?= 1.0
LIVE_SEARCH_PASS_TOP_N ?= 5
LIVE_SEARCH_PER_INDUSTRY_MIN ?= 1
LIVE_SEARCH_FAIL_ON_LOW_RATE ?= 0
LIVE_SEARCH_MIN_SUCCESS_RATE ?= 0.95
LIVE_SEARCH_MIN_RECRUITMENT_RATE ?= 0.95
LIVE_SEARCH_MIN_CORPORATE_RATE ?= 0.94
LIVE_SEARCH_MIN_CANDIDATE_MRR ?= 0.75
LIVE_SEARCH_MIN_NDCG5 ?= 0.80
LIVE_SEARCH_MIN_MEAN_GRADE_SCORE ?= 0.85
LIVE_SEARCH_HARD_MAX_OFFICIAL_RANK ?= 3
LIVE_SEARCH_HARD_MIN_METADATA_SCORE ?= 0.85
LIVE_SEARCH_USE_CURATED ?= 1
LIVE_SEARCH_FAIL_ON_REGRESSION ?= 0
BASELINE_SAVE ?= 0
BASELINE_AUTO_PROMOTE ?= 0
LIVE_ES_REVIEW_CASE_SET ?= extended
# 空 = Python 既定（smoke は mini、extended は 4 モデル）
LIVE_ES_REVIEW_PROVIDERS ?=gpt-5.4-mini,gemini-3.1-pro-preview,gpt-5.4,claude-sonnet
LIVE_ES_REVIEW_FAIL_ON_MISSING_KEYS ?= 0
LIVE_ES_REVIEW_OUTPUT_DIR ?= backend/tests/output
LIVE_ES_REVIEW_ENABLE_JUDGE ?= 1
LIVE_ES_REVIEW_REQUIRE_JUDGE_PASS ?= 0
LIVE_ES_REVIEW_COLLECT_ONLY ?= 0
LIVE_ES_REVIEW_JUDGE_MODEL ?= gpt-5.4-mini
LIVE_ES_REVIEW_CASE_FILTER ?=

## 全バックエンドテストを実行
backend-test:
	cd backend && python -m pytest tests/ -v

## Live検索レポートテスト（Legacy + Hybrid, ネットワーク必須）
## 350社キュレーションリスト × 2モード × 11検索種 = 7,700検索
## 所要時間目安: ~2時間 (1 req/s)、TOKENS_PER_SECOND=10 で ~15分
backend-test-live-search:
	@echo "Running live search report test (Legacy + Hybrid; requires network; may take a while)..."
	@echo "  Companies: $(LIVE_SEARCH_SAMPLE_SIZE), Curated: $(LIVE_SEARCH_USE_CURATED), Modes: $(LIVE_SEARCH_MODES)"
	@echo "  Rate: $(LIVE_SEARCH_TOKENS_PER_SECOND) req/s, Cache: $(LIVE_SEARCH_CACHE_MODE)"
	@echo "  Baseline: save=$(BASELINE_SAVE), auto_promote=$(BASELINE_AUTO_PROMOTE), fail_on_regression=$(LIVE_SEARCH_FAIL_ON_REGRESSION)"
	cd backend && \
	RUN_LIVE_SEARCH=1 \
	LIVE_SEARCH_MODES="$(LIVE_SEARCH_MODES)" \
	LIVE_SEARCH_CACHE_MODE="$(LIVE_SEARCH_CACHE_MODE)" \
	LIVE_SEARCH_USE_CURATED="$(LIVE_SEARCH_USE_CURATED)" \
	LIVE_SEARCH_SAMPLE_SEED="$(LIVE_SEARCH_SAMPLE_SEED)" \
	LIVE_SEARCH_SAMPLE_SIZE="$(LIVE_SEARCH_SAMPLE_SIZE)" \
	LIVE_SEARCH_MAX_RESULTS="$(LIVE_SEARCH_MAX_RESULTS)" \
	LIVE_SEARCH_TOKENS_PER_SECOND="$(LIVE_SEARCH_TOKENS_PER_SECOND)" \
	LIVE_SEARCH_MAX_TOKENS="$(LIVE_SEARCH_MAX_TOKENS)" \
	LIVE_SEARCH_PASS_TOP_N="$(LIVE_SEARCH_PASS_TOP_N)" \
	LIVE_SEARCH_PER_INDUSTRY_MIN="$(LIVE_SEARCH_PER_INDUSTRY_MIN)" \
	LIVE_SEARCH_FAIL_ON_LOW_RATE="$(LIVE_SEARCH_FAIL_ON_LOW_RATE)" \
	LIVE_SEARCH_MIN_SUCCESS_RATE="$(LIVE_SEARCH_MIN_SUCCESS_RATE)" \
	LIVE_SEARCH_MIN_RECRUITMENT_RATE="$(LIVE_SEARCH_MIN_RECRUITMENT_RATE)" \
	LIVE_SEARCH_MIN_CORPORATE_RATE="$(LIVE_SEARCH_MIN_CORPORATE_RATE)" \
	LIVE_SEARCH_MIN_CANDIDATE_MRR="$(LIVE_SEARCH_MIN_CANDIDATE_MRR)" \
	LIVE_SEARCH_MIN_NDCG5="$(LIVE_SEARCH_MIN_NDCG5)" \
	LIVE_SEARCH_MIN_MEAN_GRADE_SCORE="$(LIVE_SEARCH_MIN_MEAN_GRADE_SCORE)" \
	LIVE_SEARCH_HARD_MAX_OFFICIAL_RANK="$(LIVE_SEARCH_HARD_MAX_OFFICIAL_RANK)" \
	LIVE_SEARCH_HARD_MIN_METADATA_SCORE="$(LIVE_SEARCH_HARD_MIN_METADATA_SCORE)" \
	LIVE_SEARCH_FAIL_ON_REGRESSION="$(LIVE_SEARCH_FAIL_ON_REGRESSION)" \
	BASELINE_SAVE="$(BASELINE_SAVE)" \
	BASELINE_AUTO_PROMOTE="$(BASELINE_AUTO_PROMOTE)" \
	python -m pytest tests/test_live_company_info_search_report.py -v -s -m "integration"

backend-test-live-search-hybrid:
	@$(MAKE) backend-test-live-search LIVE_SEARCH_MODES=hybrid

backend-test-live-search-legacy:
	@$(MAKE) backend-test-live-search LIVE_SEARCH_MODES=legacy

## Live ES添削 provider gate（実 API / レポート出力。PROVIDERS 空で case_set 別既定）
backend-test-live-es-review:
	@echo "Running live ES review provider gate..."
	@echo "  Case set: $(LIVE_ES_REVIEW_CASE_SET)"
	@echo "  Providers: (empty=defaults) $(LIVE_ES_REVIEW_PROVIDERS)"
	@echo "  Output: $(LIVE_ES_REVIEW_OUTPUT_DIR)"
	RUN_LIVE_ES_REVIEW=1 \
	LIVE_ES_REVIEW_CASE_SET="$(LIVE_ES_REVIEW_CASE_SET)" \
	LIVE_ES_REVIEW_PROVIDERS="$(LIVE_ES_REVIEW_PROVIDERS)" \
	LIVE_ES_REVIEW_FAIL_ON_MISSING_KEYS="$(LIVE_ES_REVIEW_FAIL_ON_MISSING_KEYS)" \
	LIVE_ES_REVIEW_OUTPUT_DIR="$(LIVE_ES_REVIEW_OUTPUT_DIR)" \
	LIVE_ES_REVIEW_ENABLE_JUDGE="$(LIVE_ES_REVIEW_ENABLE_JUDGE)" \
	LIVE_ES_REVIEW_REQUIRE_JUDGE_PASS="$(LIVE_ES_REVIEW_REQUIRE_JUDGE_PASS)" \
	LIVE_ES_REVIEW_COLLECT_ONLY="$(LIVE_ES_REVIEW_COLLECT_ONLY)" \
	LIVE_ES_REVIEW_JUDGE_MODEL="$(LIVE_ES_REVIEW_JUDGE_MODEL)" \
	LIVE_ES_REVIEW_CASE_FILTER="$(LIVE_ES_REVIEW_CASE_FILTER)" \
	npx dotenv -e .env.local -- \
	python -m pytest backend/tests/es_review/integration/test_live_es_review_provider_report.py -v -s -m "integration"

## Pythonコードをリント（ruff/flake8）
backend-lint:
	cd backend && python -m ruff check . || python -m flake8 .

## dead code 検出（バックエンド: ruff F401/F841）
backend-deadcode:
	cd backend && python -m ruff check --select F401,F841 app/

## dead code 検出（フロントエンド: knip）
frontend-deadcode:
	npm run deadcode

## dead code 検出（全体）
deadcode: backend-deadcode frontend-deadcode

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
	@echo "psql:" && (command -v psql >/dev/null && echo "installed" || echo "not installed")
	@echo "Supabase CLI:" && (command -v supabase >/dev/null && echo "installed" || echo "not installed")
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
# デプロイ
# ===========================================

# デプロイ設定
FRONTEND_URL := https://www.shupass.jp
BACKEND_URL := https://shupass-backend-production.up.railway.app
STAGING_FRONTEND_URL := https://stg.shupass.jp
STAGING_BACKEND_URL := https://stg-api.shupass.jp
RELEASE_PR_URL := https://github.com/saoki0913/career_compass/compare/main...develop?expand=1
HEALTH_CHECK_RETRIES := 8
HEALTH_CHECK_INTERVAL := 15
HEALTH_CHECK_INITIAL_WAIT := 30
CLI_SAFE_BIN := $(CURDIR)/tools/cli-safe/bin
CLI_SAFE_PATH := PATH="$(CLI_SAFE_BIN):$$PATH"

## develop の release 前検証（本番反映は GitHub PR merge のみ）
deploy:
	zsh scripts/release/release-career-compass.sh

## ローカル変更をすべて stage してから release を実行
deploy-stage-all:
	zsh scripts/release/release-career-compass.sh --stage-all

## ヘルスチェックのみ実行（スタンドアロン）
deploy-check:
	@echo "=== Health Check ==="
	@echo ""
	@FRONTEND_OK=0; \
	BACKEND_OK=0; \
	for i in $$(seq 1 $(HEALTH_CHECK_RETRIES)); do \
		echo "-> チェック $$i/$(HEALTH_CHECK_RETRIES)..."; \
		if [ "$$FRONTEND_OK" = "0" ]; then \
			HTTP_CODE=$$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 $(FRONTEND_URL) 2>/dev/null); \
			if [ "$$HTTP_CODE" = "200" ]; then \
				echo "  Frontend ($(FRONTEND_URL)): OK ($$HTTP_CODE)"; \
				FRONTEND_OK=1; \
			else \
				echo "  Frontend ($(FRONTEND_URL)): $$HTTP_CODE"; \
			fi; \
		else \
			echo "  Frontend: OK"; \
		fi; \
		if [ "$$BACKEND_OK" = "0" ]; then \
			HTTP_CODE=$$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 $(BACKEND_URL)/health 2>/dev/null); \
			if [ "$$HTTP_CODE" = "200" ]; then \
				echo "  Backend  ($(BACKEND_URL)/health): OK ($$HTTP_CODE)"; \
				BACKEND_OK=1; \
			else \
				echo "  Backend  ($(BACKEND_URL)/health): $$HTTP_CODE"; \
			fi; \
		else \
			echo "  Backend:  OK"; \
		fi; \
		if [ "$$FRONTEND_OK" = "1" ] && [ "$$BACKEND_OK" = "1" ]; then \
			break; \
		fi; \
		if [ "$$i" -lt "$(HEALTH_CHECK_RETRIES)" ]; then \
			echo "  $(HEALTH_CHECK_INTERVAL)秒後にリトライ..."; \
			sleep $(HEALTH_CHECK_INTERVAL); \
		fi; \
		echo ""; \
	done; \
	echo ""; \
	if [ "$$FRONTEND_OK" = "1" ]; then \
		echo "[OK]   Frontend: $(FRONTEND_URL)"; \
	else \
		echo "[FAIL] Frontend: $(FRONTEND_URL)"; \
	fi; \
	if [ "$$BACKEND_OK" = "1" ]; then \
		echo "[OK]   Backend:  $(BACKEND_URL)/health"; \
	else \
		echo "[FAIL] Backend:  $(BACKEND_URL)/health"; \
	fi

## 本番DBマイグレーション（.env.production 必須）
deploy-migrate:
	@if [ ! -f .env.production ]; then \
		echo "ERROR: .env.production が見つかりません。"; \
		echo "作成方法:"; \
		echo "  DIRECT_URL=postgresql://postgres.<ref>:<pass>@<host>:5432/postgres"; \
		exit 1; \
	fi
	@echo "-> 本番DBマイグレーション実行中..."
	npm run db:migrate:prod
	@echo "-> マイグレーション完了"

## 安全ラッパー経由で主要 CLI の状態を確認
ops-status:
	@echo "=== Safe CLI Status ==="
	@echo ""
	@$(CLI_SAFE_PATH) git status --short || true
	@echo ""
	@bash scripts/release/provider-auth-status.sh || true

## 認証状態だけを安全ラッパー経由で確認
ops-auth-check:
	bash scripts/release/provider-auth-status.sh --strict

## release 前の branch / deploy 前提だけを確認
ops-release-check:
	zsh scripts/release/release-career-compass.sh --check

# ===========================================
# ヘルプ
# ===========================================

## 使用可能なコマンド一覧を表示
help:
	@echo "就活Pass (シューパス) - Makefile コマンド一覧"
	@echo "  (本番: $(FRONTEND_URL))"
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
	@echo "    make backend-test-live-search - Live検索レポート（Legacy + Hybrid, ネットワーク必須）"
	@echo "    make backend-test-live-search-hybrid - Live検索レポート（Hybridのみ）"
	@echo "    make backend-test-live-search-legacy - Live検索レポート（Legacyのみ）"
	@echo "    make backend-lint    - Pythonリント"
	@echo "    make backend-format  - Python自動フォーマット"
	@echo ""
	@echo "  🧪 E2Eテスト (Playwright):"
	@echo "    make test         - ヘッドレスでテスト実行"
	@echo "    make test-ui      - UIモードでテスト"
	@echo "    make test-headed  - ブラウザ表示でテスト"
	@echo "    make test-major   - stable major"
	@echo "    make test-major-live - AI live major"
	@echo ""
	@echo "  🗄️  データベース:"
	@echo "    【ローカル DB サーバー】Postgres を Docker 上で起動・停止（Supabase CLI）"
	@echo "    make db-up           - 起動（メモリを使うのは主にここ）"
	@echo "    make db-down         - 停止（データはボリュームに残る）"
	@echo "    make db-restart      - 停止してから再起動"
	@echo "    make db-down-clean   - 停止＋ローカル DB データ削除"
	@echo "    make db-local-status - 稼働状況（supabase status）"
	@echo "    （互換: make supabase-start / supabase-stop / … は上と同じ）"
	@echo ""
	@echo "    【Drizzle / アプリ用】すでに db-up 済みの Postgres にスキーマを当てる"
	@echo "    make db-push      - スキーマをDBに反映"
	@echo "    make db-generate  - マイグレーションファイル生成"
	@echo "    make db-migrate   - Drizzle migration 実行（app DB 用。schema.ts を追加したらまずこれ）"
	@echo "    make db-studio    - Drizzle Studio起動"
	@echo "    make db-status    - 未適用スキーマ変更を確認（Drizzle。Supabase mirror 未追跡は別途注意）"
	@echo "    make db-fresh     - DBリセット＋シード投入"
	@echo "    make reset-db     - DBリセット（強制push）"
	@echo "    make seed         - シードデータ投入"
	@echo ""
	@echo "  📋 ログ・デバッグ:"
	@echo "    make logs         - バックエンドログ表示"
	@echo ""
	@echo "  🚀 デプロイ:"
	@echo "    make deploy         - staged 済み release scope で本番反映"
	@echo "    make deploy-stage-all - ローカル変更を全部 stage して本番反映"
	@echo "    make deploy-check   - ヘルスチェックのみ（Frontend + Backend）"
	@echo "    make deploy-migrate - 本番DBマイグレーションのみ"
	@echo "    make ops-status     - provider auth の現状確認"
	@echo "    make ops-auth-check - provider auth の厳密確認"
	@echo "    make ops-release-check - release 前提（auth/secrets/branch）確認"
	@echo ""
	@echo "  🔧 環境・セットアップ:"
	@echo "    make check        - 開発環境の状態確認"
	@echo "    make deps         - 全依存パッケージインストール"
	@echo "    make setup        - 初期セットアップ"
	@echo "    make clean        - ビルド成果物削除"
	@echo ""
