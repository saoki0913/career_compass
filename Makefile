.PHONY: dev build start lint test test-ui db-push db-generate db-studio docker-up docker-down clean backend

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
db-push:
	npx drizzle-kit push

db-generate:
	npx drizzle-kit generate

db-migrate:
	npx drizzle-kit migrate

db-studio:
	npx drizzle-kit studio

# ===========================================
# Backend (FastAPI)
# ===========================================
backend:
	cd backend && uvicorn app.main:app --reload --port 8000

backend-install:
	cd backend && pip install -r requirements.txt

# ===========================================
# Docker
# ===========================================
docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-build:
	docker-compose build

docker-logs:
	docker-compose logs -f

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
	@echo "  Frontend (Next.js):"
	@echo "    make dev          - Start development server"
	@echo "    make build        - Build for production"
	@echo "    make start        - Start production server"
	@echo "    make lint         - Run ESLint"
	@echo ""
	@echo "  Backend (FastAPI):"
	@echo "    make backend      - Start FastAPI server"
	@echo "    make backend-install - Install Python dependencies"
	@echo ""
	@echo "  Testing:"
	@echo "    make test         - Run Playwright tests"
	@echo "    make test-ui      - Run tests in UI mode"
	@echo "    make test-headed  - Run tests with browser visible"
	@echo ""
	@echo "  Database:"
	@echo "    make db-push      - Push schema to database"
	@echo "    make db-generate  - Generate migrations"
	@echo "    make db-studio    - Open Drizzle Studio"
	@echo ""
	@echo "  Docker:"
	@echo "    make docker-up    - Start Docker containers"
	@echo "    make docker-down  - Stop Docker containers"
	@echo ""
	@echo "  Utilities:"
	@echo "    make clean        - Remove build artifacts"
	@echo "    make setup        - Initial setup"
