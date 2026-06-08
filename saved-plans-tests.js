const assert = require("assert");
const core = require("./agent-core");
const adapter = require("./v5-adapter");
const lifecycle = require("./saved-plans");
const candidateRuntime = require("./candidate-switcher");

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

function createContext(version = 1) {
  let counter = 0;
  return {
    requestId: "11111111-1111-4111-8111-111111111111",
    sessionId: "22222222-2222-4222-8222-222222222222",
    lineageId: "33333333-3333-4333-8333-333333333333",
    version,
    makeUuid() {
      counter += 1;
      return "00000000-0000-4000-8000-" + String(counter).padStart(12, "0");
    },
  };
}

const result = core.planRequest(
  "周六下午想和老婆孩子出去玩 4 小时，孩子 5 岁，别离家太远，老婆最近在减肥。"
);
assert.strictEqual(result.needsClarification, false);
const selectedPlanId = result.recommendedPlanId;
const context = createContext();
const payload = adapter.adaptAgentCoreResult(result, context);
const activityCard = payload.cards.find(
  (card) => card.type === "activity" && card.meta.legacyPlanId === selectedPlanId
);

const snapshot = lifecycle.buildSnapshot({
  result,
  payload,
  selectedPlanId,
  context,
  executedActions: [{
    type: "book_activity",
    title: "模拟预约活动",
    status: "success",
    requiresConfirmation: true,
    result: "模拟成功",
  }, {
    type: "reserve_table",
    title: "模拟订座",
    status: "failed_recoverable",
    requiresConfirmation: true,
    result: "模拟失败，可恢复",
  }],
  snapshotId: "44444444-4444-4444-8444-444444444444",
  savedAt: "2026-06-06T00:00:00.000Z",
  makeUuid: context.makeUuid,
});

assert.strictEqual(snapshot.selectedPlan.planRef.id, payload.cards.find(
  (card) => card.type === "plan_summary" && card.meta.legacyPlanId === selectedPlanId
).entityRef.id);
assert.ok(snapshot.selectedPlan.cards.every((card) => card.meta.legacyPlanId === selectedPlanId));
assert.ok(snapshot.selectedPlan.lockedRefs.some((ref) => ref.id === activityCard.entityRef.id));
assert.strictEqual(lifecycle.validateCandidateSummaries(snapshot.candidateSummaries), true);
snapshot.candidateSummaries.forEach((candidate) => {
  lifecycle.FORBIDDEN_CANDIDATE_FIELDS.forEach((field) => {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(candidate, field), false);
  });
  assert.deepStrictEqual(
    Object.keys(candidate).sort(),
    ["name", "planRef", "rank", "recommended", "score"].sort()
  );
});

const storage = createMemoryStorage();
lifecycle.storeSnapshot(storage, snapshot);
assert.strictEqual(lifecycle.getSnapshot(storage, snapshot.snapshotId).selectedPlan.name, snapshot.selectedPlan.name);

const deleteStorage = createMemoryStorage();
lifecycle.storeSnapshot(deleteStorage, snapshot);
lifecycle.storeSnapshotWorkspace(deleteStorage, snapshot.snapshotId, { sourceSnapshotId: snapshot.snapshotId });
assert.strictEqual(lifecycle.deleteSnapshot(deleteStorage, "missing-snapshot"), false);
assert.strictEqual(lifecycle.deleteSnapshot(deleteStorage, snapshot.snapshotId), true);
assert.strictEqual(lifecycle.getSnapshot(deleteStorage, snapshot.snapshotId), null);
assert.strictEqual(lifecycle.loadSnapshotWorkspace(deleteStorage, snapshot.snapshotId), null);

assert.deepStrictEqual(lifecycle.parseRoute("/plans/plan-123"), { name: "plan-detail", planId: "plan-123" });
assert.deepStrictEqual(lifecycle.parseRoute("/saved-plans"), { name: "saved-plans" });
assert.deepStrictEqual(
  lifecycle.parseRoute("/saved-plans/44444444-4444-4444-8444-444444444444"),
  { name: "saved-plan-detail", snapshotId: "44444444-4444-4444-8444-444444444444" }
);
assert.deepStrictEqual(lifecycle.parseRoute("/executions"), { name: "executions" });
assert.deepStrictEqual(
  lifecycle.parseRoute("/executions/exec_123"),
  { name: "execution-detail", executionId: "exec_123" }
);
assert.deepStrictEqual(lifecycle.parseRoute("/collaboration"), { name: "collaboration" });
assert.deepStrictEqual(
  lifecycle.parseRoute("/collaboration/share_123"),
  { name: "collaboration-detail", shareId: "share_123" }
);
assert.deepStrictEqual(
  lifecycle.parseRoute("/share/share_123"),
  { name: "share-detail", shareId: "share_123" }
);

assert.strictEqual(lifecycle.getReopenBehavior("success"), "readonly_execution_snapshot");
assert.strictEqual(lifecycle.getReopenBehavior("pending"), "refresh_latest_mock_state");
assert.strictEqual(lifecycle.getReopenBehavior("failed_recoverable"), "refresh_and_offer_alternative");
assert.strictEqual(lifecycle.getReopenBehavior("cancelled"), "allow_replan");
assert.strictEqual(lifecycle.getReopenBehavior("skipped"), "preserve_and_allow_manual_refresh");

const workspace = {
  context: {
    requestId: context.requestId,
    sessionId: context.sessionId,
    lineageId: context.lineageId,
    version: 1,
  },
  selectedPlanId,
  selectedPayload: lifecycle.clone(snapshot.selectedPlan),
  candidateSummaries: lifecycle.clone(snapshot.candidateSummaries),
  result: lifecycle.clone(result),
  dirty: false,
  undoWorkspace: null,
  lastChange: null,
};

assert.strictEqual(lifecycle.savePlanWorkspace(storage, workspace), true);
const savedVersionWorkspace = lifecycle.clone(workspace);
savedVersionWorkspace.selectedPlanId = "another-plan";
savedVersionWorkspace.sourceSnapshotId = snapshot.snapshotId;
lifecycle.saveWorkspace(storage, savedVersionWorkspace);
assert.strictEqual(lifecycle.loadPlanWorkspace(storage, selectedPlanId).selectedPlanId, selectedPlanId);

const lockedSwitcher = candidateRuntime.create(workspace.result, {
  key: selectedPlanId + ":activity",
  planId: selectedPlanId,
  blockType: "activity",
});
const lockedOutcome = candidateRuntime.commit(
  workspace.result,
  candidateRuntime.move(lockedSwitcher, "next"),
  1
);
const lockedPayload = adapter.adaptAgentCoreResult(lockedOutcome.result, createContext(2));
const lockedSelected = lifecycle.collectSelectedPayload(lockedPayload, selectedPlanId);
assert.strictEqual(
  lifecycle.commitPayloadReplan(
    workspace,
    lockedOutcome.result,
    lockedSelected,
    { type: "activity" },
    "调整活动"
  ).error,
  "locked_success_block"
);

const unlockedWorkspace = lifecycle.clone(workspace);
unlockedWorkspace.selectedPayload.lockedRefs = [];
const restaurantSwitcher = candidateRuntime.create(unlockedWorkspace.result, {
  key: selectedPlanId + ":restaurant",
  planId: selectedPlanId,
  blockType: "restaurant",
});
const restaurantOutcome = candidateRuntime.commit(
  unlockedWorkspace.result,
  candidateRuntime.move(restaurantSwitcher, "next"),
  1
);
const nextPayload = adapter.adaptAgentCoreResult(restaurantOutcome.result, createContext(2));
const nextSelected = lifecycle.collectSelectedPayload(nextPayload, selectedPlanId);
const beforeActivityRef = unlockedWorkspace.selectedPayload.cards.find((card) => card.type === "activity").entityRef;
const beforeRestaurantRef = unlockedWorkspace.selectedPayload.cards.find((card) => card.type === "restaurant").entityRef;
const committed = lifecycle.commitPayloadReplan(
  unlockedWorkspace,
  restaurantOutcome.result,
  nextSelected,
  { type: "restaurant" },
  "调整餐厅"
);
assert.strictEqual(committed.ok, true);
assert.strictEqual(committed.workspace.context.version, 2);
assert.strictEqual(committed.workspace.dirty, true);
assert.deepStrictEqual(
  committed.workspace.selectedPayload.cards.find((card) => card.type === "activity").entityRef,
  beforeActivityRef,
  "unaffected activity ref must remain stable"
);
assert.deepStrictEqual(
  committed.workspace.selectedPayload.cards.find((card) => card.type === "restaurant").entityRef,
  beforeRestaurantRef,
  "affected entity keeps its stable identity"
);
assert.notStrictEqual(
  committed.workspace.result.plans.find((plan) => plan.id === selectedPlanId).restaurant.name,
  unlockedWorkspace.result.plans.find((plan) => plan.id === selectedPlanId).restaurant.name
);

const undone = lifecycle.undoLatest(committed.workspace);
assert.strictEqual(undone.ok, true);
assert.deepStrictEqual(undone.workspace.result, unlockedWorkspace.result);

const shifted = lifecycle.commitTimelineShift(unlockedWorkspace, 2, 15);
assert.strictEqual(shifted.ok, true);
assert.strictEqual(shifted.workspace.context.version, 2);
assert.strictEqual(shifted.workspace.dirty, true);
assert.notStrictEqual(
  shifted.workspace.result.plans.find((plan) => plan.id === selectedPlanId).timeline[2].time,
  unlockedWorkspace.result.plans.find((plan) => plan.id === selectedPlanId).timeline[2].time
);

console.log("All saved plan lifecycle tests passed.");
