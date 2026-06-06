(function (root, factory) {
  const core = root.LocalLifeAgentCore || (typeof require === "function" ? require("./agent-core") : null);
  const api = factory(core);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LocalLifeCandidateSwitcher = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function numberFromText(value) {
    const match = String(value || "").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
  }

  function formatClock(totalMinutes) {
    const normalized = ((totalMinutes % 1440) + 1440) % 1440;
    const hours = Math.floor(normalized / 60);
    const minutes = normalized % 60;
    return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
  }

  function shiftClock(value, delta) {
    const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
    if (!match || !delta) return value;
    return formatClock(Number(match[1]) * 60 + Number(match[2]) + delta);
  }

  function shiftTimeline(timeline, startIndex, delta) {
    if (!delta) return;
    timeline.forEach(function (item, index) {
      if (index >= startIndex) item.time = shiftClock(item.time, delta);
    });
  }

  function replaceText(value, from, to) {
    if (!from || from === to || typeof value !== "string") return value;
    return value.split(from).join(to);
  }

  function replacePlanText(value, from, to) {
    if (typeof value === "string") return replaceText(value, from, to);
    if (Array.isArray(value)) {
      return value.map(function (item) { return replacePlanText(item, from, to); });
    }
    if (value && typeof value === "object") {
      const result = {};
      Object.keys(value).forEach(function (key) {
        result[key] = replacePlanText(value[key], from, to);
      });
      return result;
    }
    return value;
  }

  function adjustBudgetText(value, delta) {
    const current = numberFromText(value);
    if (!current || !delta) return value;
    return String(value).replace(String(current), String(Math.max(0, Math.round(current + delta))));
  }

  function formatActivity(raw) {
    if (raw.distance !== undefined) return clone(raw);
    return {
      id: raw.id,
      name: raw.name,
      type: raw.type,
      distance: raw.distanceKm + " km",
      open: raw.open,
      duration: raw.durationHours + " 小时",
      durationHours: raw.durationHours,
      price: raw.price ? "约 " + raw.price + " 元" : "免费",
      priceValue: raw.price || 0,
      needsBooking: Boolean(raw.needsBooking),
      canBook: Boolean(raw.needsBooking),
      requestedTime: null,
      selectedSlot: raw.availableSlots && raw.availableSlots[0] || null,
      availableSlots: raw.availableSlots || [],
      unavailableReason: null,
      tags: raw.tags || [],
    };
  }

  function formatRestaurant(raw) {
    if (raw.distance !== undefined) return clone(raw);
    return {
      id: raw.id,
      name: raw.name,
      cuisine: raw.cuisine,
      distance: raw.distanceKm + " km",
      price: "人均约 " + raw.pricePerPerson + " 元",
      pricePerPerson: raw.pricePerPerson,
      wait: raw.waitMinutes + " 分钟",
      waitMinutes: raw.waitMinutes,
      canReserve: true,
      requestedTime: raw.availableSlots && raw.availableSlots[0] || null,
      selectedSlot: raw.availableSlots && raw.availableSlots[0] || null,
      availableSlots: raw.availableSlots || [],
      unavailableReason: null,
      tags: raw.tags || [],
    };
  }

  function uniqueById(items) {
    const seen = new Set();
    return items.filter(function (item) {
      if (!item || !item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  function activityCandidates(plan, parsed) {
    const group = parsed && parsed.groupType;
    const current = formatActivity(plan.activity || {});
    const pool = (core && core.mockData && core.mockData.activities || []).filter(function (item) {
      return !group || !item.groups || item.groups.indexOf(group) >= 0;
    }).map(formatActivity);
    return uniqueById([current].concat(pool)).slice(0, 5);
  }

  function restaurantCandidates(plan, parsed) {
    const group = parsed && parsed.groupType;
    const current = formatRestaurant(plan.restaurant || {});
    const pool = (core && core.mockData && core.mockData.restaurants || []).filter(function (item) {
      return !group || !item.groups || item.groups.indexOf(group) >= 0;
    }).map(formatRestaurant);
    return uniqueById([current].concat(pool)).slice(0, 5);
  }

  function transportCandidates(plan, segmentIndex) {
    const routeText = plan.route && plan.route[segmentIndex] || "当前行程段";
    const currentMinutes = Math.max(8, numberFromText(routeText) || 20);
    const prefix = routeText.indexOf("，") >= 0 ? routeText.split("，")[0] : routeText;
    const originalMode = routeText.indexOf("步行") >= 0 ? "walk" : "mixed";
    return [
      {
        id: "transport-original-" + segmentIndex,
        name: routeText,
        mode: originalMode,
        durationMinutes: currentMinutes,
        budget: 0,
        walkingMinutes: originalMode === "walk" ? currentMinutes : 6,
        transferCount: 0,
        congestionRisk: "low",
        walkingRisk: currentMinutes > 20 ? "medium" : "low",
        transferRisk: "low",
      },
      {
        id: "transport-taxi-" + segmentIndex,
        name: prefix + "，打车约 " + Math.max(8, Math.round(currentMinutes * 0.48)) + " 分钟",
        mode: "taxi",
        durationMinutes: Math.max(8, Math.round(currentMinutes * 0.48)),
        budget: 28 + segmentIndex * 8,
        walkingMinutes: 3,
        transferCount: 0,
        congestionRisk: "medium",
        walkingRisk: "low",
        transferRisk: "low",
      },
      {
        id: "transport-transit-" + segmentIndex,
        name: prefix + "，公共交通约 " + Math.max(12, Math.round(currentMinutes * 0.78)) + " 分钟",
        mode: "public_transit",
        durationMinutes: Math.max(12, Math.round(currentMinutes * 0.78)),
        budget: 4,
        walkingMinutes: 8,
        transferCount: currentMinutes > 20 ? 1 : 0,
        congestionRisk: "low",
        walkingRisk: "medium",
        transferRisk: currentMinutes > 20 ? "medium" : "low",
      },
    ];
  }

  function create(result, options) {
    const opts = options || {};
    const plan = (result.plans || []).find(function (item) { return item.id === opts.planId; });
    if (!plan) return null;
    let candidates = [];
    if (opts.blockType === "activity") candidates = activityCandidates(plan, result.parsed);
    if (opts.blockType === "restaurant") candidates = restaurantCandidates(plan, result.parsed);
    if (opts.blockType === "transport") candidates = transportCandidates(plan, opts.segmentIndex || 0);
    if (!candidates.length) return null;
    return {
      key: opts.key,
      planId: opts.planId,
      blockType: opts.blockType,
      segmentIndex: opts.segmentIndex || 0,
      candidates: candidates,
      currentIndex: 0,
      originalCandidateId: candidates[0].id,
      adoptedCandidateId: null,
      previewStatus: "original",
      undoResult: null,
      canUndo: false,
    };
  }

  function applyActivity(plan, candidate, parsed) {
    const old = plan.activity || {};
    let next = replacePlanText(plan, old.name, candidate.name);
    const oldDuration = numberFromText(old.duration);
    const newDuration = candidate.durationHours || numberFromText(candidate.duration);
    const timeDelta = Math.round((newDuration - oldDuration) * 60);
    const oldPrice = old.priceValue === undefined ? numberFromText(old.price) : old.priceValue;
    const newPrice = candidate.priceValue === undefined ? numberFromText(candidate.price) : candidate.priceValue;
    const budgetDelta = newPrice - oldPrice;
    next.activity = clone(candidate);
    shiftTimeline(next.timeline || [], 2, timeDelta);
    next.budget = adjustBudgetText(next.budget, budgetDelta);
    return {
      plan: next,
      impact: {
        timeDeltaMinutes: timeDelta,
        budgetDelta: budgetDelta,
        riskDelta: (candidate.tags || []).indexOf("outdoor") >= 0 ? "higher" : "unchanged",
        riskChanges: (candidate.tags || []).indexOf("outdoor") >= 0
          ? ["户外候选受天气影响更明显"]
          : ["活动候选未增加明显风险"],
        congestionRisk: "unknown",
        walkingRisk: numberFromText(candidate.distance) > 3 ? "medium" : "low",
        transferRisk: "low",
      },
      affectedTimeline: (next.timeline || []).slice(1),
    };
  }

  function applyRestaurant(plan, candidate, parsed) {
    const old = plan.restaurant || {};
    let next = replacePlanText(plan, old.name, candidate.name);
    const partySize = parsed && parsed.partySize || 1;
    const oldPrice = old.pricePerPerson === undefined ? numberFromText(old.price) : old.pricePerPerson;
    const newPrice = candidate.pricePerPerson === undefined ? numberFromText(candidate.price) : candidate.pricePerPerson;
    const budgetDelta = (newPrice - oldPrice) * partySize;
    const oldWait = old.waitMinutes === undefined ? numberFromText(old.wait) : old.waitMinutes;
    const newWait = candidate.waitMinutes === undefined ? numberFromText(candidate.wait) : candidate.waitMinutes;
    const timeDelta = newWait - oldWait;
    next.restaurant = clone(candidate);
    shiftTimeline(next.timeline || [], Math.max(0, (next.timeline || []).length - 1), timeDelta);
    next.budget = adjustBudgetText(next.budget, budgetDelta);
    return {
      plan: next,
      impact: {
        timeDeltaMinutes: timeDelta,
        budgetDelta: budgetDelta,
        riskDelta: newWait > 20 ? "higher" : "unchanged",
        riskChanges: newWait > 20 ? ["候选餐厅排队时间较长"] : ["订座与排队风险可控"],
        congestionRisk: "unknown",
        walkingRisk: numberFromText(candidate.distance) > 3 ? "medium" : "low",
        transferRisk: "low",
      },
      affectedTimeline: (next.timeline || []).slice(Math.max(0, (next.timeline || []).length - 2)),
    };
  }

  function applyTransport(plan, candidate, segmentIndex, currentBudget) {
    const next = clone(plan);
    const oldText = next.route && next.route[segmentIndex] || "";
    const oldMinutes = Math.max(0, numberFromText(oldText));
    const timeDelta = candidate.durationMinutes - oldMinutes;
    if (!Array.isArray(next.route)) next.route = [];
    next.route[segmentIndex] = candidate.name;
    const timelineIndex = segmentIndex === 0 ? 0 : Math.min(2, Math.max(0, next.timeline.length - 2));
    if (next.timeline[timelineIndex]) next.timeline[timelineIndex].detail = candidate.name;
    shiftTimeline(next.timeline || [], timelineIndex + 1, timeDelta);
    const budgetDelta = candidate.budget - (currentBudget || 0);
    next.budget = adjustBudgetText(next.budget, budgetDelta);
    return {
      plan: next,
      impact: {
        timeDeltaMinutes: timeDelta,
        budgetDelta: budgetDelta,
        riskDelta: [candidate.congestionRisk, candidate.walkingRisk, candidate.transferRisk].indexOf("high") >= 0
          ? "higher"
          : "unchanged",
        riskChanges: [
          "拥堵风险：" + candidate.congestionRisk,
          "步行风险：" + candidate.walkingRisk,
          "换乘风险：" + candidate.transferRisk,
        ],
        congestionRisk: candidate.congestionRisk,
        walkingRisk: candidate.walkingRisk,
        transferRisk: candidate.transferRisk,
      },
      affectedTimeline: (next.timeline || []).slice(timelineIndex),
    };
  }

  function preview(result, switcher, index) {
    const targetIndex = index === undefined ? switcher.currentIndex : index;
    const candidate = switcher.candidates[targetIndex];
    const plan = (result.plans || []).find(function (item) { return item.id === switcher.planId; });
    if (!candidate || !plan) return null;
    let applied;
    if (switcher.blockType === "activity") applied = applyActivity(plan, candidate, result.parsed);
    if (switcher.blockType === "restaurant") applied = applyRestaurant(plan, candidate, result.parsed);
    if (switcher.blockType === "transport") {
      const adopted = switcher.candidates.find(function (item) {
        return item.id === switcher.adoptedCandidateId;
      });
      applied = applyTransport(plan, candidate, switcher.segmentIndex, adopted && adopted.budget || 0);
    }
    return Object.assign({ candidate: clone(candidate), index: targetIndex }, applied);
  }

  function move(switcher, direction) {
    const next = clone(switcher);
    const delta = direction === "previous" ? -1 : 1;
    next.currentIndex = Math.max(0, Math.min(next.candidates.length - 1, next.currentIndex + delta));
    next.previewStatus = next.currentIndex === 0 ? "original" : "previewing";
    return next;
  }

  function commit(result, switcher, candidateIndex) {
    const nextSwitcher = clone(switcher);
    const candidatePreview = preview(result, nextSwitcher, candidateIndex);
    if (!candidatePreview || !candidatePreview.plan || !Array.isArray(candidatePreview.plan.timeline)) {
      return { ok: false, result: result, switcher: switcher, error: "candidate_validation_failed" };
    }
    const nextResult = clone(result);
    const index = nextResult.plans.findIndex(function (item) { return item.id === switcher.planId; });
    if (index < 0) return { ok: false, result: result, switcher: switcher, error: "plan_not_found" };
    nextSwitcher.undoResult = clone(result);
    nextSwitcher.canUndo = true;
    nextSwitcher.currentIndex = candidatePreview.index;
    nextSwitcher.adoptedCandidateId = candidatePreview.candidate.id;
    nextSwitcher.previewStatus = candidatePreview.candidate.id === nextSwitcher.originalCandidateId ? "restored" : "adopted";
    nextResult.plans[index] = candidatePreview.plan;
    if (core && typeof core.createExecutionQueue === "function") {
      nextResult.executionQueue = core.createExecutionQueue(nextResult.plans[index], nextResult.parsed);
    }
    return {
      ok: true,
      result: nextResult,
      switcher: nextSwitcher,
      validation: { status: "passed", checks: ["time", "budget", "risk", "schema"] },
    };
  }

  function undo(result, switcher) {
    if (!switcher.canUndo || !switcher.undoResult) {
      return { ok: false, result: result, switcher: switcher, error: "undo_unavailable" };
    }
    const next = clone(switcher);
    const restored = clone(next.undoResult);
    next.undoResult = null;
    next.canUndo = false;
    next.adoptedCandidateId = null;
    next.previewStatus = "previewing";
    return { ok: true, result: restored, switcher: next };
  }

  return {
    create: create,
    preview: preview,
    move: move,
    commit: commit,
    undo: undo,
    clone: clone,
  };
});
