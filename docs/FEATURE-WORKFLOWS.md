# Export, linking, and onboarding reliability

## Document Trash

Single and bulk document deletion set `deletedAt` rather than removing rows. The owner can list Trash from Documents and restore a document with editing permission. Trashed documents are excluded from normal lists, search, AI/MCP queries, organization views, knowledge-base pages, reports, reminders, related items, and attachment access. Revision and attachment records remain intact. Restore makes the document private to avoid silently republishing it; existing archive status is preserved.

This workflow covers the Next.js application used by the main Docker deployment. The separate `flexdocs-go` implementation still uses permanent deletion and does not enforce Trash visibility. Do not run it against this application's database until its document paths have equivalent recovery and access controls.

`GET /api/documents?trash=true` is owner-scoped and paginated. `POST /api/documents/:id/restore` restores only a currently trashed document owned by the caller. Viewers and unauthenticated callers cannot restore. There is no automatic expiry or permanent-delete endpoint. Deletion and restoration are audited. Concurrent revision writes lock the parent; updates cannot edit an already trashed document.

Administrative portable exports include Trash and preserve `deletedAt` on import, so recovery cannot silently reactivate deleted articles. Full SQL/uploads backups also retain this state. Apply the `document_trash` migration and regenerate Prisma before starting the updated app; rebuild and rerun the initializer for Docker installations.

The local preview on port 3101 was verified against the disposable `flexdocs-features-db` PostgreSQL database at `127.0.0.1:55432`, with Redis at port 56379. The repository `.env` defaults to database port 5432, which may be a historical tunnel. Do not assume an unqualified `npm run dev` uses the disposable database; pass the intended connection explicitly. Production database identity and backups require separate verification.

## MCP authorization

Generic API throttling uses separate read (GET/HEAD: 400) and write (other methods: 60) counters per IP/path over the existing 15-minute window. Reading a list no longer consumes its write budget. Redis keys use `ratelimit:api:read:<IP>:<PATH>` and `ratelimit:api:write:<IP>:<PATH>`. Existing mixed counters expire naturally; deploying this change starts fresh generic budgets once. Dedicated authentication counters are unchanged. This does not change how the deployment establishes trusted client IPs.

MCP requires the authenticated owner's current role and API-key scope to permit a tool. Session callers use their role. An invalid, expired or inactive supplied key never falls back to a browser cookie. Document visibility and organization boundaries remain enforced after tool authorization; a read scope does not expose another owner's private documents.

| Tool | Required permissions (all required) |
| --- | --- |
| `flexdocs_get_document` | `document.read` |
| `flexdocs_search` | `document.read`, `asset.read` |
| `flexdocs_list_orgs` | `organization.read` |
| `flexdocs_org_pulse` | `organization.read`, `domain.read`, `asset.read`, `report.read`, `document.read` |

Search includes server/asset data, and pulse includes ticket counts, so these aggregate tools require every listed permission rather than returning unauthorized resource groups. `tools/list` advertises only permitted tools; direct calls to a known unauthorized tool return HTTP 403. Legacy `read` and `admin` scopes permit these read-only tools, still bounded by the owner's role and resource access. Unknown, empty and write-only scopes grant no MCP read access. This contract covers MCP; it does not claim that other API routes support API-key authentication.

## Portable exports

Attachment downloads preserve valid zero-byte files and return 404 when filesystem bytes are missing, retaining the database record for repair. Other filesystem failures remain errors rather than being mislabeled as missing data. Responses use `private, no-store` and `nosniff`. Legacy attachments remain uploader-only; sharing a parent document does not implicitly expose previously private files. Explicit owner-authorized attachment publication remains part of the ownership/lifecycle implementation.

`POST /api/attachments` accepts multipart form data with exactly one `file` and an optional `documentId`. Maximum file size is 10 MiB, with a 64 KiB allowance for multipart framing/fields. The reader enforces the total request limit even without `Content-Length`, before parsing or storing files. Empty files and unknown types are accepted; unknown MIME types default to `application/octet-stream`, and downloads are attachments rather than executable previews. Files are buffered within the bound, not streamed directly to disk. Unauthorized callers and non-owner document uploads are rejected. Storage writes attempt cleanup after either a partial write or a database failure; failed cleanup and process crashes still require orphan reconciliation.

The document editor sends multipart requests with transfer progress, a separate waiting-for-confirmation state, a cancel button, a 120-second timeout and a 10 MiB client-side size check. Only one upload runs per editor; changing documents/unmounting aborts its request. Cancellation and connection failures warn that the server may already have saved the file and offer attachment refresh before retrying. Duplicate-safe retry is still pending: cancellation does not guarantee server rollback. The legacy JSON/base64 path remains for existing clients.

Attachment and revision list requests cancel their predecessors and ignore stale success/error/completion callbacks. Unmounting cancels outstanding list reads. A browser regression deliberately resolves an older attachment response after a newer one and verifies that the current list remains intact. Editors are also keyed by document ID, isolating state when switching documents.

Attachment deletion commits its owner/Trash-scoped database removal before deleting bytes. Database failures preserve the file. A crash or filesystem failure after database success may leave an unreferenced file; the latter returns `cleanupPending: true` and emits an attachment-ID/error-code warning without file contents or paths. There is no automatic purge.

For a read-only inventory, set `DATABASE_URL` and an absolute `UPLOAD_DIR` belonging to the same installation, then run `npm run audit:storage` from the repository. The report includes missing record IDs, paths outside the configured root, skipped symlinks and unreferenced files with a 24-hour age indicator. It includes archived/trashed attachment references, never follows symlinks and never deletes files. Exit codes: 0 clean, 2 findings, 1 scan failure. This is not a consistent backup snapshot; concurrent writes/deletes can change results. A wrong upload root produces misleading findings. Verify configuration, pause writers for a repeat audit, retain database/uploads backups, and confirm references before any separately authorized cleanup. Age alone does not authorize deletion; unreferenced files may still be recoverable work. Automated reconciliation remains pending.

Full and organization JSON exports are administrator-only because they include decrypted vault secrets. Organization exports include records assigned to that organization; unassigned documents and links to records outside the export are excluded. Revision history and attachment bytes are included. A missing/unreadable file, an attachment exceeding 14 MB, or a vault decryption failure returns HTTP 422 with an issue list instead of a successful incomplete file. The export screen displays these issues.

These JSON files are portable data snapshots, not complete system backups. They exclude accounts, sessions, audit history, integration settings, and other unsupported system records. Continue using the database/uploads/keys recovery procedure for disaster recovery. Import remaps supported owned records to the importing admin, restores document revisions, and reports missing bytes or failed records. Existing records are skipped; import is not transactional across the entire bundle and partial results must be reviewed.

Before writing any records, portable import validates collection structure, document/folder identifiers and folder topology: duplicate IDs, missing referenced folders, cycles, and cross-organization parent/document links reject the bundle with explicit errors. If a structurally valid folder later fails to import or collides with an existing ID, dependent new documents are reported as not created instead of silently moved to the root. Failed parent linking is also reported.

The Portable Export screen now requires **Preview Backup** before **Confirm import**. Preview displays source record counts, structural validation errors, ownership/membership effects, and partial-import/retry limitations. Cancel writes nothing. Choosing another file invalidates the preview; confirmation submits the exact parsed file that was previewed. Administrators can request the same read-only check with `POST /api/import` using `type: "flexdocs-backup"`, `data: <bundle>` and `preview: true`. Execution repeats the same validation; it does not trust a previous preview. Preview does not resolve database collisions or validate every individual field, and counts are not predicted inserted rows. Imports are not yet resumable; retries cannot repair every partially imported record automatically. CSV and vault imports do not yet use this preview workflow.

Document validation includes scalar fields/dates, nested tag lists, revision records and unique revision IDs/versions, and attachment metadata/bytes. Attachments require canonical base64, matching byte length, and the existing 14,000,000-byte portable export limit; empty files and unknown MIME types are supported. Validation does not normalize Markdown or echo document content in errors. A malformed document or nested record rejects the entire bundle before writes. Other modules still need complete field validation, and database/storage failures can still produce partial execution results.

Tag creation and link failures are included in the partial-import report and prevent a successful result. If a record references an unavailable tag, its tag links are left unapplied and explicitly reported; the importer no longer silently drops the missing names. Tag names such as `__proto__` and `constructor` are preserved. A record already created before a tag-link failure remains in the imported count; automatic repair of that partial record is still pending.

## Search and linking

Folder creation validates names and colors, checks parent ownership and organization access, and inherits the parent's organization for subfolders. The sidebar follows the selected organization and refreshes the move picker after create/rename/delete. The picker offers the full folder tree through “Choose any folder”. Folder deletion runs in a serializable transaction: documents move to the root and subfolders move to the deleted folder's parent. Their content is preserved. Conflicting concurrent changes return a retryable 409 rather than leaving a partial deletion. Folder mutations are audited, and the UI reports failed requests.

The document library applies title/body search, category, folder, and archive filters on the server before paginating. Previous/Next controls expose the whole collection in pages of 50. Pinned documents sort first, followed by update time and a unique ID tie-breaker. The count reflects all matching documents, while the sidebar count covers the selected organization's accessible library. Changing organization resets filters and selection; changing filters or pages clears selection and cancels obsolete requests. Failed loads show a Retry action instead of an empty library. Moves, archive actions, and trash actions refresh the list and recover from an emptied final page.

`GET /api/documents` supports `q` (up to 500 characters), `category`, `folderId`, and `archived=false` alongside existing pagination and organization parameters. Omitting the archive parameter retains the earlier API behavior. All filters intersect the caller's access policy, and Trash remains owner-only. The live document suite covers more than 100 records with identical timestamps, full-library filters, pinned order, and private/cross-organization boundaries.

Folder moves from the document list send only `folderId` and the last observed `updatedAt` as `expectedUpdatedAt`. They never resend cached content, titles, or tags. A concurrent edit rejects the move with a reload instruction, and failed or interrupted requests leave the displayed folder unchanged. Successful moves use the complete server response, including its new version timestamp.

Document search follows the same owner-or-visible-organization access policy as document reads. Limited users only find client-visible credential metadata. Mentions and related items consume the current grouped search response. One related-items component serves document and password pages; the obsolete password component and duplicate inline document form were removed.

Relationship reads filter both endpoints; creation requires a writable source and readable target. Deletion requires readable endpoints and write access to at least one endpoint. Missing names use `related_to`, duplicates return 409, and inaccessible records return 404. Search supports certificate and network linking as well as the existing document, password, asset, domain, server, and checklist types.

## Invitation onboarding

Admins create or resend invitations from Users, optionally assigning an organization. SMTP success is reported as sent; absent/failed SMTP is clearly reported with a copyable link for manual delivery. Tokens are stored as hashes, expire after seven days, and can be accepted once. Creating a replacement link revokes prior pending links for the recipient. Revocation, expiry, replay, and concurrent acceptance are enforced server-side. Old invitations from the previously unfinished workflow must be resent.

New users supply a name and a password of at least 12 characters, receive the invited role, and are signed in after acceptance. Existing users must sign in as the invited email address first; accepting adds the requested organization membership without changing their password or global role. Organization membership uses the existing client-scope semantics. Inviting an editor into an organization therefore limits their scope, as with any other editor membership in this product.

Migration `20260922084627_invitation_organization` adds the optional organization association. Rebuild **both** app and init, rerun init to apply migrations, then restart the app. No shared/production migration was run during verification.

## Verification

`npm run test:features` requires `DOCUMENT_TEST_ISOLATED=1`, `DATABASE_URL` pointing at a disposable database, and `TEST_BASE_URL` pointing at its app. It exercises role boundaries, export isolation and failure reporting, portable document/history/file/secret round trips, relationship access, legacy import permissions, and invitation acceptance/resend/revocation/expiry/races. It removes its fixtures. CI runs it after the existing smoke and document-reliability checks.

The development server also now keeps maintenance imports inside the Node runtime. Development-only CSP permits the eval-based Next.js refresh runtime; production does not permit `unsafe-eval`.

The invitation acceptance transaction claims the link before checking the account. This serializes competing requests and ensures that the losing request reports an already-used link, rather than incorrectly requiring sign-in after the winning request creates the account. Failed identity checks roll back the claim.
