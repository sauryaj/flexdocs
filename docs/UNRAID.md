# Unraid deployment

Use the Unraid overlay so persistent state has explicit, inspectable appdata paths and PostgreSQL/Redis are not published on the host.

```bash
export FLEXDOCS_DATA_ROOT=/mnt/user/appdata/flexdocs/data
export COMPOSE_FILE=docker-compose.yml:docker-compose.unraid.yml
install -d -m 700 "$FLEXDOCS_DATA_ROOT/postgres"
install -d -m 755 "$FLEXDOCS_DATA_ROOT/redis" "$FLEXDOCS_DATA_ROOT/uploads" "$FLEXDOCS_DATA_ROOT/backups"
bash scripts/setup.sh
```

Compose Manager must use the same `COMPOSE_FILE` and `FLEXDOCS_DATA_ROOT` values. Before first start, verify the resolved mounts:

```bash
bash scripts/compose.sh config | grep -A2 -B2 "$FLEXDOCS_DATA_ROOT"
```

The initializer applies migrations and creates the bootstrap admin only when it does not exist. It does not load demo documents, vault entries, domains, or organizations. Development demo data remains an explicit action:

```bash
make seed-demo
```

Create a consistent full backup with `make backup-full`. It briefly stops application writes, leaves PostgreSQL running, captures the SQL database, uploaded bytes, protected environment/configuration, source commit, and checksums, then starts the app again. Copy the completed directory to independently protected storage; a backup on the same Unraid host is not disaster recovery.
