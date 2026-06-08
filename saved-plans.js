(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LocalLifeSavedPlans = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STORAGE_KEY = "localLife.savedPlans.v1";
  const WORKSPACE_KEY = "localLife.planWorkspace.v1";
  const PLAN_WORKSPACES_KEY = "localLife.planWorkspaces.v1";
  const SNAPSHOT_WORKSPACES_KEY = "localLife.savedPlanWorkspaces.v1";
  const REOPEN_BEHAVIORS = Object.freeze({
    success: "readonly_execution_snapshot",
    pending: "refresh_latest_mock_state",
    failed_recoverable: "refresh_and_offer_alternative",
    cancelled: "allow_replan",
    skipped: "preserve_and_allow_manual_refresh",
  });
  const FORBIDDEN_CANDIDATE_FIELDS = Object.freeze([
    "cards",
    "entities",
    "activities",
    "restaurants",
    "timeline",
    "execution_queue",
    "transport_details",
  ]);

  function clone(value) {
    if (value === undefined) return undefined;
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function createUuid() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (char) {
      const random = Math.floor(Math.random() * 16);
      const value = char === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  function parseRoute(pathname) {
    const path = String(pathname || "/").replace(/\/+$/, "") || "/";
    let match = path.match(/^\/plans\/([^/]+)\/branches\/([^/]+)$/);
    if (match) return { name: "plan-branch-detail", planId: decodeURIComponent(match[1]), branchId: decodeURIComponent(match[2]) };
    match = path.match(/^\/plans\/([^/]+)\/branches$/);
    if (match) return { name: "plan-branches", planId: decodeURIComponent(match[1]) };
    match = path.match(/^\/plans\/([^/]+)$/);
    if (match) return { name: "plan-detail", planId: decodeURIComponent(match[1]) };
    match = path.match(/^\/saved-plans\/([^/]+)$/);
    if (match) return { name: "saved-plan-detail", snapshotId: decodeURIComponent(match[1]) };
    match = path.match(/^\/executions\/([^/]+)$/);
    if (match) return { name: "execution-detail", executionId: decodeURIComponent(match[1]) };
    match = path.match(/^\/collaboration\/([^/]+)$/);
    if (match) return { name: "collaboration-detail", shareId: decodeURIComponent(match[1]) };
    match = path.match(/^\/share\/([^/]+)$/);
    if (match) return { name: "share-detail", shareId: decodeURIComponent(match[1]) };
    if (path === "/saved-plans") return { name: "saved-plans" };
    if (path === "/executions") return { name: "executions" };
    if (path === "/collaboration") return { name: "collaboration" };
    return { name: "home" };
  }

  function safeRead(storage, key, fallback) {
    if (!storage || typeof storage.getItem !== "function") return clone(fallback);
    try {
      const value = storage.getItem(key);
      return value ? JSON.parse(value) : clone(fallback);
    } catch (error) {
      return clone(fallback);
    }
  }

  function safeWrite(storage, key, value) {
    if (!storage || typeof storage.setItem !== "function") return false;
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function saveWorkspace(storage, workspace) {
    return safeWrite(storage, WORKSPACE_KEY, workspace);
  }

  function loadWorkspace(storage) {
    return safeRead(storage, WORKSPACE_KEY, null);
  }

  function savePlanWorkspace(storage, workspace) {
    if (!workspace || !workspace.selectedPlanId) return false;
    const workspaces = safeRead(storage, PLAN_WORKSPACES_KEY, {});
    workspaces[workspace.selectedPlanId] = clone(workspace);
    return safeWrite(storage, PLAN_WORKSPACES_KEY, workspaces);
  }

  function loadPlanWorkspace(storage, planId) {
    const workspaces = safeRead(storage, PLAN_WORKSPACES_KEY, {});
    if (workspaces[planId]) return clone(workspaces[planId]);
    const legacy = loadWorkspace(storage);
    return legacy && legacy.selectedPlanId === planId && !legacy.sourceSnapshotId
      ? clone(legacy)
      : null;
  }

  function listSnapshots(storage) {
    const snapshots = safeRead(storage, STORAGE_KEY, []);
    return Array.isArray(snapshots)
      ? snapshots.sort(function (left, right) {
        return String(right.savedAt).localeCompare(String(left.savedAt));
      })
      : [];
  }

  function getSnapshot(storage, snapshotId) {
    return listSnapshots(storage).find(function (snapshot) {
      return snapshot.snapshotId === snapshotId;
    }) || null;
  }

  function storeSnapshot(storage, snapshot) {
    const snapshots = listSnapshots(storage).filter(function (item) {
      return item.snapshotId !== snapshot.snapshotId;
    });
    snapshots.push(clone(snapshot));
    safeWrite(storage, STORAGE_KEY, snapshots);
    return clone(snapshot);
  }

  function storeSnapshotWorkspace(storage, snapshotId, workspace) {
    const workspaces = safeRead(storage, SNAPSHOT_WORKSPACES_KEY, {});
    workspaces[snapshotId] = clone(workspace);
    return safeWrite(storage, SNAPSHOT_WORKSPACES_KEY, workspaces);
  }

  function loadSnapshotWorkspace(storage, snapshotId) {
    const workspaces = safeRead(storage, SNAPSHOT_WORKSPACES_KEY, {});
    return workspaces[snapshotId] ? clone(workspaces[snapshotId]) : null;
  }

  function hasPlanMeta(value, planId) {
    return Boolean(value && value.meta && value.meta.legacyPlanId === planId);
  }

  function findPlanCard(payload, planId) {
    return (payload.cards || []).find(function (card) {
      return card.type === "plan_summary" && hasPlanMeta(card, planId);
    });
  }

  function collectSelectedPayload(payload, planId) {
    const source = payload || {};
    const planCard = findPlanCard(source, planId);
    if (!planCard || !planCard.entityRef) return null;
    const planRef = clone(planCard.entityRef);
    const cards = (source.cards || []).filter(function (card) {
      return hasPlanMeta(card, planId);
    });
    const entityIds = new Set();
    cards.forEach(function (card) {
      if (card.entityRef) entityIds.add(card.entityRef.id);
      if (card.targetRef) entityIds.add(card.targetRef.id);
    });
    entityIds.add(planRef.id);

    const timelineIds = new Set();
    cards.filter(function (card) {
      return card.type === "timeline";
    }).forEach(function (card) {
      (card.meta && card.meta.timelineItemIds || []).forEach(function (id) {
        timelineIds.add(id);
      });
    });

    const actionIds = new Set();
    cards.forEach(function (card) {
      (card.actions || []).forEach(function (actionRef) {
        actionIds.add(actionRef.actionId);
      });
    });

    return {
      planRef: planRef,
      cards: clone(cards),
      entities: clone((source.entities || []).filter(function (entity) {
        return hasPlanMeta(entity, planId) || entityIds.has(entity.id);
      })),
      timeline: clone((source.timeline || []).filter(function (item) {
        return timelineIds.has(item.id);
      })),
      actions: clone((source.actions || []).filter(function (action) {
        return actionIds.has(action.id);
      })),
    };
  }

  function candidateSummaries(result, payload, selectedPlanId) {
    const planRefs = new Map();
    (payload.cards || []).forEach(function (card) {
      if (card.type === "plan_summary" && card.entityRef && card.meta) {
        planRefs.set(card.meta.legacyPlanId, card.entityRef);
      }
    });
    return (result.plans || []).filter(function (plan) {
      return plan.id !== selectedPlanId;
    }).map(function (plan, index) {
      return {
        planRef: clone(planRefs.get(plan.id)),
        name: plan.name,
        score: Number(plan.score || 0),
        recommended: Boolean(plan.recommended),
        rank: index + 1,
      };
    }).filter(function (summary) {
      return Boolean(summary.planRef);
    });
  }

  function mapStepType(action) {
    const type = action && action.type;
    if (type === "reserve_table" || type === "book_activity") return "mock_reservation";
    if (type === "send_message") return "mock_notification";
    if (type === "create_reminder") return "mock_reminder";
    if (type === "buy_deal" || type === "buy_addon") return "mock_group_buy";
    if (type === "queue_token") return "mock_queue";
    return "manual_check";
  }

  function normalizeStepStatus(status) {
    return [
      "pending",
      "running",
      "success",
      "failed_recoverable",
      "blocked",
      "skipped",
      "cancelled",
    ].indexOf(status) >= 0 ? status : "pending";
  }

  function findBlockRef(selectedPayload, action) {
    const type = action && action.type;
    let kind = null;
    if (type === "book_activity" || type === "manual_activity_check") kind = "activity";
    if (type === "reserve_table" || type === "manual_restaurant_check" || type === "buy_deal") kind = "restaurant";
    const card = (selectedPayload.cards || []).find(function (item) {
      return item.type === kind;
    });
    return card && card.entityRef ? clone(card.entityRef) : clone(selectedPayload.planRef);
  }

  function buildExecutionSummary(options, selectedPayload) {
    const actions = options.executedActions || [];
    if (!actions.length) return null;
    const context = options.context;
    const statuses = actions.map(function (action) { return normalizeStepStatus(action.status); });
    let status = statuses.every(function (item) { return item === "success" || item === "skipped"; })
      ? "completed"
      : "running";
    if (statuses.indexOf("blocked") >= 0 || statuses.indexOf("failed_recoverable") >= 0) status = "blocked";
    if (statuses.every(function (item) { return item === "cancelled"; })) status = "cancelled";
    return {
      executionId: "execution-" + (options.makeUuid || createUuid)(),
      sessionId: context.sessionId,
      lineageId: context.lineageId,
      planId: selectedPayload.planRef.id,
      status: status,
      steps: actions.map(function (action) {
        const targetRef = findBlockRef(selectedPayload, action);
        return {
          stepId: "action-" + (options.makeUuid || createUuid)(),
          type: mapStepType(action),
          status: normalizeStepStatus(action.status),
          impactLevel: action.requiresConfirmation ? "high" : "low",
          title: action.title || "模拟执行步骤",
          targetRef: targetRef,
          mockResult: {
            boundary: "mock",
            result: action.result || null,
          },
        };
      }),
      mockBoundary: "external_results_are_mocked",
    };
  }

  function buildSnapshot(options) {
    const selectedPlan = (options.result.plans || []).find(function (plan) {
      return plan.id === options.selectedPlanId;
    });
    if (!selectedPlan) throw new Error("selected_plan_not_found");
    const selectedPayload = collectSelectedPayload(options.payload, options.selectedPlanId);
    if (!selectedPayload) throw new Error("selected_plan_payload_not_found");
    const executionSummary = buildExecutionSummary(options, selectedPayload);
    const lockedRefs = executionSummary
      ? executionSummary.steps.filter(function (step) {
        return step.status === "success";
      }).map(function (step) {
        return clone(step.targetRef);
      }).filter(function (ref, index, refs) {
        return refs.findIndex(function (item) { return item.id === ref.id; }) === index;
      })
      : [];

    selectedPayload.name = selectedPlan.name;
    selectedPayload.score = Number(selectedPlan.score || 0);
    selectedPayload.budgetText = selectedPlan.budget || "";
    selectedPayload.durationText = selectedPlan.totalDuration || "";
    selectedPayload.riskText = (selectedPlan.risks || []).join("；");
    selectedPayload.assumptions = {
      values: clone(options.result.parsed && options.result.parsed.assumptions || []),
      warnings: clone(options.result.parsed && options.result.parsed.warnings || []),
    };
    if (executionSummary) selectedPayload.executionSummary = executionSummary;
    selectedPayload.lockedRefs = lockedRefs;

    return {
      snapshotId: options.snapshotId || (options.makeUuid || createUuid)(),
      lineageId: options.context.lineageId,
      sessionId: options.context.sessionId,
      version: Number(options.context.version || 1),
      selectedPlan: selectedPayload,
      candidateSummaries: candidateSummaries(options.result, options.payload, options.selectedPlanId),
      savedAt: options.savedAt || new Date().toISOString(),
      dirty: false,
    };
  }

  function buildSnapshotFromWorkspace(workspace, options) {
    const opts = options || {};
    return {
      snapshotId: opts.snapshotId || createUuid(),
      lineageId: workspace.context.lineageId,
      sessionId: workspace.context.sessionId,
      version: workspace.context.version,
      selectedPlan: clone(workspace.selectedPayload),
      candidateSummaries: clone(workspace.candidateSummaries || []),
      savedAt: opts.savedAt || new Date().toISOString(),
      dirty: false,
    };
  }

  function validateCandidateSummaries(summaries) {
    return (summaries || []).every(function (summary) {
      return FORBIDDEN_CANDIDATE_FIELDS.every(function (field) {
        return !Object.prototype.hasOwnProperty.call(summary, field);
      });
    });
  }

  function getReopenBehavior(status) {
    return REOPEN_BEHAVIORS[status] || null;
  }

  function isRefLocked(snapshot, ref) {
    return Boolean(ref && (snapshot.selectedPlan.lockedRefs || []).some(function (lockedRef) {
      return lockedRef.id === ref.id;
    }));
  }

  function semanticKey(item, index) {
    const meta = item && item.meta || {};
    return [
      item.type || item.kind || "item",
      meta.legacyPlanId || "",
      meta.segmentIndex === undefined ? "" : meta.segmentIndex,
      index === undefined ? "" : index,
    ].join(":");
  }

  function mergeSelectedPayload(stablePayload, nextPayload, affected) {
    const next = clone(stablePayload);
    const affectedType = affected.type;
    const affectedIndex = affected.segmentIndex;

    function shouldUpdate(item) {
      if (affectedType === "timeline") return false;
      if (item.type === affectedType || item.kind === affectedType) {
        return affectedType !== "transport" || Number(item.meta && item.meta.segmentIndex || 0) === Number(affectedIndex || 0);
      }
      return false;
    }

    const nextCardsByKey = new Map((nextPayload.cards || []).map(function (item, index) {
      return [semanticKey(item, index), item];
    }));
    next.cards = next.cards.map(function (card, index) {
      if (!shouldUpdate(card)) return card;
      const replacement = nextCardsByKey.get(semanticKey(card, index));
      if (!replacement) return card;
      const preserved = clone(replacement);
      preserved.id = card.id;
      preserved.entityRef = clone(card.entityRef);
      preserved.targetRef = clone(card.targetRef);
      preserved.actions = clone(card.actions);
      return preserved;
    });

    const nextEntitiesByKey = new Map((nextPayload.entities || []).map(function (item, index) {
      return [semanticKey(item, index), item];
    }));
    next.entities = next.entities.map(function (entity, index) {
      if (!shouldUpdate(entity)) return entity;
      const replacement = nextEntitiesByKey.get(semanticKey(entity, index));
      if (!replacement) return entity;
      const preserved = clone(replacement);
      preserved.id = entity.id;
      return preserved;
    });

    const nextTimeline = nextPayload.timeline || [];
    next.timeline = next.timeline.map(function (item, index) {
      const replacement = nextTimeline[index];
      if (!replacement) return item;
      return Object.assign({}, clone(replacement), {
        id: item.id,
        entityRef: clone(item.entityRef),
      });
    });
    return next;
  }

  function shiftClock(value, delta) {
    const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
    if (!match) return value;
    const total = Number(match[1]) * 60 + Number(match[2]) + delta;
    const normalized = ((total % 1440) + 1440) % 1440;
    return String(Math.floor(normalized / 60)).padStart(2, "0") + ":" +
      String(normalized % 60).padStart(2, "0");
  }

  function commitTimelineShift(workspace, timelineIndex, deltaMinutes) {
    const next = clone(workspace);
    const plan = (next.result.plans || []).find(function (item) {
      return item.id === next.selectedPlanId;
    });
    if (!plan || !plan.timeline[timelineIndex]) {
      return { ok: false, workspace: workspace, error: "timeline_block_not_found" };
    }
    const targetTimeline = next.selectedPayload.timeline[timelineIndex];
    if (targetTimeline && isRefLocked({ selectedPlan: next.selectedPayload }, targetTimeline.entityRef)) {
      return { ok: false, workspace: workspace, error: "locked_success_block" };
    }
    const before = clone(workspace);
    for (let index = timelineIndex; index < plan.timeline.length; index += 1) {
      plan.timeline[index].time = shiftClock(plan.timeline[index].time, deltaMinutes);
    }
    for (let index = timelineIndex; index < next.selectedPayload.timeline.length; index += 1) {
      next.selectedPayload.timeline[index].timeLabel = shiftClock(
        next.selectedPayload.timeline[index].timeLabel,
        deltaMinutes
      );
    }
    next.context.version += 1;
    next.selectedPayload.planRef.version = next.context.version;
    next.dirty = true;
    next.undoWorkspace = before;
    next.lastChange = {
      type: "timeline",
      label: "时间块后移 " + deltaMinutes + " 分钟",
      affectedRefs: next.selectedPayload.timeline.slice(timelineIndex).map(function (item) {
        return clone(item.entityRef);
      }),
    };
    return { ok: true, workspace: next };
  }

  function commitPayloadReplan(workspace, nextResult, nextSelectedPayload, affected, label) {
    const affectedCard = (workspace.selectedPayload.cards || []).find(function (card) {
      if (card.type !== affected.type) return false;
      return affected.type !== "transport" ||
        Number(card.meta && card.meta.segmentIndex || 0) === Number(affected.segmentIndex || 0);
    });
    if (affectedCard && isRefLocked({ selectedPlan: workspace.selectedPayload }, affectedCard.entityRef)) {
      return { ok: false, workspace: workspace, error: "locked_success_block" };
    }
    const next = clone(workspace);
    next.undoWorkspace = clone(workspace);
    next.result = clone(nextResult);
    next.selectedPayload = mergeSelectedPayload(workspace.selectedPayload, nextSelectedPayload, affected);
    next.context.version += 1;
    next.selectedPayload.planRef.version = next.context.version;
    next.dirty = true;
    next.lastChange = {
      type: affected.type,
      label: label,
      affectedRefs: affectedCard && affectedCard.entityRef ? [clone(affectedCard.entityRef)] : [],
    };
    return { ok: true, workspace: next };
  }

  function undoLatest(workspace) {
    if (!workspace || !workspace.undoWorkspace) {
      return { ok: false, workspace: workspace, error: "undo_unavailable" };
    }
    const restored = clone(workspace.undoWorkspace);
    restored.undoWorkspace = null;
    restored.lastChange = null;
    return { ok: true, workspace: restored };
  }

  function reopenSnapshot(snapshot, result) {
    const planCard = (snapshot.selectedPlan.cards || []).find(function (card) {
      return card.type === "plan_summary";
    });
    return {
      sourceSnapshotId: snapshot.snapshotId,
      context: {
        sessionId: snapshot.sessionId,
        lineageId: snapshot.lineageId,
        version: snapshot.version,
      },
      selectedPlanId: planCard && planCard.meta && planCard.meta.legacyPlanId || snapshot.selectedPlan.planRef.id,
      selectedPayload: clone(snapshot.selectedPlan),
      result: clone(result || null),
      dirty: false,
      undoWorkspace: null,
      lastChange: null,
      pendingRefresh: null,
    };
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    WORKSPACE_KEY: WORKSPACE_KEY,
    PLAN_WORKSPACES_KEY: PLAN_WORKSPACES_KEY,
    SNAPSHOT_WORKSPACES_KEY: SNAPSHOT_WORKSPACES_KEY,
    FORBIDDEN_CANDIDATE_FIELDS: FORBIDDEN_CANDIDATE_FIELDS,
    REOPEN_BEHAVIORS: REOPEN_BEHAVIORS,
    clone: clone,
    parseRoute: parseRoute,
    saveWorkspace: saveWorkspace,
    loadWorkspace: loadWorkspace,
    savePlanWorkspace: savePlanWorkspace,
    loadPlanWorkspace: loadPlanWorkspace,
    listSnapshots: listSnapshots,
    getSnapshot: getSnapshot,
    storeSnapshot: storeSnapshot,
    storeSnapshotWorkspace: storeSnapshotWorkspace,
    loadSnapshotWorkspace: loadSnapshotWorkspace,
    collectSelectedPayload: collectSelectedPayload,
    buildSnapshot: buildSnapshot,
    buildSnapshotFromWorkspace: buildSnapshotFromWorkspace,
    validateCandidateSummaries: validateCandidateSummaries,
    getReopenBehavior: getReopenBehavior,
    isRefLocked: isRefLocked,
    mergeSelectedPayload: mergeSelectedPayload,
    commitTimelineShift: commitTimelineShift,
    commitPayloadReplan: commitPayloadReplan,
    undoLatest: undoLatest,
    reopenSnapshot: reopenSnapshot,
  };
});
