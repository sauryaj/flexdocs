.PHONY: help deploy stop restart logs status clean reset dev seed health

# Default port (change if 3001 is taken)
PORT ?= 3001

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

deploy: ## Build and start everything (first time or after code changes)
	@./scripts/deploy.sh

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
	@curl -sf http://localhost:$(PORT)/api/health | python3 -m json.tool 2>/dev/null || echo "❌ App not responding"

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
	docker-compose exec db pg_dump -U flexdocs flexdocs > backups/flexdocs-$$(date +%Y%m%d-%H%M%S).sql
	@echo "✅ Backup saved to backups/"

restore: ## Restore from backup: make restore FILE=backups/flexdocs-XXXX.sql
	@if [ -z "$(FILE)" ]; then echo "Usage: make restore FILE=backups/flexdocs-XXXX.sql"; exit 1; fi
	docker-compose exec -T db psql -U flexdocs flexdocs < $(FILE)
	@echo "✅ Restored from $(FILE)"

shell-db: ## Open psql shell to database
	docker-compose exec db psql -U flexdocs flexdocs

shell-app: ## Open shell in app container
	docker-compose exec app sh
