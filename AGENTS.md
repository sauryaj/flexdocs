# AGENTS.md

Conventions and hard-won operational lessons for working on FlexDocs.
Read this before making changes — it saves rediscovering things the hard way.

## Commands

```bash
npm run dev          # Dev server (port 3000)
npm test             # Unit tests (vitest) — must pass before every commit
npm run lint         # ESLint on src/
npx tsc --noEmit     # Typecheck — must be clean before every commit
npm run test:smoke   # 27-check live API suite against http://localhost:3001
```

CI (`.github/workflows/ci.yml`) runs: lint → tsc → unit tests → fresh Postgres/Redis →
`prisma migrate deploy` → seed → build → smoke. It must be green before merging.

## Database & Migrations

- **Schema changes**: edit `prisma/schema.prisma`, then `npx prisma migrate dev --name change_summary`.
  Never use `db push` against shared/production databases.
- **Docker flow**: schema changes require rebuilding AND re-running the init container:
  ```bash
  docker-compose build init app && docker-compose run --rm init && docker-compose up -d app
  ```
  A stale init image causes silent schema drift — this caused two production incidents.
- Seed (`prisma/seed.ts`) is idempotent and creates both admins with password `admin12345`.
  Keep it idempotent: any new fixture needs a skip-if-exists guard, and uniqueness checks
  must match DB-level constraints exactly (e.g., `Domain.name` is globally unique).

## Code Conventions

- **No comments unless explaining a non-obvious decision** (why > what).
- **Every mutation route gates on RBAC** via `hasPermission(user.role, '...')` — see `src/lib/rbac.ts`
  for the permission vocabulary. Self-scoped resources (profile, own vault entries) may skip it,
  shared-resource mutations may not. There was a sweep that found ~50 ungated routes; don't regress.
- **Org scoping**: list endpoints must scope through `getOrgScope()` + `scopeOrgWhere()`
  from `src/lib/org-scope.ts`. Limited users should get "impossible filters" (`{in: ['__none__']}`),
  never empty-string matches. Single-item routes verify ownership or membership.
- **Partial updates**: PUT handlers must only write fields the client actually sent
  (`...(x !== undefined ? { x } : {})`). Never pass user-supplied *names* where Prisma expects
  relation *ids* (tags are synced via raw join-table SQL for this reason).
- **Audit trail**: significant mutations call `auditLog()` from `src/lib/audit.ts` (fire-and-forget).
- **Rate limits** live in `src/middleware.ts`: GET/HEAD 400/min-ish, writes 60 per path per IP per
  15min via Redis. Don't add chatty polling endpoints without checking limits.

## Verification Ritual

Before pushing:

1. `tsc --noEmit` clean, eslint no new errors, unit tests pass.
2. If UI changed: rebuild `app`, hit the changed pages with an admin cookie jar
   (`curl -c /tmp/a.txt /api/login ...`), confirm 200s and expected markup in SSR HTML or chunks.
3. If API changed: exercise it with curl for **admin, editor/viewer, and unauthenticated** roles —
   viewers must get 403/404, never 5xx.
4. If data model changed: also run the smoke suite; CI validates migrations against a fresh DB.
5. Clean up test fixtures you created (tickets, docs, keys) — the dev DB is shared.

## Environment Gotchas

- Host `localhost:5432` was historically an SSH tunnel, not necessarily the Docker DB.
  Verify inside containers: `docker-compose exec db psql -U flexdocs -d flexdocs`.
- Colima daemon occasionally dies → `colima start`, then re-run compose commands.
- Heavy curl testing can prune your browser session (`MAX_SESSIONS_PER_USER=25`,
  oldest-first). Re-login if the UI starts 401ing.
- Redis rate-limit counters can poison testing:
  `docker-compose exec -T redis redis-cli --scan --pattern 'ratelimit:*' | xargs -r docker-compose exec -T redis redis-cli del`
- In zsh, `UID` is readonly — use another variable name.
