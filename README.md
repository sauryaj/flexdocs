# FlexDocs

IT documentation & management platform — a self-hosted IT Glue / Hudu alternative for MSPs and internal IT teams.

## Features

### Documentation
- **Document Library** — Nested folders, version history (autosave-safe snapshots), review dates & staleness tracking, attachments, markdown editor with toolbar
- **Mermaid Diagrams** — Network topologies and flowcharts render live inside documents
- **Templates** — Reusable document templates with variable substitution
- **Related Items** — Link any document to servers, credentials, assets; relationship map view
- **Duplicate/Clone** — One-click copies of documents and checklists

### Security & Access
- **Password Manager** — AES-256-GCM encryption, TOTP codes, generator, favorites, sharing links, breach checks
- **Vault Import** — Bitwarden, 1Password, Chrome CSV import
- **RBAC** — admin / editor / viewer roles enforced across every API route
- **MFA/2FA** — TOTP authenticator with recovery codes
- **Emergency Access** — Trusted contacts with delay periods
- **Session Management** — View/revoke sessions, 401 auto-logout banner
- **API Keys** — Scoped tokens with optional expiry dates

### Operations
- **My Day** — Cross-org daily queue: assigned tickets, SLA breaches, docs due for review, expiries this week, offline agents
- **Tickets** — Client/staff threads, internal notes, assignment, SLA first-response targets (urgent 1h → low 24h)
- **Client Portal** — Org-scoped summary, knowledge base, ticket filing, and shared credential vault for client users
- **Contacts & Locations** — First-class people and site records per organization
- **Website Monitoring** — 5-minute uptime checks with down-alerts and 24h uptime history
- **Renewals Tracker** — Licenses & contracts with renewal sweep alerts
- **Magic Dashboard** — Per-org pulse: expiring items, SLA breaches, offline agents, stale docs, documentation completeness score
- **Ask the Docs** — AI assistant grounded in your documentation (BYO OpenAI-compatible key; secrets never leave the vault)
- **MCP Server** — Native Model Context Protocol endpoint so AI agents (Claude, Copilot, custom) can query docs with full scoping
- **IPAM** — CIDR networks with VLAN tags and utilization computed from server IPs
- **Domains & SSL Radar** — WHOIS/DNS tracking, certificate monitoring, expiry alerts
- **Flexible Assets** — Custom layouts with typed fields (text/number/date/select/checkbox/url); starter layouts included
- **Servers & Agents** — Heartbeat monitoring, software inventory, patch status
- **Tenant Sync** — M365 & Google Workspace discovery integrations
- **QBR Reports** — Per-organization quarterly business review PDFs

### Platform
- **Global Command Palette** — `⌘K` full-surface search with relevance ranking and role scoping
- **Maintenance Automation** — Daily freshness sweeps: domains, SSL, rotation reminders, staleness digests, renewals, agent heartbeats
- **Notifications** — Realtime SSE stream + email alerts + per-type preferences
- **Onboarding Wizard** — Six-step setup progress tracker
- **Theming** — Light/dark/system, custom accent color picker, density control, font scaling, high contrast, glass/gradient effects — synced to your profile
- **Activity Log** — Full audit trail with CSV/JSON export
- **Webhooks** — Event-driven integrations with HMAC signatures

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS 3
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL 16
- **Cache**: Redis 7 (rate limiting, sessions)
- **Language**: TypeScript

## Quick Start

### Docker (Recommended)

```bash
git clone https://github.com/sauryaj/flexdocs.git
cd flexdocs
bash scripts/setup.sh
```

For a homelab, run this on the Docker host. The app is available at
`http://SERVER_IP:3001`. Put Caddy, Traefik, Nginx Proxy Manager, Pangolin, or
another reverse proxy in front of port `3001`, then set the public URL in `.env`:

```env
NEXTAUTH_URL=https://docs.example.com
```

Keep PostgreSQL (`5432`) and Redis (`6379`) private; they bind to loopback by
default. Expose only the reverse proxy over HTTPS.

The script checks Docker, generates secrets, starts everything, and waits for health.
(Manual alternative: `cp .env.example .env`, fill in secrets, `docker compose up -d --build`.)

Open http://localhost:3001 and log in with the bootstrap admin:

| Email | Password |
|---|---|
| `admin@flexdocs.local` | Value of `BOOTSTRAP_ADMIN_PASSWORD` in your private `.env` |

> Setup generates a unique bootstrap password. Manual installation must set `BOOTSTRAP_ADMIN_PASSWORD` to at least 16 characters. Existing accounts are never reset by seeding. Older installations must rotate both legacy admin accounts if they still use the old public password.

Schema migrations apply automatically on container start (`prisma migrate deploy`). See [DEPLOY.md](DEPLOY.md) for the full guide.

### Updating a homelab install

```bash
cd /path/to/flexdocs
git pull
make update
```

The update command creates a database backup, rebuilds the app and migration
images, applies migrations and seeds, restarts the app, and checks health. Keep
the database backup, the `uploads` volume, and the `ENCRYPTION_KEY` from `.env`;
all three are needed for a complete recovery.

### Local Development

```bash
# Start PostgreSQL + Redis
docker run -d --name flexdocs-pg -p 5432:5432 \
  -e POSTGRES_DB=flexdocs -e POSTGRES_USER=flexdocs -e POSTGRES_PASSWORD=flexdocs \
  postgres:16-alpine
docker run -d --name flexdocs-redis -p 6379:6379 redis:7-alpine

npm install
cp .env.example .env
# Set BOOTSTRAP_ADMIN_PASSWORD to a unique 16+ character value in .env
npx prisma migrate deploy     # or: npx prisma migrate dev (fresh DB applies baseline)
npx tsx prisma/seed.ts
npx tsx prisma/seed-orgs.ts

npm run dev
```

After changing `prisma/schema.prisma`, create a migration:

```bash
npx prisma migrate dev --name describe_your_change
```

Never use `db push` against shared databases — it skips the migration history.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Docker: `postgresql://flexdocs:<DB_PASSWORD>@db:5432/flexdocs`; host development uses `localhost` |
| `ENCRYPTION_KEY` | AES-256 key for password encryption (`openssl rand -hex 32`) | Required |
| `NEXTAUTH_SECRET` | Session signing secret | Required |
| `NEXTAUTH_URL` | Base URL of the instance | `http://localhost:3001` |
| `REDIS_URL` | Redis connection (**required in Docker** — powers rate limiting) | — |
| `DB_PASSWORD` | Postgres password used by docker-compose | Required |
| `SMTP_HOST` | SMTP server for email alerts | Disabled if empty |
| `SMTP_PORT` / `SMTP_SECURE` | SMTP port / TLS | `587` / `false` |
| `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | SMTP auth + sender | — |
| `MAINTENANCE_ON_BOOT` | Run maintenance sweeps at startup (`true`) | unset |
| `AI_API_KEY` | Enables the Ask-the-Docs assistant (OpenAI-compatible) | Disabled if empty |
| `AI_MODEL` / `AI_BASE_URL` | Model + endpoint override (OpenRouter, Ollama, …) | `gpt-4o-mini` / OpenAI |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `BACKUP_DIR` / `BACKUP_RETENTION_DAYS` | Backup location & pruning | `./backups` / `30` |
| `POCKETID_*` | Passkey auth via PocketID (optional) | Disabled |

## Testing

```bash
npm test              # Unit tests (vitest) — RBAC, vault parsing, org scoping
npm run test:smoke    # Live smoke suite — 27 API checks against a running instance
npm run lint          # ESLint
```

CI runs lint + typecheck + unit tests, then boots Postgres/Redis, applies migrations,
seeds, builds, and executes the smoke suite on every push.

## API

Interactive docs live at `/dashboard/settings/api-docs` once logged in.
Machine access uses `X-API-Key` headers (create keys in Settings → API Keys).

Popular endpoints:

- `GET /api/health` — Health check
- `GET /api/search?q=...` — Global search (role-scoped)
- `GET /api/me/my-day` — Daily queue aggregation
- `GET /api/reports/qbr?organizationId=...` — QBR PDF
- `POST /api/tickets` — Create ticket (client portal flow)

## License

MIT

## Documentation reliability and recovery

See [the reliability review](docs/DOCUMENTATION-RELIABILITY.md) for verified fixes, save-conflict behavior, access boundaries, and remaining deployment work. Follow [the recovery guide](docs/RECOVERY.md) to protect document history, uploaded files, and encryption keys. SQL backups alone are not full disaster recovery.

Local Docker discovery is disabled by default. Opt in with `docker-compose -f docker-compose.yml -f docker-compose.discovery.yml up -d --build` only when needed; the Docker socket grants control of the host. Database and Redis host ports bind only to loopback.

The root Docker deployment is the supported application path. The experimental
`flexdocs-go` service should not share this database until it has equivalent
migrations, access controls, and recoverable deletion.
