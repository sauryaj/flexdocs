# Bounded release-readiness review

Reviewed 2026-10-07 (Pacific/Auckland), application commit `3e9932432adf0cfa410da3b6b15434e879cd7ad0`, branch `codex/documentation-reliability`, [PR #1](https://github.com/sauryaj/flexdocs/pull/1). The broad nine-section goal remains paused and incomplete. This review recommends a smaller next milestone; it does not change that goal's acceptance requirements, authorize a merge or deploy an installation.

## Recommendation

Use the current application as a controlled homelab pilot with disposable or separately backed-up data. Do not continue implementing the entire roadmap automatically. Before relying on FlexDocs as the sole copy of important documentation, close the recovery, editing and release gates below. Green CI supports a pilot decision; it does not prove production operations or the entire product roadmap complete.

## Verified evidence

[Exact-head CI run 37587347517](https://github.com/sauryaj/flexdocs/actions/runs/37587347517) completed successfully in all four jobs: lint/types/unit, build/API/browser, fresh installation/populated upgrade, and isolated full recovery.

| Evidence | Observed result | Boundary |
| --- | --- | --- |
| Unit/type/lint | 320 unit tests passed; clean types; zero lint errors, 168 existing warnings | Eight database-gated tests skip in the unit job; the integration job ran eight tests in seven files successfully |
| Live regression checks | 27 smoke, 134 document reliability and 329 feature checks passed | Synthetic CI data, not an audit of an existing homelab installation |
| Browser regression | 26 Chromium scenarios passed | Most failure scenarios intercept resource responses; they verify client behavior separately from server API correctness |
| Install/upgrade | Fresh installation and populated pinned-baseline upgrade passed | The baseline is a repository commit, not proof of compatibility with every historical release |
| Full recovery | Documents/history, exact file bytes, vault decryption and access restrictions passed | Isolated synthetic drill; actual off-machine custody, operator keys and recovery targets remain unverified |

A fresh disposable local walkthrough also passed against the generated production server on 127.0.0.1:3102:

1. Create a personal document through the real API, edit with its expected version, and find it by scoped search.
2. Set up a synthetic team draft, submit/approve its review through the real API, and verify approval alone still returns 404 to a reader.
3. Publish the approved review; verify the reader receives the frozen body.
4. Open the real reader page in Chromium and inspect its rendered title and Markdown body. No resource-response interception was used in this walkthrough.
5. Trash and restore the team document through the real lifecycle API. Content remains intact, publication is cleared, state is draft, and readers remain denied until a new publication.

The team draft/memberships were fixture setup through Prisma; this is not a claim that every step was performed through the UI. Synthetic users, sessions, organization, documents, reviews/publications and activity records were cleaned up. Walkthrough log and screenshot are temporary local evidence at `/tmp/flexdocs-release-walkthrough.log` and `/tmp/flexdocs-release-reader.png`.

## Remaining work, classified

### Release gates for dependable homelab use

| Gate | Evidence / why it matters | Required exit condition |
| --- | --- | --- |
| Complete backup custody | `docs/RECOVERY.md` and `src/lib/backup.ts`: UI/Make backups contain SQL only. Uploaded bytes and original keys must be protected separately. CI proves recovery mechanics, not real off-machine backups. | One documented, repeatable backup of SQL + uploads + separately protected keys/configuration; restore a representative copy into isolation and record checksums, vault decryption and elapsed time |
| Unsaved-work navigation | `docs/DRAFT-RECOVERY.md`: ordinary links/unload are protected, but comprehensive history/programmatic navigation under failed storage remains unfinished. This is a documented coverage gap, not a newly reproduced universal data-loss defect. | Browser tests prove back/forward, organization/document switching and programmatic navigation cannot silently discard unsaved work when persistence fails; interrupted saves preserve an actionable recovery path |
| Repeatable release and rollback | `docs/PLATFORM-GOAL.md`: installation/upgrade pass, but versioned release images and a supported schema rollback policy remain incomplete. | Pin one pilot version with installation/upgrade instructions and an explicitly tested recovery/rollback procedure; do not promise old-image/new-schema compatibility |

These are gates for relying on the app, rather than evidence that all normal document workflows are currently broken. No new critical access failure was found in the small walkthrough; this review is not an exhaustive security audit.

### Important improvements, separately scheduled

- Personal ownership transfer with explicit recipient acceptance; guided departing-user handling. Current account administration rejects deleting document/folder owners rather than silently deleting or sharing their data (`src/lib/account-administration.ts`).
- Review queue and persistent review feedback; broader lifecycle mutation retry protection.
- Duplicate-safe file-upload retries and complete team ownership/publication export/import. Portable v1 currently rejects unsupported records with HTTP 422; SQL/uploads/key recovery remains the supported complete path.
- Durable background jobs and administrator backup/storage failure visibility. Operational automation is important before relying on unattended execution; it need not block a supervised manual-backup pilot.
- Documentation-focused navigation, keyboard/mobile journey coverage and reducing existing lint warnings.

### Optional or scale-driven work

- Saved views, backlinks and richer search ranking.
- PostgreSQL full-text evaluation and a reproducible 10,000-document benchmark before choosing additional search infrastructure.
- Optional module controls and wider integration improvements.

These remain requirements of the original goal unless the user explicitly agrees otherwise; classification only sets release priority.

## Proposed next goal

**Deliver one recoverable homelab pilot release of FlexDocs, without adding new product features.**

Acceptance criteria:

1. Record the exact application commit/image and supported schema; preserve a tested installation and upgrade path.
2. Close and verify the unsaved-navigation cases above using actual UI behavior and meaningful failure injection.
3. Provide a complete backup procedure with SQL, file bytes and separate key/configuration custody; demonstrate an isolated restore and record elapsed time and exact-content checks.
4. Document a tested version-appropriate recovery/rollback procedure and remaining operational limits.
5. Pass required checks for the resulting exact GitHub head, provide a short operator runbook, and stop for a release decision.

Stop when those five criteria pass. Do not add recipient-transfer, queue, search, module or integration features to this milestone. No dependable whole-goal time estimate is available; report progress against these exit conditions instead of extending an open-ended coding run. This proposed goal has not been created or started by this review.

## Subsequent authorized implementation

Following the user's redesign approval, the first implementation increment protects existing/new document drafts during global search-result routing, Quick Add and organization switching. These actions ask the active draft before changing the route/selection when browser persistence has failed. The unsaved-navigation release gate remains open for history/back-forward and other navigation paths. The broad nine-section goal remains paused; this increment is ordinary authorized work and does not mark it complete or reduce its scope.
