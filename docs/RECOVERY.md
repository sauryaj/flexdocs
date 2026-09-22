# Recovering documentation

A recoverable FlexDocs installation needs three separately protected components:

1. PostgreSQL SQL dump: documents, versions, users, attachment metadata, and encrypted vault records.
2. Uploaded file bytes: the Compose `uploads` volume (or `UPLOAD_DIR` for a local installation).
3. Configuration and keys: especially the original `ENCRYPTION_KEY`, plus application/SMTP/integration configuration. Store secrets separately from a publicly accessible backup.

The Backups screen and `make backup` create **database-only** backups. They do not copy uploads or keys, and there is no implemented S3/GCS environment-variable switch for automatic offsite copying.

## Routine backup

Run `make backup` from the repository root. The command fails if `pg_dump` fails and only renames a nonempty dump from `.partial` to `.sql` after successful completion. Local command-line backups live in `./backups`; UI backups use the configured `BACKUP_DIR` in the app container, normally the backups volume. These can be different locations.

Copy completed SQL files, a snapshot/archive of uploads, and separately protected configuration to another machine or storage system. To capture a consistent database/files pair, stop application writes while taking both copies, leaving PostgreSQL running. Restrict backup access: SQL dumps contain password hashes and sensitive organization data even when vault secrets are encrypted.

## Verify a backup

`make restore-drill` creates a fresh dump, restores it into a uniquely named scratch database with SQL error checking enabled, displays document/revision/attachment counts, and removes the scratch database. Any SQL error fails the command. It leaves the completed dump in `./backups`.

This proves the database dump can be restored. To prove disaster recovery, run a separate isolated FlexDocs installation with the restored database, a copy of uploads mounted at the original container path, and the original encryption key. Confirm:

- An expected document opens with the correct body and version history.
- A known attachment downloads and has the same checksum as the source.
- An authorized admin can decrypt a known test vault record.
- A viewer cannot download a database backup or modify documents/revisions.

Use synthetic records for drills. Do not test restoration over the live database.

## Restore after an incident

Preserve the failed installation and its latest data before modifying it. Restore the SQL dump into a fresh empty database with `psql -v ON_ERROR_STOP=1 --single-transaction`, then restore uploaded files and original keys into an isolated application. Apply only migrations appropriate for the application version. Verify content, attachments, history, access, and health before switching traffic.

`make restore FILE=...` targets the configured database and is an operational recovery command, not a safe inspection tool. It now aborts on SQL errors, but should only be used after choosing and preparing the recovery target. Restoring a plain dump over an already populated database will generally fail due to existing objects. Never use `make reset`, `make clean`, or `docker compose down -v` as a backup or recovery step: they delete stored data.
