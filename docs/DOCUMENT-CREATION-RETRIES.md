# Retrying document creation

`POST /api/documents` accepts an optional UUID `Idempotency-Key` header. The new-document UI generates this key before submitting and stores the exact request alongside its account-scoped browser draft. API clients should retain one key and the same payload until the outcome is confirmed. Omitting the header preserves compatibility but does not prevent duplicate creates.

| Outcome | HTTP status | Behavior |
| --- | --- | --- |
| First successful request | 201 | Document, initial revision, and request record commit in one transaction |
| Same account, key, and normalized payload | 200 | Returns the current document without modifying it; `Idempotency-Replayed: true` |
| Same account/key, different payload | 409 | No write; retry the original payload |
| Previously created document is trashed, deleted, or no longer owned by this account | 410 | No recreation; a deleted document retains its request tombstone |
| Missing identity or creation permission | 401/403 | Authentication and RBAC still apply to retries |
| Current document organization is inaccessible | 403 | Retry cannot bypass current organization access |
| Malformed key or invalid document | 400 | No creation |

Keys are scoped to the authenticated account. Normalization includes default values, sorted unique tags, and normalized review timestamps; exact Markdown whitespace remains significant. Only the request hash is stored on the server, not another copy of its contents. The response contains the current document, so retries cannot reset later edits. Audit creation events run only for a new creation.

After an uncertain network response, the UI pauses editing and offers **Retry original save**. Reloading and restoring the browser draft retains the original key and payload. Successful creation removes the current editor's draft; older recovery copies remain safe to retry with the same key. Clearing an uncertain draft requires confirmation because it abandons that retry link. Browser storage failure is reported: same-page retries retain their key in memory, but a reload cannot be promised safe without a persisted request. Keep that page open until the outcome is confirmed.

Migration `20260927033930_document_creation_idempotency` adds `DocumentCreationRequest` and indexes/foreign keys. It does not rewrite existing documents. Request records have no automatic expiry: deleting them could turn an old retry into a new creation. They are included in full SQL backups; portable document JSON does not carry retry records. Account deletion cascades its records, and document deletion nulls the reference while retaining the tombstone. Old application versions can ignore the additive table, but do not provide retry protection; do not drop the table as a rollback shortcut.

The shared creation service also verifies that the selected folder is owned by the creator and belongs to the same organization as the document. Keyed creations serialize on the account row before checking or recording their outcome. No external calls occur inside the transaction.

Verification: live API checks cover concurrent requests, one initial revision, account isolation, rejected changed payloads, RBAC/anonymous callers, current-content preservation, Trash/deletion tombstones, malformed keys, and folder organization mismatches. A Chromium test injects a lost response, reloads the draft, and asserts the exact same key/payload on retry. This contract currently applies to document creation only; duplicate, import, upload, and other mutation endpoints still need their own retry contracts.
