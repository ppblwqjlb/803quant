const RULE_NUMBERS = [
  "minListedDays",
  "maxHistoryPercentile",
  "minConsolidationDays",
  "maxConsolidationRangePct",
  "minGapPct",
  "maxGapPct",
  "minVolumeRatio",
  "minCloseToHighRatio",
];

const NEAR_NUMBERS = [
  "maxGapShortfallPct",
  "maxGapExcessPct",
  "maxVolumeRatioShortfall",
  "maxCloseToHighShortfall",
];

const ROW_NUMBERS = [
  "listedDays",
  "adjustedHistoryPercentile",
  "consolidationDays",
  "consolidationRangePct",
  "gapPct",
  "volumeRatio",
  "close",
  "high",
  "changePct",
];

const FUNNEL = [
  ["eligible", "基础可交易与低位结构"],
  ["limit-test", "涨停试盘"],
  ["consolidation", "缩量整理"],
  ["gap-volume", "跳空放量"],
  ["close-confirmation", "收盘确认"],
];

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireFiniteNumber(owner, key, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const value = owner[key];
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new TypeError(`${key} must be ${integer ? "an integer" : "a finite number"} between ${min} and ${max}`);
  }
}

export function validateMomentumRules(rules) {
  if (!isPlainObject(rules)) throw new TypeError("rules must be an object");
  for (const key of ["requireTradable", "excludeSt", "requireLimitUpTest"]) {
    if (typeof rules[key] !== "boolean") throw new TypeError(`rules.${key} must be a boolean`);
  }
  for (const key of RULE_NUMBERS) requireFiniteNumber(rules, key);
  requireFiniteNumber(rules, "minListedDays", { min: 0, integer: true });
  requireFiniteNumber(rules, "maxHistoryPercentile", { min: 0, max: 100 });
  requireFiniteNumber(rules, "minConsolidationDays", { min: 0, integer: true });
  requireFiniteNumber(rules, "maxConsolidationRangePct", { min: 0 });
  requireFiniteNumber(rules, "minGapPct", { min: 0 });
  requireFiniteNumber(rules, "maxGapPct", { min: 0 });
  requireFiniteNumber(rules, "minVolumeRatio", { min: 0 });
  requireFiniteNumber(rules, "minCloseToHighRatio", { min: 0, max: 1 });
  if (rules.minGapPct > rules.maxGapPct) throw new TypeError("rules.minGapPct must not exceed rules.maxGapPct");
  if (!isPlainObject(rules.near)) throw new TypeError("rules.near must be an object");
  for (const key of NEAR_NUMBERS) requireFiniteNumber(rules.near, key, { min: 0 });
  if (
    (rules.minGapPct === 0 && rules.near.maxGapShortfallPct !== 0)
    || (rules.minGapPct > 0 && rules.near.maxGapShortfallPct >= rules.minGapPct)
  ) {
    throw new TypeError("rules.near.maxGapShortfallPct must retain a positive gap threshold");
  }
  if (rules.near.maxGapExcessPct > rules.maxGapPct - rules.minGapPct) {
    throw new TypeError("rules.near.maxGapExcessPct must fit within the configured gap range");
  }
  if (
    (rules.minVolumeRatio === 0 && rules.near.maxVolumeRatioShortfall !== 0)
    || (rules.minVolumeRatio > 0 && rules.near.maxVolumeRatioShortfall >= rules.minVolumeRatio)
  ) {
    throw new TypeError("rules.near.maxVolumeRatioShortfall must retain a positive volume threshold");
  }
  if (
    (rules.minCloseToHighRatio === 0 && rules.near.maxCloseToHighShortfall !== 0)
    || (rules.minCloseToHighRatio > 0 && rules.near.maxCloseToHighShortfall >= rules.minCloseToHighRatio)
  ) {
    throw new TypeError("rules.near.maxCloseToHighShortfall must retain a positive close-to-high threshold");
  }
}

function validateRow(input, index) {
  if (!isPlainObject(input)) throw new TypeError(`rows[${index}] must be an object`);
  for (const key of ["tsCode", "name", "tradeDate", "market", "board", "industry", "setupLabel"]) {
    if (typeof input[key] !== "string" || input[key].trim() === "") {
      throw new TypeError(`rows[${index}].${key} must be a non-empty string`);
    }
  }
  for (const key of ["isTradable", "isSt", "hadLimitUpTest"]) {
    if (typeof input[key] !== "boolean") throw new TypeError(`rows[${index}].${key} must be a boolean`);
  }
  for (const key of ROW_NUMBERS) {
    if (!Number.isFinite(input[key])) throw new TypeError(`rows[${index}].${key} must be a finite number`);
  }
  if (!Number.isInteger(input.listedDays) || input.listedDays < 0) {
    throw new TypeError(`rows[${index}].listedDays must be a non-negative integer`);
  }
  if (!Number.isInteger(input.consolidationDays) || input.consolidationDays < 0) {
    throw new TypeError(`rows[${index}].consolidationDays must be a non-negative integer`);
  }
  if (input.adjustedHistoryPercentile < 0 || input.adjustedHistoryPercentile > 100) {
    throw new TypeError(`rows[${index}].adjustedHistoryPercentile must be between 0 and 100`);
  }
  if (input.volumeRatio < 0) throw new TypeError(`rows[${index}].volumeRatio must be non-negative`);
  if (input.consolidationRangePct < 0) throw new TypeError(`rows[${index}].consolidationRangePct must be non-negative`);
  if (input.high < 0 || input.close < 0) throw new TypeError(`rows[${index}].close and high must be non-negative`);
  if (input.high === 0 && input.close !== 0) throw new TypeError(`rows[${index}].high cannot be zero when close is non-zero`);
  if (input.close > input.high) throw new TypeError(`rows[${index}].close must not exceed high`);
  if (input.isTradable && input.high <= 0) throw new TypeError(`rows[${index}].high must be positive for tradable rows`);
}

function evidence(code, label, value, operator, threshold, passed, state = passed ? "passed" : "failed") {
  return { code, label, value, operator, threshold, passed, state };
}

function evaluateRow(row, rules) {
  const closeToHighRatio = row.high === 0 ? 0 : row.close / row.high;
  const checks = [
    evidence("tradable", "可交易", row.isTradable, "required", rules.requireTradable, !rules.requireTradable || row.isTradable),
    evidence("st-exclusion", "ST 排除", row.isSt, "excluded", rules.excludeSt, !rules.excludeSt || !row.isSt),
    evidence("listed-days", "上市天数", row.listedDays, ">=", rules.minListedDays, row.listedDays >= rules.minListedDays),
    evidence("history-percentile", "复权历史分位", row.adjustedHistoryPercentile, "<=", rules.maxHistoryPercentile, row.adjustedHistoryPercentile <= rules.maxHistoryPercentile),
    evidence("limit-up-test", "涨停试盘", row.hadLimitUpTest, "required", rules.requireLimitUpTest, !rules.requireLimitUpTest || row.hadLimitUpTest),
    evidence("consolidation-days", "整理天数", row.consolidationDays, ">=", rules.minConsolidationDays, row.consolidationDays >= rules.minConsolidationDays),
    evidence("consolidation-range", "整理区间", row.consolidationRangePct, "<=", rules.maxConsolidationRangePct, row.consolidationRangePct <= rules.maxConsolidationRangePct),
    evidence("gap-min", "跳空下限", row.gapPct, ">=", rules.minGapPct, row.gapPct >= rules.minGapPct),
    evidence("gap-max", "跳空上限", row.gapPct, "<=", rules.maxGapPct, row.gapPct <= rules.maxGapPct),
    evidence("volume-ratio", "量比", row.volumeRatio, ">=", rules.minVolumeRatio, row.volumeRatio >= rules.minVolumeRatio),
    evidence("close-to-high", "收盘接近最高", closeToHighRatio, ">=", rules.minCloseToHighRatio, closeToHighRatio >= rules.minCloseToHighRatio),
  ];

  const stagePasses = [
    checks.slice(0, 4).every(({ passed }) => passed),
    checks.slice(0, 5).every(({ passed }) => passed),
    checks.slice(0, 7).every(({ passed }) => passed),
    checks.slice(0, 10).every(({ passed }) => passed),
    checks.every(({ passed }) => passed),
  ];
  const finalChecks = checks.slice(7);
  const failedFinalChecks = finalChecks.filter(({ passed }) => !passed);
  const nearCheck = failedFinalChecks[0];
  const nearByCode = {
    "gap-min": row.gapPct >= rules.minGapPct - rules.near.maxGapShortfallPct,
    "gap-max": row.gapPct <= rules.maxGapPct + rules.near.maxGapExcessPct,
    "volume-ratio": row.volumeRatio >= rules.minVolumeRatio - rules.near.maxVolumeRatioShortfall,
    "close-to-high": closeToHighRatio >= rules.minCloseToHighRatio - rules.near.maxCloseToHighShortfall,
  };
  const isNear = stagePasses[2]
    && !stagePasses[4]
    && failedFinalChecks.length === 1
    && nearByCode[nearCheck?.code] === true;
  if (isNear) nearCheck.state = "near";

  return { checks, stagePasses, isNear, closeToHighRatio };
}

function toCandidate(row, evaluation, candidateType) {
  return {
    tsCode: row.tsCode,
    name: row.name,
    tradeDate: row.tradeDate,
    market: row.market,
    board: row.board,
    industry: row.industry,
    isTradable: row.isTradable,
    isSt: row.isSt,
    close: row.close,
    changePct: row.changePct,
    gapPct: row.gapPct,
    volumeRatio: row.volumeRatio,
    closeToHighRatio: evaluation.closeToHighRatio,
    setupLabel: row.setupLabel,
    candidateType,
    matchScore: Math.round((evaluation.checks.filter(({ passed }) => passed).length / evaluation.checks.length) * 100),
    evidence: evaluation.checks,
  };
}

function candidateOrder(left, right) {
  return right.matchScore - left.matchScore || left.tsCode.localeCompare(right.tsCode, "en");
}

export function evaluateMomentumUniverse(rows, rules) {
  if (!Array.isArray(rows)) throw new TypeError("rows must be an array");
  validateMomentumRules(rules);
  const tsCodes = new Set();
  const tradeDates = new Set();
  rows.forEach((row, index) => {
    validateRow(row, index);
    if (tsCodes.has(row.tsCode)) throw new TypeError(`rows[${index}].tsCode is a duplicate tsCode`);
    tsCodes.add(row.tsCode);
    tradeDates.add(row.tradeDate);
  });
  if (tradeDates.size > 1) throw new TypeError("rows must share one tradeDate");
  const counts = [0, 0, 0, 0, 0];
  const official = [];
  const near = [];

  rows.forEach((row) => {
    const evaluation = evaluateRow(row, rules);
    evaluation.stagePasses.forEach((passed, stageIndex) => {
      if (passed) counts[stageIndex] += 1;
    });
    if (evaluation.stagePasses[4]) official.push(toCandidate(row, evaluation, "official"));
    else if (evaluation.isNear) near.push(toCandidate(row, evaluation, "near"));
  });

  return {
    funnel: FUNNEL.map(([code, label], index) => ({ code, label, count: counts[index], sortOrder: index + 1 })),
    official: official.sort(candidateOrder),
    near: near.sort(candidateOrder),
  };
}
