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
- **Client Portal** — Org-scoped summary, knowledge base, ticket filing for client users
- **Renewals Tracker** — Licenses & contracts with renewal sweep alerts
- **Magic Dashboard** — Per-org pulse: expiring items, SLA breaches, offline agents, stale docs
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

The script checks Docker, generates secrets, starts everything, and waits for health.
(Manual alternative: `cp .env.example .env`, fill in secrets, `docker compose up -d --build`.)

Open http://localhost:3001 and log in with the seeded admin:

| Email | Password |
|---|---|
| `admin@flexdocs.local` | `admin12345` |

> Change the seeded password immediately in Settings → Profile.

Schema migrations apply automatically on container start (`prisma migrate deploy`). See [DEPLOY.md](DEPLOY.md) for the full guide.

### Local Development

```bash
# Start PostgreSQL + Redis
docker run -d --name flexdocs-pg -p 5432:5432 \
  -e POSTGRES_DB=flexdocs -e POSTGRES_USER=flexdocs -e POSTGRES_PASSWORD=flexdocs \
  postgres:16-alpine
docker run -d --name flexdocs-redis -p 6379:6379 redis:7-alpine

npm install
cp .env.example .env
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
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://flexdocs:flexdocs@localhost:5432/flexdocs` |
| `ENCRYPTION_KEY` | AES-256 key for password encryption (`openssl rand -hex 32`) | Required |
| `NEXTAUTH_SECRET` | Session signing secret | Required |
| `NEXTAUTH_URL` | Base URL of the instance | `http://localhost:3001` |
| `REDIS_URL` | Redis connection (**required in Docker** — powers rate limiting) | — |
| `DB_PASSWORD` | Postgres password used by docker-compose | Required |
| `SMTP_HOST` | SMTP server for email alerts | Disabled if empty |
| `SMTP_PORT` / `SMTP_SECURE` | SMTP port / TLS | `587` / `false` |
| `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | SMTP auth + sender | — |
| `MAINTENANCE_ON_BOOT` | Run maintenance sweeps at startup (`true`) | unset |
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
