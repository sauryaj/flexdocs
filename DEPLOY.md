# FlexDocs — Deployment Guide

Use `bash scripts/setup.sh` for a new installation and `bash scripts/update.sh` for an existing installation. Makefile targets wrap these same scripts; they are not separate deployment paths. Build time depends on the host, available disk space, and cached dependencies.

Requirements: Git, Bash, OpenSSL, a running Docker daemon, and Docker Compose. Run commands from the repository root on the Docker host. `bash scripts/compose.sh` selects the installed Compose plugin or standalone executable; examples below use this wrapper consistently.

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

Open the address reported by the readiness check (default **http://localhost:3001**) and log in:

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
make restore-drill  # prove a backup restores into a scratch DB (safe)
```

---

## 4. Configure before the first start

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

This uses the same installation script, with a pause to configure it before starting services.

---

## 5. Updating to a new version

Developers can verify deployment with `npm run test:deployment` (Docker, Compose with JSON configuration output, Git history, and Node required). It runs the real setup/update scripts in a unique temporary project, publishes only the app on a random loopback port, and keeps database/cache ports private. It installs the pinned earlier reliability baseline, creates synthetic records, upgrades to the working source, verifies preservation and a pre-upgrade SQL backup, then tests a fresh current installation. All disposable containers/volumes are removed; failed-run diagnostics remain in the printed temporary directory. This is not a production upgrade or a proof that every historical version is compatible. `DEPLOYMENT_BASE_REF` selects another compatible Git baseline explicitly.

```bash
git pull --ff-only
bash scripts/update.sh
```

The update script validates configuration, creates a database backup, rebuilds the app and migration images, runs the migration/seed container, starts the new app, and checks health. `make update` runs that same script. Review local changes and the target revision before updating; a successful pull alone does not establish schema compatibility. Versioned release images are not yet provided, so record the exact Git commit deployed and retain a compatible recovery copy.

Always run the init container after pulling. It applies `prisma migrate deploy`;
skipping it after a schema change causes missing-column errors.

The setup and update scripts rebuild both images and run the new initializer explicitly. Application startup uses `--no-deps` only after successful initialization; it cannot reuse a stale initializer as evidence that migrations ran. Commands stop on the first failure. An update error identifies the failed phase, and no later phase executes. `make rebuild` is an alias for this backed-up update flow.

Do not use `make clean` or `make reset` for upgrades: they remove database, uploads, and backup volumes and require the explicit `CONFIRM_DELETE_DATA=yes` flag. An application rollback is not automatically safe after migrations. Check the release's schema compatibility first; if incompatible, restore a matching database/uploads backup and its required keys into an isolated environment before switching traffic. This workflow does not automatically reverse migrations or roll back failed upgrades.

**Back up first (recommended):**

```bash
bash scripts/database-backup.sh
```

This is a database-only backup. Preserve uploads and configuration/keys separately as described in [recovery](docs/RECOVERY.md). Restore into a prepared isolated target, not over the running installation.

---

## 6. Data & backups

| What | Where | Survives `down`? |
|---|---|---|
| Database | `postgres_data` volume | Yes |
| Uploaded files | `uploads` volume | Yes |
| UI database backups | `backups` volume | Yes |
| Command-line database backups | Host `./backups` directory | Yes |
| Configuration and keys | Private host `.env` and separately protected key custody | Yes; not included in SQL backups |
| Sessions/cache | `redis_data` volume | Yes |

`bash scripts/compose.sh down` keeps named volumes. Do not add `-v` during routine operations.

Example nightly database-only backup schedule (replace the repository path):
```
0 3 * * * cd /path/to/flexdocs && bash scripts/database-backup.sh
```

This schedule does not copy uploads, encrypt offsite copies, or report cron failures. Arrange monitoring and full recovery copies separately; see [RECOVERY.md](docs/RECOVERY.md).

---

## 7. Production notes

- Set `NEXTAUTH_URL` in `.env` to your public URL (e.g. `https://docs.example.com`)
- Put HTTPS in front — Caddy or any reverse proxy terminating TLS on port 443 → `localhost:3001`
- Use real SMTP values so email alerts and emergency-access notifications work
- Keep `.env` private (mode 600); it holds the encryption key for stored passwords
- Keep off-machine copies of completed SQL backups and uploads, with configuration and encryption keys protected separately. SQL alone cannot restore file bytes or decrypt vault records without the original key.

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `docker: command not found` | Install Docker (section 2); start Docker Desktop |
| `Cannot connect to the Docker daemon` | Daemon not running — start Docker Desktop / `sudo systemctl start docker` / `colima start` |
| Port 3001 in use | `PORT=8080 bash scripts/setup.sh`, or stop the other service |
| Port 5432 in use | Inspect which service owns the port before changing it. Edit the database's host-port mapping in `docker-compose.yml` if needed; the application uses the internal database port. |
| Init container fails | Read the setup/update command's initializer output. Diagnose the reported configuration, database, or migration failure before retrying the supported script. Do not bypass initialization to start the app. |
| App returns 500 or readiness fails | Inspect `bash scripts/compose.sh logs --tail 100 app db redis` and run `make health`. Diagnose the failing dependency instead of assuming a fixed startup delay. |
| Migration complaints | `bash scripts/compose.sh run --rm init npx prisma migrate status` inspects migration status; preserve data and investigate failed migrations before another upgrade attempt. |
| Requests return 429 | Inspect the affected endpoint and traffic, stop excessive polling/testing, and allow the rate-limit window to expire. Do not clear all rate-limit counters on a shared installation as a routine fix. |
| Login rejected with bootstrap credentials | Bootstrap credentials apply only when the account is first created. Seeding does not reset an existing password. Use another authorized administrator to recover access; do not reset the database to fix login. |
| Forgot admin password entirely | Preserve the database and backups. Account recovery requires a targeted credential reset after verifying the account and database. Running the initializer will not change an existing password. |
| PostgreSQL recovery loop or Redis persistence errors with `No space left on device` | Check database/Redis logs and `docker system df`. Docker's virtual disk may be full even when the host has free space. Remove only identified, unused build artifacts or expand Docker storage; preserve database/upload volumes and recovery images. Then verify database readiness, Redis persistence status, and application readiness. |

Still stuck? Collect `bash scripts/compose.sh logs --tail 100 app db redis` and `make status`. Review and redact secrets, document content, and personal data before sharing diagnostics.

## 9. Destructive operations and restore

`make clean` and `make reset` require `CONFIRM_DELETE_DATA=yes` and delete persistent data, including database, uploads, and container backup volumes. They are for an intentional disposal/reset only, never upgrades or login troubleshooting.

`make restore FILE=<SQL_BACKUP_PATH>` writes to the configured database. Choose and prepare an isolated recovery target first; a plain SQL dump generally cannot be restored over an already populated database. Follow [RECOVERY.md](docs/RECOVERY.md) and verify the restored installation before switching traffic.

See [RECOVERY.md](docs/RECOVERY.md) for backup scope and isolated restore verification. Protect uploads and the encryption key separately from SQL dumps.

Fresh installations require a unique `BOOTSTRAP_ADMIN_PASSWORD` of at least 16 characters. `scripts/setup.sh` generates it into a mode-restricted `.env`. Existing accounts are not reset. Remove old public passwords from both legacy admins before exposing an upgraded installation. `docker-compose.discovery.yml` explicitly enables privileged local Docker discovery; base Compose does not mount the Docker socket.
