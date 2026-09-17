"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
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
  Landmark,
  LayoutDashboard,
  ListFilter,
  LoaderCircle,
  Menu,
  Receipt,
  RefreshCw,
  ShieldAlert,
  WalletCards,
  X,
} from "lucide-react";
import { HomePage } from "./home-page";
import { IPOPage } from "./ipo-page";
import { MotionController } from "./motion-controller";
import { StrategyPage, emptyStrategyResearchData } from "./strategy-page";
import { TodayPage, emptyTodayResearchData } from "./today-page";
import { PageHeading, useAccessibleOverlay } from "./ui-blocks";
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

type PageId = "home" | "today" | "risk" | "strategy" | "ipo" | "membership";
type PlanId = "monthly" | "quarterly" | "yearly";
type PaymentState = "idle" | "processing" | "success" | "failed";
type MembershipMode = "purchase" | "redeem";
type RedeemState = "idle" | "validating" | "success" | "invalid";

const NAV_ITEMS = [
  { id: "today", label: "今日决策台", mobile: "今日", icon: LayoutDashboard },
  { id: "risk", label: "风控提醒", mobile: "风控", icon: ShieldAlert },
  { id: "strategy", label: "策略信号观察", mobile: "信号", icon: ListFilter },
  { id: "ipo", label: "IPO 专题", mobile: "IPO", icon: Landmark },
  { id: "membership", label: "会员服务", mobile: "我的", icon: Crown },
] as const;

type ResearchRecord = Record<string, unknown>;
type RiskData = { snapshot: ResearchRecord | null; signals: ResearchRecord[] };

const emptyRiskData = (): RiskData => ({ snapshot: null, signals: [] });
const researchStatus = (loading: boolean, response: ResearchResponse<unknown>) => (loading ? "pending" : response.status);
const record = (value: unknown): ResearchRecord => (value && typeof value === "object" && !Array.isArray(value) ? value as ResearchRecord : {});
const rows = (value: unknown): string[][] => (Array.isArray(value) ? value.map((item) => (Array.isArray(item) ? item.map(displayValue) : Object.values(record(item)).map(displayValue))) : []);
const researchValue = (item: ResearchRecord | null | undefined, key: string) => displayValue(item?.[key]);
const asBoolean = (value: unknown) => value === true || value === 1 || value === "1" || value === "true";

export function PrototypeApp({ initialContext }: { initialContext: SystemContext }) {
  const context = useServerContext(initialContext);
  const todayResearch = useResearchModule("/api/research/today", emptyTodayResearchData);
  const riskResearch = useResearchModule("/api/research/risk", emptyRiskData);
  const strategyResearch = useResearchModule("/api/research/strategy", emptyStrategyResearchData);
  const [page, setPage] = useState<PageId>("home");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [membershipMode, setMembershipMode] = useState<MembershipMode>("purchase");
  const [navigationSequence, setNavigationSequence] = useState(0);
  const productNavRef = useRef<HTMLElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const pendingNavigationRef = useRef<PageId | null>(null);
  const dataAsOf = todayResearch.response.dataAsOf;

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
                className={page === item.id ? "top-nav-item active" : ""}
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
            <div className="market-status">
              <span className="status-dot" />
              <strong>{context.serverDate} · 盘后</strong>
              <span>{dataAsOf ? `行情数据截至 ${dataAsOf}` : "等待当日批次入仓"}</span>
            </div>
            <span>覆盖沪深主板、创业板、科创板、北交所</span>
          </div>
          <main className="page-content">
          {page === "today" && (
            <TodayPage
              compactDate={context.compactDate}
              onStrategy={() => navigate("strategy")}
              response={todayResearch.response}
              loading={todayResearch.loading}
            />
          )}
          {page === "risk" && <RiskPage compactDate={context.compactDate} response={riskResearch.response} loading={riskResearch.loading} />}
          {page === "strategy" && <StrategyPage compactDate={context.compactDate} response={strategyResearch.response} loading={strategyResearch.loading} />}
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
