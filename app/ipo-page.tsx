"use client";

import { Building2, CircleAlert, Cpu, Database, FileSearch, GitCompareArrows } from "lucide-react";
import { emptyIpoResearchData, adaptIpoResearch, ipoValue, researchDisplayState } from "./ipo-adapters";
import { useResearchModule } from "./use-research-module";
import { displayValue } from "../lib/research/contracts";
import type { SystemContext } from "../lib/server/system-context";

const stateClass = (value: string) => value === "complete" ? "complete" : value === "planned" ? "planned" : "incomplete";
const probabilityWidth = (value: unknown) => {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? `${Math.max(0, Math.min(100, parsed))}%` : "0%";
};

function IpoStateNotice({ state }: { state: string }) {
  if (state === "pending") return <div className="state-banner" data-reveal><Database size={17} /><span>正在获取 IPO 研究数据。</span></div>;
  if (state === "partial") return <div className="state-banner warning" data-reveal><CircleAlert size={17} /><span>当前批次部分字段缺失；可用数据照常展示，缺失字段显示 XX。</span></div>;
  if (state === "missing") return <div className="state-banner warning" data-reveal><CircleAlert size={17} /><span>当前日期暂无 IPO 研究批次。</span></div>;
  if (state === "failed") return <div className="state-banner warning" data-reveal><CircleAlert size={17} /><span>IPO 研究数据请求失败，请稍后刷新。</span></div>;
  if (state === "empty") return <div className="state-banner" data-reveal><Database size={17} /><span>当前批次已完成，但没有可展示的 IPO 公司记录。</span></div>;
  return null;
}

export function IPOPage({ context }: { context: SystemContext }) {
  const research = useResearchModule("/api/research/ipo", emptyIpoResearchData);
  const status = research.loading ? "pending" : research.response.status;
  const view = adaptIpoResearch(research.response.data);
  const displayState = researchDisplayState(status, research.response.data.companies.length);
  const companies = view.primary.length ? view.primary : [{}];
  const comparisonRows = view.comparisonRows.length ? view.comparisonRows : [["XX", "XX", "XX"]];
  const allocationRows = view.subscriptions.length ? view.subscriptions : [{ item: {}, company: {} }];
  const valuationRows = view.primary.flatMap((company) => view.valuationsFor(company).map((valuation) => ({ company, valuation })));

  return (
    <div className="page-stack ipo-page" data-research-status={displayState}>
      <div className="page-heading" data-reveal>
        <div>
          <span className="eyebrow">IPO DUEL RESEARCH · {context.compactDate}</span>
          <h1 data-page-heading tabIndex={-1}>{view.primary.map((company) => ipoValue(company, "name")).join(" × ") || "XX × XX"}</h1>
          <p>对比审核进度、业务模式、申购参数与市值情景，所有数值均以当前研究批次为准。</p>
        </div>
        <span className="demo-badge"><Database size={14} />数据状态 · {displayState}</span>
      </div>

      <IpoStateNotice state={displayState} />

      <section className="ipo-company-grid" aria-label="公司概览" data-reveal>
        {companies.map((company, index) => (
          <article className={`surface-card ipo-company-card company-${ipoValue(company, "companyCode")}`} key={ipoValue(company, "id")}>
            <header><span>0{index + 1}</span><em>{ipoValue(company, "currentStatus")}</em></header>
            <div className="ipo-company-name">
              <span>{index === 0 ? <Cpu size={24} /> : <Building2 size={24} />}</span>
              <div><h2>{ipoValue(company, "name")}</h2><small>{ipoValue(company, "fullName")}</small></div>
            </div>
            <div className="ipo-company-code"><strong>{ipoValue(company, "tsCode")}</strong><span>{ipoValue(company, "industry")}</span></div>
            <p>{ipoValue(company, "summary")}</p>
            <dl>
              {[["核心产品", ipoValue(company, "coreProduct")], ["研究坐标", ipoValue(company, "researchFocus")], ["需求端", ipoValue(company, "demandDrivers")]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
          </article>
        ))}
      </section>

      <section className="surface-card ipo-progress" aria-labelledby="ipo-progress-title" data-reveal>
        <div className="section-title"><span id="ipo-progress-title"><FileSearch size={18} />发行上市进度对比</span><small>以当前批次披露节点为准</small></div>
        <div className="ipo-progress-grid">
          {companies.map((company) => {
            const stages = view.stagesFor(company);
            return <article className="ipo-progress-row" key={ipoValue(company, "id")}>
              <header><div><b>{ipoValue(company, "name")}</b><small>{ipoValue(company, "dataAsOf")}</small></div><strong>{ipoValue(company, "currentStatus")}</strong></header>
              <div className="ipo-progress-track" role="list" aria-label={`${ipoValue(company, "name")}发行上市进度`}>
                {(stages.length ? stages : [{}]).map((stage) => {
                  const completion = ipoValue(stage, "completionStatus");
                  return <span role="listitem" aria-label={`${ipoValue(stage, "stageName")}：${ipoValue(stage, "eventDate")}，${completion}`} className={stateClass(completion)} key={ipoValue(stage, "id")}><i /><b>{ipoValue(stage, "stageName")}</b><small>{ipoValue(stage, "eventDate")}</small>{completion === "planned" && <em>计划</em>}</span>;
                })}
              </div>
            </article>;
          })}
        </div>
      </section>

      <section className="surface-card ipo-comparison" aria-labelledby="ipo-comparison-title" data-reveal>
        <div className="section-title"><span id="ipo-comparison-title"><GitCompareArrows size={18} />核心对比矩阵</span><small>每个公司列按 `ipoCompanyId` 对齐</small></div>
        <div className="ipo-comparison-scroll">
          <table>
            <thead><tr><th>研究维度</th><th>{ipoValue(view.primary[0], "name")}</th><th>{ipoValue(view.primary[1], "name")}</th></tr></thead>
            <tbody>{comparisonRows.map(([dimension, first, second]) => <tr key={dimension}><th scope="row">{dimension}</th><td>{first}</td><td>{second}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="surface-card ipo-allocation" aria-labelledby="ipo-allocation-title" data-reveal>
        <div className="section-title"><span id="ipo-allocation-title"><GitCompareArrows size={18} />中签难度对比</span><small>字段依照当前批次原始口径显示</small></div>
        <div className="ipo-allocation-grid">
          {allocationRows.map(({ item, company }) => (
            <article className={`ipo-allocation-card company-${ipoValue(company, "companyCode")}`} key={ipoValue(item, "id")}>
              <header><div><h2>{ipoValue(company, "name")}</h2><span>{ipoValue(item, "issueShares")} / {ipoValue(item, "fundraisingAmount")}</span><small>{ipoValue(item, "calculationBasis")}</small></div><em>{ipoValue(item, "analysisType")}</em></header>
              <dl>{[["发行价", ipoValue(item, "issuePrice")], ["单签资金", ipoValue(item, "singleLotFunds")], ["顶格申购股数", ipoValue(item, "topSubscriptionShares")], ["需配市值", ipoValue(item, "requiredMarketCap")], ["配号数量", ipoValue(item, "allocationNumberCount")]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
              <div className="ipo-probability-row"><div><span>单号中签率</span><strong>{ipoValue(item, "winningRatePct")}</strong></div><div className="ipo-probability-track" aria-hidden="true"><i style={{ width: probabilityWidth(item.winningRatePct) }} /></div><small>{ipoValue(item, "atLeastOneWinProbabilityPct")}</small></div>
            </article>
          ))}
        </div>
      </section>

      <section className="surface-card ipo-valuation" aria-labelledby="ipo-valuation-title" data-reveal>
        <div className="section-title"><span id="ipo-valuation-title"><Database size={18} />股价与市值情景</span><small>按公司保留每个估值情景</small></div>
        <p className="ipo-valuation-note">缺少发行价、流通股本或市值字段时，页面显示 XX，避免用前端测算值代替数据库记录。</p>
        <div className="ipo-valuation-scroll">
          <table>
            <thead><tr><th>公司</th><th>情景</th><th>总市值</th><th>流通市值</th><th>流通股本</th><th>情景价格</th></tr></thead>
            <tbody>{(valuationRows.length ? valuationRows : [{ company: {}, valuation: {} }]).map(({ company, valuation }) => <tr key={ipoValue(valuation, "id")}><th scope="row">{ipoValue(company, "name")}</th><td>{ipoValue(valuation, "scenarioLabel")}</td><td>{ipoValue(valuation, "totalMarketCap")}</td><td>{ipoValue(valuation, "floatingMarketCap")}</td><td>{ipoValue(valuation, "floatingShares")}</td><td>{ipoValue(valuation, "scenarioPrice")}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="space-ipo-section" aria-labelledby="space-ipo-title" data-reveal>
        <div className="section-title"><span id="space-ipo-title"><FileSearch size={18} />商业航天 IPO 进度</span><small>仅显示数据库中标注的公开审核节点</small></div>
        <div className="space-ipo-grid">
          {(view.commercialCompanies.length ? view.commercialCompanies : [{}]).map((company, index) => {
            const events = view.stagesFor(company);
            return <article className="surface-card space-ipo-card" key={ipoValue(company, "id")}>
              <header><span>0{index + 1}</span><strong>状态：{ipoValue(company, "currentStatus")}</strong></header>
              <div className="space-ipo-company"><Building2 size={23} aria-hidden="true" /><div><h2>{ipoValue(company, "name")}</h2><p>{ipoValue(company, "fullName")}</p></div></div>
              <p className="space-ipo-focus">{ipoValue(company, "researchFocus")}</p>
              <div className="space-ipo-stages" aria-label={`${ipoValue(company, "name")}审核阶段`}>{(events.length ? events : [{}]).map((stage) => <span aria-label={`${ipoValue(stage, "stageName")}：${ipoValue(stage, "completionStatus")}`} className={stateClass(ipoValue(stage, "completionStatus"))} key={ipoValue(stage, "id")}><i /><b>{ipoValue(stage, "stageName")}</b><small>{ipoValue(stage, "completionStatus")}</small></span>)}</div>
              <ol className="space-ipo-timeline" aria-label={`${ipoValue(company, "name")}公开事件`}>{(events.length ? events : [{}]).map((event, eventIndex) => <li key={ipoValue(event, "id")}><i>{eventIndex + 1}</i><time>{ipoValue(event, "eventDate")}</time><p>{ipoValue(event, "description")}</p></li>)}</ol>
            </article>;
          })}
        </div>
      </section>

      <section className="surface-card ipo-data-note" aria-labelledby="ipo-data-title" data-reveal>
        <div><Database size={20} /><span><b id="ipo-data-title">数据说明</b><small>批次 {displayValue(research.response.batchId)} · 截至 {displayValue(research.response.dataAsOf)}</small></span></div>
        <p>当前模块只显示数据库返回的公开信息；缺失字段以 XX 呈现。</p>
      </section>
      <div className="compliance-notice" data-reveal><CircleAlert size={17} /><p>本专题仅提供公开信息整理与产业研究框架，不构成申购建议、证券投资咨询或个性化投资建议。</p></div>
    </div>
  );
}
