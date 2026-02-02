.PHONY: dev build start lint test test-ui db-push db-generate db-studio clean \
	up down restart backend-test backend-test-search backend-lint backend-format logs check deps reset-db seed \
	db-migrate db-status db-check db-drop db-introspect db-fresh backend-install \
	backend-test-mappings backend-test-subsidiary backend-test-company \
	backend-test-comprehensive backend-test-comprehensive-quick backend-test-comprehensive-stats \
	backend-test-content-type backend-test-content-type-unit backend-test-content-type-integration

# ===========================================
# Frontend (Next.js)
# ===========================================
dev:
	npm run dev

build:
	npm run build

start:
	npm run start

lint:
	npm run lint

# ===========================================
# Testing
# ===========================================
test:
	npx playwright test

test-ui:
	npx playwright test --ui

test-headed:
	npx playwright test --headed

# ===========================================
# Database (Drizzle + Turso)
# ===========================================

# Basic Commands
db-push:
	@echo "Pushing schema to database..."
	npx drizzle-kit push

db-generate:
	@echo "Generating migration files..."
	npx drizzle-kit generate

db-migrate:
	@echo "Running migrations..."
	npx drizzle-kit migrate

db-studio:
	@echo "Opening Drizzle Studio..."
	npx drizzle-kit studio

# Status & Check
db-status:
	@echo "=== Database Status ==="
	@echo "Checking for pending schema changes..."
	npx drizzle-kit check || echo "No pending changes or check not available"

db-check:
	@echo "=== Dry Run: Schema Changes ==="
	npx drizzle-kit push --dry-run 2>/dev/null || npx drizzle-kit generate --dry-run 2>/dev/null || echo "Dry run not supported in this version"

db-introspect:
	@echo "Introspecting database schema..."
	npx drizzle-kit introspect

# Reset & Fresh
db-drop:
	@echo "WARNING: This will drop all tables!"
	@read -p "Are you sure? (y/N): " confirm && [ "$$confirm" = "y" ] || exit 1
	@echo "Dropping tables..."
	npx drizzle-kit drop || echo "Drop command not available. Use reset-db instead."

db-fresh: reset-db seed
	@echo "Database fresh install complete!"


# ===========================================
# Development Convenience
# ===========================================
up:
	@echo "Starting backend server..."
	cd backend && uvicorn app.main:app --reload --port 8000

down:
	@echo "Stopping backend server..."
	@-pkill -f "uvicorn app.main:app" 2>/dev/null || echo "No backend process found"

restart: down
	@sleep 1
	@$(MAKE) up

backend-install:
	cd backend && pip install -r requirements.txt

# ===========================================
# Backend Testing
# ===========================================
backend-test:
	cd backend && python -m pytest tests/ -v

backend-test-search:
	cd backend && python -m pytest tests/test_search_precision.py -v

backend-test-mappings:
	@echo "Testing all 1,613 company mappings..."
	cd backend && python -m pytest tests/test_company_mappings.py -v

backend-test-subsidiary:
	@echo "Testing subsidiary/parent detection..."
	cd backend && python -m pytest tests/test_subsidiary_detection.py -v

backend-test-company:
	@echo "Running all company-related tests..."
	cd backend && python -m pytest tests/test_company_mappings.py tests/test_subsidiary_detection.py -v

# Comprehensive Search Tests (全企業包括的検索テスト)
backend-test-comprehensive:
	@echo "Running full comprehensive search test (約30分, 実API呼び出し)..."
	cd backend && python -m pytest tests/test_comprehensive_search.py -v -s

backend-test-comprehensive-quick:
	@echo "Running quick comprehensive test (関係性検証のみ, API呼び出しなし)..."
	cd backend && python -m pytest tests/test_comprehensive_search.py -v -k "TestCompanyRelationships"

backend-test-comprehensive-stats:
	@echo "Running statistics tests only..."
	cd backend && python -m pytest tests/test_comprehensive_search.py -v -s -k "TestSearchStatistics"

backend-test-comprehensive-integration:
	@echo "Running integration tests only (実API呼び出し)..."
	cd backend && python -m pytest tests/test_comprehensive_search.py -v -s -m integration

# ContentType検索テスト
backend-test-content-type:
	@echo "Running content type search tests..."
	cd backend && python -m pytest tests/test_content_type_search.py -v

backend-test-content-type-unit:
	@echo "Running content type unit tests only..."
	cd backend && python -m pytest tests/test_content_type_search.py -v -k "not Integration"

backend-test-content-type-integration:
	@echo "Running content type integration tests (requires network)..."
	cd backend && python -m pytest tests/test_content_type_search.py -v -m integration

backend-lint:
	cd backend && python -m ruff check . || python -m flake8 .

backend-format:
	cd backend && python -m black .

# ===========================================
# Logs & Debug
# ===========================================
logs:
	@echo "Backend logs (tail -f)..."
	@tail -f backend/logs/*.log 2>/dev/null || echo "No log files found. Backend may not be logging to file."

# ===========================================
# Environment Check
# ===========================================
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

deps:
	@echo "Installing all dependencies..."
	npm install
	cd backend && pip install -r requirements.txt
	@echo "Dependencies installed!"

# ===========================================
# Development Workflow
# ===========================================
reset-db:
	@echo "Resetting database..."
	npx drizzle-kit push --force
	@echo "Database reset complete!"

seed:
	@echo "Seeding database..."
	curl -X POST http://localhost:3000/api/templates/seed || echo "Failed to seed. Is the frontend server running?"
	@echo "Seed complete!"

# ===========================================
# Utilities
# ===========================================
clean:
	rm -rf .next node_modules

install:
	npm install

setup: install db-push
	@echo "Setup complete!"

# ===========================================
# Help
# ===========================================
help:
	@echo "Available commands:"
	@echo ""
	@echo "  Development Convenience:"
	@echo "    make up           - Start backend server"
	@echo "    make down         - Stop backend server"
	@echo "    make restart      - Restart backend server"
	@echo ""
	@echo "  Frontend (Next.js):"
	@echo "    make dev          - Start development server"
	@echo "    make build        - Build for production"
	@echo "    make start        - Start production server"
	@echo "    make lint         - Run ESLint"
	@echo ""
	@echo "  Backend (FastAPI):"
	@echo "    make backend      - Start FastAPI server (alias: up)"
	@echo "    make backend-install - Install Python dependencies"
	@echo "    make backend-test - Run backend tests (pytest)"
	@echo "    make backend-test-search - Run search precision tests"
	@echo "    make backend-test-mappings - Run company mappings tests"
	@echo "    make backend-test-comprehensive - Full search test (~30min, real API)"
	@echo "    make backend-test-comprehensive-quick - Quick relationship test (no API)"
	@echo "    make backend-test-comprehensive-stats - Statistics only"
	@echo "    make backend-lint - Run Python linter (ruff/flake8)"
	@echo "    make backend-format - Format Python code (black)"
	@echo ""
	@echo "  Testing:"
	@echo "    make test         - Run Playwright tests"
	@echo "    make test-ui      - Run tests in UI mode"
	@echo "    make test-headed  - Run tests with browser visible"
	@echo ""
	@echo "  Database:"
	@echo "    make db-push      - Push schema to database"
	@echo "    make db-generate  - Generate migration files"
	@echo "    make db-migrate   - Run migrations"
	@echo "    make db-studio    - Open Drizzle Studio"
	@echo "    make db-status    - Check for pending schema changes"
	@echo "    make db-check     - Dry run of schema changes"
	@echo "    make db-introspect - Introspect existing database"
	@echo "    make db-drop      - Drop all tables (with confirmation)"
	@echo "    make db-fresh     - Reset DB and seed (fresh install)"
	@echo "    make reset-db     - Reset database (force push)"
	@echo "    make seed         - Seed database with initial data"
	@echo ""
	@echo "  Logs & Debug:"
	@echo "    make logs         - Show backend logs"
	@echo ""
	@echo "  Environment:"
	@echo "    make check        - Check environment and dependencies"
	@echo "    make deps         - Install all dependencies"
	@echo ""
	@echo "  Utilities:"
	@echo "    make clean        - Remove build artifacts"
	@echo "    make setup        - Initial setup"
