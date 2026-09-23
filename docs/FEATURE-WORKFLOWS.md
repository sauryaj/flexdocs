# Export, linking, and onboarding reliability

## Document Trash

Single and bulk document deletion set `deletedAt` rather than removing rows. The owner can list Trash from Documents and restore a document with editing permission. Trashed documents are excluded from normal lists, search, AI/MCP queries, organization views, knowledge-base pages, reports, reminders, related items, and attachment access. Revision and attachment records remain intact. Restore makes the document private to avoid silently republishing it; existing archive status is preserved.

This workflow covers the Next.js application used by the main Docker deployment. The separate `flexdocs-go` implementation still uses permanent deletion and does not enforce Trash visibility. Do not run it against this application's database until its document paths have equivalent recovery and access controls.

`GET /api/documents?trash=true` is owner-scoped and paginated. `POST /api/documents/:id/restore` restores only a currently trashed document owned by the caller. Viewers and unauthenticated callers cannot restore. There is no automatic expiry or permanent-delete endpoint. Deletion and restoration are audited. Concurrent revision writes lock the parent; updates cannot edit an already trashed document.

Administrative portable exports include Trash and preserve `deletedAt` on import, so recovery cannot silently reactivate deleted articles. Full SQL/uploads backups also retain this state. Apply the `document_trash` migration and regenerate Prisma before starting the updated app; rebuild and rerun the initializer for Docker installations.

The local preview on port 3101 was verified against the disposable `flexdocs-features-db` PostgreSQL database at `127.0.0.1:55432`, with Redis at port 56379. The repository `.env` defaults to database port 5432, which may be a historical tunnel. Do not assume an unqualified `npm run dev` uses the disposable database; pass the intended connection explicitly. Production database identity and backups require separate verification.

## Portable exports

Full and organization JSON exports are administrator-only because they include decrypted vault secrets. Organization exports include records assigned to that organization; unassigned documents and links to records outside the export are excluded. Revision history and attachment bytes are included. A missing/unreadable file, an attachment exceeding 14 MB, or a vault decryption failure returns HTTP 422 with an issue list instead of a successful incomplete file. The export screen displays these issues.

These JSON files are portable data snapshots, not complete system backups. They exclude accounts, sessions, audit history, integration settings, and other unsupported system records. Continue using the database/uploads/keys recovery procedure for disaster recovery. Import remaps supported owned records to the importing admin, restores document revisions, and reports missing bytes or failed records. Existing records are skipped; import is not transactional across the entire bundle and partial results must be reviewed.

## Search and linking

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
