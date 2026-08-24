# FlexDocs — Deployment Guide

Three ways to deploy, pick one:

| Path | For | Time |
|---|---|---|
| **One command** (recommended) | Anyone with Docker | ~5 min |
| **Makefile** | If you have `make` | ~5 min |
| **Manual** | No make, or you want full control | ~10 min |

---

## 1. One command (recommended)

Install [Docker](#2-install-docker) if you don't have it, then:

```bash
git clone https://github.com/sauryaj/flexdocs.git
cd flexdocs
bash scripts/setup.sh
```

The script:
1. Verifies Docker is installed and running
2. Generates `.env` with fresh random secrets (never overwrites an existing `.env`)
3. Builds and starts all containers
4. Waits until the app is healthy

Then open **http://localhost:3001** and log in:

| Email | Password |
|---|---|
| `admin@flexdocs.local` | `admin12345` |

> **Change this password immediately** (Profile → Change Password) — it's public in the source code.

Custom port: `PORT=8080 bash scripts/setup.sh`

---

## 2. Install Docker

### macOS
```bash
brew install --cask docker          # then launch Docker Desktop
```
(Apple Silicon and Intel both work. Colima users: `colima start` first if commands hang.)

### Linux (Ubuntu/Debian)
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER       # log out & back in
```

### Windows
Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) with WSL2, run all commands from the WSL terminal.

**Verify:** `docker info` prints system info without errors.

---

## 3. Makefile shortcuts

If you have `make`, these wrap the common operations:

```bash
make deploy         # setup/update: secrets + migrations + build + start
make stop           # stop everything (data kept)
make restart        # restart app only (fast)
make logs           # follow app logs
make status         # container status + health
make health         # health JSON
make backup         # dump database to backups/*.sql
make restore FILE=backups/flexdocs-XXX.sql
make restore-drill  # prove a backup restores into a scratch DB (safe)
make reset          # nuclear: delete volumes + images, rebuild from scratch
make clean          # remove containers, volumes, images
```

---

## 4. Manual setup (no make / full control)

```bash
git clone https://github.com/sauryaj/flexdocs.git
cd flexdocs

# 1. Generate secrets
cp .env.example .env
sed -i.bak "s|ENCRYPTION_KEY=.*|ENCRYPTION_KEY=\"$(openssl rand -hex 32)\"|" .env
sed -i.bak "s|NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=\"$(openssl rand -hex 32)\"|" .env
rm .env.bak
# Edit .env: set DB_PASSWORD, NEXTAUTH_URL, SMTP_* as needed

# 2. Start (builds images, applies migrations, seeds)
docker compose up -d --build

# 3. Wait for health
curl http://localhost:3001/api/health
```

`docker-compose` (v1, hyphenated) works anywhere `docker compose` appears above.

---

## 5. Updating to a new version

```bash
git pull
docker compose build init app
docker compose run --rm init     # applies DB migrations + seeds (idempotent)
docker compose up -d
```

> **Always re-run the init container after pulling.** It applies database migrations
> (`prisma migrate deploy`). Skipping it after a schema change causes missing-column errors.

**Back up first (recommended):**

```bash
make backup                                              # or:
docker compose exec db pg_dump -U flexdocs flexdocs > backup-$(date +%F).sql
```

Restore: `make restore FILE=backup-2026-01-15.sql`

---

## 6. Data & backups

| What | Where | Survives `down`? |
|---|---|---|
| Database | `postgres_data` volume | Yes |
| Uploaded files | `uploads` volume | Yes |
| App backups | `backups` volume + `./backups` | Yes |
| Sessions/cache | `redis_data` volume | Yes |

`docker compose down` keeps all volumes. Only `down -v` (or `make clean`) deletes data.

Schedule a nightly backup with cron:
```
0 3 * * * cd /path/to/flexdocs && docker compose exec db pg_dump -U flexdocs flexdocs > backups/flexdocs-$(date +\%F).sql
```

---

## 7. Production notes

- Set `NEXTAUTH_URL` in `.env` to your public URL (e.g. `https://docs.example.com`)
- Put HTTPS in front — Caddy or any reverse proxy terminating TLS on port 443 → `localhost:3001`
- Use real SMTP values so email alerts and emergency-access notifications work
- Keep `.env` private (mode 600); it holds the encryption key for stored passwords
- Back up off-machine: copy `backups/*.sql` somewhere else — a backup on the same disk is not a backup

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `docker: command not found` | Install Docker (section 2); start Docker Desktop |
| `Cannot connect to the Docker daemon` | Daemon not running — start Docker Desktop / `sudo systemctl start docker` / `colima start` |
| Port 3001 in use | `PORT=8080 bash scripts/setup.sh`, or stop the other service |
| Port 5432 in use | Local Postgres running? `docker compose edit` to remap, or stop it — the app uses the internal network, not host 5432 |
| Init container fails | `docker compose logs init`. Usual cause: stale image after pulling — rebuild it (`docker compose build init`) |
| App 500s right after start | DB still initializing — wait 30s, refresh. Then check `docker compose logs app` |
| Migrations complaints | `docker compose run --rm init npx prisma migrate status` |
| Everything returns 429 | Rate-limit counters in Redis are poisoned: `docker compose exec redis redis-cli --scan --pattern 'ratelimit:*' \| xargs -r docker compose exec redis redis-cli del` |
| Login rejected with seeded creds | Password was changed — restore from backup or `make reset` (wipes data!) |
| Forgot admin password entirely | `docker compose run --rm init` re-seeds only missing users; to force-reset, restore a backup or use `make reset` |

Still stuck? Open an issue with the output of `docker compose logs app init` and `make status`.
