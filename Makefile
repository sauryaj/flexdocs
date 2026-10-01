.PHONY: help deploy update rebuild stop restart logs logs-all status clean reset dev seed health backup restore restore-drill shell-db shell-app

# Default port (change if 3001 is taken)
PORT ?= 3001
COMPOSE = bash scripts/compose.sh

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

deploy: ## Initial setup: secrets, migrations, build, start (use update for upgrades)
	@bash scripts/setup.sh

update: ## Update an existing install: backup, rebuild, migrate, restart
	@bash scripts/update.sh

stop: ## Stop all containers
	$(COMPOSE) down

restart: ## Restart the app (fast, no rebuild)
	$(COMPOSE) restart app
	@$(MAKE) health

rebuild: update ## Rebuild through the backed-up upgrade path

logs: ## Follow app logs
	$(COMPOSE) logs -f app

logs-all: ## Follow all logs
	$(COMPOSE) logs -f

status: ## Show container status
	@$(COMPOSE) ps
	@HEALTH_ATTEMPTS=1 bash scripts/wait-for-health.sh

health: ## Check app health
	@bash scripts/wait-for-health.sh

clean: ## Remove containers, volumes, and images
	@test "$(CONFIRM_DELETE_DATA)" = "yes" || (echo "This deletes database, uploads, and backups. Use CONFIRM_DELETE_DATA=yes only for an intentional reset."; exit 1)
	$(COMPOSE) down -v --rmi local

reset: ## Nuclear option: clean + rebuild from scratch
	@$(MAKE) clean
	@bash scripts/setup.sh

dev: ## Run locally in dev mode (requires local PostgreSQL)
	npx prisma generate && npm run dev -- -p $(PORT)

seed: ## Re-run database seed (app must be running)
	$(COMPOSE) build init
	$(COMPOSE) run --rm init

backup: ## Create a database backup
	@mkdir -p backups
	bash scripts/database-backup.sh
	@echo "✅ Backup saved to backups/"

restore: ## Restore from backup: make restore FILE=backups/flexdocs-XXXX.sql
	@if [ -z "$(FILE)" ]; then echo "Usage: make restore FILE=backups/flexdocs-XXXX.sql"; exit 1; fi
	$(COMPOSE) exec -T db psql -v ON_ERROR_STOP=1 --single-transaction -U flexdocs flexdocs < "$(FILE)"
	@echo "✅ Restored from $(FILE)"

restore-drill: ## Verify a backup restores cleanly into a scratch DB (safe, no live data touched)
	bash scripts/restore-drill.sh

shell-db: ## Open psql shell to database
	$(COMPOSE) exec db psql -U flexdocs flexdocs

shell-app: ## Open shell in app container
	$(COMPOSE) exec app sh
