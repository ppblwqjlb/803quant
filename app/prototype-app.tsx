"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bell,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock,
  Crown,
  Database,
  FileText,
  Gauge,
  LayoutDashboard,
  Landmark,
  ListFilter,
  LoaderCircle,
  Menu,
  Receipt,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { HomePage } from "./home-page";
import { IPOPage } from "./ipo-page";
import { MotionController } from "./motion-controller";
import { useResearchModule, type ResearchResponse } from "./use-research-module";
import { useServerContext } from "./use-server-context";
import type { SystemContext } from "../lib/server/system-context";
import {
  MEMBERSHIP_DEMO,
  PLANS,
  getPageFromHash,
  getPlanExpiry,
  getPlanSummary,
  validateRedemptionCode,
} from "../lib/prototype-model.mjs";
import { displayValue } from "../lib/research/contracts";
import { keepsAvailableResearchRows, researchDisplayState } from "./ipo-adapters";

type PageId = "home" | "today" | "risk" | "strategy" | "ipo" | "membership";
type StrategyView = "official" | "near";
type PlanId = "monthly" | "quarterly" | "yearly";
type PaymentState = "idle" | "processing" | "success" | "failed";
type MembershipMode = "purchase" | "redeem";
type RedeemState = "idle" | "validating" | "success" | "invalid";

type Candidate = {
  id: string;
  name: string;
  code: string;
  market: string;
  sector: string;
  view: StrategyView;
  score: string;
  close: string;
  change: string;
  gap: string;
  volumeRatio: string;
  tableSignals: string[][];
  metrics: string[][];
  setup: string;
  reason: string;
  evidence: string[][];
};

type IntelItem = {
  id: string;
  author: string;
  avatar: string;
  kind: string;
  action: string;
  sector: string;
  time: string;
  title: string;
  body: string;
  change: string;
  importance: string;
};

const NAV_ITEMS = [
  { id: "today", label: "今日决策台", mobile: "今日", icon: LayoutDashboard },
  { id: "risk", label: "风控提醒", mobile: "风控", icon: ShieldAlert },
  { id: "strategy", label: "策略信号观察", mobile: "信号", icon: ListFilter },
  { id: "ipo", label: "IPO 专题", mobile: "IPO", icon: Landmark },
  { id: "membership", label: "会员服务", mobile: "我的", icon: Crown },
] as const;


type ResearchRecord = Record<string, unknown>;
type TodayData = { snapshot: ResearchRecord | null; riskSnapshot: ResearchRecord | null; strategyRun: ResearchRecord | null; strategyCandidates: ResearchRecord[]; intelItems: ResearchRecord[]; events: ResearchRecord[] };
type RiskData = { snapshot: ResearchRecord | null; signals: ResearchRecord[] };
type StrategyData = { definition: ResearchRecord | null; run: ResearchRecord | null; funnel: ResearchRecord[]; candidates: ResearchRecord[] };

const emptyTodayData = (): TodayData => ({ snapshot: null, riskSnapshot: null, strategyRun: null, strategyCandidates: [], intelItems: [], events: [] });
const emptyRiskData = (): RiskData => ({ snapshot: null, signals: [] });
const emptyStrategyData = (): StrategyData => ({ definition: null, run: null, funnel: [], candidates: [] });
const researchStatus = (loading: boolean, response: ResearchResponse<unknown>) => loading ? "pending" : response.status;
const record = (value: unknown): ResearchRecord => value && typeof value === "object" && !Array.isArray(value) ? value as ResearchRecord : {};
const rows = (value: unknown): string[][] => Array.isArray(value) ? value.map((item) => Array.isArray(item) ? item.map(displayValue) : Object.values(record(item)).map(displayValue)) : [];
const researchValue = (item: ResearchRecord | null | undefined, key: string) => displayValue(item?.[key]);
const asBoolean = (value: unknown) => value === true || value === 1 || value === "1" || value === "true";

function toCandidate(item: ResearchRecord): Candidate {
  return {
    id: researchValue(item, "id"), name: researchValue(item, "name"), code: researchValue(item, "tsCode"), market: researchValue(item, "market"), sector: researchValue(item, "industry"),
    view: item.candidateType === "near" ? "near" : "official", score: researchValue(item, "matchScore"), close: researchValue(item, "closePrice"), change: researchValue(item, "changeRatePct"),
    gap: researchValue(item, "gapRatePct"), volumeRatio: researchValue(item, "volumeRatio"), tableSignals: [["缺口", researchValue(item, "gapRatePct")], ["量比", researchValue(item, "volumeRatio")]],
    metrics: [["跳空幅度", researchValue(item, "gapRatePct")], ["量比", researchValue(item, "volumeRatio")], ["策略匹配", researchValue(item, "matchScore")]],
    setup: researchValue(item, "setupLabel"), reason: researchValue(item, "reasonText"), evidence: rows(item.evidence),
  };
}

export function PrototypeApp({ initialContext }: { initialContext: SystemContext }) {
  const context = useServerContext(initialContext);
  const todayResearch = useResearchModule("/api/research/today", emptyTodayData);
  const riskResearch = useResearchModule("/api/research/risk", emptyRiskData);
  const strategyResearch = useResearchModule("/api/research/strategy", emptyStrategyData);
  const [page, setPage] = useState<PageId>("home");
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [membershipMode, setMembershipMode] = useState<MembershipMode>("purchase");
  const [navigationSequence, setNavigationSequence] = useState(0);
  const productNavRef = useRef<HTMLElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const pendingNavigationRef = useRef<PageId | null>(null);

  useEffect(() => {
    const syncHash = () => {
      pendingNavigationRef.current = null;
      const next = getPageFromHash(window.location.hash) as PageId;
      setPage(next);
    };
    if (!window.location.hash) window.history.replaceState(null, "", "#home");
    syncHash();
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("popstate", syncHash);
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("popstate", syncHash);
    };
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    productNavRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileMenuOpen(false);
      requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

  useEffect(() => {
    const destination = pendingNavigationRef.current;
    if (!destination || destination !== page) return;

    const frameId = requestAnimationFrame(() => {
      if (pendingNavigationRef.current !== destination) return;
      pendingNavigationRef.current = null;
      window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
      document.querySelector<HTMLElement>("main [data-page-heading]")?.focus({ preventScroll: true });
    });

    return () => cancelAnimationFrame(frameId);
  }, [page, navigationSequence]);

  const navigate = (next: PageId) => {
    pendingNavigationRef.current = next;
    setMobileMenuOpen(false);
    if (next === "membership") setMembershipMode("purchase");
    setPage(next);
    setNavigationSequence((sequence) => sequence + 1);
    if (window.location.hash !== `#${next}`) window.history.pushState(null, "", `#${next}`);
  };

  const openCandidate = (candidate: Candidate) => {
    setSelectedCandidate(candidate);
    navigate("strategy");
  };

  return (
    <div className="app-frame risk-theme-ready">
      <MotionController />
      <header className="site-header">
        <button type="button" className="site-brand" onClick={() => navigate("home")} aria-label="返回803见势研究首页">
          <span className="brand-mark" aria-hidden="true"><Image src="/803-jianshi-logo.png" alt="" width={42} height={42} priority unoptimized /></span>
          <div>
            <strong>803见势研究</strong>
            <span>A 股数据与信息研究平台</span>
          </div>
        </button>
        <nav ref={productNavRef} id="product-navigation" className={mobileMenuOpen ? "top-nav open" : "top-nav"} aria-label="产品导航">
          {NAV_ITEMS.map((item) => (
              <button
                type="button"
                key={item.id}
                className={page === item.id ? "top-nav-item active" : "top-nav-item"}
                aria-current={page === item.id ? "page" : undefined}
                onClick={() => navigate(item.id)}
              >
                <span>{item.label}</span>
              </button>
          ))}
        </nav>
        <div className="header-actions">
          {page === "home" ? (
            <button type="button" className="header-cta" onClick={() => navigate("today")}>查看今日决策 <ChevronRight size={18} /></button>
          ) : (
            <>
            <span className="demo-badge"><Database size={14} />{page === "membership" ? "演示会员" : "公开研究"}</span>
            <button type="button" className="icon-button" aria-label="站内消息">
              <Bell size={18} />
              <span className="notification-dot" />
            </button>
            </>
          )}
          <button ref={mobileMenuButtonRef} type="button" className="mobile-menu-button" aria-label={mobileMenuOpen ? "关闭产品导航" : "打开产品导航"} aria-controls="product-navigation" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>
            {mobileMenuOpen ? <X size={23} /> : <Menu size={23} />}
          </button>
        </div>
      </header>

      {page === "home" ? (
        <HomePage onNavigate={navigate} context={context} />
      ) : (
        <div className="product-workspace">
          <div className="product-statusbar">
            <div className="market-status"><span className="status-dot" /><strong>{context.serverDate} · 收盘后</strong><span>全市场数据已完成</span></div>
            <span>覆盖沪深主板、创业板、科创板</span>
          </div>
          <main className="page-content">
          {page === "today" && (
            <TodayPage
              compactDate={context.compactDate}
              onRisk={() => navigate("risk")}
              onStrategy={() => navigate("strategy")}
              onCandidate={openCandidate}
              today={todayResearch.response}
              todayLoading={todayResearch.loading}
              risk={riskResearch.response}
              strategy={strategyResearch.response}
            />
          )}
          {page === "risk" && <RiskPage compactDate={context.compactDate} response={riskResearch.response} loading={riskResearch.loading} />}
          {page === "strategy" && (
            <StrategyPage selected={selectedCandidate} onSelected={setSelectedCandidate} compactDate={context.compactDate} response={strategyResearch.response} loading={strategyResearch.loading} />
          )}
          {page === "ipo" && <IPOPage context={context} />}
          {page === "membership" && (
            <MembershipPage
              key={membershipMode}
              initialMode={membershipMode}
              onEnterMemberContent={(target) => navigate(target)}
            />
          )}
          <div className="compliance-notice sitewide-notice"><CircleAlert size={17} /><p>本平台提供公开信息整理、数据展示与标准化模型结果，不构成证券投资咨询或个性化投资建议。市场有风险，投资需独立判断。</p></div>
          </main>
        </div>
      )}

      {page !== "home" && <nav className="mobile-nav" aria-label="移动端主导航">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.id}
              className={page === item.id ? "active" : ""}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <Icon size={19} strokeWidth={1.9} />
              <span>{item.mobile}</span>
            </button>
          );
        })}
      </nav>}

    </div>
  );
}

function PageHeading({ eyebrow, title, description, right }: { eyebrow: string; title: string; description: string; right?: React.ReactNode }) {
  return (
    <div className="page-heading" data-reveal>
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1 data-page-heading tabIndex={-1}>{title}</h1>
        <p>{description}</p>
      </div>
      {right && <div className="heading-action">{right}</div>}
    </div>
  );
}

function StateTabs<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (next: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button type="button" key={option.id} aria-pressed={value === option.id} className={value === option.id ? "active" : ""} onClick={() => onChange(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TodayPage({ compactDate, onRisk, onStrategy, onCandidate, today, todayLoading, risk, strategy }: { compactDate: string; onRisk: () => void; onStrategy: () => void; onCandidate: (candidate: Candidate) => void; today: ResearchResponse<TodayData>; todayLoading: boolean; risk: ResearchResponse<RiskData>; strategy: ResearchResponse<StrategyData> }) {
  const dataState = researchStatus(todayLoading, today);
  const riskSnapshot = today.data.riskSnapshot ?? risk.data.snapshot;
  const scenario = {
    score: researchValue(riskSnapshot, "score"), stage: researchValue(riskSnapshot, "stageLabel"), summary: researchValue(riskSnapshot, "summary"), action: researchValue(riskSnapshot, "actionText"),
    coefficient: researchValue(riskSnapshot, "riskCoefficientPct"), exposure: researchValue(riskSnapshot, "exposureConstraintPct"),
    killSwitch: { hitCount: researchValue(riskSnapshot, "killConditionHitCount"), total: researchValue(riskSnapshot, "killConditionTotalCount") },
  };
  const allCandidates = (today.data.strategyCandidates.length ? today.data.strategyCandidates : strategy.data.candidates).map(toCandidate);
  const todayCandidates = [
    ...allCandidates.filter((item) => item.view === "official"),
    allCandidates.find((item) => item.view === "near"),
  ].filter(Boolean) as Candidate[];
  const signalState = researchDisplayState(dataState, todayCandidates.length);
  const scrollToIntel = () => document.getElementById("today-intelligence")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="page-stack" data-research-status={dataState}>
      <PageHeading
        eyebrow={`TODAY'S BRIEF · ${compactDate}`}
        title="收盘之后，先做明天的减法"
        description="把市场风险、规则信号、公开信息和关键事件整理成一张研究台。"
        right={<span className="status-label">{dataState}</span>}
      />

      {dataState === "partial" && <div className="state-banner warning" data-reveal><Clock size={17} /><span><b>当前批次部分缺失。</b>可用风险、信号和公开内容会照常展示；缺失字段以 XX 呈现。</span></div>}
      {dataState === "missing" && <div className="state-banner warning" data-reveal><CircleAlert size={17} /><span><b>当前日期暂无研究批次。</b>页面不会用旧批次数据替代。</span></div>}
      {dataState === "failed" && <div className="state-banner warning" data-reveal><CircleAlert size={17} /><span><b>研究数据请求失败。</b>请稍后刷新。</span></div>}

      <section className="today-hero" data-reveal>
        <button type="button" className={`risk-overview tone-${dataState}`} onClick={onRisk}>
          <div className="risk-overview-top">
            <span><ShieldAlert size={18} /> 风险总览</span>
            <span className="link-label">查看 {risk.data.signals.length} 项证据 <ChevronRight size={15} /></span>
          </div>
          <div className="risk-overview-main">
            <div className="score-orbit" style={{ "--score": scenario.score } as React.CSSProperties}>
              <span>{scenario.score}</span><small>RiskScore</small>
            </div>
            <div>
              <span className="status-label">{scenario.stage}</span>
              <h2>{scenario.summary}</h2>
              <p>{scenario.action}</p>
            </div>
          </div>
          <div className="risk-metrics">
            <span>状态系数 <b>{scenario.coefficient}</b></span>
            <span>模型约束值 <b>{scenario.exposure}</b></span>
            <span>极端风险阈值 <b>{scenario.killSwitch.hitCount}/{scenario.killSwitch.total}</b></span>
          </div>
        </button>

        <div className="three-lines surface-card">
          <div className="section-title"><span><Zap size={17} /> 今日三句话</span><small>先结论，后证据</small></div>
          <ol>{rows(today.data.snapshot?.summaryPoints).length ? rows(today.data.snapshot?.summaryPoints).map(([label, copy], index) => <li key={`${label}-${index}`}><span>0{index + 1}</span><p><b>{label}：</b>{copy}</p></li>) : <li><span>01</span><p><b>研究状态：</b>{dataState === "failed" ? "数据请求失败，请稍后刷新。" : "当前批次暂无可展示摘要。"}</p></li>}</ol>
        </div>
      </section>

      <section className="surface-card candidates-preview" data-reveal>
        <div className="section-title">
          <div><span><TrendingUp size={17} /> 今日策略信号</span><small>规则命中 {researchValue(today.data.strategyRun ?? strategy.data.run, "officialCandidateCount")} · 临近阈值 {researchValue(today.data.strategyRun ?? strategy.data.run, "nearCandidateCount")}</small></div>
          <button type="button" className="text-button" onClick={onStrategy}>查看完整漏斗 <ChevronRight size={15} /></button>
        </div>
        {signalState === "pending" ? (
          <LoadingBlock label="正在计算全市场筛选漏斗…" />
        ) : signalState === "missing" || signalState === "failed" ? (
          <StatusBlock icon={<CircleAlert size={22} />} title={signalState === "failed" ? "策略数据请求失败" : "当前日期暂无策略批次"} description="页面不会把不可用数据描述为零结果。" />
        ) : signalState === "empty" ? (
          <EmptyBlock title="今日没有规则命中样本" description={`策略已完成 ${researchValue(today.data.strategyRun ?? strategy.data.run, "marketSampleCount")} 只股票筛选；当前不以临近阈值样本填充结果。`} action="查看临近阈值" onAction={onStrategy} />
        ) : keepsAvailableResearchRows(signalState) ? (
          <div className="preview-grid">
            {todayCandidates.map((item, index) => (
              <button type="button" className="candidate-tile" key={item.id} onClick={() => onCandidate(item)}>
                <span className="rank">0{index + 1}</span>
                <div className="candidate-name"><h3>{item.name}{item.view === "near" && <em className="near-badge">临近阈值</em>}</h3><span>{item.code}</span></div>
                <div className="price-line"><b>¥{item.close}</b><span className="stock-up">{item.change}</span></div>
                <p>{item.setup}</p>
                <div className="tile-bottom"><span>{item.sector}</span><b>匹配 {item.score}</b></div>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="today-lower-grid" data-reveal>
        <div className="surface-card intel-preview">
          <div className="section-title">
            <div><span><FileText size={17} /> 公开内容重要变化</span><small>不是热榜，是观点与关注度的变化</small></div>
            <button type="button" className="text-button" onClick={scrollToIntel}>全部 {today.data.intelItems.length} 条 <ChevronRight size={15} /></button>
          </div>
          {today.data.intelItems.slice(0, 3).map((source) => {
            const item: IntelItem = { id: researchValue(source, "id"), author: researchValue(source, "authorName"), avatar: researchValue(source, "authorName").slice(0, 1), kind: researchValue(source, "contentKind"), action: researchValue(source, "attentionAction"), sector: researchValue(source, "sector"), time: researchValue(source, "publishedAt"), title: researchValue(source, "title"), body: researchValue(source, "bodySummary"), change: researchValue(source, "changeSummary"), importance: researchValue(source, "importance") };
            return (
            <button type="button" className="intel-row" key={item.id} onClick={scrollToIntel}>
              <span className="creator-avatar">{item.avatar}</span>
              <span className="intel-copy"><span><b>{item.author}</b><em>{item.kind}</em></span><strong>{item.title}</strong><small>{item.change}</small></span>
              <ChevronRight size={16} />
            </button>);
          })}
        </div>

        <div className="surface-card event-preview">
          <div className="section-title"><div><span><Clock size={17} /> 本月大事件</span><small>事件 → 板块 → 观察标的</small></div></div>
          <div className="mini-timeline">{(today.data.events.length ? today.data.events : [{}]).slice(0, 3).map((event, index) => <div className={`event-item ${index === 0 ? "past" : ""}`} key={researchValue(event, "id")}><time>{researchValue(event, "eventDate")}</time><span><b>{researchValue(event, "title")}</b><small>{researchValue(event, "summary")}</small></span></div>)}</div>
        </div>
      </section>
      <IntelSection response={today} loading={todayLoading} />
    </div>
  );
}

function RiskPage({ compactDate, response, loading }: { compactDate: string; response: ResearchResponse<RiskData>; loading: boolean }) {
  const scenarioId: string = asBoolean(response.data.snapshot?.killSwitchTriggered) ? "triggered" : response.status === "ready" ? "normal" : "warning";
  const snapshot = response.data.snapshot;
  const scenario = {
    score: researchValue(snapshot, "score"), label: researchValue(snapshot, "stageCode"), stage: researchValue(snapshot, "stageLabel"), summary: researchValue(snapshot, "summary"), action: researchValue(snapshot, "actionText"), layer: researchValue(snapshot, "currentDataLayer"),
    coefficient: researchValue(snapshot, "riskCoefficientPct"), exposure: researchValue(snapshot, "exposureConstraintPct"),
    signals: response.data.signals.map((item) => ({ id: researchValue(item, "id"), status: researchValue(item, "signalStatus"), label: researchValue(item, "signalLabel"), contribution: researchValue(item, "contributionScore"), value: researchValue(item, "displayValue"), percentile: researchValue(item, "historicalPercentilePct"), threshold: researchValue(item, "thresholdText"), note: researchValue(item, "explanation") })),
    timeline: rows(snapshot?.timeline),
    killSwitch: { hitCount: researchValue(snapshot, "killConditionHitCount"), total: researchValue(snapshot, "killConditionTotalCount"), triggered: asBoolean(snapshot?.killSwitchTriggered), conditions: rows(snapshot?.killConditions).map(([label, met, value]) => ({ label, met: asBoolean(met), value })) },
  };
  return (
    <div className="page-stack" data-research-status={researchStatus(loading, response)}>
      <PageHeading
        eyebrow={`RISK CONTROL · ${compactDate}`}
        title="风控提醒"
        description="把市场风险拆成可验证的信号链，而不是一句模糊的“注意风险”。"
        right={<span className="status-label">{researchStatus(loading, response)}</span>}
      />

      <div className={`state-banner scenario-alert tone-${scenarioId}`} data-reveal>
        {scenarioId === "triggered" ? <CircleAlert size={18} /> : <Activity size={18} />}
        <span><b>{scenario.stage}：</b>{scenario.action}</span>
        <small>当前数据层 · {scenario.layer}</small>
      </div>

      <section className="risk-dashboard" data-reveal>
        <div className={`risk-score-card tone-${scenarioId}`}>
          <div className="score-orbit large" style={{ "--score": scenario.score } as React.CSSProperties}>
            <span>{scenario.score}</span><small>RISK SCORE</small>
          </div>
          <div className="score-copy">
            <span className="status-label">{scenario.label}</span>
            <h2>{scenario.stage}</h2>
            <p>{scenario.summary}</p>
          </div>
          <div className="score-side-metric"><span>观察系数</span><b>{scenario.coefficient}</b><small>衡量模型所处风险阶段</small></div>
          <div className="score-side-metric"><span>模型约束值</span><b>{scenario.exposure}</b><small>标准化计算结果，非个性化建议</small></div>
        </div>

        <div className="risk-chain surface-card">
          <div className="section-title"><span><Gauge size={17} /> 三阶段风险链</span><small>由慢到快</small></div>
          <div className="chain-steps">
            <div><span>01</span><b>底色层</b><small>收盘后识别市场脆弱度</small><em>已完成</em></div>
            <div><span>02</span><b>压力层</b><small>隔夜与竞价确认外部压力</small><em>{scenarioId === "normal" ? "待确认" : "已确认"}</em></div>
            <div className={scenarioId === "triggered" ? "active" : ""}><span>03</span><b>快速层</b><small>09:35 判断是否进入极端阈值</small><em>{scenarioId === "triggered" ? "已触发" : "未触发"}</em></div>
          </div>
        </div>
      </section>

      <section className="surface-card" data-reveal>
        <div className="section-title"><div><span><Activity size={17} /> 六信号矩阵</span><small>点击任一信号查看原始值、分位与阈值</small></div><span className="formula-note">RiskScore = Σ 信号贡献分</span></div>
        <div className="signal-grid">
          {scenario.signals.map((item) => (
            <details className={`signal-card signal-${item.status}`} key={item.id}>
              <summary>
                <span className="signal-head"><i /><b>{item.label}</b><em>+{item.contribution}</em></span>
                <strong>{item.value}</strong>
                <span className="signal-meta">历史分位 {item.percentile}<ChevronRight size={15} /></span>
              </summary>
              <div className="signal-detail"><p><span>触发阈值</span><b>{item.threshold}</b></p><p>{item.note}</p></div>
            </details>
          ))}
        </div>
      </section>

      <section className="risk-bottom-grid" data-reveal>
        <div className="surface-card risk-timeline">
          <div className="section-title"><span><Clock size={17} /> 风险分更新时间轴</span><small>以当前批次返回层级为准</small></div>
          <div className="timeline-list">
            {scenario.timeline.map(([time, score, note, state]) => (
              <div className={`timeline-row ${state}`} key={time}>
                <span className="timeline-dot" />
                <time>{time}</time><b>{score}</b><p>{note}</p>
                <em>{state === "done" ? "完成" : state === "current" ? "当前" : "待更新"}</em>
              </div>
            ))}
          </div>
        </div>
        <KillSwitchPanel kill={scenario.killSwitch} />
      </section>
    </div>
  );
}

function KillSwitchPanel({ kill }: { kill: { hitCount: string; total: string; triggered: boolean; conditions: { label: string; met: boolean; value: string }[] } }) {
  return (
    <div className={`surface-card kill-switch ${kill.triggered ? "triggered" : ""}`}>
      <div className="section-title"><span><ShieldAlert size={17} /> 极端风险阈值</span><small>三项必须同时满足</small></div>
      <div className="kill-count"><b>{kill.hitCount}<small>/{kill.total}</small></b><span>{kill.triggered ? "极端阈值已触发" : "尚未触发"}</span></div>
      <div className="and-line"><span>AND</span></div>
      <div className="kill-conditions">
        {kill.conditions.map((condition) => (
          <div key={condition.label} className={condition.met ? "met" : ""}>
            {condition.met ? <CircleCheck size={18} /> : <span className="empty-check" />}
            <span><b>{condition.label}</b><small>{condition.value}</small></span>
          </div>
        ))}
      </div>
      <p className="kill-note">仅当数据库返回的全部条件同时满足，页面才显示“已触发”。</p>
    </div>
  );
}

function StrategyPage({ selected, onSelected, compactDate, response, loading }: { selected: Candidate | null; onSelected: (item: Candidate | null) => void; compactDate: string; response: ResearchResponse<StrategyData>; loading: boolean }) {
  const [view, setView] = useState<StrategyView>(selected?.view ?? "official");
  const [sector, setSector] = useState("全部板块");
  const responseState = researchStatus(loading, response);
  const runState = responseState === "ready" ? (response.data.candidates.length ? "ready" : "empty") : responseState;
  const candidates = response.data.candidates.map(toCandidate).filter((item) => item.view === view && (sector === "全部板块" || item.sector === sector));
  const strategy = response.data.definition;
  const sectors = ["全部板块", ...Array.from(new Set(response.data.candidates.map((item) => researchValue(item, "industry")).filter((item) => item !== "XX")))];

  return (
    <div className="page-stack" data-research-status={researchStatus(loading, response)}>
      <PageHeading
        eyebrow={`STRATEGY SCREEN · ${compactDate}`}
        title="策略信号观察"
        description="展示标准化规则如何形成命中样本；结果每天收盘后统一更新。"
        right={<span className="status-label">{researchStatus(loading, response)}</span>}
      />

      <section className="strategy-intro" data-reveal>
        <div className="strategy-title-card">
          <span className="strategy-index">{researchValue(strategy, "strategyCode")}</span>
          <div><h2>{researchValue(strategy, "name")}</h2><p>{researchValue(strategy, "description")}</p></div>
          <div className="strategy-tags">{Object.entries(record(strategy?.rules)).map(([key, value]) => <span key={key}>{displayValue(value)}</span>)}</div>
        </div>
        <div className="simplified-rule surface-card">
          <span>规则路径</span>
          <p>{Object.entries(record(strategy?.rules)).map(([step, value], index) => <span key={step}>{index > 0 && <b>→</b>}{displayValue(value)}</span>)}</p>
        </div>
      </section>

      {runState === "pending" && <RunningStrategy run={response.data.run} />}
      {runState === "partial" && <StatusBlock icon={<CircleAlert size={22} />} title="策略数据部分缺失" description="可用漏斗和候选记录会照常展示，缺失字段显示 XX。" />}
      {runState === "missing" && <StatusBlock icon={<CircleAlert size={22} />} title="当前日期暂无策略批次" description="页面不会用旧批次或静态样本填充结果。" />}
      {runState === "failed" && <StatusBlock icon={<CircleAlert size={22} />} title="策略数据请求失败" description="请稍后刷新后重试。" />}

      {keepsAvailableResearchRows(runState) || runState === "empty" ? (
        <>
          <StrategyFunnel response={response} />
          <section className="surface-card candidate-section" data-reveal>
            <div className="candidate-toolbar">
              <StateTabs
                label="信号类型"
                value={view}
                onChange={setView}
                options={[{ id: "official", label: `规则命中 ${researchValue(response.data.run, "officialCandidateCount")}` }, { id: "near", label: `临近阈值 ${researchValue(response.data.run, "nearCandidateCount")}` }]}
              />
              <label className="select-control"><span>板块</span><select value={sector} onChange={(event) => setSector(event.target.value)}>{sectors.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            {runState === "empty" ? (
              <EmptyBlock title="筛选已完成，今日 0 个规则命中样本" description="所有层级均保留真实通过数量。零结果不会自动放宽阈值，也不会用临近阈值样本替代规则命中。" />
            ) : candidates.length === 0 ? (
              <EmptyBlock title="当前板块没有结果" description="更换板块或查看全部板块；策略阈值没有因为筛选条件改变。" action="清除板块筛选" onAction={() => setSector("全部板块")} />
            ) : (
              <CandidateTable items={candidates} onOpen={onSelected} />
            )}
          </section>
        </>
      ) : null}

      {selected && <EvidenceDrawer candidate={selected} onClose={() => onSelected(null)} />}
    </div>
  );
}

function StrategyFunnel({ response }: { response: ResearchResponse<StrategyData> }) {
  const steps = response.data.funnel.map((item) => [researchValue(item, "stepName"), researchValue(item, "passedCount")]);
  return (
    <section className="surface-card strategy-funnel" data-reveal>
      <div className="section-title"><div><span><ListFilter size={17} /> 今日筛选漏斗</span><small>每一步都可解释，零结果也保留</small></div><span className="batch-label">批次 {displayValue(response.batchId)}</span></div>
      <div className="funnel-steps">
        {steps.map(([label, count], index) => (
          <div key={label} style={{ "--step": index } as React.CSSProperties}><span>{label}</span><b>{count}</b>{index < steps.length - 1 && <ChevronRight size={16} />}</div>
        ))}
      </div>
    </section>
  );
}

function CandidateTable({ items, onOpen }: { items: Candidate[]; onOpen: (item: Candidate) => void }) {
  return (
    <div className="candidate-table-wrap">
      <table className="candidate-table">
        <thead><tr><th>规则样本</th><th>收盘数据</th><th>关键信号</th><th>匹配度</th><th /></tr></thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td><div className="table-stock"><b>{item.name}</b><span>{item.code} · {item.sector}</span></div></td>
              <td><b>¥{item.close}</b><span className="stock-up">{item.change}</span></td>
              <td><div className="signal-tags">{item.tableSignals.map(([label, value]) => <span key={label}>{label} {value}</span>)}</div><small>{item.setup}</small></td>
              <td><div className="match-score"><span><i style={{ width: `${item.score}%` }} /></span><b>{item.score}</b></div></td>
              <td><button type="button" className="row-action" onClick={() => onOpen(item)}>查看证据 <ChevronRight size={15} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="candidate-mobile-list">
        {items.map((item) => (
          <button type="button" className="candidate-mobile-card" key={item.id} onClick={() => onOpen(item)}>
            <div><span><b>{item.name}</b><small>{item.code}</small></span><span><b>¥{item.close}</b><em className="stock-up">{item.change}</em></span></div>
            <p>{item.reason}</p>
            <footer><span>{item.sector} · {item.setup}</span><b>匹配 {item.score}</b></footer>
          </button>
        ))}
      </div>
    </div>
  );
}

function useAccessibleOverlay<T extends HTMLElement>(onDismiss: () => void, dismissible = true) {
  const overlayRef = useRef<T>(null);
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const pageStack = overlay.closest(".page-stack");
    const overlayLayer = overlay.parentElement;
    const appFrame = overlayLayer?.parentElement?.classList.contains("app-frame") ? overlayLayer.parentElement : null;
    const backgroundTargets = Array.from(new Set([
      ...(appFrame
        ? Array.from(appFrame.children).filter((item) => !item.contains(overlay)) as HTMLElement[]
        : [
            ...document.querySelectorAll<HTMLElement>(".site-header, .product-statusbar, .mobile-nav"),
            ...Array.from(pageStack?.children ?? []).filter((item) => !item.contains(overlay)) as HTMLElement[],
          ]),
    ]));
    const previousStates = backgroundTargets.map((item) => ({
      item,
      inert: item.inert,
      ariaHidden: item.getAttribute("aria-hidden"),
    }));
    const previousOverflow = document.body.style.overflow;

    backgroundTargets.forEach((item) => {
      item.inert = true;
      item.setAttribute("aria-hidden", "true");
    });
    document.body.style.overflow = "hidden";

    const getFocusable = () => Array.from(overlay.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [href], select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
    )).filter((item) => item.getClientRects().length > 0);

    (getFocusable()[0] ?? overlay).focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissible) {
        event.preventDefault();
        dismissRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (!focusable.length) {
        event.preventDefault();
        overlay.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previousStates.forEach(({ item, inert, ariaHidden }) => {
        item.inert = inert;
        if (ariaHidden === null) item.removeAttribute("aria-hidden");
        else item.setAttribute("aria-hidden", ariaHidden);
      });
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [dismissible]);

  return overlayRef;
}

function EvidenceDrawer({ candidate, onClose }: { candidate: Candidate; onClose: () => void }) {
  const drawerRef = useAccessibleOverlay<HTMLElement>(onClose);
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside ref={drawerRef} tabIndex={-1} className="evidence-drawer" role="dialog" aria-modal="true" aria-labelledby="evidence-title">
        <header><span className="eyebrow">EVIDENCE · 当前批次</span><button type="button" className="icon-button" aria-label="关闭证据抽屉" onClick={onClose}><X size={19} /></button></header>
        <div className="drawer-stock"><div><h2 id="evidence-title">{candidate.name}</h2><span>{candidate.code} · {candidate.market} · {candidate.sector}</span></div><div><b>¥{candidate.close}</b><span className="stock-up">{candidate.change}</span></div></div>
        <div className="evidence-verdict"><CircleCheck size={20} /><span><b>{candidate.setup}</b><p>{candidate.reason}</p></span></div>
        <h3>命中依据</h3>
        <div className="evidence-list">
          {candidate.evidence.map(([label, value, status]) => (
            <div key={`${label}-${value}`}><span>{status === "通过" ? <Check size={16} /> : <CircleAlert size={16} />}{label}</span><b>{value}</b><em>{status}</em></div>
          ))}
        </div>
        <div className="drawer-metrics">{candidate.metrics.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
        <div className="drawer-note"><CircleAlert size={17} /><p>该页面仅展示标准化规则如何形成命中样本，不构成证券投资咨询或个性化投资建议。</p></div>
        <button type="button" className="primary-button full" onClick={onClose}>我已看完证据</button>
      </aside>
    </div>
  );
}

function RunningStrategy({ run }: { run: ResearchRecord | null }) {
  const progress = Number(researchValue(run, "progressPct"));
  const progressWidth = Number.isFinite(progress) ? `${Math.max(0, Math.min(100, progress))}%` : "0%";
  return (
    <div className="surface-card running-strategy">
      <LoaderCircle className="spin" size={24} /><div><h3>{researchValue(run, "runStatus")}</h3><p>{researchValue(run, "processedCount")} / {researchValue(run, "marketSampleCount")}</p><span><i style={{ width: progressWidth }} /></span></div><b>{researchValue(run, "progressPct")}</b>
    </div>
  );
}

function IntelSection({ response, loading }: { response: ResearchResponse<TodayData>; loading: boolean }) {
  const [author, setAuthor] = useState("全部作者");
  const [action, setAction] = useState("全部标签");
  const [sector, setSector] = useState("全部板块");
  const dataState = researchStatus(loading, response);
  const sourceItems = useMemo(
    () => response.data.intelItems.map((item) => ({ id: researchValue(item, "id"), author: researchValue(item, "authorName"), avatar: researchValue(item, "authorName").slice(0, 1), kind: researchValue(item, "contentKind"), action: researchValue(item, "attentionAction"), sector: researchValue(item, "sector"), time: researchValue(item, "publishedAt"), title: researchValue(item, "title"), body: researchValue(item, "bodySummary"), change: researchValue(item, "changeSummary"), importance: researchValue(item, "importance") })),
    [response.data.intelItems],
  );
  const items = useMemo(
    () => sourceItems.filter((item) => (author === "全部作者" || item.author === author) && (action === "全部标签" || item.action === action) && (sector === "全部板块" || item.sector === sector)),
    [sourceItems, author, action, sector],
  );
  const operationCounts = useMemo(() => ({
    add: sourceItems.filter((item) => item.action === "关注提升").length,
    reduce: sourceItems.filter((item) => item.action === "关注降低").length,
  }), [sourceItems]);

  return (
    <section id="today-intelligence" className="today-intelligence-block" aria-labelledby="today-intelligence-title" data-reveal>
      <div className="page-heading section-heading">
        <div><span className="eyebrow">DAILY INFORMATION BATCH</span><h2 id="today-intelligence-title">今日信息</h2><p>公开内容摘要、观点变化与市场总结，是今日决策台的一部分。</p></div>
        <div className="heading-action"><span className="status-label">{dataState}</span></div>
      </div>

      <section className="batch-card surface-card">
        <div><Database size={20} /><span><b>{displayValue(response.dataAsOf)} 夜间批次</b><small>批次号 {displayValue(response.batchId)}</small></span></div>
        <dl><div><dt>数据日期</dt><dd>{displayValue(response.dataAsOf)}</dd></div><div><dt>数据状态</dt><dd>{dataState}</dd></div><div><dt>覆盖作者</dt><dd>{displayValue(response.data.intelItems.length)}</dd></div></dl>
      </section>

      {dataState === "partial" && <div className="state-banner warning"><Clock size={17} /><span><b>批次部分缺失：</b>当前仅展示本批可用内容。</span></div>}
      {dataState === "partial" && <div className="state-banner warning"><CircleAlert size={17} /><span><b>部分来源缺失：</b>缺失字段以 XX 呈现，其余内容可正常浏览。</span></div>}

      <section className="intel-summary-grid">
        <div className="summary-card consensus"><span>今日共识</span><b>{displayValue(response.data.snapshot?.headline)}</b><p>{displayValue(response.data.snapshot?.summary)}</p></div>
        <div className="summary-card divergence"><span>最大分歧</span><b>{displayValue(response.data.snapshot?.divergenceHeadline)}</b><p>{displayValue(response.data.snapshot?.divergenceSummary)}</p></div>
        <div className="summary-card operations"><span>关注变化</span><b><i>{operationCounts.add} 提升</i> · {operationCounts.reduce} 降低</b><p>{dataState === "ready" ? "汇总当前研究批次的作者观点变化。" : "仅统计当前可用来源。"}</p></div>
      </section>

      <section className="surface-card intel-feed-card">
        <div className="intel-filters">
          <label><span>作者</span><select value={author} onChange={(event) => setAuthor(event.target.value)}>{["全部作者", ...Array.from(new Set(sourceItems.map((item) => item.author)))].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>观点标签</span><select value={action} onChange={(event) => setAction(event.target.value)}>{["全部标签", ...Array.from(new Set(sourceItems.map((item) => item.action)))].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>板块</span><select value={sector} onChange={(event) => setSector(event.target.value)}>{["全部板块", ...Array.from(new Set(sourceItems.map((item) => item.sector)))].map((item) => <option key={item}>{item}</option>)}</select></label>
          <span className="result-count">{items.length} 条结果</span>
        </div>
        {items.length ? (
          <div className="intel-feed">
            {items.map((item) => (
              <article className="feed-item" key={item.id}>
                <div className="feed-author"><span className="creator-avatar">{item.avatar}</span><div><b>{item.author}</b><small>{item.time} · 公开内容摘要 · 虚构演示作者</small></div></div>
                <div className="feed-content"><div className="feed-tags"><span className={`kind kind-${item.action}`}>{item.kind}</span><span>{item.sector}</span><em>重要度 {item.importance}</em></div><h2>{item.title}</h2><p>{item.body}</p><footer><RefreshCw size={14} />{item.change}</footer></div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyBlock title="没有匹配的信息" description="当前三个筛选条件没有交集，请减少筛选项后重试。" action="清除筛选" onAction={() => { setAuthor("全部作者"); setAction("全部标签"); setSector("全部板块"); }} />
        )}
      </section>
    </section>
  );
}

function MembershipPage({ initialMode, onEnterMemberContent }: {
  initialMode: MembershipMode;
  onEnterMemberContent: (target: "risk" | "strategy") => void;
}) {
  const [mode, setMode] = useState<MembershipMode>(initialMode);
  const [planId, setPlanId] = useState<PlanId>("yearly");
  const [autoRenew, setAutoRenew] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentState, setPaymentState] = useState<PaymentState>("idle");
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemState, setRedeemState] = useState<RedeemState>("idle");
  const [redeemMessage, setRedeemMessage] = useState("");
  const paymentTimer = useRef<number | null>(null);
  const redeemTimer = useRef<number | null>(null);
  const redeemValidationId = useRef(0);
  const selectedPlan = PLANS.find((item) => item.id === planId) ?? PLANS[0];
  const summary = getPlanSummary(planId);

  const beginPayment = () => {
    if (paymentTimer.current) window.clearTimeout(paymentTimer.current);
    setPaymentState("processing");
    paymentTimer.current = window.setTimeout(() => {
      setPaymentState("success");
    }, 1400);
  };

  const setPaymentDemoState = (state: "failed" | "success") => {
    if (paymentTimer.current) window.clearTimeout(paymentTimer.current);
    paymentTimer.current = null;
    setPaymentState(state);
  };

  const cancelRedemptionValidation = () => {
    redeemValidationId.current += 1;
    if (redeemTimer.current !== null) window.clearTimeout(redeemTimer.current);
    redeemTimer.current = null;
    setRedeemState("idle");
    setRedeemMessage("");
  };

  const redeemMembership = () => {
    const validationId = redeemValidationId.current + 1;
    redeemValidationId.current = validationId;
    if (redeemTimer.current !== null) window.clearTimeout(redeemTimer.current);
    redeemTimer.current = null;
    if (!redeemCode.trim()) {
      setRedeemState("invalid");
      setRedeemMessage("请输入兑换码后再验证。");
      return;
    }
    setRedeemState("validating");
    setRedeemMessage("正在校验兑换码…");
    redeemTimer.current = window.setTimeout(() => {
      if (validationId !== redeemValidationId.current) return;
      redeemTimer.current = null;
      const result = validateRedemptionCode(redeemCode);
      setRedeemState(result.valid ? "success" : "invalid");
      setRedeemMessage(result.message);
    }, 650);
  };

  useEffect(() => () => {
    if (paymentTimer.current) window.clearTimeout(paymentTimer.current);
    redeemValidationId.current += 1;
    if (redeemTimer.current !== null) window.clearTimeout(redeemTimer.current);
  }, []);

  return (
    <div className="page-stack membership-page">
      <PageHeading eyebrow="MEMBERSHIP" title="选择适合你的会员开通方式" description="本地原型保留购买与兑换流程演示；风控与策略页面当前均可直接浏览。" />
      <section className="membership-hero" data-reveal>
        <div><span className="eyebrow">803会员 · 数据研究权益</span><h2>每天少看一点噪音，<br />多做一次独立判断。</h2><p>覆盖全 A 股主板、创业板与科创板；会员方案可用于未来的持续更新、历史归档与高级数据服务。</p></div>
        <div className="membership-proof"><span><b>17:30</b><small>盘后复盘</small></span><span><b>22:45</b><small>信息成品</small></span><span><b>09:25</b><small>竞价校验</small></span></div>
      </section>

      <section className="benefit-strip" data-reveal>
        {["盘前提示与盘后复盘", "市场风险阈值", "策略信号观察", "公开信息变化汇聚", "本月事件与 IPO 专题"].map((item) => <span key={item}><Check size={16} />{item}</span>)}
      </section>

      <section className="membership-mode-tabs segmented" role="group" aria-label="会员开通方式" data-reveal>
        <button type="button" className={mode === "purchase" ? "active" : ""} aria-pressed={mode === "purchase"} onClick={() => { cancelRedemptionValidation(); setMode("purchase"); }}>在线开通</button>
        <button type="button" className={mode === "redeem" ? "active" : ""} aria-pressed={mode === "redeem"} onClick={() => { cancelRedemptionValidation(); setMode("redeem"); }}>兑换会员码</button>
      </section>

      {mode === "purchase" ? (
        <>
          <section className="pricing-section" data-reveal>
            <div className="pricing-copy"><span className="eyebrow">选择周期</span><h2>按需要选择信息服务周期</h2><p>原型中的支付流程仅用于演示，不会发起真实扣款。</p></div>
            <div className="pricing-plans">
              {PLANS.map((plan) => {
                const planSummary = getPlanSummary(plan.id);
                return (
                  <button type="button" key={plan.id} aria-pressed={plan.id === planId} className={`pricing-plan ${plan.id === planId ? "selected" : ""} ${plan.featured ? "featured" : ""}`} onClick={() => setPlanId(plan.id as PlanId)}>
                    {plan.featured && <span className="popular-label">适合长期观察</span>}
                    <span className="plan-radio">{plan.id === planId && <i />}</span>
                    <h3>{plan.label}</h3>
                    <div className="plan-price"><small>¥</small><b>{plan.price}</b><span>/{plan.months === 1 ? "月" : plan.months === 3 ? "季" : "年"}</span></div>
                    <p>约 ¥{planSummary.monthlyEquivalent}/月</p>
                    <em>{planSummary.savings ? `较月付省 ¥${planSummary.savings}` : "按月灵活体验"}</em>
                    <small>{plan.note}</small>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="checkout-bar surface-card" data-reveal>
            <div><span>已选 {selectedPlan.label}</span><b>¥{summary.price}</b><small>{summary.savings ? `已优惠 ¥${summary.savings}` : "首期费用"}</small></div>
            <label className="renew-toggle"><button type="button" role="switch" aria-checked={autoRenew} className={autoRenew ? "on" : ""} onClick={() => setAutoRenew((value) => !value)}><i /></button><span><b>自动续费</b><small>默认关闭，可随时关闭</small></span></label>
            <button type="button" className="primary-button" onClick={() => { setPaymentState("idle"); setDialogOpen(true); }}><WalletCards size={18} />演示开通</button>
          </section>

          <section className="rules-card surface-card" data-reveal>
            <div><FileText size={18} /><span><b>计费规则</b><small>按自然时长计费；季付 3 个月，年付 12 个月，自开通时刻起生效。</small></span></div>
            <div><RefreshCw size={18} /><span><b>续费与退款</b><small>自动续费默认关闭；首次购买 24 小时内且未使用付费内容可申请全额退款。</small></span></div>
            <div><Receipt size={18} /><span><b>发票</b><small>订单完成后可申请电子普通发票，预计 1–3 个工作日开具。</small></span></div>
          </section>
        </>
      ) : (
        <section className="redeem-card surface-card" data-reveal>
          <div className="redeem-copy"><span className="eyebrow">REDEEM CODE</span><h2>兑换已购买的会员码</h2><p>兑换成功后，本次浏览期间可查看风控提醒与策略信号观察。刷新页面会恢复默认演示状态。</p></div>
          <div className="redeem-form">
            <label htmlFor="member-code">会员兑换码</label>
            <input id="member-code" value={redeemCode} onChange={(event) => { cancelRedemptionValidation(); setRedeemCode(event.target.value); }} placeholder="请输入兑换码" autoComplete="off" />
            <div>
              <button type="button" className="secondary-button" onClick={() => { cancelRedemptionValidation(); setRedeemCode("803-2026-VIP"); }}>填入演示码</button>
              <button type="button" className="primary-button" onClick={redeemMembership} disabled={redeemState === "validating"}>{redeemState === "validating" ? "校验中…" : "立即兑换"}</button>
            </div>
            <p className={`redeem-message ${redeemState}`} role="status">
              {redeemState === "invalid" ? (redeemMessage || "兑换码无效或已失效，请核对后重试。") : redeemMessage}
            </p>
          </div>
          {redeemState === "success" && (
            <div className="redeem-success">
              <CircleCheck size={24} /><span><b>会员权益已生效</b><small>演示到期时间：{MEMBERSHIP_DEMO.redeemExpiresAt}</small></span>
              <div><button type="button" className="secondary-button" onClick={() => onEnterMemberContent("risk")}>进入风控提醒</button><button type="button" className="primary-button" onClick={() => onEnterMemberContent("strategy")}>进入策略信号观察</button></div>
            </div>
          )}
        </section>
      )}

      {dialogOpen && (
        <PaymentDialog
          planLabel={selectedPlan.label}
          price={summary.price}
          expiresAt={getPlanExpiry(planId)}
          autoRenew={autoRenew}
          state={paymentState}
          onClose={() => setDialogOpen(false)}
          onReturn={() => { setDialogOpen(false); onEnterMemberContent("strategy"); }}
          onPay={beginPayment}
          onFail={() => setPaymentDemoState("failed")}
          onSuccess={() => setPaymentDemoState("success")}
        />
      )}
    </div>
  );
}

function PaymentDialog({ planLabel, price, expiresAt, autoRenew, state, onClose, onReturn, onPay, onFail, onSuccess }: { planLabel: string; price: number; expiresAt: string; autoRenew: boolean; state: PaymentState; onClose: () => void; onReturn: () => void; onPay: () => void; onFail: () => void; onSuccess: () => void }) {
  const [invoiceRequested, setInvoiceRequested] = useState(false);
  const dialogRef = useAccessibleOverlay<HTMLDivElement>(onClose, state !== "processing");
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && state !== "processing") onClose(); }}>
      <div ref={dialogRef} tabIndex={-1} className="payment-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-title">
        <header><div><span className="eyebrow">DEMO CHECKOUT</span><h2 id="payment-title">{state === "success" ? "会员已生效" : "确认开通"}</h2></div><button type="button" className="icon-button" aria-label="关闭支付弹窗" onClick={onClose} disabled={state === "processing"}><X size={19} /></button></header>
        {state === "idle" && <><div className="order-summary"><span>{planLabel}</span><b>¥{price}</b><small>自动续费：{autoRenew ? "开启" : "关闭"}</small></div><div className="mock-pay-method"><span className="pay-mark">演</span><span><b>模拟支付</b><small>不会调用真实支付接口</small></span><CircleCheck size={18} /></div><button type="button" className="primary-button full" onClick={onPay}>确认支付 ¥{price}</button><button type="button" className="text-button centered" onClick={onFail}>直接演示支付失败</button></>}
        {state === "processing" && <div className="payment-state"><LoaderCircle className="spin" size={36} /><h3>支付处理中</h3><p>正在模拟创建订单与会员权益，请稍候…</p><button type="button" className="text-button centered" onClick={onFail}>模拟网络中断</button></div>}
        {state === "failed" && <div className="payment-state failed"><CircleAlert size={38} /><h3>支付未完成</h3><p>模拟网关响应超时，本次没有产生扣款。</p><button type="button" className="primary-button full" onClick={onPay}><RefreshCw size={17} />重新支付</button><button type="button" className="text-button centered" onClick={onSuccess}>直接演示成功状态</button></div>}
        {state === "success" && <div className="payment-success"><span className="success-mark"><Check size={26} /></span><h3>{planLabel}已开通</h3><p>生效时间：{MEMBERSHIP_DEMO.activatedAt}<br />到期时间：{expiresAt}</p><div><span>订单号</span><b>{MEMBERSHIP_DEMO.orderNo}</b></div><button type="button" className="secondary-button full" disabled={invoiceRequested} onClick={() => setInvoiceRequested(true)}><Receipt size={17} />{invoiceRequested ? "发票申请已提交" : "申请电子发票"}</button><button type="button" className="primary-button full" onClick={onReturn}>进入策略信号观察</button></div>}
      </div>
    </div>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return <div className="loading-block" role="status"><LoaderCircle className="spin" size={22} /><span>{label}</span><div><i /><i /><i /></div></div>;
}

function EmptyBlock({ title, description, action, onAction }: { title: string; description: string; action?: string; onAction?: () => void }) {
  return <div className="empty-block"><span><FileText size={24} /></span><h3>{title}</h3><p>{description}</p>{action && <button type="button" className="secondary-button" onClick={onAction}>{action}</button>}</div>;
}

function StatusBlock({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <div className="surface-card status-block"><span>{icon}</span><div><h3>{title}</h3><p>{description}</p></div></div>;
}
