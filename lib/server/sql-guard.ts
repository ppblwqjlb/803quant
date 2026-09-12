const SAFE_FUNCTIONS = new Set([
  "ABS", "AVG", "CAST", "CEIL", "CEILING", "CHAR_LENGTH", "COALESCE", "CONCAT", "CONCAT_WS",
  "CONVERT", "COUNT", "CURDATE", "CURRENT_DATE", "CURRENT_TIMESTAMP", "DATE", "DATE_FORMAT",
  "DATEDIFF", "DAY", "FLOOR", "GREATEST", "IF", "IFNULL", "JSON_ARRAY", "JSON_ARRAYAGG",
  "JSON_EXTRACT", "JSON_OBJECT", "JSON_OBJECTAGG", "JSON_UNQUOTE", "LEAST", "LENGTH", "LOWER",
  "LPAD", "LTRIM", "MAX", "MIN", "MOD", "MONTH", "NOW", "NULLIF", "ROUND", "ROW_NUMBER",
  "RPAD", "RTRIM", "STDDEV", "SUBSTR", "SUBSTRING", "SUM", "TRIM", "UPPER", "UTC_DATE",
  "UTC_TIMESTAMP", "VARIANCE", "YEAR",
]);

const PARENTHESIZED_SQL_KEYWORDS = new Set([
  "AS", "EXISTS", "FROM", "IN", "JOIN", "ON", "OVER", "STRAIGHT_JOIN", "USING", "VALUES",
]);
const MUTATING_STATEMENTS = new Set([
  "ALTER", "CALL", "CREATE", "DELETE", "DO", "DROP", "HANDLER", "INSERT", "LOAD", "RENAME",
  "REPLACE", "SET", "TRUNCATE", "UPDATE",
]);
const FROM_CLAUSE_END = new Set([
  "FOR", "GROUP", "HAVING", "INTO", "LIMIT", "LOCK", "ORDER", "QUALIFY", "UNION", "WHERE", "WINDOW",
]);

export const APPROVED_APPLICATION_TABLES = new Set([
  "adj_factor", "call_auction", "daily", "daily_basic", "daily_decision_snapshot", "external_market_quote",
  "index_basic", "index_daily", "intel_item", "ipo_company", "ipo_metric_snapshot", "ipo_stage_event",
  "ipo_subscription_analysis", "ipo_valuation_scenario", "market_event", "research_batch", "risk_signal_result",
  "risk_snapshot", "stock_basic", "stock_limit_price", "strategy_candidate", "strategy_definition",
  "strategy_funnel_result", "strategy_run", "trade_calendar",
]);
const APPROVED_METADATA_TABLES = new Set(["tables", "columns", "statistics"]);

type TokenKind = "identifier" | "quoted" | "string" | "symbol";
type Token = {
  kind: TokenKind;
  value: string;
  upper: string;
  depth: number;
  start: number;
  end: number;
};
type NameToken = Token & { kind: "identifier" | "quoted" };
type ScopedAliases = { aliases: Set<string>; start: number; end: number };

export type ReadTarget = {
  schema?: string;
  table: string;
  metadata: boolean;
};

export type ObjectTypeLookup = (schema: string, table: string) => Promise<string | undefined>;

export class ApprovedBaseTableMissingError extends Error {
  readonly code = "APPROVED_BASE_TABLE_MISSING";

  constructor() {
    super("An approved read-only base table is unavailable");
    this.name = "ApprovedBaseTableMissingError";
  }
}

function readOnlyError(): Error {
  return new Error("SQL rejected by read-only guard");
}

function isIdentifierCharacter(char: string): boolean {
  const codePoint = char.codePointAt(0) ?? 0;
  return /[\p{L}\p{N}_$]/u.test(char) || (codePoint >= 0x80 && codePoint <= 0xffff);
}

function lexSql(sql: string): Token[] {
  const tokens: Token[] = [];
  let depth = 0;

  for (let index = 0; index < sql.length; ) {
    const tokenStart = index;
    const char = sql[index];
    const next = sql[index + 1];

    if (/\s/u.test(char)) {
      index += 1;
      continue;
    }
    if (char === ";" || char === "#" || (char === "-" && next === "-") || (char === "/" && next === "*")) {
      throw readOnlyError();
    }
    if (char === "'" || char === '"' || char === "`") {
      const quote = char;
      const kind: TokenKind = quote === "`" ? "quoted" : "string";
      let value = "";
      let closed = false;
      index += 1;
      while (index < sql.length) {
        const quotedChar = sql[index];
        const quotedNext = sql[index + 1];
        if (quotedChar === "\\" && quote !== "`" && index + 1 < sql.length) {
          value += quotedNext;
          index += 2;
          continue;
        }
        if (quotedChar === quote) {
          if (quotedNext === quote) {
            value += quote;
            index += 2;
            continue;
          }
          closed = true;
          index += 1;
          break;
        }
        value += quotedChar;
        index += 1;
      }
      if (!closed) throw readOnlyError();
      tokens.push({ kind, value, upper: value.toUpperCase(), depth, start: tokenStart, end: index });
      continue;
    }
    if (isIdentifierCharacter(char)) {
      let value = "";
      while (index < sql.length && isIdentifierCharacter(sql[index])) {
        value += sql[index];
        index += 1;
      }
      tokens.push({ kind: "identifier", value, upper: value.toUpperCase(), depth, start: tokenStart, end: index });
      continue;
    }
    if (char === "(" || char === ")") {
      if (char === ")") {
        depth -= 1;
        if (depth < 0) throw readOnlyError();
      }
      tokens.push({ kind: "symbol", value: char, upper: char, depth, start: tokenStart, end: index + 1 });
      if (char === "(") depth += 1;
      index += 1;
      continue;
    }
    const symbol = char === ":" && next === "=" ? ":=" : char;
    tokens.push({ kind: "symbol", value: symbol, upper: symbol, depth, start: tokenStart, end: index + symbol.length });
    index += symbol.length;
  }

  if (depth !== 0) throw readOnlyError();
  return tokens;
}

function isNameToken(token: Token | undefined): token is NameToken {
  return token?.kind === "identifier" || token?.kind === "quoted";
}

function findMatchingParen(tokens: Token[], openIndex: number): number {
  let nesting = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    if (tokens[index].value === "(") nesting += 1;
    if (tokens[index].value === ")") nesting -= 1;
    if (nesting === 0) return index;
  }
  throw readOnlyError();
}

function parseCtes(tokens: Token[], withIndex: number): { aliases: Set<string>; declarationIndexes: Set<number>; mainIndex: number } {
  const aliases = new Set<string>();
  const declarationIndexes = new Set<number>();
  let index = withIndex + 1;
  if (tokens[index]?.upper === "RECURSIVE") index += 1;

  while (index < tokens.length) {
    if (!isNameToken(tokens[index])) throw readOnlyError();
    aliases.add(tokens[index].value.toLowerCase());
    declarationIndexes.add(index);
    index += 1;

    if (tokens[index]?.value === "(") {
      index = findMatchingParen(tokens, index) + 1;
    }
    if (tokens[index]?.upper !== "AS" || tokens[index + 1]?.value !== "(") throw readOnlyError();
    const closeIndex = findMatchingParen(tokens, index + 1);
    const bodyFirst = tokens[index + 2]?.upper;
    if (bodyFirst !== "SELECT" && bodyFirst !== "WITH") throw readOnlyError();
    index = closeIndex + 1;
    if (tokens[index]?.value !== ",") break;
    index += 1;
  }

  return { aliases, declarationIndexes, mainIndex: index };
}

function assertSafeCalls(tokens: Token[], cteDeclarationIndexes: Set<number>): void {
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    if (tokens[index + 1].value !== "(" || (!isNameToken(token) && token.kind !== "string")) continue;
    if (cteDeclarationIndexes.has(index)) continue;
    const qualified = tokens[index - 1]?.value === ".";
    if (!qualified && token.kind === "identifier" && PARENTHESIZED_SQL_KEYWORDS.has(token.upper)) continue;
    const adjacent = token.end === tokens[index + 1].start;
    if (token.kind !== "identifier" || qualified || !adjacent || !SAFE_FUNCTIONS.has(token.upper)) throw readOnlyError();
  }
}

function readTarget(
  tokens: Token[],
  start: number,
  cteAliases: Set<string>,
  scopedAliases: readonly ScopedAliases[] = [],
): { target?: ReadTarget; next: number } {
  if (tokens[start]?.value === "(") {
    if (tokens[start + 1]?.upper !== "SELECT" && tokens[start + 1]?.upper !== "WITH") throw readOnlyError();
    return { next: findMatchingParen(tokens, start) + 1 };
  }
  if (!isNameToken(tokens[start])) throw readOnlyError();

  let schema: string | undefined;
  let table = tokens[start].value;
  let next = start + 1;
  if (tokens[next]?.value === "." && isNameToken(tokens[next + 1])) {
    schema = table;
    table = tokens[next + 1].value;
    next += 2;
  }

  const normalizedName = table.toLowerCase();
  const isScopedAlias = scopedAliases.some(
    (scope) => start >= scope.start && start < scope.end && scope.aliases.has(normalizedName),
  );
  if (!schema && (cteAliases.has(normalizedName) || isScopedAlias)) return { next };
  const normalizedSchema = schema?.toLowerCase();
  const normalizedTable = table.toLowerCase();
  if (normalizedSchema === "information_schema") {
    if (!APPROVED_METADATA_TABLES.has(normalizedTable)) throw readOnlyError();
    return { target: { schema: "information_schema", table: normalizedTable, metadata: true }, next };
  }
  if (table !== normalizedTable) throw readOnlyError();
  if (!APPROVED_APPLICATION_TABLES.has(normalizedTable)) throw readOnlyError();
  return { target: { schema, table, metadata: false }, next };
}

function collectSelectTargets(
  tokens: Token[],
  cteAliases: Set<string>,
  scopedAliases: readonly ScopedAliases[],
): ReadTarget[] {
  const targets: ReadTarget[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const from = tokens[index];
    if (from.upper !== "FROM" || from.kind !== "identifier") continue;
    const clauseDepth = from.depth;
    let hasSelectAtDepth = false;
    for (let previous = index - 1; previous >= 0; previous -= 1) {
      if (tokens[previous].depth < clauseDepth) break;
      if (tokens[previous].depth === clauseDepth && tokens[previous].upper === "SELECT") {
        hasSelectAtDepth = true;
        break;
      }
    }
    if (!hasSelectAtDepth) continue;
    let parsed = readTarget(tokens, index + 1, cteAliases, scopedAliases);
    if (parsed.target) targets.push(parsed.target);
    let cursor = parsed.next;

    while (cursor < tokens.length) {
      const token = tokens[cursor];
      if (
        token.depth < clauseDepth ||
        (token.depth === clauseDepth &&
          token.kind === "identifier" &&
          tokens[cursor - 1]?.value !== "." &&
          FROM_CLAUSE_END.has(token.upper))
      ) break;
      if (token.depth === clauseDepth && (["JOIN", "STRAIGHT_JOIN"].includes(token.upper) || token.value === ",")) {
        parsed = readTarget(tokens, cursor + 1, cteAliases, scopedAliases);
        if (parsed.target) targets.push(parsed.target);
        cursor = parsed.next;
        continue;
      }
      cursor += 1;
    }
  }
  return targets;
}

function collectCommandTarget(tokens: Token[], first: string): ReadTarget[] {
  if (first === "SHOW") {
    if (tokens[1]?.upper === "CREATE" && tokens[2]?.upper === "TABLE") {
      const parsed = readTarget(tokens, 3, new Set());
      if (parsed.next !== tokens.length || !parsed.target) throw readOnlyError();
      return [parsed.target];
    }

    const isTables = tokens[1]?.upper === "TABLES";
    const isTableStatus = tokens[1]?.upper === "TABLE" && tokens[2]?.upper === "STATUS";
    if (!isTables && !isTableStatus) throw readOnlyError();
    let index = isTables ? 2 : 3;

    if (["FROM", "IN"].includes(tokens[index]?.upper)) {
      if (!isNameToken(tokens[index + 1])) throw readOnlyError();
      index += 2;
    }
    if (tokens[index]?.upper === "LIKE") {
      if (tokens[index + 1]?.kind !== "string") throw readOnlyError();
      index += 2;
    }
    if (index !== tokens.length) throw readOnlyError();
    return [];
  }

  let targetIndex = -1;
  if (first === "DESCRIBE" || first === "DESC") targetIndex = 1;
  if (targetIndex < 0 || !tokens[targetIndex]) return [];
  const parsed = readTarget(tokens, targetIndex, new Set());
  return parsed.target ? [parsed.target] : [];
}

function deduplicateTargets(targets: ReadTarget[]): ReadTarget[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.schema?.toLowerCase() ?? ""}.${target.table.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function analyzeReadOnlySql(sql: string): ReadTarget[] {
  if (typeof sql !== "string" || !sql.trim()) throw readOnlyError();
  const tokens = lexSql(sql);
  if (!tokens.length || tokens.some((token) => token.value === ":=")) throw readOnlyError();

  const first = tokens[0].upper;
  let statementIndex = 0;
  let cteAliases = new Set<string>();
  let cteDeclarationIndexes = new Set<number>();
  const scopedAliases: ScopedAliases[] = [];

  if (first === "EXPLAIN") {
    statementIndex = tokens.findIndex((token, index) => index > 0 && token.depth === 0 && (token.upper === "SELECT" || token.upper === "WITH"));
    if (statementIndex < 0) throw readOnlyError();
  }
  const statement = tokens[statementIndex]?.upper;
  if (statement === "WITH") {
    const parsed = parseCtes(tokens, statementIndex);
    cteAliases = parsed.aliases;
    cteDeclarationIndexes = parsed.declarationIndexes;
    if (tokens[parsed.mainIndex]?.upper !== "SELECT") throw readOnlyError();
  } else if (statement !== "SELECT" && first !== "SHOW" && first !== "DESCRIBE" && first !== "DESC") {
    throw readOnlyError();
  }

  if (
    !["SHOW", "DESCRIBE", "DESC"].includes(first) &&
    tokens.some(
      (token, index) => token.kind === "identifier" && token.upper === "TABLE" && tokens[index - 1]?.value !== ".",
    )
  ) throw readOnlyError();

  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].upper !== "WITH" || tokens[index].kind !== "identifier" || tokens[index].depth === 0) continue;
    const parsed = parseCtes(tokens, index);
    if (parsed.aliases.size !== 1 || tokens[parsed.mainIndex]?.upper !== "SELECT") throw readOnlyError();
    for (const declarationIndex of parsed.declarationIndexes) cteDeclarationIndexes.add(declarationIndex);
    const end = tokens.findIndex(
      (token, tokenIndex) => tokenIndex > parsed.mainIndex && token.value === ")" && token.depth === tokens[index].depth - 1,
    );
    if (end < 0) throw readOnlyError();
    scopedAliases.push({ aliases: parsed.aliases, start: parsed.mainIndex, end });
  }

  assertSafeCalls(tokens, cteDeclarationIndexes);
  if (tokens.some((token, index) => token.upper === "INTO" && tokens[index - 1]?.value !== ".")) throw readOnlyError();
  if (tokens.some((token) => token.upper === "OUTFILE" || token.upper === "DUMPFILE")) throw readOnlyError();
  if (tokens.some((token, index) => token.upper === "FOR" && ["UPDATE", "SHARE"].includes(tokens[index + 1]?.upper))) throw readOnlyError();
  if (tokens.some((token, index) => token.upper === "LOCK" && tokens[index + 1]?.upper === "IN")) throw readOnlyError();
  if (tokens.some((token, index) => MUTATING_STATEMENTS.has(token.upper) && tokens[index - 1]?.value === "(")) throw readOnlyError();

  const targets = first === "SHOW" || first === "DESCRIBE" || first === "DESC"
    ? collectCommandTarget(tokens, first)
    : collectSelectTargets(tokens, cteAliases, scopedAliases);
  return deduplicateTargets(targets);
}

export function assertReadOnlySql(sql: string): void {
  analyzeReadOnlySql(sql);
}

export async function verifyReadTargets(
  targets: readonly ReadTarget[],
  defaultSchema: string,
  lookup: ObjectTypeLookup,
): Promise<void> {
  for (const target of targets) {
    if (target.metadata) continue;
    const schema = target.schema ?? defaultSchema;
    if (target.schema && target.schema !== defaultSchema) throw readOnlyError();
    const objectType = await lookup(schema, target.table);
    if (objectType === undefined) throw new ApprovedBaseTableMissingError();
    if (objectType !== "BASE TABLE") throw readOnlyError();
  }
}
