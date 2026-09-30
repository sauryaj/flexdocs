# Document ownership and publication migration design

Status: staged implementation contract. Migration `20260930065322_documentation_ownership_foundation` adds document/folder ownership kinds defaulting to personal, a nullable document maintainer reference and an explicit organization documentation grant table. Database checks require an organization for organization ownership. No existing record is converted and no grants are created. Conversion, grant management, capability enforcement and publication remain pending; do not manually enable team rows or grants as a substitute for those services.

## Verified starting point

`Document.userId` and `Folder.userId` are required user relations; both resources can also have an organization. `visibility` is a string (`private` or `org`), not an ownership type. `DocumentRevision.userId` records the revision actor. Attachments have their own uploader and an optional document relation.

`document-access.ts` permits non-trashed owner reads and non-archived organization-visible reads within `getOrgScope()`. The document GET route reports editability only for the owner with `document.update`; write and revision routes remain owner-scoped. Attachment retrieval is scoped through `getAttachmentData(id, user.id)`. An organization-visible document therefore does not currently imply shared attachment or history access.

`org-scope.ts` grants all-organization scope to global administrators and legacy editors with no memberships. Other users with memberships are limited to those organizations; viewers without memberships have no shared scope. Membership roles currently use `client` and `org_admin`, while global roles are `viewer`, `editor`, and `admin`. Neither vocabulary currently defines reviewers. Do not silently reinterpret either role as a grant to edit someone else's document.

## Target model

Separate three decisions: who owns the resource, who may maintain its working copy, and which snapshot readers can see.

```text
Personal owner or organization owner
                 |
      Document working copy ---- revisions / review feedback
                 |
          authorized publish
                 |
     immutable published snapshot ---- snapshot attachments
                 |
       authorized reader surfaces
```

Fields/tables below describe the target contract; ownership kinds, maintainer references and documentation grants exist in the schema foundation. The remaining publication fields are proposed, and these names are not public API parameters:

- Document and folder `ownershipKind`: `personal` or `organization`, default `personal`. Keep existing `userId` for compatibility and provenance; do not repurpose it as the last editor.
- Organization ownership requires a non-null `organizationId`. Personal documents may retain their existing organization association and sharing audience without becoming team-owned.
- A nullable `responsibleUserId` identifies the maintainer of a team document. It is not an access grant. Removing a member can leave the document unassigned and visible in the team's review queue.
- An explicit organization documentation grant stores `reader`, `contributor`, `reviewer`, or `administrator`. This is separate from portal membership roles and other module permissions. Grant changes are audited and restricted to an authorized administrator.
- Document `state`: `draft`, `in_review`, `published`, `archived`, or `trashed`; a `publishedSnapshotId` can remain present while newer changes are in review. State alone never determines which body a reader receives.
- An immutable publication snapshot contains title, Markdown, category, tags and reader-visible metadata, source revision identity, publisher, publication time, and attachment references. File replacement must create a new immutable attachment version; never mutate bytes referenced by a published snapshot.
- Review feedback identifies the document and immutable submitted revision. Approval of an older revision cannot publish a newer working copy.

Folder ownership and organization must match a document before assignment. A team folder cannot contain personal documents. Legacy mismatches are reported during preflight; migration must not silently move, reveal, or delete them.

## Capability matrix

This matrix applies only after explicit conversion to team ownership. Every capability requires the correct organization grant; global roles alone do not create team-content grants. Global administrators may explicitly provision documentation grants, with an audit record. Anonymous requests receive no access.

| Team action | Reader | Contributor | Reviewer | Documentation administrator |
| --- | --- | --- | --- | --- |
| Read published snapshot and its attachments | Yes | Yes | Yes | Yes |
| Read working copy and internal revision history | No | Yes | Yes | Yes |
| Create/edit working copy, upload working attachments | No | Yes | Yes | Yes |
| Submit for review and comment on submitted revision | No | Yes | Yes | Yes |
| Approve/publish an exact revision | No | No | Yes | Yes |
| Restore history into a new draft | No | Yes | Yes | Yes |
| Archive, move to Trash, restore from Trash | No | No | No | Yes |
| Reassign responsible maintainer | No | No | No | Yes |
| Transfer between organizations or to personal ownership | No | No | No | Explicit transfer workflow |
| Permanent deletion | No | No | No | Explicit retention/purge workflow |

Personal content stays owner-only for working copies, history and mutations, with existing global RBAC restrictions. Existing organization-visible personal content retains its legacy reader audience until an explicit owner action changes it. Published shared attachment access must be disclosed and authorized when that content adopts the new publication model; do not expose legacy owner-only files merely because their parent body was shared.

Unknown grants deny access. A contributor/reviewer grant cannot bypass a global read-only account restriction; grant assignment rejects incompatible global roles. Existing `client` and `org_admin` memberships receive no automatic write/review capability. Legacy reader access is retained by the compatibility policy, not by inventing reviewer grants. Newly created team documents require explicit grants and have no legacy staff-wide fallback.

## Safe migration sequence

The first compatibility check is implemented as `npm run audit:ownership`. Set an explicit `DATABASE_URL` for the intended installation. It runs a PostgreSQL read-only, repeatable-read transaction, selecting identifiers and ownership/visibility metadata without content, titles or file bytes. Exit codes are 0 for no detected structural ambiguity, 2 for findings and 1 for inspection failure. It checks unknown visibility, shared records without organizations, document/folder organization and owner mismatches, folder ancestry and cycles. Proposed legacy lifecycle counts preserve Trash-over-archive precedence. A passing preflight is only a data-shape gate: it does not prove the capability matrix, authorize migration, or enable team ownership/publication. Findings require an explicit preservation/repair decision before migration; no automatic repair runs.

1. Build representative fixtures containing private/shared personal documents, organizations, memberships, unassigned documents, archives, Trash, revisions, files, and mismatched folders. Record access outcomes for owners, non-owners, staff editors, scoped members and administrators across all read surfaces.
2. Add ownership fields with personal defaults. Backfill provenance and lifecycle without changing owner, organization, visibility, timestamps, content, tags, IDs, or bytes. Preflight unknown visibility values and shared records missing an organization; fail with record identifiers requiring review instead of guessing a mapping.
3. Add snapshot support with a compatibility read adapter. For existing active shared content, preserve the exact current reader-visible body/metadata as its initial legacy snapshot. Private and archived content does not acquire a new reader audience. Trash takes precedence over archive; preserve archive provenance for later restoration. Initial snapshots must not expose previously owner-only attachments or draft history.
4. Before enabling the new model, route UI API, search (including counts/snippets), portal, exports, AI, MCP, revisions and attachment reads through one access/publication service. Caller-specific filters cannot widen its result. Reader exports include only authorized published representations; owner recovery exports keep private working state and history under a separate capability.
5. Add explicit team conversion preview: source owner, target organization, target grants, affected folders/files, reader audience before/after, and publication effect. The personal owner must authorize conversion; a system administrator cannot silently seize personal private content. Reject mixed-ownership folder trees or require an explicit per-resource plan. Copying files into a new publication must be deliberate.
6. Convert using a transaction with expected document version, locked ownership state, revalidated memberships, durable retry key, and transactional audit record. Preserve creation idempotency tombstones and original authorship. Transfer must not let the old creation key recreate or retrieve content after access is lost.
7. Keep compatibility fields until old writers are retired and round-trip/migration coverage passes. Do not deploy the Go backend or an older web image against team-enabled data. Old code would ignore team grants and published snapshots even if the additive schema still permits its queries.

No automatic bulk conversion is planned. Organization association is insufficient evidence of team ownership. This preserves private content and the existing working installation while owners adopt the new model deliberately.

Initial lifecycle mapping is deterministic: `deletedAt` present maps to `trashed`; otherwise `isArchived` maps to `archived`; otherwise valid `visibility=org` maps to `published` with the compatibility snapshot; remaining private records map to `draft`. Preserve both old flags when a trashed record was also archived. No existing record is inferred to be awaiting review. These labels must not change the legacy access outcomes before explicit conversion.

## Lifecycle and transfer invariants

- Publishing requires permission and an exact submitted revision. Snapshot creation, publication pointer, lifecycle state, and audit event commit together. Concurrent edits or approval attempts return a conflict, not an implicit merge.
- Saving a working copy cannot alter the published snapshot. Restoring history produces a new draft and cannot republish it. Archiving or trashing removes reader visibility across every surface, including files and AI retrieval.
- Restoring a trashed personal document remains private. Restoring a team document returns a draft visible to maintainers; readers regain access only after a new authorized publication.
- A reviewer may publish their own work for a small-team installation; strict two-person review is a later configurable policy, not an implied guarantee.
- Team maintainer reassignment within an organization changes responsibility, not ownership or audience. Departing users do not strand team documents. Removing the last documentation administrator requires a replacement grant first.
- Cross-organization transfer requires authority in both organizations and an explicit audience preview. Clear folder placement unless a compatible target is selected; reset publication pending review in the destination. Preserve audit/provenance and revoke source-team access atomically.
- A personal owner leaving without authorizing transfer is an unresolved recovery case, not permission to expose their private content. Preserve the account/data until a separately authorized recovery policy exists; account deletion must check these dependencies.
- Automatic permanent deletion remains disabled. Retention/purge implementation must account for published attachment references, recovery exports, and retry tombstones before removing bytes.

## Implementation gates and evidence

1. Pure policy and query-predicate tests must cover the complete matrix, unknown roles, global read-only ceilings, legacy staff scope, and denied cross-organization access.
2. Live integration tests must exercise the same fixtures through document lists/details, folders, history, attachment list/download/preview/delete, search results/counts/snippets, export, portal, AI retrieval and MCP. Test permission revocation between initial read and mutation.
3. Migration tests compare pre/post access sets and exact content/history/file hashes; every existing private record remains private. Ambiguous fixtures cause actionable preflight failure, not silent repair.
4. Browser tests cover owner conversion preview/cancel, contributor editing, reader seeing the unchanged published version, reviewer conflicts, departure reassignment, archive/Trash/restore, and lost-response transfer retries.
5. Backup/restore and portable import/export must preserve the new ownership/publication state. Old-format imports default to personal ownership and cannot assign team grants or publish through unchecked fields.
6. Document the first compatible app revision and prohibit older-writer rollback once team state exists. Recovery requires a tested matching database/uploads/configuration/key set. Production migration remains subject to explicit authorization.

The foundation migration was tested against a populated disposable database containing private/shared/archived/trashed/unassigned documents, a folder, revision history and exact base64 attachment bytes. JSON comparisons excluding only the newly added fields proved existing values unchanged, personal defaults/null maintainers and no grants. Organization-required constraints rejected invalid document/folder updates. All migrations also applied to a fresh disposable schema. The local disposable preview was backed up before migration and passed 135 feature and 134 document reliability checks afterward; 250 unit tests and types passed. No production migration or updated Docker image is claimed.

The shared capability matrix is now implemented in `document-capabilities.ts`. Personal document detail editability, update and deletion use that policy while retaining owner-scoped lookups. `document-capability-service.ts` resolves team grants through a current membership query, selecting only the caller's grant and accepting a transaction client for mutation integration. Unknown grants, missing membership and database failures never infer access. The resolver is not yet wired across runtime surfaces; this is not team enablement.

Validation: 258 unit tests and 134 live document checks passed for the initial policy integration, with clean types and zero lint errors. A subsequent PostgreSQL-backed test proves a contributor grant permits editing while membership exists and denies editing immediately after membership removal, even while the grant remains. CI runs this test alongside AI provider-context boundaries after applying migrations. It uses mocked route authentication and a local provider stub, not live session authentication. The local preview needed a restart after Prisma regeneration: its old client omitted the new ownership field, which correctly caused the policy to deny writes. Deployments must use rebuilt application and initializer images.

The broader gates above remain requirements. The current runtime still uses owner-centric access/writes and does not consume documentation grants or serve published snapshots. Team enablement requires consistent service integration, explicit conversion, audience/attachment consent, compatible exports and migration/browser verification.
