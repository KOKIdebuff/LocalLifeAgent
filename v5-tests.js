const assert = require("assert");
const core = require("./agent-core");
const contract = require("./v5-contract");
const adapter = require("./v5-adapter");
const renderer = require("./v5-renderer");

function makeUuidFactory(prefix) {
  let counter = 0;
  return function () {
    counter += 1;
    return prefix + "-0000-4000-8000-" + String(counter).padStart(12, "0");
  };
}

const flags = contract.resolveFeatureFlags({
  search: "?v5GenerativeUI=1&adapterFallback=0",
  localStorage: {
    getItem(key) {
      if (key === "localLife.adapterFallback") return "true";
      return null;
    },
  },
});
assert.strictEqual(flags.v5GenerativeUI, true, "URL should enable the V5 demo path");
assert.strictEqual(flags.adapterFallback, false, "URL should override storage");
assert.strictEqual(flags.localReplan, true, "unspecified flags should keep contract defaults");

const legacy = core.planRequest(
  "周六下午想和老婆孩子出去玩 4 小时，孩子 5 岁，别离家太远，老婆最近在减肥。",
  { groupType: "familyKids", timePreset: "周末下午" }
);
assert.strictEqual(legacy.needsClarification, false);

const payload = adapter.adaptAgentCoreResult(legacy, {
  makeUuid: makeUuidFactory("10000000"),
});
const validation = contract.validatePayload(payload);
assert.deepStrictEqual(validation, { valid: true, errors: [] });
assert.ok(payload.cards.some((card) => card.type === "assumption_banner"));
assert.strictEqual(
  payload.cards.filter((card) => card.type === "plan_summary").length,
  legacy.plans.length,
  "each legacy plan should become a plan summary card"
);
["activity", "restaurant", "timeline"].forEach((type) => {
  assert.strictEqual(
    payload.cards.filter((card) => card.type === type).length,
    legacy.plans.length,
    type + " should be generated for each plan"
  );
});
assert.ok(payload.actions.some((action) => action.type === "select_plan"));
assert.ok(payload.actions.some((action) => action.type === "refresh_block"));
assert.ok(payload.actions.every((action) => action.targetRef.lineageId === payload.lineageId));
assert.ok(payload.cards.every((card) => card.entityRef || card.targetRef));
assert.ok(payload.timeline.every((item) => item.entityRef && item.entityRef.sessionId === payload.sessionId));
const expectedPlanCardTypes = [
  "plan_summary",
  "activity",
  "restaurant",
  "transport",
  "transport",
  "timeline",
];
const expectedPlanEntityKinds = [
  "plan",
  "activity",
  "restaurant",
  "transport",
  "transport",
  "timeline_block",
];
const switcherActions = [
  "refresh_block",
  "preview_previous_candidate",
  "preview_next_candidate",
  "adopt_preview_candidate",
  "restore_original_candidate",
  "undo_candidate_adoption",
];
const expectedPlanActionTypes = [
  "select_plan",
  ...switcherActions,
  ...switcherActions,
  ...switcherActions,
  ...switcherActions,
];
assert.deepStrictEqual(
  {
    cardTypes: payload.cards.map((card) => card.type),
    entityKinds: payload.entities.map((entity) => entity.kind),
    actionTypes: payload.actions.map((action) => action.type),
    timelineCount: payload.timeline.length,
    mode: payload.planningMode,
    source: payload.source,
  },
  {
    cardTypes: [
      ...expectedPlanCardTypes,
      ...expectedPlanCardTypes,
      ...expectedPlanCardTypes,
      "assumption_banner",
    ],
    entityKinds: [
      ...expectedPlanEntityKinds,
      ...expectedPlanEntityKinds,
      ...expectedPlanEntityKinds,
    ],
    actionTypes: [
      ...expectedPlanActionTypes,
      ...expectedPlanActionTypes,
      ...expectedPlanActionTypes,
      "edit_assumption", "edit_assumption",
    ],
    timelineCount: 15,
    mode: "adapter_fallback",
    source: "agent_core_adapter",
  },
  "adapter output projection should remain golden and deterministic"
);

const unknownCardPayload = JSON.parse(JSON.stringify(payload));
unknownCardPayload.cards.push({
  id: "card-20000000-0000-4000-8000-000000000001",
  type: "future_card",
  status: "ready",
  title: "未来卡片",
  summaryText: "当前版本不应渲染",
  targetRef: payload.runtimeSummary.activePlanRef,
  actions: [],
  meta: {},
});
assert.ok(contract.validatePayload(unknownCardPayload).valid, "forward-compatible card strings remain valid");
assert.ok(
  !contract.getRenderableCards(unknownCardPayload).some((card) => card.type === "future_card"),
  "unknown cards must not enter the main renderer"
);
assert.strictEqual(
  contract.isExecutableAction({
    type: "future_action",
    status: "enabled",
    targetRef: payload.runtimeSummary.activePlanRef,
  }),
  false,
  "unknown actions must never execute"
);

const malformed = JSON.parse(JSON.stringify(payload));
delete malformed.cards[0].targetRef;
delete malformed.cards[0].entityRef;
assert.strictEqual(contract.validatePayload(malformed).valid, false, "incomplete refs must force fallback");

const clarification = core.planRequest("今天下午有空，帮我安排一下。");
const clarificationPayload = adapter.adaptAgentCoreResult(clarification, {
  makeUuid: makeUuidFactory("30000000"),
});
assert.ok(contract.validatePayload(clarificationPayload).valid);
assert.ok(clarificationPayload.cards.some((card) => card.type === "soft_prompt"));
assert.ok(clarificationPayload.actions.some((action) => action.type === "answer_soft_prompt"));

const areaOverride = core.planRequest("今天下午和朋友出去玩。", {
  groupType: "friends",
  timePreset: "今天下午",
  location: "朝阳区周边",
});
assert.strictEqual(areaOverride.parsed.location, "朝阳区周边");

assert.strictEqual(typeof renderer.render, "function", "renderer should load without a build step");
assert.deepStrictEqual(
  [0, 1, 2, 3].map(renderer.getMediaForIndex),
  [
    "assets/workbench/plan-heritage.jpg",
    "assets/workbench/plan-city.jpg",
    "assets/workbench/plan-food.jpg",
    "assets/workbench/plan-heritage.jpg",
  ],
  "plan media mapping should be local and deterministic"
);
assert.ok(
  !renderer.implementedActionTypes.includes("future_action"),
  "renderer action whitelist must stay closed by default"
);
console.log("All V5 frontend tests passed.");
