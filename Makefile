.PHONY: dev build start lint test test-ui db-push db-generate db-studio clean \
	up down restart backend-test backend-test-search backend-lint backend-format logs check deps reset-db seed \
	db-migrate db-status db-check db-drop db-introspect db-fresh backend-install \
	backend-test-mappings backend-test-subsidiary backend-test-company \
	backend-test-comprehensive backend-test-comprehensive-quick backend-test-comprehensive-stats \
	backend-test-content-type backend-test-content-type-unit backend-test-content-type-integration \
	backend-test-es-char backend-test-live-search backend-test-live-search-hybrid backend-test-live-search-legacy \
	deploy deploy-check deploy-migrate

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
LIVE_SEARCH_SAMPLE_SEED ?= 9
LIVE_SEARCH_SAMPLE_SIZE ?= 30
LIVE_SEARCH_MAX_RESULTS ?= 5
LIVE_SEARCH_TOKENS_PER_SECOND ?= 1.0
LIVE_SEARCH_MAX_TOKENS ?= 1.0
LIVE_SEARCH_PASS_TOP_N ?= 5
LIVE_SEARCH_PER_INDUSTRY_MIN ?= 1
LIVE_SEARCH_FAIL_ON_LOW_RATE ?= 0
LIVE_SEARCH_MIN_SUCCESS_RATE ?= 0.70

## 全バックエンドテストを実行
backend-test:
	cd backend && python -m pytest tests/ -v

## Live検索レポートテスト（Legacy + Hybrid, ネットワーク必須）
backend-test-live-search:
	@echo "Running live search report test (Legacy + Hybrid; requires network; may take a while)..."
	cd backend && \
	RUN_LIVE_SEARCH=1 \
	LIVE_SEARCH_MODES="$(LIVE_SEARCH_MODES)" \
	LIVE_SEARCH_CACHE_MODE="$(LIVE_SEARCH_CACHE_MODE)" \
	LIVE_SEARCH_SAMPLE_SEED="$(LIVE_SEARCH_SAMPLE_SEED)" \
	LIVE_SEARCH_SAMPLE_SIZE="$(LIVE_SEARCH_SAMPLE_SIZE)" \
	LIVE_SEARCH_MAX_RESULTS="$(LIVE_SEARCH_MAX_RESULTS)" \
	LIVE_SEARCH_TOKENS_PER_SECOND="$(LIVE_SEARCH_TOKENS_PER_SECOND)" \
	LIVE_SEARCH_MAX_TOKENS="$(LIVE_SEARCH_MAX_TOKENS)" \
	LIVE_SEARCH_PASS_TOP_N="$(LIVE_SEARCH_PASS_TOP_N)" \
	LIVE_SEARCH_PER_INDUSTRY_MIN="$(LIVE_SEARCH_PER_INDUSTRY_MIN)" \
	LIVE_SEARCH_FAIL_ON_LOW_RATE="$(LIVE_SEARCH_FAIL_ON_LOW_RATE)" \
	LIVE_SEARCH_MIN_SUCCESS_RATE="$(LIVE_SEARCH_MIN_SUCCESS_RATE)" \
	python -m pytest tests/test_live_company_info_search_report.py -v -s -m "integration"

backend-test-live-search-hybrid:
	@$(MAKE) backend-test-live-search LIVE_SEARCH_MODES=hybrid

backend-test-live-search-legacy:
	@$(MAKE) backend-test-live-search LIVE_SEARCH_MODES=legacy

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
FRONTEND_URL := https://shupass.jp
BACKEND_URL := https://career-compass-backend.up.railway.app
HEALTH_CHECK_RETRIES := 8
HEALTH_CHECK_INTERVAL := 15
HEALTH_CHECK_INITIAL_WAIT := 30

## develop → main 本番デプロイ（ビルド検証・DBマイグレ・ヘルスチェック付き）
deploy:
	@echo ""
	@echo "=========================================="
	@echo " Deploy: develop -> main"
	@echo "=========================================="
	@echo ""
	@STASHED=0; \
	DEPLOY_FAILED=0; \
	HAS_ENV_PROD=0; \
	\
	echo "--- Phase 0: 事前チェック ---"; \
	echo ""; \
	if [ -n "$$(git status --porcelain)" ]; then \
		echo "WARNING: 未コミットの変更があります:"; \
		git status --short; \
		echo ""; \
		echo "どうしますか？"; \
		echo "  1) stash して続行（デプロイ後に自動復元）"; \
		echo "  2) そのまま続行（変更はデプロイに含まれません）"; \
		echo "  3) 中止"; \
		printf "選択 [1-3]: "; \
		read choice; \
		case "$$choice" in \
			1) echo "-> 変更をstashします..."; git stash push -m "deploy-auto-stash"; STASHED=1 ;; \
			2) echo "-> 未コミットの変更を残して続行します..." ;; \
			3) echo "中止しました。"; exit 1 ;; \
			*) echo "無効な選択です。中止します。"; exit 1 ;; \
		esac; \
		echo ""; \
	fi; \
	\
	CURRENT=$$(git branch --show-current); \
	if [ "$$CURRENT" != "develop" ]; then \
		echo "ERROR: developブランチで実行してください（現在: $$CURRENT）"; \
		if [ "$$STASHED" = "1" ]; then git stash pop; fi; \
		exit 1; \
	fi; \
	\
	if [ -f .env.production ]; then \
		HAS_ENV_PROD=1; \
	else \
		echo "INFO: .env.production が見つかりません。DBマイグレーションはスキップされます。"; \
		echo "  作成方法: .env.production に DIRECT_URL=<本番DB URL> を記載"; \
		echo ""; \
	fi; \
	\
	echo "-> developを最新に更新..."; \
	git pull origin develop; \
	echo ""; \
	\
	echo "--- Phase 1: ビルド検証 ---"; \
	echo ""; \
	echo "-> ビルドチェック実行中..."; \
	if ! npm run build; then \
		echo ""; \
		echo "ERROR: ビルドに失敗しました。エラーを修正してから再実行してください。"; \
		if [ "$$STASHED" = "1" ]; then echo "-> stashを復元します..."; git stash pop; fi; \
		exit 1; \
	fi; \
	echo ""; \
	echo "-> ビルドチェック OK"; \
	echo ""; \
	\
	echo "-> main との差分コミット:"; \
	git log main..develop --oneline; \
	echo ""; \
	printf "上記の変更を本番デプロイしますか？ (y/N): "; \
	read confirm; \
	if [ "$$confirm" != "y" ]; then \
		echo "中止しました。"; \
		if [ "$$STASHED" = "1" ]; then echo "-> stashを復元します..."; git stash pop; fi; \
		exit 1; \
	fi; \
	echo ""; \
	\
	echo "--- Phase 2: DBマイグレーション ---"; \
	echo ""; \
	if [ "$$HAS_ENV_PROD" = "1" ]; then \
		printf "本番DBマイグレーションを実行しますか？ (y/N/skip): "; \
		read migrate_choice; \
		case "$$migrate_choice" in \
			y|Y) \
				echo "-> 本番DBマイグレーション実行中..."; \
				if ! npm run db:migrate:prod; then \
					echo ""; \
					echo "ERROR: DBマイグレーションに失敗しました。"; \
					echo "  コードはまだプッシュされていません。本番環境は変更されていません。"; \
					echo "  マイグレーションを修正してから再実行してください。"; \
					if [ "$$STASHED" = "1" ]; then echo "-> stashを復元します..."; git stash pop; fi; \
					exit 1; \
				fi; \
				echo "-> マイグレーション完了"; \
				echo "" ;; \
			skip|s|S) \
				echo "-> DBマイグレーションをスキップしました。"; \
				echo "" ;; \
			*) \
				echo "中止しました。"; \
				if [ "$$STASHED" = "1" ]; then echo "-> stashを復元します..."; git stash pop; fi; \
				exit 1 ;; \
		esac; \
	else \
		echo "-> .env.production なし: DBマイグレーションをスキップ"; \
		echo ""; \
	fi; \
	\
	echo "--- Phase 3: Git マージ & プッシュ ---"; \
	echo ""; \
	echo "-> mainにチェックアウト..."; \
	git checkout main; \
	echo "-> mainを最新に更新..."; \
	git pull origin main; \
	echo "-> developをマージ..."; \
	if ! git merge develop; then \
		echo ""; \
		echo "ERROR: マージコンフリクトが発生しました。"; \
		echo "  手動で解決してください:"; \
		echo "    git merge --abort"; \
		echo "    git checkout develop"; \
		if [ "$$STASHED" = "1" ]; then echo "    git stash pop"; fi; \
		exit 1; \
	fi; \
	echo "-> mainをプッシュ（Vercel + Railway 自動デプロイ）..."; \
	if ! git push origin main; then \
		echo ""; \
		echo "ERROR: プッシュに失敗しました。"; \
		echo "  mainはローカルでマージ済みですがリモートには未反映です。"; \
		echo "  リトライ: git push origin main"; \
		echo "  取消:     git reset --hard HEAD~1 && git checkout develop"; \
		if [ "$$STASHED" = "1" ]; then echo "            git stash pop"; fi; \
		exit 1; \
	fi; \
	echo ""; \
	echo "-> developに戻ります..."; \
	git checkout develop; \
	if [ "$$STASHED" = "1" ]; then echo "-> stashを復元します..."; git stash pop; fi; \
	echo ""; \
	\
	echo "--- Phase 4: ヘルスチェック ---"; \
	echo ""; \
	echo "-> デプロイ反映を待機中（$(HEALTH_CHECK_INITIAL_WAIT)秒）..."; \
	sleep $(HEALTH_CHECK_INITIAL_WAIT); \
	echo ""; \
	FRONTEND_OK=0; \
	BACKEND_OK=0; \
	for i in $$(seq 1 $(HEALTH_CHECK_RETRIES)); do \
		echo "-> ヘルスチェック $$i/$(HEALTH_CHECK_RETRIES)..."; \
		if [ "$$FRONTEND_OK" = "0" ]; then \
			HTTP_CODE=$$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 $(FRONTEND_URL) 2>/dev/null); \
			if [ "$$HTTP_CODE" = "200" ]; then \
				echo "  Frontend ($(FRONTEND_URL)): OK ($$HTTP_CODE)"; \
				FRONTEND_OK=1; \
			else \
				echo "  Frontend ($(FRONTEND_URL)): $$HTTP_CODE (待機中...)"; \
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
				echo "  Backend  ($(BACKEND_URL)/health): $$HTTP_CODE (待機中...)"; \
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
	\
	echo "=========================================="; \
	echo " Deploy Summary"; \
	echo "=========================================="; \
	echo ""; \
	if [ "$$FRONTEND_OK" = "1" ]; then \
		echo "  [OK]   Frontend: $(FRONTEND_URL)"; \
	else \
		echo "  [FAIL] Frontend: $(FRONTEND_URL)"; \
		DEPLOY_FAILED=1; \
	fi; \
	if [ "$$BACKEND_OK" = "1" ]; then \
		echo "  [OK]   Backend:  $(BACKEND_URL)/health"; \
	else \
		echo "  [FAIL] Backend:  $(BACKEND_URL)/health"; \
		DEPLOY_FAILED=1; \
	fi; \
	echo ""; \
	if [ "$$DEPLOY_FAILED" = "1" ]; then \
		echo "WARNING: 一部のヘルスチェックが失敗しました。"; \
		echo ""; \
		echo "  確認:"; \
		echo "    Vercel:  https://vercel.com/dashboard -> Deployments"; \
		echo "    Railway: https://railway.app/dashboard -> Deployments"; \
		echo ""; \
		echo "  ロールバック（必要な場合）:"; \
		echo "    git checkout main"; \
		echo "    git revert HEAD"; \
		echo "    git push origin main"; \
		echo "    git checkout develop"; \
		echo ""; \
	else \
		echo "デプロイ成功。全てのヘルスチェックに合格しました。"; \
		echo ""; \
	fi

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

# ===========================================
# ヘルプ
# ===========================================

## 使用可能なコマンド一覧を表示
help:
	@echo "就活Compass (シューパス) - Makefile コマンド一覧"
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
	@echo "  🚀 デプロイ:"
	@echo "    make deploy         - 本番デプロイ（ビルド検証→DBマイグレ→マージ→ヘルスチェック）"
	@echo "    make deploy-check   - ヘルスチェックのみ（Frontend + Backend）"
	@echo "    make deploy-migrate - 本番DBマイグレーションのみ"
	@echo ""
	@echo "  🔧 環境・セットアップ:"
	@echo "    make check        - 開発環境の状態確認"
	@echo "    make deps         - 全依存パッケージインストール"
	@echo "    make setup        - 初期セットアップ"
	@echo "    make clean        - ビルド成果物削除"
	@echo ""
