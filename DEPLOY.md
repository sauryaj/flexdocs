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
| `admin@flexdocs.local` | `BOOTSTRAP_ADMIN_PASSWORD` from the private `.env` |

> Setup generates a unique first-install password. Existing account passwords are preserved; review legacy admin accounts during upgrades.

Custom port: `PORT=8080 bash scripts/setup.sh`

Readiness checks discover the running app's published port through Compose, including a port configured only in `.env`. Both setup and `make health` require HTTP 200 and return a nonzero exit status on failure. The default is 60 attempts, with a five-second request limit and three seconds between attempts. Adjust `HEALTH_ATTEMPTS` and `HEALTH_INTERVAL_SECONDS` for slower hosts. Run these commands on the Docker host; remote Docker contexts are not supported by this host-side probe. The reported address is the direct local app address; configure `NEXTAUTH_URL` separately for your HTTPS reverse proxy.

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
make deploy         # initial setup: secrets + migrations + build + start
make stop           # stop everything (data kept)
make restart        # restart app only (fast)
make logs           # follow app logs
make status         # container status + health
make health         # wait for readiness; nonzero exit on failure
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

# 1. Generate private configuration with unique secrets
bash scripts/setup.sh --env-only
# Edit .env: set NEXTAUTH_URL, PORT, SMTP_* as needed

# 2. Start (builds images, applies migrations, seeds)
bash scripts/setup.sh

# 3. Wait for health
bash scripts/wait-for-health.sh
```

`docker-compose` (v1, hyphenated) works anywhere `docker compose` appears above.

---

## 5. Updating to a new version

Developers can verify deployment with `npm run test:deployment` (Docker, Compose with JSON configuration output, Git history, and Node required). It runs the real setup/update scripts in a unique temporary project, publishes only the app on a random loopback port, and keeps database/cache ports private. It installs the pinned earlier reliability baseline, creates synthetic records, upgrades to the working source, verifies preservation and a pre-upgrade SQL backup, then tests a fresh current installation. All disposable containers/volumes are removed; failed-run diagnostics remain in the printed temporary directory. This is not a production upgrade or a proof that every historical version is compatible. `DEPLOYMENT_BASE_REF` selects another compatible Git baseline explicitly.

```bash
git pull
make update
```

`make update` creates a database backup, rebuilds the app and migration images, runs
the migration/seed container, starts the new app, and checks health. It is safe to
run repeatedly. If you do not have `make`, use the equivalent commands below:

```bash
bash scripts/update.sh
```

Always run the init container after pulling. It applies `prisma migrate deploy`;
skipping it after a schema change causes missing-column errors.

The setup and update scripts rebuild both images and run the new initializer explicitly. Application startup uses `--no-deps` only after successful initialization; it cannot reuse a stale initializer as evidence that migrations ran. Commands stop on the first failure. An update error identifies the failed phase, and no later phase executes. `make rebuild` is an alias for this backed-up update flow.

Do not use `make clean` or `make reset` for upgrades: they remove database, uploads, and backup volumes and require the explicit `CONFIRM_DELETE_DATA=yes` flag. An application rollback is not automatically safe after migrations. Check the release's schema compatibility first; if incompatible, restore a matching database/uploads backup and its required keys into an isolated environment before switching traffic. This workflow does not automatically reverse migrations or roll back failed upgrades.

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
0 3 * * * cd /path/to/flexdocs && bash scripts/database-backup.sh
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

See [RECOVERY.md](docs/RECOVERY.md) for backup scope and isolated restore verification. Protect uploads and the encryption key separately from SQL dumps.

Fresh installations require a unique `BOOTSTRAP_ADMIN_PASSWORD` of at least 16 characters. `scripts/setup.sh` generates it into a mode-restricted `.env`. Existing accounts are not reset. Remove old public passwords from both legacy admins before exposing an upgraded installation. `docker-compose.discovery.yml` explicitly enables privileged local Docker discovery; base Compose does not mount the Docker socket.
