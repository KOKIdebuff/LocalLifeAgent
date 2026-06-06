const assert = require("assert");
const core = require("./agent-core");
const runtime = require("./candidate-switcher");

const result = core.planRequest(
  "周六下午想和老婆孩子出去玩 4 小时，孩子 5 岁，别离家太远，老婆最近在减肥。",
  { groupType: "familyKids", timePreset: "周末下午" }
);
const originalJson = JSON.stringify(result);
const planId = result.plans[0].id;

const activity = runtime.create(result, {
  key: planId + ":activity",
  planId,
  blockType: "activity",
});
assert.ok(activity.candidates.length >= 2, "activity should have stable alternatives");
const activityNext = runtime.move(activity, "next");
const activityPreview = runtime.preview(result, activityNext);
assert.strictEqual(JSON.stringify(result), originalJson, "preview must not mutate Main");
assert.notStrictEqual(activityPreview.candidate.id, activity.originalCandidateId);
assert.ok(Array.isArray(activityPreview.affectedTimeline));

const activityPrevious = runtime.move(activityNext, "previous");
assert.strictEqual(
  activityPrevious.candidates[activityPrevious.currentIndex].id,
  activity.originalCandidateId,
  "previous must restore the exact original candidate"
);

const activityAdoption = runtime.commit(result, activityNext, activityNext.currentIndex);
assert.ok(activityAdoption.ok);
assert.notStrictEqual(
  activityAdoption.result.plans[0].activity.id,
  result.plans[0].activity.id,
  "adoption should update Main"
);
assert.strictEqual(JSON.stringify(result), originalJson, "adoption must not mutate its input snapshot");
assert.ok(activityAdoption.switcher.canUndo);

const activityUndo = runtime.undo(activityAdoption.result, activityAdoption.switcher);
assert.ok(activityUndo.ok);
assert.strictEqual(
  activityUndo.result.plans[0].activity.id,
  result.plans[0].activity.id,
  "one-step undo should restore the prior Main"
);

const transport = runtime.create(result, {
  key: planId + ":transport:0",
  planId,
  blockType: "transport",
  segmentIndex: 0,
});
assert.strictEqual(transport.candidates.length, 3);
const transportNext = runtime.move(transport, "next");
const transportPreview = runtime.preview(result, transportNext);
assert.strictEqual(JSON.stringify(result), originalJson, "transport preview must not mutate Main");
assert.ok(transportPreview.impact.timeDeltaMinutes !== 0);
assert.ok(transportPreview.impact.budgetDelta >= 0);
assert.ok(transportPreview.impact.congestionRisk);
assert.ok(transportPreview.affectedTimeline.length > 0);

const transportAdoption = runtime.commit(result, transportNext, transportNext.currentIndex);
assert.ok(transportAdoption.ok);
assert.notStrictEqual(transportAdoption.result.plans[0].route[0], result.plans[0].route[0]);
assert.strictEqual(
  transportAdoption.result.plans[0].route[1],
  result.plans[0].route[1],
  "transport adoption must only update the bound route segment"
);

const transportTransit = runtime.move(transportAdoption.switcher, "next");
const transitPreview = runtime.preview(transportAdoption.result, transportTransit);
assert.strictEqual(
  transitPreview.impact.budgetDelta,
  transportTransit.candidates[2].budget - transportTransit.candidates[1].budget,
  "transport budget must be relative to the currently adopted candidate"
);
const transportRestore = runtime.commit(transportAdoption.result, transportAdoption.switcher, 0);
assert.strictEqual(
  transportRestore.result.plans[0].budget,
  result.plans[0].budget,
  "restoring original transport must remove the adopted transport cost"
);

console.log("All candidate switcher runtime tests passed.");
