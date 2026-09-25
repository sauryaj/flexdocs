# Documentation-first platform work register

Started 2026-09-24. This tracks the new nine-part platform goal. The earlier reliability improvements are the baseline, not completion of the expanded goal. Preserve Next.js, TypeScript, PostgreSQL, and existing data. No production deployment or destructive migration is authorized by this register.

## Baseline and milestones

The baseline is commit `92cd7fd` on `codex/documentation-reliability`, PR #1. CI run 35975013892 passed unit/type/lint, build/API, and isolated recovery jobs. Existing access/history/trash/export fixes must remain intact.

| Goal section | Required deliverables | Current status |
| --- | --- | --- |
| 1. Architecture | Workflow/access/deployment/job inventory; prioritized findings; module/service boundaries; Go isolation or retirement proposal; compatibility plans | Baseline inventory, boundaries, Go isolation proposal, and migration invariants in `PLATFORM-ARCHITECTURE.md`; service refactoring and concrete ownership/publication migration designs pending |
| 2. Editing | User/org/document/tab-isolated drafts; recovery; expiration/logout; honest storage and save states; navigation protection; conflict comparison; idempotent mutations; browser failure tests | New-document browser drafts now scoped with explicit copy recovery, expiry, logout invalidation, and visible storage errors; see `DRAFT-RECOVERY.md`. Existing-document recovery, full navigation/conflict/idempotency work and automated browser coverage remain pending |
| 3. Ownership | Personal/team ownership; capability matrix; shared attachment/history policy; folder/org consistency; transfer; safe migrations | Current owner-centric rules retained; new ownership design and migration pending |
| 4. Lifecycle | Draft/review/published/archive/trash transitions; published snapshots; reviewers; comparisons; comments; queues; templates; explicit retention | Trash/history/review dates present; publishing and team review pending |
| 5. Discovery | Documentation-first navigation; optional modules; consistent/accessibile UI; ranked filtered search; saved views; backlinks; keyboard/mobile verification | Pagination and scoped search present; navigation/search redesign pending |
| 6. Files/import | Bounded multipart uploads; progress/cancellation; storage interface; cleanup; import preview/results/retries; round-trip checks | Legacy base64 uploads and partially recoverable imports remain; redesign pending |
| 7. Deployment | One install/upgrade path; configured ports; failing readiness gates; correct migrations; versioned images; rollback compatibility; fresh/upgrade tests; separated destructive commands | Shared setup/update flow and failure gates tested; destructive resets gated; fresh current install and populated baseline upgrade drill pass. Versioned images and published release compatibility remain pending |
| 8. Recovery | Consistent complete backups; key custody; encrypted off-machine storage; status/integrity/drills; durable jobs; restart safety; measured 24h/1h targets | Isolated full recovery test exists; operational implementation and target measurement pending |
| 9. Quality | Browser failure coverage; upgrade tests; safe logs/IDs; operational health; justified cleanup; no new lint warnings; 10k-document benchmarks; matching docs | Existing suites retained; expanded checks and benchmarks pending |

Milestone order: data safety/deployment; access/ownership; lifecycle/usability; scale/integrations. Do not silently defer requirements. Record implementation and authoritative evidence here as each lands. All sections remain open until their stated completion evidence is available or the user explicitly changes scope.

## Findings register

| ID | Severity | Evidence and reproduction | Impact / next action |
| --- | --- | --- | --- |
| DEP-01 | High | Original Makefile `health` ended with `|| echo`; an unreachable app printed an error but returned zero. `make update` consumed that status. | False upgrade success. Replace with bounded readiness that exits nonzero and test failure propagation. |
| DEP-02 | Medium | `setup.sh` initialized `PORT` from shell/default, while Compose also reads `.env`. With only `.env PORT=8080`, setup probed 3001. | Healthy installs could time out. Resolve the actual published app port through Compose. |
| EDIT-01 | High | `documents/new/page.tsx` uses the literal `flexdocs_new_doc_draft` key without user/org/tab identity. | Draft mix-up on shared browsers/tabs. Design scoped persistence and logout cleanup. |
| EDIT-02 | High | Existing editor keeps unsaved state in memory; only a `beforeunload` handler protects it. | Interrupted sessions and internal navigation can lose edits. Implement persistent recovery and navigation protection. |
| OPS-01 | Medium | Deployment commands mix `docker compose` and `docker-compose`; setup can reuse an existing initializer path. | Inconsistent prerequisites and upgrade behavior. Unify the lifecycle with failure-injection tests. |
| TEAM-01 | Medium | Current document/folder owner is `userId`; shared readers cannot read owner-only attachment/history endpoints. | Team workflows incomplete. Design capability matrix and data-preserving migration before changing access. |
| REC-01 | High for production recovery | Recovery guide documents SQL/uploads/key requirements but off-machine backup custody is unverified. | Local backup alone does not prove disaster recovery. Implement and measure isolated complete restore workflow; production storage configuration remains operator-specific. |

## Architecture direction

Keep one deployable web application with explicit internal services for identity/access, organizations, documents, attachments, search, recovery, and integrations. Introduce a separate worker process only for durable long-running jobs. PostgreSQL remains authoritative; Redis must not be the sole record of a recoverable job. Keep local-volume file storage behind a storage interface. Review the existing Go tree before proposing retirement; do not remove it or run it against this application's database without parity analysis.

Ownership and publication migrations must preserve current private visibility, original owners, content, revision history, attachment references, and deleted state. Document an explicit mapping and test representative old data before changing schema. These are design constraints, not implemented guarantees for the future model.

## Evidence: readiness gate

`scripts/wait-for-health.sh` is used by setup, update, and `make health`. `scripts/compose.sh` selects the available Compose CLI without evaluating configuration as shell code. The probe resolves the running app's published port, requires HTTP 200, bounds requests/retries, and fails nonzero. `tests/deployment-health.test.ts` executes the actual shell entry points with disposable fake Docker/curl executables to inject delayed startup, missing port bindings, redirects, unhealthy responses, IPv6 bindings, and legacy Compose. These tests prove command behavior, not a completed fresh-install/upgrade drill. No running installation was changed for this verification.

## Evidence: setup and upgrade sequencing

`scripts/update.sh` validates Compose configuration, backs up SQL, builds both images, runs initialization, starts Redis/app, and waits for readiness. A failed phase exits nonzero and identifies the phase. Setup explicitly builds and runs initialization too. The app starts with `--no-deps` only after successful initialization. Make commands, backup, and the SQL restore drill use the shared Compose wrapper. `make rebuild` delegates to update; `clean`/`reset` require explicit data-deletion acknowledgement.

`tests/deployment-workflow.test.ts` copies the real entry points into disposable directories and injects failures in validation, backup, build, migration, service startup, and readiness. It checks ordering, aborted subsequent steps, partial-backup cleanup, preserved configuration, legacy Compose, and reset protection. These complement the real container drill below; fake executables alone do not prove migration correctness. No live installation is upgraded by these tests.

## Evidence: actual installation and upgrade

`npm run test:deployment` passed locally in 349 seconds using disposable project `flexdocs-deployment-821c67bbd809`. It installed baseline `92cd7fdffe7243ee9d4c87b3abc28fb1ee2861e7`, populated synthetic records, ran the real update script against the working source, and verified content, tags, privacy, revision history, exact attachment bytes, vault decryption, Trash, preserved login credentials despite a changed bootstrap password, unchanged configuration, and a pre-upgrade SQL backup. It then removed those disposable volumes and successfully installed the current source into fresh volumes. The drill completed cleanup with exit code zero.

The baseline is an earlier reliability commit, not a published release. This does not establish compatibility with every historical schema or measure disaster-recovery RPO/RTO. CI now includes this same drill with full Git history so the pinned baseline is available. Local unit/type/lint verification remains 171 tests passing, clean TypeScript, and zero lint errors (172 warnings).
