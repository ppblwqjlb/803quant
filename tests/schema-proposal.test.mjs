import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const REQUIRED_PROPOSAL_TABLES = [
  "stock_basic",
  "trade_calendar",
  "stock_limit_price",
  "external_market_quote",
  "market_event",
  "intel_item",
  "research_batch",
  "daily_decision_snapshot",
  "risk_snapshot",
  "risk_signal_result",
  "strategy_definition",
  "strategy_run",
  "strategy_funnel_result",
  "strategy_candidate",
  "ipo_company",
  "ipo_stage_event",
  "ipo_metric_snapshot",
  "ipo_subscription_analysis",
  "ipo_valuation_scenario",
];

const RAW_TABLES = [
  "adj_factor",
  "daily",
  "daily_basic",
  "index_basic",
  "index_daily",
  "call_auction",
];

const APPROVED_JSON_COLUMNS = [
  "summary_points_json",
  "timeline_json",
  "kill_conditions_json",
  "rules_json",
  "evidence_json",
  "metrics_json",
];

test("schema proposal is explicitly non-executable and covers every module", async () => {
  const sql = await readFile(new URL("../docs/database/mysql-research-schema-proposal.sql", import.meta.url), "utf8");

  assert.match(sql, /DO NOT EXECUTE WITHOUT EXPLICIT USER APPROVAL/);
  const proposalTables = [...sql.matchAll(/CREATE TABLE `([^`]+)`/g)].map((match) => match[1]);
  assert.deepEqual(proposalTables.sort(), [...REQUIRED_PROPOSAL_TABLES].sort());
  for (const table of RAW_TABLES) {
    assert.doesNotMatch(sql, new RegExp("CREATE TABLE `" + table + "`"));
  }
  assert.doesNotMatch(
    sql,
    /\b(?:DROP|TRUNCATE|ALTER)\s+TABLE\b|\bINSERT\s+INTO\b|\bUPDATE\s+(?:`[^`]+`|[A-Za-z_][A-Za-z0-9_$]*)\s+SET\b|\bDELETE\s+FROM\b/i,
  );
});

test("schema proposal keeps finance types and JSON usage reviewable", async () => {
  const sql = await readFile(new URL("../docs/database/mysql-research-schema-proposal.sql", import.meta.url), "utf8");

  assert.match(sql, /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4/g);
  assert.match(sql, /DECIMAL\(/);
  assert.match(sql, /FOREIGN KEY/);
  assert.match(sql, /UNIQUE KEY/);
  assert.match(sql, /latest_successful_batch/);
  assert.match(sql, /candidate_filter/);

  const jsonColumns = [...sql.matchAll(/`([a-z_]+)`\s+JSON\b/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(jsonColumns)].sort(), [...APPROVED_JSON_COLUMNS].sort());
});

test("schema proposal enforces terminal batch and result classification integrity", async () => {
  const sql = await readFile(new URL("../docs/database/mysql-research-schema-proposal.sql", import.meta.url), "utf8");

  assert.match(
    sql,
    /CONSTRAINT `chk_research_batch_terminal_times` CHECK \(\s*`status` NOT IN \('success', 'partial'\)\s*OR \(`completed_at` IS NOT NULL AND `data_as_of` IS NOT NULL\)\s*\)/,
  );
  assert.match(
    sql,
    /CONSTRAINT `chk_research_batch_time_order` CHECK \(\s*`started_at` IS NULL OR `completed_at` IS NULL OR `completed_at` >= `started_at`\s*\)/,
  );
  assert.match(sql, /UNIQUE KEY `uq_research_batch_id_trade_date_status` \(`id`, `trade_date`, `status`\)/);
  assert.match(
    sql,
    /FOREIGN KEY \(`research_batch_id`, `trade_date`, `run_status`\) REFERENCES `research_batch` \(`id`, `trade_date`, `status`\) ON UPDATE CASCADE ON DELETE RESTRICT/,
  );
  assert.match(sql, /UNIQUE KEY `uq_strategy_candidate_run_stock` \(`strategy_run_id`, `stock_id`\)/);
  assert.doesNotMatch(sql, /UNIQUE KEY `[^`]+` \(`strategy_run_id`, `stock_id`, `candidate_type`\)/);
  assert.match(
    sql,
    /CONSTRAINT `chk_ipo_subscription_at_least_one_probability` CHECK \(`at_least_one_win_probability_pct` IS NULL OR \(`at_least_one_win_probability_pct` >= 0 AND `at_least_one_win_probability_pct` <= 100\)\)/,
  );
});

test("frontend map names every page module and the missing-data contract", async () => {
  const map = await readFile(new URL("../docs/database/frontend-table-map.md", import.meta.url), "utf8");

  for (const heading of ["全局与顶部", "今日决策台", "风控提醒", "策略信号观察", "IPO 专题"]) {
    assert.match(map, new RegExp(`## ${heading}`));
  }
  for (const table of REQUIRED_PROPOSAL_TABLES) {
    assert.match(map, new RegExp("`" + table + "`"));
  }
  for (const field of ["batchId", "dataAsOf", "source_name", "source_url", "XX"]) {
    assert.match(map, new RegExp(field));
  }
});
