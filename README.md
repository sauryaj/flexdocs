# FlexDocs

IT documentation & management platform — a self-hosted IT Glue alternative.

## Features

- **Document Library** — Nested folders, version history, attachments, move between folders
- **Password Manager** — AES-256-GCM encryption, generator, favorites, sharing
- **Domains Management** — WHOIS/DNS tracking, SSL certificates, expiry alerts, CSV import/export
- **Flexible Assets** — Custom asset types with dynamic fields
- **Checklists** — Interactive checklists with progress tracking
- **Organizations** — Multi-tenant resource organization
- **Relationships** — Link any resources together
- **Global Search** — Search across all modules
- **MFA/2FA** — TOTP authenticator with recovery codes
- **Webhooks** — Event-driven integrations with HMAC signatures
- **Activity Log** — Full audit trail with CSV/JSON export
- **Templates** — Reusable document templates
- **Session Management** — View and revoke active sessions
- **Keyboard Shortcuts** — Ctrl+K search, Ctrl+N new document
- **Theming** — Light/Dark mode with 8 accent colors

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS 3
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL 16
- **Cache**: Redis 7
- **Proxy**: Caddy (HTTPS)
- **Language**: TypeScript

## Quick Start

### Docker (Recommended)

```bash
git clone https://github.com/sauryaj/flexdocs.git
cd flexdocs
cp .env.example .env
# Edit .env with your secrets
docker compose up -d
```

Open http://localhost:3001

### Local Development

```bash
# Start PostgreSQL
docker run -d --name flexdocs-pg -p 5432:5432 \
  -e POSTGRES_DB=flexdocs \
  -e POSTGRES_USER=flexdocs \
  -e POSTGRES_PASSWORD=flexdocs \
  postgres:16-alpine

# Setup
npm install
cp .env.example .env
npx prisma db push
npx tsx prisma/seed.ts
npx tsx prisma/seed-orgs.ts

# Run
npm run dev
```

Open http://localhost:3001

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://flexdocs:flexdocs@localhost:5432/flexdocs` |
| `ENCRYPTION_KEY` | AES-256 key for password encryption | Required |
| `NEXTAUTH_SECRET` | Session secret | Required |
| `REDIS_URL` | Redis connection string | Optional |
| `SMTP_HOST` | SMTP server for email notifications | Optional |

## API Endpoints

- `GET /api/health` — Health check
- `GET /api/search?q=...` — Global search
- `GET /api/activity/export?format=csv` — Audit log export
- `POST /api/documents/bulk` — Bulk operations
- `POST /api/mfa/recovery-codes` — Generate recovery codes
- `GET /api/sessions` — List sessions
- `POST /api/webhooks` — Create webhook
- `POST /api/passwords/share` — Share password

## Development

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run test         # Run tests
npm run lint         # Lint code
```

## License

MIT
