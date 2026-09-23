# Export, linking, and onboarding reliability

## Portable exports

Full and organization JSON exports are administrator-only because they include decrypted vault secrets. Organization exports include records assigned to that organization; unassigned documents and links to records outside the export are excluded. Revision history and attachment bytes are included. A missing/unreadable file, an attachment exceeding 14 MB, or a vault decryption failure returns HTTP 422 with an issue list instead of a successful incomplete file. The export screen displays these issues.

These JSON files are portable data snapshots, not complete system backups. They exclude accounts, sessions, audit history, integration settings, and other unsupported system records. Continue using the database/uploads/keys recovery procedure for disaster recovery. Import remaps supported owned records to the importing admin, restores document revisions, and reports missing bytes or failed records. Existing records are skipped; import is not transactional across the entire bundle and partial results must be reviewed.

## Search and linking

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
