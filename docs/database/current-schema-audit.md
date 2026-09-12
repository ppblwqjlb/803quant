# Current MySQL schema audit

## Safety boundary

The database modules use Next.js's `server-only` marker. The application creates its MySQL pool lazily and sets `multipleStatements: false`, `decimalNumbers: true`, timezone `+08:00`, port range `1..65535`, and connection-limit range `1..20`.

Application queries pass through two checks before execution:

1. A conservative SQL analyzer accepts the supported subset of `SELECT`, `DESCRIBE`, `EXPLAIN ... SELECT`, and `WITH ... SELECT`, plus exactly `SHOW CREATE TABLE <approved-table>`, `SHOW TABLES [FROM|IN <schema>] [LIKE <literal>]`, and `SHOW TABLE STATUS [FROM|IN <schema>] [LIKE <literal>]`. Other `SHOW` clauses—including `WHERE`, `EXISTS`, parentheses, expressions, subqueries, and extra clauses—are rejected. MySQL `TABLE` query blocks—including `UNION`, `INTERSECT`, and `EXCEPT TABLE` forms—are explicitly unsupported and rejected. Pure built-ins are an explicit allowlist and must be immediately adjacent to `(`; whitespace, digits, `$`, Unicode, quoted names, qualification, and built-in-name routine collisions cannot turn an unknown routine into an accepted call.
2. Every supported physical `FROM`/`JOIN` target must use its canonical lower-case application name from `APPROVED_APPLICATION_TABLES`. Before the application query runs, a fixed parameterized lookup against `information_schema.TABLES` must report `TABLE_TYPE = 'BASE TABLE'` for that exact identifier. Within the supported query subset, unknown, case-distinct, cross-schema, and view objects are rejected. Only `information_schema.TABLES`, `COLUMNS`, and `STATISTICS` are metadata exceptions.

Successful base-table checks are cached for the server process. This assumes schema objects are not replaced while the process is running; deployments must restart after reviewed schema changes.

The analyzer is intentionally not a general MySQL parser. The supported deployment target is MySQL 8 with ordinary string quoting and backticks for quoted identifiers; unsupported syntax or SQL-mode-dependent identifier forms are rejected. The application filter remains defense in depth. The database account must be limited to approved base-table `SELECT` plus the three metadata views and must not receive `EXECUTE`, `FILE`, DDL, DML, lock/admin, or view-creation privileges. No view or stored-routine safety is trusted by the application boundary.

## Known export baseline

The supplied read-only schema export contains these market-data tables:

| Table | Columns | Indexes |
| --- | --- | --- |
| `adj_factor` | `ts_code`, `trade_date`, `adj_factor` | `PRIMARY (ts_code, trade_date)`, `idx_adj_factor_trade_date`, `idx_adj_factor_quant_date` |
| `daily` | `ts_code`, `trade_date`, `open`, `high`, `low`, `close`, `pre_close`, `change`, `pct_chg`, `vol`, `amount` | `PRIMARY (ts_code, trade_date)`, `idx_daily_trade_date`, `idx_daily_quant_date` |
| `daily_basic` | `ts_code`, `trade_date`, `close`, `turnover_rate`, `turnover_rate_f`, `volume_ratio`, `pe`, `pe_ttm`, `pb`, `ps`, `ps_ttm`, `dv_ratio`, `dv_ttm`, `total_share`, `float_share`, `free_share`, `total_mv`, `circ_mv` | `PRIMARY (ts_code, trade_date)`, `idx_daily_basic_trade_date`, `idx_daily_basic_quant_date` |
| `index_basic` | `ts_code`, `name`, `fullname`, `market`, `publisher`, `index_type`, `category`, `base_date`, `base_point`, `list_date`, `weight_rule`, `desc`, `exp_date` | `PRIMARY (ts_code)`, `idx_index_basic_market`, `idx_index_basic_category`, `idx_index_basic_quant_filter` |
| `index_daily` | `ts_code`, `trade_date`, `close`, `open`, `high`, `low`, `pre_close`, `change`, `pct_chg`, `vol`, `amount` | `PRIMARY (ts_code, trade_date)`, `idx_index_daily_trade_date`, `idx_index_daily_quant_date` |

These tables and their existing composite date/security indexes are candidates for reuse. Application-owned research batches, reports, evidence, timelines, metrics, and queued work should use separately reviewed tables rather than modifying the market-data tables.

`call_auction` is referenced, verify live.

## Live audit status

No live tunnel/listener was available in this environment, so `npm run db:audit` could not produce a live inventory. No production database connection was attempted and no credentials were requested, discovered, persisted, or printed.

When the required `MYSQL_*` environment variables and a live listener are available, run `npm run db:audit`. The command reads metadata only from `information_schema.TABLES`, `information_schema.COLUMNS`, and `information_schema.STATISTICS`; it does not sample user data or issue DDL/DML.
