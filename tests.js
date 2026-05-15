const assert = require("assert");
const core = require("./agent-core");

function timeToMinutes(time) {
  const parts = String(time).split(":").map(Number);
  return parts[0] * 60 + parts[1];
}

function assertAvailabilityCallsRespectRequest(result) {
  result.toolCalls
    .filter((call) => call.name === "check_availability" && call.output.available)
    .forEach((call) => {
      assert.ok(call.output.selected_slot, "available result should include selected_slot");
      assert.ok(
        timeToMinutes(call.output.selected_slot) >= timeToMinutes(call.input.time),
        `selected_slot ${call.output.selected_slot} should not be earlier than requested ${call.input.time}`
      );
    });
}

function assertExecutionQueueMatchesPlan(result) {
  const plan = result.plans.find((item) => item.id === result.recommendedPlanId) || result.plans[0];
  const reserveAction = result.executionQueue.find((action) => action.type === "reserve_table");
  if (plan.restaurant.canReserve) {
    assert.ok(reserveAction, "reservable restaurant should create reserve_table action");
    assert.strictEqual(reserveAction.time, plan.restaurant.selectedSlot);
    assert.strictEqual(reserveAction.selectedSlot, plan.restaurant.selectedSlot);
  } else {
    assert.ok(!reserveAction, "unreservable restaurant should not create reserve_table action");
  }

  const activityAction = result.executionQueue.find((action) => action.type === "book_ticket" || action.type === "book_activity");
  if (plan.activity.needsBooking && plan.activity.canBook) {
    assert.ok(activityAction, "bookable activity should create ticket booking action");
    assert.strictEqual(activityAction.time, plan.activity.selectedSlot);
    assert.strictEqual(activityAction.selectedSlot, plan.activity.selectedSlot);
  }
}

function getTraceStage(result, id) {
  assert.ok(result.agentLoopTrace, "result should include agentLoopTrace");
  assert.strictEqual(result.agentLoopTrace.mode, "single_orchestrator_with_mock_research_lanes");
  const ids = result.agentLoopTrace.stages.map((stage) => stage.id);
  assert.deepStrictEqual(ids, ["understand", "planner", "researchers", "merger", "verifier", "revise", "reflect"]);
  return result.agentLoopTrace.stages.find((stage) => stage.id === id);
}

function assertFindingKeys(stage, expectedKeys) {
  const keys = stage.findings.map((finding) => finding.key);
  expectedKeys.forEach((key) => {
    assert.ok(keys.includes(key), `${stage.id} should include ${key} finding`);
  });
}

const cases = [
  {
    name: "friends",
    input: "下午和 4 个朋友出去玩，2 男 2 女，不想太累，晚上一起吃饭。",
    expectedGroup: "friends",
  },
  {
    name: "family kids",
    input: "今天下午想和老婆孩子出去玩 4 小时，孩子 5 岁，别太远，老婆最近在减肥。",
    expectedGroup: "familyKids",
  },
  {
    name: "family elders",
    input: "周日下午想带爸妈出去走走，别太累，最好能吃顿舒服的饭。",
    expectedGroup: "familyElders",
  },
  {
    name: "couple",
    input: "今天晚上想和女朋友出去约会，预算中等，想有点仪式感。",
    expectedGroup: "couple",
  },
  {
    name: "solo",
    input: "今天下午自己一个人附近逛逛，别太贵，不要太远。",
    expectedGroup: "solo",
  },
  {
    name: "coworkers",
    input: "今天下班后和同事吃饭聊天，不想太贵，最好别太远。",
    expectedGroup: "coworkers",
  },
];

const llmOverride = core.planRequest("周末想慢慢玩，不想赶。", {
  intentSource: "llm",
  intentConfidence: 0.91,
  intentReasoningSummary: "LLM 识别为情侣周末轻松活动。",
  groupType: "couple",
  timePreset: "周末下午",
  partySize: 2,
  preferences: ["relaxed", "photo", "meal"],
  budgetPerPerson: 150,
  lessonsUsed: [
    {
      id: 1,
      lesson: "用户偏好慢节奏，不喜欢打卡式高密度安排。",
      avoidance: "每日核心活动控制在 1-2 个。",
    },
  ],
});
assert.strictEqual(llmOverride.needsClarification, false, "LLM override should provide required fields");
assert.strictEqual(llmOverride.parsed.groupType, "couple", "LLM group override should win");
assert.strictEqual(llmOverride.parsed.partySize, 2, "LLM party size should apply");
assert.strictEqual(llmOverride.parsed.intentSource, "llm", "parsed result should expose LLM source");
assert.ok(llmOverride.parsed.preferenceLabels.some((label) => label.includes("节奏轻松")), "LLM preferences should merge");
assert.ok(getTraceStage(llmOverride, "understand").findings.some((finding) => finding.key === "memory"), "trace should show memory usage");

const llmMissing = core.planRequest("帮我安排一下。", {
  intentSource: "llm",
  intentConfidence: 0.88,
  missingFields: ["groupType"],
  timePreset: "今天下午",
});
assert.strictEqual(llmMissing.needsClarification, true, "LLM missing fields should keep clarification");
assert.strictEqual(llmMissing.clarification.key, "groupType", "missing group should ask group clarification");

cases.forEach((item) => {
  const result = core.planRequest(item.input);
  assert.strictEqual(result.needsClarification, false, item.name + " should not need clarification");
  assert.strictEqual(result.parsed.groupType, item.expectedGroup, item.name + " group mismatch");
  assert.ok(result.plans.length >= 2, item.name + " should return multiple plans");
  assert.ok(result.toolCalls.length >= 5, item.name + " should call mock tools");
  assert.ok(result.executionQueue.length >= 2, item.name + " should create execution queue");
  assert.ok(result.executionQueue.some((action) => action.requiresConfirmation), item.name + " should require confirmation");
  assertAvailabilityCallsRespectRequest(result);
  assertExecutionQueueMatchesPlan(result);
});

const familyMain = core.planRequest("今天下午想和老婆孩子出去玩 4 小时，孩子 5 岁，别太远，老婆最近在减肥。");
assert.ok(
  new Set(familyMain.plans.map((plan) => plan.score)).size > 1,
  "family plans should not all share the same score"
);
familyMain.plans.forEach((plan) => {
  assert.ok(plan.scoreDetails.length >= 5, "plan should expose score dimensions");
  assert.ok(plan.scoreDetails.some((item) => item.key === "distance"), "score details should include distance");
  assert.ok(plan.scoreDetails.some((item) => item.key === "reservation"), "score details should include reservation stability");
  assert.ok(plan.recommendationReasons.length >= 3, "plan should expose concise recommendation reasons");
  assert.ok(plan.servicePackage, "plan should expose a Meituan service package");
  assert.ok(plan.servicePackage.itineraryItems.length >= 4, "service package should include itinerary items");
  assert.ok(plan.servicePackage.meituanActions.some((action) => action.type === "buy_deal"), "service package should include deal purchase action");
  assert.ok(plan.servicePackage.businessMetrics.waitSavedMinutes >= 0, "service package should expose wait-saving metrics");
  assert.ok(plan.servicePackage.replanEvents.length >= 4, "service package should expose replan events");
});

assert.ok(
  familyMain.plans[0].servicePackage.offPeakStrategy.isOffPeak,
  "recommended family plan should use off-peak dining strategy"
);
assert.ok(
  familyMain.plans[0].servicePackage.businessMetrics.couponSavings > 0,
  "service package should show coupon savings"
);
assert.strictEqual(getTraceStage(familyMain, "planner").status, "done");
assert.strictEqual(getTraceStage(familyMain, "researchers").status, "done");
assert.strictEqual(getTraceStage(familyMain, "merger").status, "done");
assert.strictEqual(getTraceStage(familyMain, "verifier").status, "done");
assert.strictEqual(getTraceStage(familyMain, "revise").status, "ready");
assertFindingKeys(getTraceStage(familyMain, "researchers"), ["weather_route", "activities", "restaurants", "availability"]);
assertFindingKeys(getTraceStage(familyMain, "verifier"), ["time", "distance", "budget", "reservation", "confirmation"]);
const researcherLanes = getTraceStage(familyMain, "researchers").lanes;
assert.ok(Array.isArray(researcherLanes), "researchers stage should expose lanes");
["weather_route", "activity_ticketing", "restaurant_booking", "deals_addons", "notification"].forEach((laneId) => {
  const lane = researcherLanes.find((lane) => lane.id === laneId);
  assert.ok(lane, `researchers lanes should include ${laneId}`);
  assert.strictEqual(typeof lane.mockLatencyMs, "number", `${laneId} should expose mock latency`);
  assert.ok(lane.resultSummary, `${laneId} should expose result summary`);
});
assert.ok(
  familyMain.executionQueue.some((action) => action.type === "send_message" && action.shareCard),
  "non-solo execution queue should include a share card"
);

const manualActivityPlan = familyMain.plans.find((plan) => plan.activity.needsBooking && !plan.activity.canBook);
assert.ok(manualActivityPlan, "family scenario should include an activity needing manual confirmation");
const manualActivityExecuted = core.executeActionQueue(core.createExecutionQueue(manualActivityPlan, familyMain.parsed));
assert.ok(
  manualActivityExecuted.some((action) => action.type === "manual_activity_check" && action.status === "skipped"),
  "manual activity checks should be skipped instead of faking success"
);

const missingGroup = core.planRequest("今天下午有空，帮我安排一下。");
assert.strictEqual(missingGroup.needsClarification, true);
assert.strictEqual(missingGroup.clarification.key, "groupType");
assert.strictEqual(missingGroup.plans.length, 0);
assert.strictEqual(getTraceStage(missingGroup, "planner").status, "active");
assert.strictEqual(getTraceStage(missingGroup, "researchers").status, "pending");
assert.strictEqual(getTraceStage(missingGroup, "researchers").findings.length, 0);
assert.strictEqual(getTraceStage(missingGroup, "merger").status, "pending");
assert.strictEqual(getTraceStage(missingGroup, "verifier").status, "pending");
assert.strictEqual(getTraceStage(missingGroup, "revise").status, "pending");

const answeredGroup = core.planRequest("今天下午有空，帮我安排一下。", { groupType: "friends" });
assert.strictEqual(answeredGroup.needsClarification, false);
assert.strictEqual(answeredGroup.parsed.groupType, "friends");
assert.ok(answeredGroup.plans.length >= 2);

const conflict = core.planRequest("下午 2 点出发，只能玩 1 小时，还想去很远的地方吃饭。", { groupType: "friends" });
assert.strictEqual(conflict.needsClarification, false);
assert.ok(conflict.parsed.warnings.length > 0, "conflict should produce warning");
assert.ok(/近距离|替代/.test(conflict.plans[0].name), "conflict should use near fallback plan");

const friends = core.planRequest("下午和 4 个朋友出去玩，2 男 2 女，不想太累，晚上一起吃饭。");
assertAvailabilityCallsRespectRequest(friends);
assert.ok(
  friends.plans[0].issueNotices.some((notice) => /餐厅已替换/.test(notice.title)),
  "friends recommended plan should foreground no-seat replacement"
);
assert.ok(
  friends.executionQueue.some((action) => action.type === "join_queue"),
  "friends scenario should include queue action"
);
assert.ok(
  friends.executionQueue.some((action) => action.type === "buy_deal"),
  "friends scenario should include group-buying action"
);
const availabilityCalls = friends.toolCalls.filter((call) => call.name === "check_availability");
assert.ok(
  availabilityCalls.some((call) => call.output.available === false),
  "friends scenario should simulate a no-seat restaurant"
);
assert.ok(
  friends.plans.some((plan) => plan.risks.some((risk) => /已替换|无座/.test(risk))),
  "friends scenario should explain restaurant replacement"
);

const executed = core.executeActionQueue(friends.executionQueue);
assert.ok(executed.every((action) => action.status === "success"), "all mock actions should succeed");
assert.ok(
  executed.some((action) => action.type === "buy_deal" && /团购券/.test(action.result)),
  "deal purchase should produce a simulated voucher result"
);
assert.ok(
  executed.some((action) => action.type === "join_queue" && /排队号/.test(action.result)),
  "queue action should produce a simulated queue token"
);

const couple = core.planRequest("今天晚上想和女朋友出去约会，预算中等，想有点仪式感。");
assertAvailabilityCallsRespectRequest(couple);
assert.ok(
  couple.toolCalls
    .filter((call) => call.name === "check_availability" && call.output.available)
    .every((call) => timeToMinutes(call.output.selected_slot) >= timeToMinutes(call.input.time)),
  "couple scenario should never return a slot earlier than requested time"
);
assertExecutionQueueMatchesPlan(couple);

const rainy = core.planRequest("今天下午下雨，想和朋友出去玩，不想户外，晚上吃饭。");
const weatherCall = rainy.toolCalls.find((call) => call.name === "get_weather");
assert.strictEqual(weatherCall.output.outdoor_ok, false, "rainy input should mark outdoor as unsuitable");
assert.ok(
  rainy.plans[0].activity.tags.includes("室内"),
  "rainy input should prefer an indoor recommended activity"
);
assert.ok(
  rainy.plans.some((plan) => plan.issueNotices.some((notice) => /天气风险/.test(notice.title))),
  "rainy input should expose weather risk for outdoor options"
);

const rainReplan = core.planRequest("周六下午想和老婆孩子出去玩 4 小时，孩子 5 岁，别离家太远，老婆最近在减肥。", { replanEvent: "rain" });
assert.strictEqual(rainReplan.parsed.replanEvent, "rain");
assert.ok(
  rainReplan.plans[0].activity.tags.includes("室内"),
  "rain replan should recommend an indoor activity"
);
assert.ok(
  rainReplan.plans[0].servicePackage.replanEvents.some((event) => event.id === "rain" && event.active),
  "rain replan event should be marked active"
);

const fullReplan = core.planRequest("下午和 4 个朋友出去玩，2 男 2 女，不想太累，晚上一起吃饭。", { replanEvent: "restaurant_full" });
assert.ok(
  fullReplan.toolCalls.some((call) => call.name === "check_availability" && /突发满座/.test(call.output.reason || "")),
  "restaurant-full replan should simulate sudden full-seat state"
);
assert.ok(
  fullReplan.plans[0].issueNotices.some((notice) => /餐厅已替换/.test(notice.title)),
  "restaurant-full replan should foreground restaurant replacement"
);
assert.strictEqual(getTraceStage(fullReplan, "revise").status, "done");
assert.ok(
  getTraceStage(fullReplan, "revise").findings.some((finding) => finding.key === "restaurant_full" && /替换/.test(finding.summary)),
  "restaurant-full replan should describe restaurant replacement in revise trace"
);

const soldOutReplan = core.planRequest("周六下午想和老婆孩子出去玩 4 小时，孩子 5 岁，别离家太远，老婆最近在减肥。", { replanEvent: "activity_sold_out" });
assert.strictEqual(soldOutReplan.parsed.replanEvent, "activity_sold_out");
assert.ok(
  soldOutReplan.toolCalls.some((call) => call.name === "check_availability" && /活动突发无票/.test(call.output.reason || "")),
  "activity-sold-out replan should simulate a sold-out activity"
);
assert.ok(
  soldOutReplan.plans[0].issueNotices.some((notice) => /活动已替换/.test(notice.title)),
  "activity-sold-out replan should foreground activity replacement"
);
assert.ok(
  getTraceStage(soldOutReplan, "revise").findings.some((finding) => finding.key === "activity_sold_out" && /替换/.test(finding.summary)),
  "activity-sold-out replan should describe replacement in revise trace"
);
assert.ok(
  soldOutReplan.executionQueue.some((action) => action.type === "replan_notice" && /->/.test(action.target)),
  "activity-sold-out replan should show replacement in execution queue"
);

const partyChanged = core.planRequest("下午和 4 个朋友出去玩，2 男 2 女，不想太累，晚上一起吃饭。", { replanEvent: "party_changed" });
assert.strictEqual(partyChanged.parsed.replanEvent, "party_changed");
assert.ok(partyChanged.parsed.partySize > friends.parsed.partySize, "party-changed replan should increase party size");
assert.ok(
  partyChanged.toolCalls.some((call) => call.name === "check_availability" && call.input.party_size === partyChanged.parsed.partySize),
  "party-changed replan should recheck availability with changed party size"
);
assert.ok(
  partyChanged.plans[0].issueNotices.some((notice) => /人数已变化/.test(notice.title)),
  "party-changed replan should foreground changed party size"
);
assert.ok(
  partyChanged.executionQueue.some((action) => action.type === "replan_notice" && /重新校验/.test(action.target)),
  "party-changed replan should show recheck notice in execution queue"
);
assert.ok(
  partyChanged.plans[0].servicePackage.businessMetrics.totalBudget >= friends.plans[0].servicePackage.businessMetrics.totalBudget,
  "party-changed replan should recalculate service package budget"
);

const tiredChild = core.planRequest("周六下午想和老婆孩子出去玩 4 小时，孩子 5 岁，别离家太远。", { replanEvent: "tired_child" });
assert.ok(
  Number(tiredChild.plans[0].activity.distance.replace(" km", "")) <= 2.5,
  "tired-child replan should lower travel burden"
);

const budgetHigh = core.planRequest("周六下午想和老婆孩子出去玩 4 小时，孩子 5 岁，别离家太远。", { replanEvent: "budget_high" });
assert.ok(
  budgetHigh.plans[0].servicePackage.businessMetrics.totalBudget <= familyMain.plans[0].servicePackage.businessMetrics.totalBudget,
  "budget-high replan should not increase total service package budget"
);

const soloBudget = core.planRequest("今天下午自己一个人附近逛逛，别太贵，不要太远。");
assert.strictEqual(soloBudget.parsed.groupType, "solo");
assert.ok(
  Number(soloBudget.plans[0].activity.distance.replace(" km", "")) <= 2.5,
  "near solo budget scenario should recommend a nearby activity"
);
assert.ok(
  soloBudget.plans[0].scoreDetails.some((item) => item.key === "budget"),
  "budget-sensitive input should expose budget score details"
);

const originalRestaurantSlots = core.mockData.restaurants.map((restaurant) => restaurant.availableSlots.slice());
try {
  core.mockData.restaurants.forEach((restaurant) => {
    restaurant.availableSlots = [];
  });
  const noRestaurantAvailability = core.planRequest("今天下午想和老婆孩子出去玩 4 小时，孩子 5 岁，别太远，老婆最近在减肥。");
  assert.ok(noRestaurantAvailability.plans.length >= 1, "should still generate a plan when restaurants are unavailable");
  assert.ok(
    !noRestaurantAvailability.executionQueue.some((action) => action.type === "reserve_table"),
    "unavailable restaurants should not create reserve_table action"
  );
  assert.ok(
    noRestaurantAvailability.plans[0].risks.some((risk) => /无可自动预约餐厅|人工确认|稍后重查/.test(risk)),
    "plan should explain missing automatic restaurant reservation"
  );
  const noRestaurantExecuted = core.executeActionQueue(noRestaurantAvailability.executionQueue);
  assert.ok(
    !noRestaurantExecuted.some((action) => action.type === "reserve_table" && action.status === "success"),
    "unavailable restaurants should not produce reserve_table success"
  );
  assert.ok(
    !noRestaurantExecuted.some((action) => /预约成功/.test(action.result || "")),
    "unavailable restaurant flow should not claim reservation success"
  );
} finally {
  core.mockData.restaurants.forEach((restaurant, index) => {
    restaurant.availableSlots = originalRestaurantSlots[index];
  });
}

const defensiveResult = core.executeActionQueue([
  {
    id: "bad-reserve",
    type: "reserve_table",
    title: "预约餐厅",
    target: "无效餐厅",
    time: "20:00",
    requiresConfirmation: true,
    status: "pending",
  },
]);
assert.strictEqual(defensiveResult[0].status, "skipped");

console.log("All agent-core tests passed.");
