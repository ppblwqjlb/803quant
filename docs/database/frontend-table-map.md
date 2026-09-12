# Frontend field map for the hybrid MySQL proposal

This is a review map, not an instruction to create tables. It maps the current page structure from top to bottom to the proposed schema in `mysql-research-schema-proposal.sql`, while retaining the existing raw market tables. Membership, payment, redemption-code, and membership-expiry demo fields are outside this database scope.

## Shared selection, audit, and `XX` contract

- `serverDate` and the date printed in page headings come from the server in `Asia/Shanghai`; they are not database facts and never replace an event date, publication time, batch time, or IPO milestone date.
- For each research module, select the `research_batch` row for the requested `trade_date` and module. A result is displayable only when the matching batch has `status = 'success'` (or as explicitly partial when `status = 'partial'`). Both terminal displayable states are database-constrained to have `completed_at` and `data_as_of`. `batchId` is `research_batch.batch_code`; `dataAsOf` is `research_batch.data_as_of`.
- The latest-successful lookup orders the relevant current-date rows by `completed_at DESC, id DESC`. A pending/running/failed current-date batch is not replaced by a prior trade date while presenting it as current.
- Response `status` authority is `research_batch.status`, combined with row/field presence. For strategy, `strategy_run.trade_date` and `run_status` are a database-enforced mirror of the parent batch date/status through one composite foreign key; parent updates cascade to the mirror, so contradictory dates or states cannot be stored. `error_message`, `records_total`, `records_completed`, and `records_missing` drive the pending/partial/failed text and completeness labels.
- Every visible source label/link/time uses that row's `source_name`, `source_url`, and `source_published_at`; ingestion provenance uses `source_record_id`. The displayed cutoff uses `data_as_of`. If a result row has its own audit fields, those take precedence over the parent batch fields.
- `null`, `undefined`, empty/blank strings, absent JSON keys, and non-finite computed numbers render as `XX` in that exact field position. Numeric zero and boolean false are valid values. A missing row keeps its card, table row shell, timeline slot, or metric cell and shows `XX`; it never falls back to prototype constants.
- JSON is decoded only at named presentation boundaries. A missing key affects only its own display field. Invalid JSON shape marks the response partial and lists the precise field path in `missingFields`.

## 全局与顶部

| Exact position | Displayed field | Source table/column | Selection and fallback |
| --- | --- | --- | --- |
| Site header and every research page eyebrow/title date | formatted current date | API `serverDate`, timezone literal `Asia/Shanghai` | Server-generated; if unavailable, preserve heading and show `XX`. |
| Top market-status label | open/closed/non-trading state | `trade_calendar.is_open`, keyed by `exchange + trade_date`; session text from `session_open_time`, `session_close_time` | Match `serverDate`; missing calendar row is `XX`, not an assumed trading day. |
| Top previous-trading-day context | previous trading date | `trade_calendar.previous_trade_date` | `XX` when absent. |
| Module status/batch strip | status, `batchId`, `dataAsOf`, completion and error detail | `research_batch.status`, `batch_code`, `data_as_of`, `completed_at`, `error_message`, count fields | Current module/current trade date only; pending and failed remain visibly distinct. |

## 今日决策台

| Exact top-to-bottom position | Displayed field group | Source table/column | Selection, derivation, and audit fields |
| --- | --- | --- | --- |
| Page eyebrow | `TODAY'S BRIEF` date | API `serverDate` | Shared server-date rule. |
| Delay/partial banner below heading | batch state, delay/completeness text | `research_batch` where `module = 'today'`: `status`, `started_at`, `completed_at`, `records_*`, `error_message` | `batchId = batch_code`; `dataAsOf = data_as_of`; never insert older content into a delayed current batch. |
| Hero, left: “风险总览” score ring | RiskScore | `risk_snapshot.risk_score` through the current-date successful `research_batch` where `module = 'risk'` | Missing risk batch or score shows `XX`; the today batch does not duplicate risk output. |
| Hero, left: stage/headline/action | status label, stage, summary, action | `risk_snapshot.stage_label`, `stage_code`, `summary`, `action_text` | Row audit: `source_name`, `source_url`, `source_published_at`, `data_as_of`. |
| Hero, left: three bottom metrics | status coefficient, model constraint, extreme-risk hit count/total | `risk_snapshot.risk_coefficient_pct`, `exposure_constraint_pct`, `kill_condition_hit_count`, `kill_condition_total_count` | Format percentages only after null checks; `0` stays `0`. |
| Hero, right: “今日三句话” | ordered labels and conclusion text | `daily_decision_snapshot.summary_points_json` | Snapshot is the unique row for the today `research_batch`; each missing array item/label/text is `XX`. Headline/summary/action fallbacks are not synthesized. |
| Hero/page lead copy, when surfaced | market stage, headline, summary, action | `daily_decision_snapshot.market_stage`, `headline`, `summary`, `action_text` | Audit from snapshot `source_*` and `data_as_of`; parent `batch_code` supplies `batchId`. |
| “今日策略信号” section heading | official and near counts, run state | `strategy_run.official_candidate_count`, `near_candidate_count`, `run_status` joined to the strategy `research_batch` | Only `strategy_definition.strategy_code = 'momentum-gap-volume'`; no strategy 02. |
| Strategy preview tiles | rank, name, near badge, code, close, change, setup, sector, score | `strategy_candidate.rank_no`, `candidate_type`, `close_price`, `change_rate_pct`, `setup_label`, `match_score`; `stock_basic.name`, `ts_code`, `board`, `industry` | Current successful run only. Candidate `source_*`/`data_as_of` and strategy batch code remain available to the tile/drawer. |
| “公开内容重要变化” preview | author, content kind, title, change summary | `intel_item.author_name`, `content_kind`, `title`, `change_summary` | Order `published_at DESC, id DESC` within the today batch cutoff. Item attribution is `source_name`, `source_url`, `source_published_at`; missing avatar initials are presentation-only and may be omitted. |
| “本月大事件” mini timeline | date, title, category/sector/status | `market_event.event_date`, `title`, `category`, `related_sector`, `event_status`, ordered by `event_date`, `sort_order` | Event dates are business facts, never replaced by `serverDate`. Each item links to `source_url` with `source_name` and `source_published_at`. |
| “今日信息” batch card | batch date/code, completion time, completeness, covered-source count | Today `research_batch.trade_date`, `batch_code`, `completed_at`, `records_completed / records_total` | Coverage count is a distinct count of completed `intel_item.source_name` at/before `data_as_of`; unavailable numerator/denominator is `XX`. |
| “今日共识 / 最大分歧 / 关注变化” cards | aggregate label, count, explanation | Aggregation of `intel_item.content_kind`, `attention_action`, `sector`, `title`, `body_summary` bounded by batch `data_as_of`; curated summary rows may use `content_kind` values identifying consensus/divergence | If the bounded item set cannot support an aggregate, only that card's values become `XX`; no copied static summary. |
| Information filters | author, viewpoint tag, sector, result count | `intel_item.author_name`, `attention_action`, `sector`; count of matched `id` | Filters operate on the same bounded item set. Empty result is a valid empty state, not `XX`. |
| Information feed cards | author, publication time, kind/action, sector, importance, title, body, change | `intel_item.author_name`, `published_at`, `content_kind`, `attention_action`, `sector`, `importance`, `title`, `body_summary`, `change_summary` | Source line/link uses `source_name`, `source_url`, `source_published_at`; any individual missing field is `XX`. |

Raw-layer note for this page: strategy close/change evidence may be recomputed from existing `daily`, `daily_basic`, `adj_factor`, and `call_auction` during the batch, but the page reads the auditable `strategy_candidate` result. Those raw tables are not recreated.

## 风控提醒

| Exact top-to-bottom position | Displayed field group | Source table/column | Selection, derivation, and audit fields |
| --- | --- | --- | --- |
| Page eyebrow | `RISK CONTROL` date | API `serverDate` | Shared server-date rule. |
| Banner under heading | stage/action and “当前数据层” | `risk_snapshot.stage_label`, `action_text`, `current_data_layer` | Select the risk snapshot attached to the current-date risk batch. Batch code/status/cutoff come from `research_batch`. |
| Risk score card | score, status label, stage, summary, observation coefficient, model constraint | `risk_snapshot.risk_score`, `stage_code`, `stage_label`, `summary`, `risk_coefficient_pct`, `exposure_constraint_pct` | Each scalar has independent `XX`; row attribution from `source_*`, cutoff from `data_as_of`. |
| “三阶段风险链” | layer number/name/note/state | ordered entries in `risk_snapshot.timeline_json` | Expected named layers are close/base, overnight/pressure, and open/fast; each absent entry remains in place as `XX`. |
| “六信号矩阵” cards | label, contribution, display value, historical percentile, threshold, status, explanation | `risk_signal_result.signal_label`, `contribution_score`, `display_value`, `historical_percentile_pct`, `threshold_text`, `signal_status`, `explanation`, ordered by `sort_order` | Unique by `risk_snapshot_id + signal_code`; missing one of six produces an `XX` card and partial status. Signal source/audit uses its `source_*`, `data_as_of`. |
| Market-breadth signal evidence | advance/decline and index context | Result in `risk_signal_result`; computed from existing `daily`/`index_daily` | No duplicate raw breadth table. |
| Limit-down-spread signal evidence | limit-down count/rate | Result in `risk_signal_result`; computed using `stock_limit_price.down_limit_price` plus existing `daily`/`call_auction` | `stock_limit_price.source_name`, `source_url`, `source_published_at`, `data_as_of` trace the reference prices. |
| Overnight-pressure signal evidence | A50/other external quote and change | Result in `risk_signal_result`; input from `external_market_quote.symbol`, `quote_at`, `close_price`, `change_rate_pct` | Choose latest quote at/before batch `data_as_of`; source/audit comes from the quote row. |
| Industry/core-sector aggregation evidence | industry/board grouping | `stock_basic.industry`, `board`, `list_status`, joined to existing raw market rows | Missing classification makes only that grouped label/value `XX`. |
| “风险分更新时间轴” | time, score/delta, note, state | `risk_snapshot.timeline_json` ordered entries | Four visible slots (previous close, overnight, 09:25, 09:35) are preserved; absent entry fields show `XX`. |
| “极端风险阈值” summary | hit/total, triggered label | `risk_snapshot.kill_condition_hit_count`, `kill_condition_total_count`, `kill_switch_triggered` | Boolean false is valid; missing boolean is `XX`. |
| Extreme-condition rows | met state, label, display value | `risk_snapshot.kill_conditions_json` | Preserve three AND-condition positions. Missing condition/key is `XX`, and trigger is never inferred true unless the stored scalar says true. |

## 策略信号观察

| Exact top-to-bottom position | Displayed field group | Source table/column | Selection, derivation, and audit fields |
| --- | --- | --- | --- |
| Page eyebrow | `STRATEGY SCREEN` date | API `serverDate` | Shared server-date rule. |
| Run-status area beneath heading | pending/running/success/partial/failed, progress counts and elapsed time | Authoritative strategy `research_batch.status`, `records_*`, `started_at`, `completed_at`, `error_message`; mirrored `strategy_run.run_status`, plus `market_sample_count`, `runtime_ms` | Composite FK equality requires the run `trade_date`/`run_status` to match its parent batch. `batchId = research_batch.batch_code`; `dataAsOf = strategy_run.data_as_of` then batch cutoff. No older run appears as today's run. |
| Strategy title card (strategy 01 only) | index/name/title/description/enabled/version | `strategy_definition.strategy_code`, `name`, `description`, `is_enabled`, `version` | Require code `momentum-gap-volume`. “策略 01” is a UI ordinal; removed strategy 02 has no row or selector. |
| Strategy tags | run timing, universe, source state | Derived from `strategy_definition.rules_json`, enabled status, and batch/run status | Every missing expected rule/tag key shows `XX`; never label database data as demo data. |
| “规则路径” | ordered rule steps | `strategy_definition.rules_json` | Preserve the path positions (low position, test limit, consolidation, gap/volume, close confirmation); absent step is `XX`. Definition attribution uses `source_*`, `data_as_of`. |
| “今日筛选漏斗” header | batch label | `research_batch.batch_code` | This is the exact batch ID displayed beside the funnel; cutoff is `strategy_run.data_as_of`. |
| Funnel steps | step name and passed count | `strategy_funnel_result.step_name`, `passed_count`, ordered by `sort_order` | Zero is a valid completed count. Missing expected step remains visible with `XX`; row provenance uses `source_*`, `data_as_of`. |
| Candidate toolbar tabs | official and near labels/counts | `strategy_run.official_candidate_count`, `near_candidate_count`; types `strategy_candidate.candidate_type` | Allowed types are `official` and `near` only, and they are mutually exclusive per run/stock through the `(strategy_run_id, stock_id)` unique key. Counts therefore require no cross-tab deduplication. |
| Candidate board/sector filter | available board/industry values | `stock_basic.board`, `industry`, `list_status` joined through `strategy_candidate.stock_id` | Uses the indexed listed-stock classification; an unknown candidate classification is shown as `XX`, not “all”. |
| Candidate table/mobile card: identity | stock name, code, board/sector | `stock_basic.name`, `ts_code`, `market`, `board`, `industry` | Candidate must reference `stock_basic.id`; missing display dimension is independently `XX`. |
| Candidate table/mobile card: close data | close and percent change | `strategy_candidate.close_price`, `change_rate_pct` | Stored as DECIMAL result evidence from the run; raw source remains existing `daily`. |
| Candidate table/mobile card: key signals | gap, volume ratio, setup | `strategy_candidate.gap_rate_pct`, `volume_ratio`, `setup_label` | No generic JSON for these typed values. Missing field is `XX`. |
| Candidate table/mobile card: match | score and rank | `strategy_candidate.match_score`, `rank_no` | Sort official/near independently by rank then score; zero score is valid. |
| Candidate card reason | explanatory copy | `strategy_candidate.reason_text` | Missing text is `XX`. |
| Evidence drawer | evidence label/value/state rows | `strategy_candidate.evidence_json` | Each expected evidence item/key renders independently; missing JSON data is `XX`. Candidate `source_name`, `source_url`, `source_published_at`, `source_record_id`, and `data_as_of` are shown/available for audit. |

Batch computation may read existing `daily`, `daily_basic`, `adj_factor`, `call_auction`, plus proposed `stock_limit_price` and `stock_basic`. The proposal does not duplicate those raw daily/index/adjustment/auction datasets.

## IPO 专题

| Exact top-to-bottom position | Displayed field group | Source table/column | Selection, derivation, and audit fields |
| --- | --- | --- | --- |
| Page eyebrow | `IPO DUEL RESEARCH` date | API `serverDate` | Server current date only; does not alter historical IPO facts. |
| Heading right “公开资料 · 截至 …” badge | cutoff date | IPO `research_batch.data_as_of` | `batchId = batch_code`; missing cutoff is `XX`. Status derives from the IPO batch. |
| Company overview cards | status, name/full name, code, exchange/board/industry, summary | `ipo_company.current_status`, `name`, `full_name`, `ts_code`, `exchange`, `board`, `industry`, `summary` | Includes long-form company cards such as ChangXin/Unitree and commercial-space cards. Company source link/time use `source_name`, `source_url`, `source_published_at`; cutoff is `data_as_of`. |
| Company overview fact rows | core product, research coordinate, demand side | `ipo_company.core_product`, `research_focus`, `demand_drivers`; additional disclosed metrics from `ipo_metric_snapshot.metrics_json` | Each fact cell independently uses `XX`; metric snapshot must belong to the selected IPO batch/company. |
| “发行上市进度对比” header/rows | latest event, current status | Latest ordered `ipo_stage_event.event_date/event_at`, `description`, `completion_status`; status also from `ipo_company.current_status` | Historical fact dates remain their stored dates. |
| Progress track | stage, date, complete/current/planned/incomplete state | `ipo_stage_event.stage_name`, `event_date`, `completion_status`, ordered by `sort_order` | Preserve the visible 受理/问询/上市委/注册/申购/上市 positions; a missing stage is an `XX` milestone. Every milestone exposes its own `source_name`, `source_url`, `source_published_at`, `data_as_of`. |
| “核心对比矩阵” | research dimension and per-company value | `ipo_metric_snapshot.snapshot_kind`, keyed entries in `metrics_json` | Use one selected successful IPO batch. Missing company/key affects only that matrix cell. Snapshot attribution is `source_*`; cutoff is `data_as_of`. |
| “中签难度对比” header/scale | actual or scenario label, issue shares, fundraising amount, calculation basis | `ipo_subscription_analysis.analysis_type`, `issue_shares`, `fundraising_amount`, `calculation_basis` | `actual` and `scenario` must be visibly labelled; no scenario is presented as official. |
| Subscription detail rows | issue price, single-lot funds/shares, top subscription shares, required market cap, allocation count | `ipo_subscription_analysis.issue_price`, `single_lot_funds`, `single_lot_shares`, `top_subscription_shares`, `required_market_cap`, `allocation_number_count` | Finance values are DECIMAL and formatted after null checks. Each missing number is `XX`. |
| Subscription probability row | single-number win rate, normalized bar, at-least-one probability | `ipo_subscription_analysis.winning_rate_pct`, `at_least_one_win_probability_pct` | Both nullable percentages are database-constrained to `0..100`. The bar is derived only from a finite stored rate; otherwise text and bar label are `XX`. Attribution from row `source_name`, `source_url`, `source_published_at`, cutoff `data_as_of`. |
| “宇树股价与市值情景” table | price, total market cap, float-share headers, floating market caps | `ipo_valuation_scenario.scenario_price`, `total_shares`, `total_market_cap`, `floating_shares`, `floating_market_cap`, `scenario_label`, `is_official` | Group rows by price and columns by float-share scenario. Every scenario belongs to the selected IPO batch/company; missing intersection stays `XX`. |
| “商业航天 IPO 进度” cards | company status/name/full name/focus | `ipo_company.current_status`, `name`, `full_name`, `research_focus` | Same company audit fields as overview cards. |
| Commercial-space stage strip/event list | stage/status; date and event description | `ipo_stage_event.stage_name`, `completion_status`, `event_date`, `description`, ordered by `sort_order` | Missing stage/event field is `XX`; source link/name/time come from that event row. |
| Bottom “数据说明” card | batch code, cutoff, fact/scenario explanation | `research_batch.batch_code`, `data_as_of`; `ipo_subscription_analysis.analysis_type`, `calculation_basis`; `ipo_valuation_scenario.is_official`, `calculation_basis` | The note describes what the selected rows actually contain. Missing provenance fields (`source_name`, `source_url`) render `XX`; they are never replaced with generic “公开资料”. |

The removed IPO “关键时间线” and “观察变量与主要风险” modules are intentionally not mapped or restored. Public events remain in `ipo_stage_event`, and flexible company comparison metrics use only the approved `metrics_json` column.

## Proposed-table coverage and raw-layer boundary

| Layer | Tables | Purpose |
| --- | --- | --- |
| Reference/source | `stock_basic`, `trade_calendar`, `stock_limit_price`, `external_market_quote`, `market_event`, `intel_item`, `ipo_company`, `ipo_stage_event` | Normalized identities, calendar, non-duplicated supplemental inputs, and source-backed public facts. |
| Batch/audit | `research_batch` | Module/trade-date status, `batchId`, `dataAsOf`, completeness, pipeline version, and failure trace. |
| Today/risk results | `daily_decision_snapshot`, `risk_snapshot`, `risk_signal_result` | Today conclusions plus typed risk overview/signals with limited presentation JSON. |
| Strategy 01 results | `strategy_definition`, `strategy_run`, `strategy_funnel_result`, `strategy_candidate` | Versioned rules, execution state, funnel, official/near candidates, and evidence. |
| IPO results | `ipo_metric_snapshot`, `ipo_subscription_analysis`, `ipo_valuation_scenario` | Comparison metrics, actual/scenario subscription math, and valuation scenarios. |
| Existing raw market layer (reused, not proposed) | `daily`, `daily_basic`, `adj_factor`, `index_basic`, `index_daily`, `call_auction` (presence pending live audit) | Authoritative daily/index/adjustment/auction inputs; no proposal table duplicates them. |
