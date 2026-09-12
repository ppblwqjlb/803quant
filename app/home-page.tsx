import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Gauge,
  Landmark,
  ScanSearch,
  ShieldAlert,
} from "lucide-react";
import type { SystemContext } from "../lib/server/system-context";
import { CountUpValue } from "./count-up-value";
import { DecisionOrbit } from "./decision-orbit";

type ProductPageId = "today" | "risk" | "strategy" | "ipo" | "membership";

type HomePageProps = {
  onNavigate: (page: ProductPageId) => void;
  context: SystemContext;
};

const PRODUCTS = [
  { id: "today", no: "01", title: "今日决策台", description: "风险、规则信号、公开信息与事件，一页形成研究摘要。", outcome: "每天先看一页，三分钟建立市场信息全景。", icon: BarChart3 },
  { id: "risk", no: "02", title: "风控提醒", description: "用多项市场数据识别风险阶段与阈值变化。", outcome: "从六项信号到极端风险阈值，查看模型状态依据。", icon: ShieldAlert },
  { id: "strategy", no: "03", title: "策略信号观察", description: "收盘后运行规则，展示命中样本、依据与临近阈值。", outcome: "一套规则策略收盘后更新，并保留完整命中依据。", icon: ScanSearch },
  { id: "ipo", no: "04", title: "IPO 专题", description: "聚合发行进程、公开披露与产业链影响信息。", outcome: "从已知事实、待验证变量和主要风险理解 IPO 事件。", icon: Landmark },
] as const;

const PROOF = [
  { value: 10, suffix: "", unit: "年", label: "持续深耕 A 股研究", spoken: "10 年深耕" },
  { value: 300, suffix: "+", unit: "位", label: "累计服务学员", spoken: "服务 300+ 学员" },
  { value: 1, suffix: "", unit: "套", label: "持续运行规则策略", spoken: "1 套策略" },
  { value: 1200, suffix: "", unit: "天", label: "社群活跃更新", spoken: "社群活跃更新 1200 天" },
] as const;

const RESEARCH = [
  { no: "01", label: "GOOD COMPANY", title: "好公司", summary: "先理解企业，再判断股价。", detail: "从治理结构、竞争优势、财务质量与行业位置出发，寻找能够持续创造价值的公司。", tags: ["公司治理", "竞争壁垒", "财务质量"] },
  { no: "02", label: "GOOD BUSINESS", title: "好生意", summary: "看懂利润从哪里来，又能持续多久。", detail: "理解商业模式、现金流、成长空间与周期属性，识别增长质量，而不只追逐短期题材。", tags: ["商业模式", "现金流", "成长空间"] },
  { no: "03", label: "GOOD PRICE", title: "好价格", summary: "优秀公司，也需要合理的估值区间。", detail: "通过估值区间、安全边际与市场预期，持续记录价格与基本面之间的变化。", tags: ["估值区间", "安全边际", "预期差"] },
  { no: "04", label: "MARKET STATE", title: "市场状态", summary: "基本面描述企业，市场数据记录状态。", detail: "结合趋势结构、量价关系、催化事件与风险信号，形成可复核的市场观察记录。", tags: ["技术面", "量价结构", "风险观察"] },
] as const;

const SERVICE_TIMES = [
  ["08:30", "盘前提示", "看清隔夜变量与今日风险边界"],
  ["09:25", "竞价校验", "用集合竞价更新风险与强弱数据"],
  ["15:30", "盘后复盘", "复盘市场并运行策略 01"],
  ["22:45", "信息成品", "聚合观点变化与次日关注重点"],
] as const;

const FAQS = [
  ["适合怎样的投资者？", "适合希望系统研究 A 股、愿意独立判断，并重视风险控制和长期复盘的投资者。"],
  ["每天如何使用？", "先用今日决策台查看风险与事件，再查看规则信号依据，并在同一页面阅读今日公开信息摘要。"],
  ["策略信号何时更新？", "策略 01 在每个交易日收盘后运行，规则命中与临近阈值结果随盘后数据更新。"],
  ["会发送站外提醒吗？", "首版只提供站内风险提醒与内容更新，不发送短信、邮件或社交平台通知。"],
  ["可以查看全部历史吗？", "首版会员不提供全部历史内容，也不保存历史查询记录，产品聚焦当日与本月的决策信息。"],
] as const;

export function HomePage({ onNavigate, context }: HomePageProps) {
  return (
    <main className="home-page">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <span className="home-kicker">A-SHARE DATA & PUBLIC INFORMATION · SINCE 2016</span>
          <p className="brand-slogan">数据为据，决策有衡</p>
          <h1 id="home-title" data-page-heading tabIndex={-1} aria-label="研究好公司，等待好价格，把握好节奏">
            <span className="hero-title-line">研究好公司，</span>
            <span className="hero-title-line">等待好价格，</span>
            <span className="hero-title-line">把握好节奏</span>
          </h1>
          <p className="home-copy">聚合公司质地、生意模式、估值、市场结构与技术面数据，用多维信息支持独立研究判断。</p>
          <div className="hero-actions">
            <button type="button" className="primary-action" onClick={() => onNavigate("today")}>查看今日决策 <ArrowRight size={20} /></button>
            <a className="secondary-action" href="#research-system">了解研究体系 <ChevronRight size={19} /></a>
          </div>
        </div>

        <DecisionOrbit />
      </section>

      <section className="product-entry-grid" aria-label="产品入口">
        {PRODUCTS.map((product, index) => {
          const Icon = product.icon;
          return (
            <button type="button" key={product.id} className="product-entry" data-reveal data-reveal-delay={index * 70} onClick={() => onNavigate(product.id)}>
              <span className="product-number">{product.no}</span>
              <Icon size={24} strokeWidth={1.6} />
              <strong>{product.title}</strong>
              <p>{product.description}</p>
              <span className="entry-link">进入查看 <ArrowUpRight size={18} /></span>
            </button>
          );
        })}
      </section>

      <section className="home-section proof-section" aria-labelledby="proof-title" data-reveal>
        <span className="home-kicker">WHY 803</span>
        <h2 id="proof-title" className="home-section-title">10 年深耕，用研究与陪伴赢得信任</h2>
        <div className="proof-matrix">
          {PROOF.map((item, index) => (
            <div className="proof-cell" key={item.label}>
              <div><CountUpValue value={item.value} suffix={item.suffix} label={item.spoken} delay={index * 90} /><span aria-hidden="true">{item.unit}</span></div>
              <p>{item.label}</p>
            </div>
          ))}
          <div className="proof-story">
            <Gauge size={30} />
            <blockquote>不替你给出答案，而是用公开信息、规则模型与持续复盘，帮助你形成自己的判断。</blockquote>
            <span>数据聚合 × 规则观察 × 长期记录</span>
          </div>
          <div className="proof-data-note">
            <span>数据口径</span>
            <strong>{context.dottedDate}</strong>
            <p>演示阶段请以可核验记录为准</p>
          </div>
        </div>
      </section>

      <section id="research-system" className="home-section research-section" aria-labelledby="research-title">
        <span className="home-kicker">RESEARCH SYSTEM</span>
        <div className="research-intro" data-reveal>
          <h2 id="research-title" className="home-section-title">从理解一家公司，到形成一份研究记录</h2>
          <p>我们不依赖单一信号。基本面描述企业质量，估值记录价格区间，技术面和风险模型呈现市场状态。</p>
        </div>
        <div className="research-list">
          {RESEARCH.map((item, index) => (
            <article className="research-row" key={item.no} data-reveal data-reveal-delay={Math.min(index * 60, 180)}>
              <div className="research-index"><span>{item.no}</span><small>{index + 1} / {RESEARCH.length}</small></div>
              <div className="research-heading"><span>{item.label}</span><h3>{item.title}</h3></div>
              <div className="research-detail"><strong>{item.summary}</strong><p>{item.detail}</p><div>{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section capability-section" aria-labelledby="capability-title">
        <span className="home-kicker">WHAT YOU GET</span>
        <div className="capability-intro" data-reveal>
          <h2 id="capability-title" className="home-section-title">四个模块，把信息整理成每日研究</h2>
          <p>从观察市场风险，到查看规则命中、吸收公开信息和持续复盘，每个模块都对应一个明确的研究问题。</p>
        </div>
        <div className="capability-list">
          {PRODUCTS.map((product, index) => {
            const Icon = product.icon;
            return (
              <button type="button" key={product.id} className="capability-row" data-reveal data-reveal-delay={index * 60} onClick={() => onNavigate(product.id)}>
                <span className="capability-no">{product.no}</span>
                <span className="capability-icon"><Icon size={24} strokeWidth={1.6} /></span>
                <span className="capability-copy"><strong>{product.title}</strong><small>{product.description}</small></span>
                <span className="capability-outcome">{product.outcome}</span>
                <ArrowUpRight size={20} />
              </button>
            );
          })}
        </div>
      </section>

      <section className="home-section service-section" aria-labelledby="service-title">
        <div className="service-heading" data-reveal>
          <span className="home-kicker">DAILY RESEARCH</span>
          <h2 id="service-title" className="home-section-title">每个交易日，持续把信息沉淀为研究</h2>
          <p>从盘前到盘后，再到夜间信息成品，保持稳定、可预期的研究节奏。</p>
        </div>
        <div className="service-timeline">
          {SERVICE_TIMES.map(([time, title, description], index) => (
            <div className="service-step" key={time} data-reveal data-reveal-delay={index * 60}>
              <span className="service-no">0{index + 1}</span>
              <time>{time}</time>
              <strong>{title}</strong>
              <p>{description}</p>
            </div>
          ))}
          <div className="service-step service-monthly" data-reveal data-reveal-delay="280">
            <CalendarClock size={26} />
            <strong>月内持续更新</strong>
            <p>大事件时间线与专项情景分析</p>
          </div>
        </div>
      </section>

      <section className="home-section join-section" aria-labelledby="join-title" data-reveal>
        <span className="home-kicker">BEFORE YOU JOIN</span>
        <h2 id="join-title" className="home-section-title">开始之前，你可能想了解</h2>
        <div className="faq-list">
          {FAQS.map(([question, answer], index) => (
            <details key={question} open={index === 0}>
              <summary><span>0{index + 1}</span><strong>{question}</strong><ChevronRight size={22} /></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="home-cta" data-reveal>
        <div>
          <span className="home-kicker">JOIN 803</span>
          <span className="brand-slogan compact">数据为据，决策有衡</span>
          <h2>把分散信息，变成长期可复核的研究记录</h2>
          <p><CheckCircle2 size={18} /> 盘前提示 · 盘后复盘 · 策略 01 · 信息汇聚 · IPO 专题</p>
          <div className="home-price-summary" aria-label="会员价格摘要">
            <span>月度 <b>¥99</b></span>
            <span>季度 <b>¥259</b></span>
            <span className="recommended">年度方案 <b>¥799</b></span>
          </div>
        </div>
        <div className="home-cta-actions">
          <button type="button" className="primary-action" onClick={() => onNavigate("membership")}>查看会员方案 <ArrowRight size={20} /></button>
          <button type="button" className="secondary-action" onClick={() => onNavigate("today")}>先看今日决策 <ArrowRight size={20} /></button>
        </div>
      </section>
      <p className="home-compliance-note" data-reveal>本平台提供公开信息整理、数据展示与标准化模型结果，不构成证券投资咨询或个性化投资建议。市场有风险，投资需独立判断。</p>
    </main>
  );
}
