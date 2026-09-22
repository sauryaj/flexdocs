# Documentation reliability review

Review date: 2026-09-22. Scope: the Next.js application at the repository root, with emphasis on document editing, recovery, access control, and deployment checks. The separate `flexdocs-go/` implementation was not changed or certified by this review.

## Findings and changes

| Severity | Problem found | Change |
| --- | --- | --- |
| Critical | Any authenticated user could download the complete SQL database backup, bypassing organization boundaries. | Backup listing and download now require `backup.read` (admin only). |
| High | Document changes committed before revision/tag writes; a later failure could leave a partially saved document. | Document updates, tags, and recovery snapshots share a database transaction. Creation and duplication also create initial history atomically. |
| High | Concurrent tabs silently overwrote newer edits; overlapping saves could misreport unsaved text as saved. | The editor sends `expectedUpdatedAt`, serializes its saves, tracks the submitted snapshot, and preserves local edits on HTTP 409 or failure. |
| High | Revision creation and restore bypassed role checks. | Both mutations require `document.update` and document ownership. |
| High | The Restore button called a nonexistent `/restore` endpoint. Restore also lost the current content. | Added the endpoint alias and snapshot the current content before restoring, in one transaction. |
| High | A 15-second history throttle discarded recovery points; only body changes were captured. | Every distinct overwritten title/content/category is preserved; parent-row locking serializes revision allocation. |
| High | Backup credentials were interpolated into a shell command; interrupted dumps looked complete. | `pg_dump` runs without a shell, receives a password-free connection URL and its password via environment, writes a partial file, and publishes only a successful nonempty dump with restrictive permissions. |
| High | Readiness returned HTTP 200 during database failure; seed errors were swallowed. | Readiness returns 503 for database or configured Redis failure. Initialization stops on seed failure. |
| High | Fresh installs created public default admin passwords and the secondary seed could reset credentials. | Require a unique bootstrap password, preserve existing credentials, remove legacy-account creation and login autofill. |
| High | Default deployment exposed database/cache host ports broadly and mounted the Docker socket. | Bind database/cache ports to loopback and require an explicit discovery override for socket access. |
| High | A fresh Git checkout could not build the Docker image because the empty `public/` directory was absent. | Track a placeholder and exercise clean-checkout Docker builds in CI. |
| High | Initialization depended on downloading an undeclared TypeScript runner at startup. | Pin `tsx` in the lockfile and verify initialization on an internal network without internet access. |
| Medium | Backup execution blocked the Node.js event loop. | Run `pg_dump` asynchronously and coalesce concurrent requests per process. |
| Medium | Rotation password generation sometimes omitted required character classes, making an existing test flaky. | Guarantee each class and shuffle with cryptographic random integers. |
| Medium | Shared documents appeared in lists but could not be opened; limited editors could lose their own private docs from the list. | List and detail routes share the same owner-or-visible-organization policy; non-owners/viewers get a read-only document view. |
| Medium | Invalid dates, titles, tag payloads, pagination, and folder references produced unreliable requests. | Validation rejects invalid writes, deduplicates tags, checks folder ownership and organization access, and bounds pagination. |
| Medium | Attachments could be associated with another user's document, trusted caller-supplied size, and left files behind after database failure. | Owner validation, bounded payloads, actual byte counts, safe suffixes, and cleanup on failed metadata insertion. |
| Medium | Bulk deletion used an invalid raw SQL array binding. | Use Prisma deletion and the existing foreign-key cascades. |
| Medium | Restore scripts continued after failures; the drill dropped a fixed database name. | Fail-fast scripts, transactional SQL restore, unique scratch database, and cleanup trap. |
| Medium | A fixed-width sidebar squeezed the editor on narrow screens. | Stack the sidebar below the editor and adapt metadata fields to available width. |
| Medium | Compose ignored the configured public application URL. | `NEXTAUTH_URL` now uses the configured value. |

## Save and history contract

- `PUT /api/documents/:id` accepts partial updates. For conflict detection, include the `updatedAt` value from the last successful read/write as `expectedUpdatedAt`.
- HTTP 409 means the document changed. Preserve the local draft, reload the current document, compare, and explicitly apply the desired edits. The editor keeps the draft in the open tab and stops automatic retries after errors. It does not store an offline copy or merge edits automatically.
- Legacy API clients that omit `expectedUpdatedAt` remain last-write-wins. Each distinct overwritten document state is still preserved transactionally.
- `POST /api/documents/:id/revisions` accepts an optional message and `expectedUpdatedAt`.
- `POST /api/documents/:id/revisions/:revisionId/restore` accepts the current document timestamp in `If-Unmodified-Since-Version`. The original endpoint without `/restore` remains supported.
- Content revisions cover title, content, and category. They do not roll back tags, attachments, sharing, or folder placement.
- Automatic history pruning was removed to avoid silently deleting recovery points. Storage grows with edit history; introduce an explicit retention policy before operating at large scale.

## Verification

Final results: 117 unit tests, 44 live documentation checks, and all 27 existing smoke checks passed. Production build and typecheck passed; ESLint reports 0 errors and 179 pre-existing warnings.

The checks used a disposable PostgreSQL 16 / Redis instance on loopback ports 55432 / 56379, not the shared development database.

- Unit tests cover payload validation, timestamp conflicts, history capture, revision roles, backup roles, partial backup failures, bootstrap requirements, password generation, and readiness failures.
- The production build, TypeScript checking, and ESLint error checks pass. Existing lint warnings remain. Compatible dependency updates removed all five advisories reported by `npm audit` during this review (zero remaining at verification time).
- `scripts/document-reliability-test.mjs` exercises real authenticated HTTP requests, admin/editor/viewer boundaries, shared/private reads, rapid saves, simultaneous writers, recovery history, and restoration. It removes its fixtures and requires `DOCUMENT_TEST_ISOLATED=1`.
- The existing 27-check API smoke suite is also run against the isolated instance.
- Browser checks verified save status, restore behavior, and a stale second-tab draft remaining visible after a conflict.
- A SQL dump restored successfully into a separate scratch database, including documents and revisions. The automated full-recovery drill also restores uploaded bytes and verifies a synthetic vault secret using the original encryption key. This does not certify production backup storage or keys.

Run the live documentation suite only with a disposable seeded database and matching application:

```sh
DOCUMENT_TEST_ISOLATED=1 \
TEST_BASE_URL=http://localhost:3101 \
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:PORT/DISPOSABLE_DB \
npm run test:documents
```

CI runs this suite after the existing smoke tests against its disposable database, plus a separate Docker-based full-recovery job.

## Remaining limits and deployment work

1. **Legacy credential rotation remains an operator task.** Fresh installs now require a unique `BOOTSTRAP_ADMIN_PASSWORD`, create only `admin@flexdocs.local`, and no longer advertise demo credentials. Existing account passwords are preserved. Rotate both legacy admin accounts if they still use the previous public password before exposing an upgraded installation.
2. **Database backups are not complete disaster recovery.** Preserve the uploads volume and encryption key as well as SQL. Keep an off-machine copy. See [RECOVERY.md](RECOVERY.md).
3. **Deletion remains permanent.** There is no trash/undelete workflow; deleting documents cascades revision history. Prefer archive for routine removal. SQL backup recovery is the remaining fallback.
4. **The platform has a large attack and maintenance surface.** SSH, cloud discovery, password management, public sharing, and the Go implementation need their own focused reviews. These changes are not a whole-product security certification.
5. **Network exposure still needs an operator review.** Database and Redis host ports now bind to loopback, and the default app has no Docker socket. `docker-compose.discovery.yml` is an explicit privileged opt-in. TLS termination and external firewall rules remain deployment responsibilities.
6. **Backups are asynchronous but not durable jobs.** `pg_dump` no longer blocks the Node.js event loop; overlapping requests share the in-flight backup per process. The request still waits for completion and may outlast proxy timeouts. Large deployments should use an external scheduler or a durable job worker.
7. **Shared reading is intentionally limited.** Non-owners can read org-visible document content, but this change does not grant access to owner-only revision history or attachment endpoints.

Changes are prepared on `codex/documentation-reliability` for pull-request review. No production deployment, merge, or shared database migration was performed.
