"use client";

import { Activity, ChevronRight, CircleAlert, Clock, Database, Gauge, Landmark, ShieldAlert, TrendingUp, WalletCards, Zap } from "lucide-react";
import { displayValue } from "../lib/research/contracts";
import { barWidth, compactToIso, formatCount, formatNumber, formatPct, formatSigned, thousandsToYi, trendTone, wanToWanYi } from "./research-format";
import { EmptyBlock, LoadingBlock, PageHeading, StatusBlock } from "./ui-blocks";
import type { TodayData } from "../lib/server/repositories/today";
import type { ResearchResponse } from "./use-research-module";

const dataState = (loading: boolean, response: ResearchResponse<TodayData>) => (loading ? "pending" : response.status);

export const emptyTodayResearchData = (): TodayData => ({
  tradeDate: null,
  previousTradeDate: null,
  indices: [],
  breadth: null,
  limit: null,
  previousLimit: null,
  industries: [],
  segments: [],
  margin: null,
  globalIndices: [],
  commodity: null,
  fx: null,
  auction: null,
  valuation: null,
  strategy: null,
});

function TrendValue({ value, digits = 2, suffix = "%", className }: { value: number | null; digits?: number; suffix?: string; className?: string }) {
  const text = suffix ? formatPct(value, digits) : formatSigned(value, digits);
  return <span className={`trend trend-${trendTone(value)}${className ? ` ${className}` : ""}`}>{text}</span>;
}

function MacroStat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: string }) {
  return (
    <div className="macro-stat">
      <span>{label}</span>
      <b className={tone ? `trend trend-${tone}` : undefined}>{value}</b>
      {hint && <small>{hint}</small>}
    </div>
  );
}

function TodayNotices({ state }: { state: string }) {
  if (state === "pending") return <LoadingBlock label="正在汇总今日市场数据…" />;
  if (state === "partial") return <div className="state-banner warning" data-reveal><Clock size={17} /><span><b>部分数据源缺失。</b>可用模块照常展示，缺失字段以 XX 呈现。</span></div>;
  if (state === "missing") return <div className="state-banner warning" data-reveal><CircleAlert size={17} /><span><b>请求日期没有对应的交易日数据。</b>页面不会用其他交易日替代。</span></div>;
  if (state === "failed") return <div className="state-banner warning" data-reveal><CircleAlert size={17} /><span><b>市场数据请求失败。</b>请稍后刷新。</span></div>;
  return null;
}

export function TodayPage({ compactDate, response, loading, onStrategy }: {
  compactDate: string;
  response: ResearchResponse<TodayData>;
  loading: boolean;
  onStrategy: () => void;
}) {
  const state = dataState(loading, response);
  const data = response.data;
  const breadth = data.breadth;
  const limit = data.limit;
  const valuation = data.valuation;
  const margin = data.margin;
  const investmentAmountYi = thousandsToYi(breadth?.amountK ?? null);
  const totalMarketCapWanYi = wanToWanYi(valuation?.totalMvSum ?? null);
  const totalPriced = breadth ? breadth.up + breadth.down + breadth.flat : 0;

  const buckets = breadth ? [
    { label: "涨停", count: breadth.limitUp, tone: "up-strong" },
    { label: "涨超5%", count: breadth.up5Pct, tone: "up" },
    { label: "涨0-5%", count: breadth.up0Pct, tone: "up-soft" },
    { label: "平盘", count: breadth.flat, tone: "flat" },
    { label: "跌0-5%", count: breadth.down0Pct, tone: "down-soft" },
    { label: "跌超5%", count: breadth.down5Pct, tone: "down" },
    { label: "跌停", count: breadth.limitDown, tone: "down-strong" },
  ] : [];

  const topIndustries = data.industries.slice(0, 6);
  const bottomIndustries = [...data.industries].reverse().slice(0, 6);

  const highlights: string[] = [];
  if (data.indices.length) {
    const down = data.indices.filter((item) => (item.pctChg ?? 0) < 0).length;
    const lead = data.indices[0];
    highlights.push(`主要指数 ${data.indices.length} 项中 ${down} 项收跌，${displayValue(lead.name ?? lead.tsCode)} ${formatNumber(lead.close, 2)}（${formatPct(lead.pctChg)}）。`);
  }
  if (breadth) {
    highlights.push(`全市场 ${formatCount(totalPriced)} 只有成交样本：上涨 ${formatCount(breadth.up)} 只、下跌 ${formatCount(breadth.down)} 只，平均涨跌幅 ${formatPct(breadth.avgPctChg)}。`);
  }
  if (limit) {
    highlights.push(`涨停 ${limit.limitUp} 家、跌停 ${limit.limitDown} 家，上涨率 ${formatNumber(limit.upRate, 2)}%，较 2 个交易日前 ${formatSigned(limit.upRateChg2d, 2)} 个百分点。`);
  }
  if (margin) {
    highlights.push(`两市成交额 ${formatNumber(margin.marketTurnover, 0)} 亿元（数据日 ${compactToIso(margin.tradeDate)}），两融余额 ${formatNumber(margin.totalMarginBalance, 2)} 亿元，融资净买入 ${formatSigned(margin.marginNetBuy, 2)} 亿元。`);
  }
  if (data.segments.length) {
    const strongest = data.segments[0];
    const weakest = data.segments[data.segments.length - 1];
    highlights.push(`板块维度：${displayValue(strongest.segment)} ${formatPct(strongest.avgPctChg)} 最强，${displayValue(weakest.segment)} ${formatPct(weakest.avgPctChg)} 最弱。`);
  }

  return (
    <div className="page-stack" data-research-status={state}>
      <PageHeading
        eyebrow={`TODAY'S BRIEF · ${compactDate}`}
        title="今日决策台"
        description="把指数、市场宽度、资金面、行业结构与策略信号汇总成一张可验证的盘后研究台。"
        right={<span className="status-label">{state}</span>}
      />

      <TodayNotices state={state} />

      {state !== "pending" && !data.tradeDate && (
        <StatusBlock icon={<CircleAlert size={22} />} title="当前日期没有可用的市场数据" description="请确认请求日期是否为交易日，或等待当日批次入仓后刷新。" />
      )}

      {data.tradeDate && (
        <>
          <section className="macro-batch surface-card" data-reveal>
            <div className="section-title">
              <div><span><Database size={17} />数据批次</span><small>口径随各数据源自身日期</small></div>
              <span className="batch-label">{displayValue(response.batchId)}</span>
            </div>
            <div className="macro-batch-grid">
              <MacroStat label="数据日期" value={compactToIso(data.tradeDate)} />
              <MacroStat label="前一交易日" value={compactToIso(data.previousTradeDate)} />
              <MacroStat label="有成交样本" value={formatCount(totalPriced)} />
              <MacroStat label="两市成交额" value={`${formatNumber(margin?.marketTurnover ?? investmentAmountYi, 0)} 亿`} hint={margin ? `数据日 ${compactToIso(margin.tradeDate)}` : "按当日成交额合计"} />
            </div>
          </section>

          <section className="surface-card macro-indices" data-reveal>
            <div className="section-title"><div><span><TrendingUp size={17} />主要指数</span><small>收盘点位与当日涨跌幅</small></div></div>
            {data.indices.length ? (
              <div className="macro-index-grid">
                {data.indices.map((item) => (
                  <article className="macro-index-card" key={item.tsCode}>
                    <span>{displayValue(item.name ?? item.tsCode)}</span>
                    <b>{formatNumber(item.close, 2)}</b>
                    <TrendValue value={item.pctChg} />
                  </article>
                ))}
              </div>
            ) : (
              <EmptyBlock title="没有指数行情" description="当前交易日在 index_daily 中没有匹配的指数记录。" />
            )}
          </section>

          {highlights.length > 0 && (
            <section className="three-lines surface-card" data-reveal>
              <div className="section-title"><span><Zap size={17} />今日要点</span><small>先结论，后证据</small></div>
              <ol>
                {highlights.map((copy, index) => (
                  <li key={copy}><span>0{index + 1}</span><p>{copy}</p></li>
                ))}
              </ol>
            </section>
          )}

          <section className="surface-card macro-breadth" data-reveal>
            <div className="section-title"><div><span><Activity size={17} />市场宽度</span><small>涨跌分布与极值</small></div>{limit && <span className="formula-note">涨跌停口径来自 limit_updown</span>}</div>
            {breadth ? (
              <>
                <div className="breadth-summary">
                  <div className="breadth-count up"><span>上涨</span><b>{formatCount(breadth.up)}</b></div>
                  <div className="breadth-count flat"><span>平盘</span><b>{formatCount(breadth.flat)}</b></div>
                  <div className="breadth-count down"><span>下跌</span><b>{formatCount(breadth.down)}</b></div>
                  <div className="breadth-count wide"><span>平均涨跌幅</span><b className={`trend trend-${trendTone(breadth.avgPctChg)}`}>{formatPct(breadth.avgPctChg)}</b></div>
                </div>
                <div className="breadth-bar" role="img" aria-label="全市场涨跌分布">
                  {buckets.map((bucket) => (
                    <span
                      key={bucket.label}
                      className={`breadth-seg tone-${bucket.tone}`}
                      style={{ width: barWidth(bucket.count, totalPriced) }}
                      title={`${bucket.label} ${bucket.count}`}
                    />
                  ))}
                </div>
                <div className="breadth-legend">
                  {buckets.map((bucket) => (
                    <span key={bucket.label} className={`tone-${bucket.tone}`}><i />{bucket.label}<b>{formatCount(bucket.count)}</b></span>
                  ))}
                </div>
              </>
            ) : (
              <EmptyBlock title="没有市场宽度数据" description="当前交易日在 daily 中没有可统计的涨跌样本。" />
            )}
          </section>

          <section className="macro-grid-2">
            <div className="surface-card" data-reveal>
              <div className="section-title"><div><span><WalletCards size={17} />成交与两融</span><small>资金面观察</small></div>{margin && <span className="batch-label">{compactToIso(margin.tradeDate)}</span>}</div>
              {margin ? (
                <div className="macro-stat-list">
                  <MacroStat label="两市成交额" value={`${formatNumber(margin.marketTurnover, 0)} 亿`} />
                  <MacroStat label="沪市成交额" value={`${formatNumber(margin.shTurnover, 0)} 亿`} />
                  <MacroStat label="深市成交额" value={`${formatNumber(margin.szTurnover, 0)} 亿`} />
                  <MacroStat label="两融余额" value={`${formatNumber(margin.totalMarginBalance, 2)} 亿`} />
                  <MacroStat label="融资买入额" value={`${formatNumber(margin.marginBuy, 2)} 亿`} />
                  <MacroStat label="融资净买入" value={`${formatSigned(margin.marginNetBuy, 2)} 亿`} tone={trendTone(margin.marginNetBuy)} />
                  <MacroStat label="融资买入占成交" value={`${formatNumber(margin.marginTurnoverRatio, 2)}%`} />
                  <MacroStat label="两融成交占 A 股" value={`${formatNumber(margin.totalTurnoverRatio, 2)}%`} />
                </div>
              ) : (
                <EmptyBlock title="没有两融数据" description="margin_daily 中没有当前日期之前的记录。" />
              )}
            </div>

            <div className="surface-card" data-reveal>
              <div className="section-title"><div><span><Landmark size={17} />板块表现</span><small>按上市板块分组平均涨跌幅</small></div><span className="formula-note">{compactToIso(data.tradeDate)}</span></div>
              {data.segments.length ? (
                <div className="macro-stat-list">
                  {data.segments.map((item) => (
                    <MacroStat
                      key={item.segment}
                      label={`${displayValue(item.segment)} · ${formatCount(item.stockCount)} 只`}
                      value={formatPct(item.avgPctChg)}
                      hint={`成交 ${formatNumber(thousandsToYi(item.amountK), 0)} 亿`}
                      tone={trendTone(item.avgPctChg)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyBlock title="没有板块数据" description="stock_basic 中缺少市场分类或当日没有成交记录。" />
              )}
            </div>
          </section>

          <section className="surface-card macro-industry" data-reveal>
            <div className="section-title"><div><span><Gauge size={17} />行业涨跌榜</span><small>按所属行业分组，样本不少于 3 只</small></div><span className="formula-note">共 {formatCount(data.industries.length)} 个行业</span></div>
            {data.industries.length ? (
              <div className="industry-columns">
                <div>
                  <h3>领涨行业</h3>
                  <ol className="industry-list">
                    {topIndustries.map((item) => (
                      <li key={item.industry}><span>{item.industry}<small>{item.stockCount} 只</small></span><TrendValue value={item.avgPctChg} /></li>
                    ))}
                  </ol>
                </div>
                <div>
                  <h3>领跌行业</h3>
                  <ol className="industry-list">
                    {bottomIndustries.map((item) => (
                      <li key={item.industry}><span>{item.industry}<small>{item.stockCount} 只</small></span><TrendValue value={item.avgPctChg} /></li>
                    ))}
                  </ol>
                </div>
              </div>
            ) : (
              <EmptyBlock title="没有行业数据" description="当日成交记录与股票行业分类无法关联。" />
            )}
          </section>

          <section className="macro-grid-2">
            <div className="surface-card" data-reveal>
              <div className="section-title"><div><span><Clock size={17} />集合竞价</span><small>开盘竞价高开低开分布</small></div>{data.auction && <span className="batch-label">{compactToIso(data.auction.tradeDate)}</span>}</div>
              {data.auction ? (
                <div className="macro-stat-list">
                  <MacroStat label="参与竞价个股" value={formatCount(data.auction.stockCount)} />
                  <MacroStat label="平均竞价涨跌幅" value={formatPct(data.auction.avgPctChg)} tone={trendTone(data.auction.avgPctChg)} />
                  <MacroStat label="高开家数" value={formatCount(data.auction.gapUpCount)} tone="up" />
                  <MacroStat label="低开家数" value={formatCount(data.auction.gapDownCount)} tone="down" />
                </div>
              ) : (
                <EmptyBlock title="没有集合竞价数据" description="call_auction 中没有当前交易日的记录。" />
              )}
            </div>

            <div className="surface-card" data-reveal>
              <div className="section-title"><div><span><Database size={17} />估值与市值</span><small>全市场口径统计</small></div><span className="formula-note">{valuation ? `${formatCount(valuation.peSampleCount)} 只有效 PE` : "XX"}</span></div>
              {valuation ? (
                <div className="macro-stat-list">
                  <MacroStat label="市盈率 PE(TTM) 均值" value={formatNumber(valuation.peTtmAvg, 2)} />
                  <MacroStat label="市净率 PB 均值" value={formatNumber(valuation.pbAvg, 2)} />
                  <MacroStat label="总市值" value={`${formatNumber(totalMarketCapWanYi, 2)} 万亿`} />
                  <MacroStat label="平均换手率" value={`${formatNumber(valuation.turnoverAvg, 2)}%`} />
                </div>
              ) : (
                <EmptyBlock title="没有估值数据" description="daily_basic 中没有当前交易日的记录。" />
              )}
            </div>
          </section>

          <section className="macro-grid-2">
            <div className="surface-card" data-reveal>
              <div className="section-title"><div><span><Activity size={17} />隔夜外围市场</span><small>上一外部交易日收盘</small></div>{data.globalIndices.length > 0 && <span className="batch-label">最新可得</span>}</div>
              {data.globalIndices.length ? (
                <div className="global-grid">
                  {data.globalIndices.map((item) => (
                    <div className="global-row" key={item.indexCode}>
                      <span>{displayValue(item.indexName ?? item.indexCode)}</span>
                      <b>{formatNumber(item.close, 2)}</b>
                      <TrendValue value={item.changePct} />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyBlock title="没有外围市场数据" description="foreign_index 中没有当前日期之前的记录。" />
              )}
            </div>

            <div className="surface-card" data-reveal>
              <div className="section-title"><div><span><TrendingUp size={17} />大宗商品与汇率</span><small>外部定价环境</small></div>{data.commodity && <span className="batch-label">{compactToIso(data.commodity.tradeDate)}</span>}</div>
              {data.commodity || data.fx ? (
                <div className="macro-stat-list">
                  {data.commodity && <>
                    <MacroStat label="黄金（美元/盎司）" value={formatNumber(data.commodity.gold, 2)} />
                    <MacroStat label="白银（美元/盎司）" value={formatNumber(data.commodity.silver, 2)} />
                    <MacroStat label="金银比" value={formatNumber(data.commodity.goldSilverRatio, 2)} />
                    <MacroStat label="WTI 原油（美元/桶）" value={formatNumber(data.commodity.wti, 2)} />
                    <MacroStat label="布伦特原油（美元/桶）" value={formatNumber(data.commodity.brent, 2)} />
                  </>}
                  {data.fx && <>
                    <MacroStat label="美元兑人民币" value={formatNumber(data.fx.usd ? data.fx.usd / 100 : null, 4)} hint={`数据日 ${compactToIso(data.fx.tradeDate)}`} />
                    <MacroStat label="欧元兑人民币" value={formatNumber(data.fx.eur ? data.fx.eur / 100 : null, 4)} />
                    <MacroStat label="日元兑人民币" value={formatNumber(data.fx.jpy ? data.fx.jpy / 100 : null, 4)} />
                  </>}
                </div>
              ) : (
                <EmptyBlock title="没有商品与汇率数据" description="gold_oil 与 exchange_rate 中没有可用记录。" />
              )}
            </div>
          </section>

          <section className="surface-card macro-strategy" data-reveal>
            <div className="section-title">
              <div><span><ShieldAlert size={17} />今日策略信号</span><small>启动信号 · 标准化规则筛选结果</small></div>
              <button type="button" className="text-button" onClick={onStrategy}>查看完整漏斗 <ChevronRight size={15} /></button>
            </div>
            {data.strategy ? (
              <>
                <div className="macro-batch-grid">
                  <MacroStat label="策略" value={displayValue(data.strategy.strategyName)} hint={`评估日 ${compactToIso(data.strategy.evaluationDate)}`} />
                  <MacroStat label="全市场样本" value={formatCount(data.strategy.universeCount)} />
                  <MacroStat label="规则命中" value={formatCount(data.strategy.resultCount)} />
                  <MacroStat label="漏斗层数" value={formatCount(data.strategy.funnel.length)} />
                </div>
                <div className="funnel-steps compact">
                  {data.strategy.funnel.map((step, index) => (
                    <div key={step.code} style={{ "--step": index } as React.CSSProperties}>
                      <span>{step.name}</span><b>{formatCount(step.stockCount)}</b>
                      {index < data.strategy!.funnel.length - 1 && <ChevronRight size={16} />}
                    </div>
                  ))}
                </div>
                {data.strategy.hits.length > 0 ? (
                  <div className="hit-list">
                    {data.strategy.hits.map((hit) => (
                      <article className="hit-row" key={hit.tsCode}>
                        <div className="hit-name"><b>{displayValue(hit.name)}</b><span>{hit.tsCode} · {displayValue(hit.board)} · {displayValue(hit.industry)}</span></div>
                        <div className="hit-price"><b>{formatNumber(hit.close, 2)}</b><TrendValue value={hit.pctChg} /></div>
                        <p>{displayValue(hit.summary)}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="state-banner" data-reveal>
                    <CircleAlert size={17} />
                    <span><b>今日 0 个规则命中样本。</b>筛选已完成 {formatCount(data.strategy.universeCount)} 只标的，页面不会放宽阈值填充结果。</span>
                  </div>
                )}
              </>
            ) : (
              <EmptyBlock title="没有策略批次" description="risk_strategy_run 中没有当前日期之前的成功运行记录。" />
            )}
          </section>

          <section className="surface-card macro-sources" data-reveal>
            <div className="section-title"><span><Database size={17} />数据说明</span><small>各模块取数来源与自身日期</small></div>
            <dl>
              <div><dt>批次</dt><dd>{displayValue(response.batchId)} · 截至 {displayValue(response.dataAsOf)}</dd></div>
              <div><dt>行情与宽度</dt><dd>daily / daily_basic / index_daily · {compactToIso(data.tradeDate)}</dd></div>
              <div><dt>涨跌停与上涨率</dt><dd>limit_updown · {limit ? compactToIso(limit.tradeDate) : "XX"}</dd></div>
              <div><dt>集合竞价</dt><dd>call_auction · {data.auction ? compactToIso(data.auction.tradeDate) : "XX"}</dd></div>
              <div><dt>两融与成交</dt><dd>margin_daily · {margin ? compactToIso(margin.tradeDate) : "XX"}</dd></div>
              <div><dt>外围市场</dt><dd>foreign_index · 最新可得交易日</dd></div>
              <div><dt>策略信号</dt><dd>risk_strategy_run / funnel / result · {data.strategy ? compactToIso(data.strategy.evaluationDate) : "XX"}</dd></div>
            </dl>
            <p className="source-note">{response.missingFields.length ? `缺失字段：${response.missingFields.join("、")}` : "当前批次所有模块均取自数据库原始记录，未使用前端测算值替代。"}</p>
          </section>
        </>
      )}

      <div className="compliance-notice sitewide-notice"><CircleAlert size={17} /><p>本页面展示公开市场数据与标准化统计结果，不构成证券投资咨询或个性化投资建议。市场有风险，投资需独立判断。</p></div>
    </div>
  );
}
