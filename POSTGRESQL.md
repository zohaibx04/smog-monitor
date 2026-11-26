# PostgreSQL database

The app uses PostgreSQL 18.6 at `127.0.0.1:5432`, database `smog_db`, role `aeris`. The database listens only on this computer; other people use the frontend's LAN URL. The administrator token used by the app is separate from the database password.

The existing database was migrated on 2 November 2026: 7 locations and 1,236 readings, with verified matching content. The live app has since resumed collecting data. All 23 backend tests passed, including three against PostgreSQL.

## Start and stop

Run `pwsh -File scripts/backend.ps1` as usual. It starts PostgreSQL when needed and loads its credentials. PostgreSQL runs as a local background process, not a Windows service. Closing the backend leaves PostgreSQL available.

```powershell
pwsh -File scripts/postgres.ps1 -Action Status
# Stop the backend before stopping the database:
pwsh -File scripts/postgres.ps1 -Action Stop
```

Data files: `.run/postgresql/data`. Do not delete this directory. Local binaries: `.tools/postgres/pgsql`. These directories are excluded from version control. Copying the project through Git does not copy its database.

## First setup on another Windows computer

Download PostgreSQL Windows binaries from the [official PostgreSQL Windows download page](https://www.postgresql.org/download/windows/) and its EDB binary archive link. Extract the `pgsql` directory under `.tools/postgres`, so `.tools/postgres/pgsql/bin/initdb.exe` exists. Use PowerShell 7:

```powershell
pwsh -File scripts/postgres.ps1 -Action Setup
```

Setup creates an authenticated cluster and three databases: `smog_db` for live data, `smog_demo` for synthetic demonstrations, and `smog_test` for integration tests. It applies `database/postgresql/schema.sql`. Repeating setup preserves existing records. If port 5432 is already used, configure the existing PostgreSQL server and supply `DB_URL`, `DB_USER`, and `DB_PASSWORD` instead (see README).

Passwords are randomly generated and encrypted with Windows DPAPI in `.run/postgresql.json`, readable by the same Windows account. The app role cannot create databases or roles. Do not commit or share this configuration file. For pgAdmin, register host `127.0.0.1`, port `5432`, maintenance database `smog_db`, username `aeris`. To display your app database password privately in your terminal:

```powershell
$pg = Get-Content .run/postgresql.json -Raw | ConvertFrom-Json
[Net.NetworkCredential]::new('', (ConvertTo-SecureString $pg.Password)).Password
```

## Existing H2 data

After setup, stop the backend and run:

```powershell
pwsh -File scripts/migrate-h2-to-postgres.ps1
```

The migration requires an empty destination, backs up `backend/data/smog.mv.db`, reads H2 without modifying it, copies all four tables in one transaction, verifies SHA-256 hashes of every row, and resets identity sequences. Record IDs, timestamps, archived locations, preferences, and alerts are retained. Reports and H2 backups are saved in `.run/backups`. A failed migration rolls back inserted rows. Do not rerun it after the app has started writing to PostgreSQL.

## Backup and restore

```powershell
pwsh -File scripts/postgres.ps1 -Action Backup
```

This creates a PostgreSQL custom-format backup in `.run/backups`. Keep a copy on another drive. Restore with PostgreSQL `pg_restore` into a newly created empty database, then point `DB_URL` at that database; avoid restoring over a running app database. Database dumps are portable; the encrypted local credentials are tied to this Windows account.

## Schema and tests

The explicit schema contains `monitored_area`, `smog_reading`, `alert_preference`, and `smog_alert`, with identity keys, timezone-aware timestamps, location references, and a unique location/time/source reading constraint. Historical preference IDs in alerts intentionally survive deletion of a preference. Hibernate validates the schema rather than changing tables automatically.

`pwsh -File scripts/backend.ps1 -Test` runs the existing isolated H2 tests and PostgreSQL integration tests against `smog_test` when local setup exists. PostgreSQL test writes roll back. If using an external server, set `AERIS_POSTGRES_TEST_URL` to a separately initialized database named `smog_test`; never use the live database for tests.
