# analytics_sync

Azure Function that mirrors the entire production Postgres database to a
separate analytics Postgres, for the management console to read from
without querying production directly. Per direction from the tech lead:
"create a copy of our prod database onto another database" - every table,
not a curated subset.

Simplified from the target design for now: both databases are reached over
public endpoint + firewall rules (matching how every other Postgres
connection in this repo already works), not the private-endpoint/VNet
topology in the full diagram. That network-isolation layer can be added on
top later without changing this Function's logic - it only cares about two
connection strings.

## How it works

- **Timer-triggered**, every 15 minutes (`function_app.py` - NCRONTAB
  `0 */15 * * * *`).
- **Tables are discovered dynamically** from the source's `public` schema on
  every run - nothing is hardcoded, so a table added to prod later shows up
  in the mirror with no code change.
- **UPSERT per table** (`INSERT ... ON CONFLICT DO UPDATE`), not a full
  `TRUNCATE`-then-reinsert. Which rows get read from the source depends on
  the table:
  - A table with a column literally named `updated_at` (`active_sims`,
    `rica_records`) is filtered by `updated_at > last_watermark` - only new
    or changed rows are read and transferred each run.
  - Every other table gets a full read every run, even ones that are
    insert-only today (`notifications`, `process_log`, `api_call_log`, ...).
    `created_at` is deliberately **not** treated as a watermark, even where
    it's the only timestamp column present: `information_schema` alone can't
    tell an insert-only table apart from one where UPDATEs just don't touch
    `created_at` - which is exactly what `selfies`
    (`liveness_status`/`liveness_score`) and `sim_swap_orders` (`status`) do.
    Filtering either of those on `created_at` would silently stop syncing a
    row's later updates forever, the moment it first fell behind the
    watermark - this sync hit that bug for real in testing before the fix.
    The destination write is still an UPSERT either way, not a truncate, so
    there's no window where a full-read table is empty. Adding a real
    `updated_at` column to `selfies`/`sim_swap_orders` would let them (and
    only them, correctly) join the incremental path; that's a change to
    `Backend/app/db.py`'s schema, not made here.
  - A source table with no primary key at all falls back to
    `TRUNCATE`-then-reinsert, since `ON CONFLICT` has nothing to key on.
  - Watermarks persist in a `_sync_state` table created on the *destination*
    database, since a Function App's consumption-plan instances don't
    reliably keep state between runs.
- Destination tables are created automatically (types inferred from
  `information_schema.columns`, with a conservative fallback to `text` for
  anything not explicitly recognised). The source's **primary key is
  recreated** on the destination (required for `ON CONFLICT`); other
  constraints, foreign keys and indexes are not - this is a reporting copy,
  not a standby replica.
- Known gap: UPSERT never removes a row that was hard-deleted from the
  source - a deleted prod row stays in the mirror indefinitely. Acceptable
  for a reporting console at current scale; would need a tombstone/soft-
  delete convention on the source, or a periodic full reconciliation pass,
  to close. See `sync.py`'s docstring for more detail on both this and the
  full-table-read tables above.

## Setup

**1. Create the analytics Postgres** (if it doesn't exist yet):

```bash
az postgres flexible-server create \
  --resource-group <your-resource-group> \
  --name <analytics-server-name> \
  --location <region> \
  --tier Burstable --sku-name Standard_B1ms \
  --storage-size 32 \
  --version 16 \
  --admin-user <admin-username> \
  --admin-password <admin-password> \
  --public-access 0.0.0.0-255.255.255.255   # tighten to real caller IPs once known
az postgres flexible-server db create \
  --resource-group <your-resource-group> \
  --server-name <analytics-server-name> \
  --database-name analytics
```

**2. Local dev:**

```bash
cd Backend/analytics_sync
cp local.settings.json.example local.settings.json   # gitignored, fill in real values
func start
```

Requires [Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local).
`postgres_*` / `database` point at production (read-only use here, but still
real prod credentials - handle accordingly); `analytics_postgres_*` /
`analytics_database` point at the server created in step 1.

**3. Run the tests** (from this directory, using the repo's shared venv):

```bash
uv run --project ../.. pytest -v
```

Tests mock the database connections entirely (`test_sync.py`'s
`FakeConnection`/`FakeCursor`) - no live Postgres needed to run them.

**4. Deploy:**

```bash
az functionapp create \
  --resource-group <your-resource-group> \
  --name <function-app-name> \
  --storage-account <storage-account-name> \
  --consumption-plan-location <region> \
  --runtime python --runtime-version 3.12 \
  --functions-version 4 \
  --os-type Linux

az functionapp config appsettings set \
  --resource-group <your-resource-group> \
  --name <function-app-name> \
  --settings \
    postgres_host=<prod-host> postgres_port=5432 \
    postgres_username=<prod-user> postgres_password=<prod-password> \
    database=<prod-db-name> \
    analytics_postgres_host=<analytics-host> analytics_postgres_port=5432 \
    analytics_postgres_username=<analytics-user> analytics_postgres_password=<analytics-password> \
    analytics_database=analytics

func azure functionapp publish <function-app-name>
```

## Required environment variables

| Variable | Points at |
|---|---|
| `postgres_host` / `postgres_port` / `postgres_username` / `postgres_password` / `database` | Production (source) - same names `db_logger.py` already uses elsewhere in this repo |
| `analytics_postgres_host` / `analytics_postgres_port` / `analytics_postgres_username` / `analytics_postgres_password` / `analytics_database` | Analytics (destination) |

## Not done here

- The private-endpoint/VNet network isolation from the full design diagram.
- Monitoring/alerting on sync failures beyond what Application Insights
  captures automatically from an unhandled exception in the trigger.
- Backfilling history that predates this Function's first run - the first
  run has no watermark, so it copies everything that exists in both source
  tables at that point, which may be a large one-time transfer depending on
  table size.
