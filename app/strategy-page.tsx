"use client";

import { useState } from "react";
import { Check, ChevronRight, CircleAlert, CircleCheck, Clock, Database, ListFilter, TrendingUp, X } from "lucide-react";
import { displayValue } from "../lib/research/contracts";
import { compactToIso, formatCount, formatNumber, formatPct, formatRuntime, showDate, trendTone } from "./research-format";
import { EmptyBlock, LoadingBlock, PageHeading, StatusBlock, useAccessibleOverlay } from "./ui-blocks";
import type { StrategyCandidate, StrategyData } from "../lib/server/repositories/strategy";
import type { ResearchResponse } from "./use-research-module";

const dataState = (loading: boolean, response: ResearchResponse<StrategyData>) => (loading ? "pending" : response.status);

export const emptyStrategyResearchData = (): StrategyData => ({
  run: null,
  funnel: [],
  candidates: [],
  failureStages: [],
  history: [],
});

function StrategyNotices({ state }: { state: string }) {
  if (state === "partial") return <div className="state-banner warning" data-reveal><Clock size={17} /><span><b>部分内容缺失。</b>可用漏斗与命中记录照常展示，缺失字段以 XX 呈现。</span></div>;
  if (state === "missing") return <div className="state-banner warning" data-reveal><CircleAlert size={17} /><span><b>请求日期之前没有成功的策略运行批次。</b>页面不会用更早批次冒充当日结果。</span></div>;
  if (state === "failed") return <div className="state-banner warning" data-reveal><CircleAlert size={17} /><span><b>策略数据请求失败。</b>请稍后刷新。</span></div>;
  return null;
}

function EvidenceDrawer({ candidate, onClose }: { candidate: StrategyCandidate; onClose: () => void }) {
  const drawerRef = useAccessibleOverlay<HTMLElement>(onClose);
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside ref={drawerRef} tabIndex={-1} className="evidence-drawer" role="dialog" aria-modal="true" aria-labelledby="evidence-title">
        <header><span className="eyebrow">EVIDENCE · {compactToIso(candidate.evaluationDate)}</span><button type="button" className="icon-button" aria-label="关闭证据抽屉" onClick={onClose}><X size={19} /></button></header>
        <div className="drawer-stock">
          <div><h2 id="evidence-title">{displayValue(candidate.name)}</h2><span>{candidate.tsCode} · {displayValue(candidate.board)} · {displayValue(candidate.industry)}</span></div>
          <div><b>{formatNumber(candidate.close, 2)}</b><span className={`trend trend-${trendTone(candidate.pctChg)}`}>{formatPct(candidate.pctChg)}</span></div>
        </div>
        <div className="evidence-verdict"><CircleCheck size={20} /><span><b>信号确认日 {compactToIso(candidate.signalDate)}</b><p>{displayValue(candidate.summary)}</p></span></div>

        <h3>命中依据</h3>
        {candidate.evidence.length ? (
          <div className="evidence-list">
            {candidate.evidence.map((row, index) => (
              <div key={`${row.label}-${index}`}>
                <span>{row.status === "通过" ? <Check size={16} /> : <CircleAlert size={16} />}{displayValue(row.label)}</span>
                <b>{displayValue(row.value)}</b>
                <em>{displayValue(row.status)}</em>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-block compact"><h3>该记录没有证据明细</h3><p>risk_strategy_result.evidence_json 为空或结构无法解析。</p></div>
        )}

        <div className="drawer-metrics">
          {candidate.signals.map((signal, index) => (
            <div key={`${signal.label}-${index}`}><span>{displayValue(signal.label)}</span><b>{displayValue(signal.value)}</b></div>
          ))}
        </div>
        <div className="drawer-note"><CircleAlert size={17} /><p>该页面仅展示标准化规则如何形成命中样本，不构成证券投资咨询或个性化投资建议。</p></div>
        <button type="button" className="primary-button full" onClick={onClose}>我已看完证据</button>
      </aside>
    </div>
  );
}

export function StrategyPage({ compactDate, response, loading }: {
  compactDate: string;
  response: ResearchResponse<StrategyData>;
  loading: boolean;
}) {
  const [selected, setSelected] = useState<StrategyCandidate | null>(null);
  const [industry, setIndustry] = useState("全部行业");
  const state = dataState(loading, response);
  const data = response.data;
  const run = data.run;
  const universe = data.funnel[0]?.stockCount ?? run?.universeCount ?? 0;
  const industries = ["全部行业", ...Array.from(new Set(data.candidates.map((item) => item.industry).filter((item): item is string => Boolean(item))))];
  const candidates = industry === "全部行业" ? data.candidates : data.candidates.filter((item) => item.industry === industry);

  return (
    <div className="page-stack" data-research-status={state}>
      <PageHeading
        eyebrow={`STRATEGY SCREEN · ${compactDate}`}
        title="策略信号观察"
        description="展示启动信号策略如何逐层筛选全市场样本，每一步保留真实通过数量与淘汰数量。"
        right={<span className="status-label">{state}</span>}
      />

      <StrategyNotices state={state} />
      {state === "pending" && <LoadingBlock label="正在读取策略运行批次…" />}
      {state === "ready" && !run && <StatusBlock icon={<CircleAlert size={22} />} title="没有可用的策略运行" description="数据库中还没有状态为 success 的策略运行记录。" />}

      {run && (
        <>
          <section className="surface-card strategy-run-card" data-reveal>
            <div className="strategy-title-card">
              <span className="strategy-index">策略</span>
              <div>
                <h2>{displayValue(run.strategyName)}</h2>
                <p>评估交易日 {compactToIso(run.evaluationDate)} · 参数版本 {displayValue(run.paramsVersion)}</p>
              </div>
              <div className="strategy-tags">
                <span>{displayValue(run.strategyCode)}</span>
                <span>批次 #{run.runId}</span>
                <span>状态 {displayValue(run.status)}</span>
                <span>耗时 {formatRuntime(run.runtimeMs)}</span>
              </div>
            </div>
            <div className="macro-batch-grid">
              <div className="macro-stat"><span>全市场样本</span><b>{formatCount(run.universeCount)}</b><small>通过基础可交易条件</small></div>
              <div className="macro-stat"><span>规则命中</span><b>{formatCount(run.resultCount)}</b><small>最终结果数量</small></div>
              <div className="macro-stat"><span>开始时间</span><b className="mono">{showDate(run.startedAt)}</b></div>
              <div className="macro-stat"><span>完成时间</span><b className="mono">{showDate(run.completedAt)}</b></div>
            </div>
          </section>

          <section className="surface-card strategy-funnel" data-reveal>
            <div className="section-title">
              <div><span><ListFilter size={17} />筛选漏斗</span><small>逐层条件收紧，零结果也保留</small></div>
              <span className="batch-label">批次 {displayValue(response.batchId)}</span>
            </div>
            {data.funnel.length ? (
              <>
                <div className="funnel-steps">
                  {data.funnel.map((step, index) => (
                    <div key={step.code} style={{ "--step": index } as React.CSSProperties}>
                      <span>{step.name}</span><b>{formatCount(step.stockCount)}</b>
                      {index < data.funnel.length - 1 && <ChevronRight size={16} />}
                    </div>
                  ))}
                </div>
                <ol className="funnel-detail">
                  {data.funnel.map((step, index) => {
                    const previous = index === 0 ? step.stockCount : data.funnel[index - 1].stockCount;
                    const removed = Math.max(0, previous - step.stockCount);
                    const passRate = universe > 0 ? (step.stockCount / universe) * 100 : null;
                    return (
                      <li key={step.code}>
                        <span className="funnel-order">0{index + 1}</span>
                        <div className="funnel-body">
                          <div className="funnel-head"><b>{step.name}</b><span>{step.code}</span></div>
                          <div className="funnel-meter"><i style={{ width: `${Math.max(0, Math.min(100, passRate ?? 0))}%` }} /></div>
                          <dl className="funnel-numbers">
                            <div><dt>通过</dt><dd>{formatCount(step.stockCount)}</dd></div>
                            <div><dt>本层淘汰</dt><dd>{index === 0 ? "—" : formatCount(removed)}</dd></div>
                            <div><dt>累计通过率</dt><dd>{passRate === null ? "XX" : `${formatNumber(passRate, 2)}%`}</dd></div>
                          </dl>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </>
            ) : (
              <EmptyBlock title="没有漏斗记录" description="risk_strategy_funnel 中没有该批次的阶段数据。" />
            )}
          </section>

          {data.failureStages.length > 0 && (
            <section className="surface-card" data-reveal>
              <div className="section-title"><div><span><ListFilter size={17} />淘汰分布</span><small>按首个未通过的阶段统计</small></div></div>
              <div className="failure-grid">
                {data.failureStages.map((item) => (
                  <div className="failure-card" key={item.stage}>
                    <span>{item.label}</span>
                    <b>{formatCount(item.count)}</b>
                    <small>{item.stage}</small>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="surface-card candidate-section" data-reveal>
            <div className="section-title">
              <div><span><TrendingUp size={17} />命中个股</span><small>评估日 {compactToIso(run.evaluationDate)} · 共 {formatCount(data.candidates.length)} 条记录</small></div>
              {industries.length > 2 && (
                <label className="select-control">
                  <span>行业</span>
                  <select value={industry} onChange={(event) => setIndustry(event.target.value)}>
                    {industries.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
              )}
            </div>
            {data.candidates.length === 0 ? (
              <div className="state-banner" data-reveal>
                <CircleAlert size={17} />
                <span><b>本次运行 0 个规则命中样本。</b>筛选已完成 {formatCount(run.universeCount)} 只标的，页面不会放宽阈值填充结果。</span>
              </div>
            ) : candidates.length === 0 ? (
              <EmptyBlock title="当前行业没有结果" description="更换行业筛选；策略阈值没有因为筛选条件改变。" action="清除行业筛选" onAction={() => setIndustry("全部行业")} />
            ) : (
              <div className="candidate-table-wrap">
                <table className="candidate-table">
                  <thead><tr><th>规则样本</th><th>确认日收盘</th><th>规则信号</th><th>信号摘要</th><th /></tr></thead>
                  <tbody>
                    {candidates.map((item) => (
                      <tr key={item.tsCode}>
                        <td><div className="table-stock"><b>{displayValue(item.name)}</b><span>{item.tsCode} · {displayValue(item.board)} · {displayValue(item.industry)}</span></div></td>
                        <td><b>{formatNumber(item.close, 2)}</b><span className={`trend trend-${trendTone(item.pctChg)}`}>{formatPct(item.pctChg)}</span></td>
                        <td><div className="signal-tags">{item.signals.map((signal, index) => <span key={`${signal.label}-${index}`}>{displayValue(signal.label)} {displayValue(signal.value)}</span>)}</div></td>
                        <td><small>{displayValue(item.summary)}</small></td>
                        <td><button type="button" className="row-action" onClick={() => setSelected(item)}>查看证据 <ChevronRight size={15} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="candidate-mobile-list">
                  {candidates.map((item) => (
                    <button type="button" className="candidate-mobile-card" key={item.tsCode} onClick={() => setSelected(item)}>
                      <div><span><b>{displayValue(item.name)}</b><small>{item.tsCode}</small></span><span><b>{formatNumber(item.close, 2)}</b><em className={`trend trend-${trendTone(item.pctChg)}`}>{formatPct(item.pctChg)}</em></span></div>
                      <p>{displayValue(item.summary)}</p>
                      <footer><span>{displayValue(item.industry)} · 信号日 {compactToIso(item.signalDate)}</span><b>查看证据</b></footer>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {data.history.length > 0 && (
        <section className="surface-card" data-reveal>
          <div className="section-title"><div><span><Database size={17} />历史信号</span><small>按首次推出时间倒序</small></div><span className="batch-label">最近 {data.history.length} 条</span></div>
          <ol className="history-list">
            {data.history.map((item) => (
              <li key={`${item.tsCode}-${item.confirmationDate}`}>
                <time>{compactToIso(item.confirmationDate)}</time>
                <span><b>{displayValue(item.name)}</b><small>{item.tsCode} · {displayValue(item.industry)}</small></span>
                <span className="history-price"><b>{formatNumber(item.close, 2)}</b><em className={`trend trend-${trendTone(item.pctChg)}`}>{formatPct(item.pctChg)}</em></span>
                <p>{displayValue(item.summary)}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="compliance-notice sitewide-notice"><CircleAlert size={17} /><p>本页面展示标准化规则如何形成命中样本，不构成证券投资咨询或个性化投资建议。市场有风险，投资需独立判断。</p></div>

      {selected && <EvidenceDrawer candidate={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
