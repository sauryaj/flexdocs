.PHONY: help deploy update stop restart logs status clean reset dev seed health

# Default port (change if 3001 is taken)
PORT ?= 3001

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

deploy: ## First-time setup or update: secrets, migrations, build, start
	@./scripts/setup.sh

update: ## Update an existing install: backup, rebuild, migrate, restart
	@test -f .env || (echo "No .env found. Run: make deploy"; exit 1)
	@./scripts/database-backup.sh
	docker compose build init app
	docker compose run --rm init
	docker compose up -d app
	@$(MAKE) health

stop: ## Stop all containers
	docker-compose down

restart: ## Restart the app (fast, no rebuild)
	docker-compose restart app

rebuild: ## Full rebuild (rebuilds Docker image)
	docker-compose down
	docker-compose build --no-cache
	docker-compose up -d
	@sleep 3
	@curl -sf http://localhost:$(PORT)/api/health && echo "\n✅ FlexDocs running at http://localhost:$(PORT)" || echo "⏳ Still starting... check: docker-compose logs -f app"

logs: ## Follow app logs
	docker-compose logs -f app

logs-all: ## Follow all logs
	docker-compose logs -f

status: ## Show container status
	@docker-compose ps
	@echo ""
	@curl -sf http://localhost:$(PORT)/api/health 2>/dev/null && echo "" || echo "❌ App not responding"

health: ## Check app health
	@bash scripts/wait-for-health.sh

clean: ## Remove containers, volumes, and images
	docker-compose down -v --rmi local

reset: ## Nuclear option: clean + rebuild from scratch
	docker-compose down -v --rmi local
	docker-compose build --no-cache
	docker-compose up -d
	@sleep 5
	@echo "✅ FlexDocs running at http://localhost:$(PORT)"

dev: ## Run locally in dev mode (requires local PostgreSQL)
	npx prisma generate && npm run dev -- -p $(PORT)

seed: ## Re-run database seed (app must be running)
	docker-compose run --rm init

backup: ## Create a database backup
	@mkdir -p backups
	bash scripts/database-backup.sh
	@echo "✅ Backup saved to backups/"

restore: ## Restore from backup: make restore FILE=backups/flexdocs-XXXX.sql
	@if [ -z "$(FILE)" ]; then echo "Usage: make restore FILE=backups/flexdocs-XXXX.sql"; exit 1; fi
	docker-compose exec -T db psql -v ON_ERROR_STOP=1 --single-transaction -U flexdocs flexdocs < "$(FILE)"
	@echo "✅ Restored from $(FILE)"

restore-drill: ## Verify a backup restores cleanly into a scratch DB (safe, no live data touched)
	bash scripts/restore-drill.sh

shell-db: ## Open psql shell to database
	docker-compose exec db psql -U flexdocs flexdocs

shell-app: ## Open shell in app container
	docker-compose exec app sh
