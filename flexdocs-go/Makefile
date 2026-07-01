.PHONY: dev build run test clean docker-build docker-run

# Development
dev:
	cd ../flexdocs && npm run build
	cp -r ../flexdocs/out ./public 2>/dev/null || true
	go run ./cmd/server

# Build
build:
	cd ../flexdocs && npm run build
	cp -r ../flexdocs/out ./public 2>/dev/null || true
	CGO_ENABLED=0 go build -o bin/flexdocs ./cmd/server

# Run production
run: build
	./bin/flexdocs

# Test
test:
	go test ./...

# Clean
clean:
	rm -rf bin/ public/ uploads/

# Docker
docker-build:
	docker compose build

docker-run:
	docker compose up -d

docker-stop:
	docker compose down

docker-logs:
	docker compose logs -f

# Database
db-push:
	npx prisma db push --accept-data-loss

db-seed:
	npx tsx prisma/seed.ts
	npx tsx prisma/seed-orgs.ts

# Format
fmt:
	gofmt -w .

# Lint
lint:
	golangci-lint run

# Vet
vet:
	go vet ./...
