const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const styles = fs.readFileSync("styles.css", "utf8");

[
  "goal-input",
  "generate-btn",
  "reset-btn",
  "understanding",
  "plans",
  "agent-stages",
  "execution-queue",
  "feedback-input",
  "assumption-modal",
  "risk-modal",
  "feedback-modal",
].forEach((id) => {
  assert.ok(html.includes(`id="${id}"`), `workbench must preserve #${id}`);
});

["process", "execution", "memory"].forEach((tab) => {
  assert.ok(html.includes(`data-agent-tab="${tab}"`), `agent rail must include ${tab} tab`);
  assert.ok(html.includes(`data-agent-panel="${tab}"`), `agent rail must include ${tab} panel`);
});

assert.ok(!app.includes("window.prompt"), "assumption editing must use the accessible modal");
assert.ok(app.includes('event.key !== "Escape"'), "modals and drawer must support Escape");
assert.ok(app.includes("onOpenRisk: openRiskModal"), "V5 risks must open the formal risk modal");
assert.ok(
  html.indexOf('src="/candidate-switcher.js"') < html.indexOf('src="/app.js"'),
  "candidate switcher runtime must load before app.js"
);
assert.ok(app.includes("decorateCandidateSwitchers"), "app must decorate cards with session-local candidate state");
assert.ok(styles.includes(".candidate-switcher"), "candidate switcher interaction styles must exist");
assert.ok(html.includes('data-route-link="/saved-plans"'), "saved plans route must be reachable from the shared header");
assert.ok(html.includes('id="route-page"'), "secondary route shell must exist");
assert.ok(html.indexOf('src="/saved-plans.js"') < html.indexOf('src="/app.js"'), "saved plan runtime must load before app.js");
assert.ok(app.includes("renderSavedPlansPage"), "app must render the saved plan list route");
assert.ok(app.includes("renderPlanDetailPage"), "app must render plan detail routes");
assert.ok(app.includes("查看详情与调整安排"), "selected plans must expose a visible detail and adjustment entry");
assert.ok(app.includes("createDetailTransportBoxes"), "plan detail must show transport blocks inside the plan card");
assert.ok(app.includes("createTimelineAdjustControl"), "timeline replan controls must sit on timeline rows");
assert.ok(styles.includes(".inline-replan-control"), "detail replan controls must be embedded inside affected blocks");
assert.ok(app.includes("target.appendChild(panel)"), "choice preview must render inside the clicked adjustment block");
assert.ok(!app.includes('querySelector(".detail-plan-card")'), "choice preview must not jump to the top of the plan card");
[
  "可刷新最新 Mock 状态",
  "刷新 Mock 状态",
  "编辑副本",
  "reopenPolicy",
  "Main 方案",
  "另存为新快照",
  "SAVED PLAN SNAPSHOT",
  "SAVED PLAN LIBRARY",
  "已保存方案",
  "已保存记录",
  "每条记录只保存",
  "轻量摘要",
  "候选摘要",
  "张卡片",
  "执行锁定",
  "锁定区块",
  "查看详情与局部重排",
  "局部重排",
  "预览下一个候选",
  "候选预览",
  "采用并生成新版本",
  "重排校验失败",
].forEach((copy) => {
  assert.ok(!app.includes(copy) && !html.includes(copy), `product UI must not expose internal copy: ${copy}`);
});
assert.ok(styles.includes("@font-face"), "workbench fonts must be local");
assert.ok(!html.includes("fonts.googleapis.com"), "workbench must not depend on remote fonts");
assert.ok(!html.includes("tailwind"), "workbench must remain framework-free");

[
  "assets/workbench/avatar.jpg",
  "assets/workbench/plan-heritage.jpg",
  "assets/workbench/plan-city.jpg",
  "assets/workbench/plan-food.jpg",
  "assets/fonts/material-symbols-rounded.ttf",
].forEach((path) => {
  assert.ok(fs.existsSync(path), `${path} must exist locally`);
});

console.log("All workbench shell tests passed.");
