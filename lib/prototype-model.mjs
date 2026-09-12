export const PAGE_IDS = ["home", "today", "risk", "strategy", "ipo", "membership"];

export const MEMBERSHIP_DEMO = Object.freeze({
  activatedAt: "2026-08-03 22:58",
  redeemExpiresAt: "2027-08-03 23:59",
  orderNo: "JS260803225801",
  expiryByPlan: { monthly: "2026-09-03 22:58", quarterly: "2026-11-03 22:58", yearly: "2027-08-03 22:58" },
});

export const PLANS = [
  { id: "monthly", label: "月度会员", price: 99, months: 1, autoRenewDefault: false, note: "适合先完整体验一个决策周期" },
  { id: "quarterly", label: "季度会员", price: 259, months: 3, autoRenewDefault: false, note: "覆盖财报季与主题轮动" },
  { id: "yearly", label: "年度会员", price: 799, months: 12, autoRenewDefault: false, featured: true, note: "全年策略更新与专题分析" },
];

export function getReferenceIssuePrice(raiseYuan, issueShares) {
  return Math.round((raiseYuan / issueShares) * 100) / 100;
}

export function getAtLeastOneHitProbability(ratePercent, allocationNumbers) {
  const rate = ratePercent / 100;
  return Math.round((1 - (1 - rate) ** allocationNumbers) * 100 * 10_000) / 10_000;
}

export function getMarketCapYi(priceYuan, shares) {
  return Math.round((priceYuan * shares / 100_000_000) * 100) / 100;
}

export function getPageFromHash(hash) {
  const value = String(hash || "").replace(/^#\/?/, "");
  if (value === "intel") return "today";
  return PAGE_IDS.includes(value) ? value : "home";
}

export function getPlanSummary(planId) {
  const plan = PLANS.find((item) => item.id === planId) || PLANS[0];
  const listPrice = 99 * plan.months;
  return { price: plan.price, monthlyEquivalent: Number((plan.price / plan.months).toFixed(2)), savings: listPrice - plan.price };
}

export function getPlanExpiry(planId) {
  return MEMBERSHIP_DEMO.expiryByPlan[planId] || MEMBERSHIP_DEMO.expiryByPlan.monthly;
}

export function validateRedemptionCode(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (normalized === "803-2026-VIP") return { valid: true, expiresAt: MEMBERSHIP_DEMO.redeemExpiresAt, message: "兑换成功，会员权益已生效。" };
  return { valid: false, message: "兑换码无效或已失效，请核对后重试。" };
}
