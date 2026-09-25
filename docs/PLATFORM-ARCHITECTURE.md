# Documentation-first architecture baseline

Inspected 2026-09-24. This inventories the current implementation and defines incremental boundaries for the platform goal. It is not a claim that the proposed model already exists.

## Current boundaries and intended ownership

| Module | Current implementation | Responsibilities and direction |
| --- | --- | --- |
| Identity/access | `src/lib/auth.ts`, `session.ts`, `rbac.ts`, `org-scope.ts`, `api-keys.ts` | Resolve authenticated actor and scope once; expose capabilities to all callers. Keep secrets and session handling outside content services. |
| Organizations | `OrganizationContext.tsx`, organization API routes, `Organization`/`OrganizationMember` schema | Browsing context is a filter, not authorization. Define personal versus team ownership before migrating documents. |
| Documents | Document API routes, `document-write.ts`, `document-access.ts`, document dashboard pages | Existing transactional writes, snapshots, and conflict checks are reusable. Extract remaining creation, lifecycle, transfer, and restore rules into a service consumed by all write paths. |
| Folders | Folder API routes, `folder-input.ts`, sidebar and move picker | Maintain tree validity, owner/org consistency, and content preservation on deletion. Coordinate document moves through the document service. |
| Attachments | Attachment API routes, `file-storage.ts`, `document-client.ts` | Replace JSON/base64 transport incrementally; retain local filesystem adapter. Centralize authorization through the parent document policy. |
| Search | Search API routes, `search-results.ts`, library query handlers | Apply access policy before ranking, counts, and snippets. Benchmark PostgreSQL search before introducing another data store. |
| Import/export | `import.ts`, `export.ts`, import/export API routes | Portable transfer includes document relationships/history/files but is distinct from disaster recovery. Introduce preview and explicit record outcomes; route document writes through shared services. |
| Recovery | `backup.ts`, backup API routes, database-backup/restore/full-recovery scripts | Current backups are asynchronous per-process work. Move orchestration into durable jobs and preserve a verifiable manifest of database/files/configuration. |
| Jobs | `instrumentation.ts`, `register-jobs.ts`, `scan-runner.ts`, `maintenance-jobs.ts` | Current Node web process registers timers and cron callbacks. A durable worker must own retries, leases, restart recovery, and deduplication before horizontal scaling. |
| Integrations | AI/MCP API routes, discovery/tenant sync/webhook libraries | Use shared document capability and publication policy; these must not independently reinterpret team access. Optional modules must disable scheduled work as well as navigation. |

The initial deployment remains one web application, PostgreSQL, Redis, local file volumes, and an initializer. A worker is a separate process of the same codebase, not a separate product or independently owned microservice. Persist job intent/results in PostgreSQL; Redis can coordinate/cache but cannot be the only recoverable job record.

## Current workflows

Creation stores a user-owned document with optional organization/folder, tags, and initial history. Editing uses expected timestamps and serialized transactions to preserve overwritten title/content/category. Library moves send partial updates. Delete places records in owner-only Trash; restore returns them privately. Shared reading uses organization visibility, while revisions and attachments currently remain owner-scoped. Review dates do not constitute a publication workflow.

The new-document form currently persists one browser draft key; the existing editor holds unsaved edits in memory. The next data-safety milestone must introduce a draft protocol with identity, organization, document, tab identity, expiration, and explicit recovery choices. Do not attach a recovered draft to another authenticated user or silently apply it over a newer server version.

Setup generates configuration when absent, builds app/init, starts services, explicitly runs init, and gates success on readiness. Update validates configuration, takes a SQL backup, rebuilds app/init, runs migrations, starts the app, and verifies readiness. SQL alone is not a full backup. Migration completion is not evidence that an older app image remains schema-compatible.

## Migration contract for ownership and publication

1. Inventory existing private/shared, archived/trashed, unassigned/organization-assigned documents, folders, attachments, and revisions in a disposable representative fixture.
2. Add new ownership/publication fields without deleting old fields. Define explicit mappings in a migration design before running schema changes.
3. Existing private content must remain private. Assigning an organization must not itself publish it or grant new membership. Preserve original author/owner provenance even when team ownership is introduced.
4. Existing shared content needs an explicit initial published snapshot mapping. Edits must not replace the published snapshot until a permitted transition succeeds.
5. Preserve IDs, attachment references/bytes, history, tags, archive status, and Trash state. Do not prune during migration.
6. Test old-data migration and new-code access matrices before rollout. Document which older app versions remain compatible. Rollback may require restoring a consistent backup rather than reversing a migration.

These are required design invariants. New team ownership, publication state, durable jobs, and draft recovery are still pending implementation.

## Go implementation disposition

Keep `flexdocs-go/` isolated as an experimental implementation for now. Its document handler still executes SQL `DELETE FROM "Document"`, unlike the Next.js Trash contract. It has separate auth, handlers, server, Docker, and schema/model code. Shared-database operation is therefore unsupported.

Before proposing removal: inventory users/deployments and unique capabilities, document replacement/export paths, verify data migration against a disposable copy, and obtain explicit authorization for irreversible removal. Until then, do not ship it as an alternative production backend or claim feature/security parity. Existing files are preserved.

## Verification references

See `PLATFORM-GOAL.md` for findings and open milestones, `DOCUMENTATION-RELIABILITY.md` for the earlier verified fixes, `FEATURE-WORKFLOWS.md` for current transfer/access contracts, and `DEPLOY.md`/`RECOVERY.md` for operational procedures. These files should be updated alongside behavior changes, with measured results rather than inferred guarantees.
