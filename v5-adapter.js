(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LocalLifeV5Adapter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function defaultUuid() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (char) {
      const random = Math.floor(Math.random() * 16);
      const value = char === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  function createContext(options) {
    const opts = options || {};
    const makeUuid = opts.makeUuid || defaultUuid;
    return {
      requestId: opts.requestId || makeUuid(),
      sessionId: opts.sessionId || makeUuid(),
      lineageId: opts.lineageId || makeUuid(),
      version: opts.version || 1,
      makeUuid: makeUuid,
    };
  }

  function scopedId(kind, context) {
    return kind + "-" + context.makeUuid();
  }

  function makeRef(kind, id, context) {
    return {
      kind: kind,
      id: id,
      lineageId: context.lineageId,
      sessionId: context.sessionId,
      version: context.version,
    };
  }

  function addAction(payload, context, spec) {
    const action = {
      id: scopedId("action", context),
      type: spec.type,
      label: spec.label,
      targetRef: spec.targetRef,
      status: spec.status || "enabled",
      requiresConfirmation: Boolean(spec.requiresConfirmation),
      disabledReason: spec.disabledReason || null,
      meta: Object.assign({
        source: "agent_core_adapter",
        mockBoundary: "adapter_fallback",
      }, spec.meta || {}),
    };
    payload.actions.push(action);
    return { actionId: action.id, targetRef: action.targetRef };
  }

  function addCandidateActions(payload, context, card, targetRef, meta) {
    const baseMeta = Object.assign({}, meta);
    const compatibility = addAction(payload, context, {
      type: "refresh_block",
      label: "换一换（兼容入口）",
      targetRef: targetRef,
      meta: Object.assign({}, baseMeta, { compatibilityOnly: true }),
    });
    card.meta.compatibilityActionId = compatibility.actionId;
    [
      ["preview_previous_candidate", "上一个", "disabled"],
      ["preview_next_candidate", "下一个", "enabled"],
      ["adopt_preview_candidate", "采用这个", "disabled"],
      ["restore_original_candidate", "恢复原方案", "disabled"],
      ["undo_candidate_adoption", "撤销采用", "disabled"],
    ].forEach(function (item) {
      card.actions.push(addAction(payload, context, {
        type: item[0],
        label: item[1],
        targetRef: targetRef,
        status: item[2],
        meta: baseMeta,
      }));
    });
  }

  function makeEntity(kind, title, summary, status, context, meta) {
    const idKind = kind === "timeline_block" ? "timeline" : kind;
    return {
      id: scopedId(idKind, context),
      kind: kind,
      status: status || "ready",
      title: title,
      summaryText: summary || title,
      meta: Object.assign({
        source: "agent_core_adapter",
        mockBoundary: "adapter_fallback",
      }, meta || {}),
    };
  }

  function makeCard(type, title, summary, refKey, ref, context, meta) {
    const card = {
      id: scopedId("card", context),
      type: type,
      status: "ready",
      title: title,
      summaryText: summary || title,
      cardSchemaVersion: "v5-p0-card",
      actions: [],
      meta: Object.assign({
        source: "agent_core_adapter",
        mockBoundary: "adapter_fallback",
      }, meta || {}),
    };
    card[refKey] = ref;
    return card;
  }

  function makeRecovery() {
    return {
      code: "planning_unavailable",
      httpStatus: 503,
      severity: "recoverable",
      recoverable: true,
      blocking: false,
      fallback: {
        enabled: true,
        mode: "adapter",
        usesAgentCore: true,
        reason: "adapter_fallback",
      },
      userMessageKey: "stable_generation_mode",
      recommendedAction: "use_adapter_fallback",
      preserve: {
        keepOldPlan: false,
        keepLastStableSnapshot: false,
        doNotRenderBackendData: true,
        visibleState: "adapter_output",
      },
      telemetry: {
        logLevel: "info",
        auditRequired: false,
      },
      message: "已切换到稳定生成模式。",
    };
  }

  function buildAssumptionBanner(result, payload, context, planRef) {
    const parsed = result.parsed || {};
    const values = [
      ["partySize", "人数", parsed.partySize == null ? null : parsed.partySize, true],
      ["budgetPerPerson", "人均预算", parsed.budgetPerPerson == null ? null : parsed.budgetPerPerson, true],
      ["area", "区域", parsed.location || null, true],
      ["timePreset", "时间", parsed.timeRange && parsed.timeRange.label, false],
    ].filter(function (item) { return item[2] !== null && item[2] !== undefined && item[2] !== ""; });

    if (!values.length && !(parsed.assumptions || []).length) return;
    payload.assumptionBanner = {
      id: scopedId("assumption", context),
      title: "本次方案采用的默认信息",
      items: values.map(function (item) {
        return {
          key: item[0],
          label: item[1],
          value: item[2],
          editable: item[3],
          source: (parsed.assumptions || []).length ? "local_rules" : "user_input",
        };
      }),
    };
    const card = makeCard(
      "assumption_banner",
      payload.assumptionBanner.title,
      values.map(function (item) { return item[1] + "：" + item[2]; }).join(" · "),
      "targetRef",
      planRef,
      context,
      { assumptionBannerId: payload.assumptionBanner.id }
    );
    values.filter(function (item) { return item[3]; }).forEach(function (item) {
      card.actions.push(addAction(payload, context, {
        type: "edit_assumption",
        label: "修改" + item[1],
        targetRef: planRef,
        meta: { assumptionKey: item[0], currentValue: item[2] },
      }));
    });
    payload.cards.push(card);
  }

  function adaptClarification(result, payload, context, placeholderPlan) {
    const planRef = makeRef("plan", placeholderPlan.id, context);
    buildAssumptionBanner(result, payload, context, planRef);
    const clarification = result.clarification || {};
    const card = makeCard(
      "soft_prompt",
      "需要确认一个关键信息",
      clarification.question || "补充信息后再继续生成方案。",
      "targetRef",
      planRef,
      context,
      { clarificationKey: clarification.key || null }
    );
    card.status = "blocked";
    (clarification.options || []).forEach(function (option) {
      card.actions.push(addAction(payload, context, {
        type: "answer_soft_prompt",
        label: option.label,
        targetRef: planRef,
        meta: {
          clarificationKey: clarification.key,
          clarificationValue: option.value,
        },
      }));
    });
    payload.cards.push(card);
  }

  function adaptPlan(plan, result, payload, context) {
    const selected = plan.id === result.recommendedPlanId;
    const planEntity = makeEntity(
      "plan",
      plan.name || "待确认方案",
      [plan.fit, plan.totalDuration, plan.budget].filter(Boolean).join(" · ") || "本地稳定方案",
      selected ? "selected" : "ready",
      context,
      {
        legacyPlanId: plan.id,
        score: plan.score,
        fit: plan.fit,
        budget: plan.budget,
        totalDuration: plan.totalDuration,
        scoreDetails: plan.scoreDetails || [],
        recommendationReasons: plan.recommendationReasons || [],
        servicePackage: plan.servicePackage || null,
      }
    );
    payload.entities.push(planEntity);
    const planRef = makeRef("plan", planEntity.id, context);

    const planCard = makeCard(
      "plan_summary",
      plan.name || "待确认方案",
      [plan.fit, plan.totalDuration, plan.budget].filter(Boolean).join(" · ") || "本地稳定方案",
      "entityRef",
      planRef,
      context,
      {
        legacyPlanId: plan.id,
        planRefId: planEntity.id,
        score: plan.score,
        fit: plan.fit,
        budget: plan.budget,
        totalDuration: plan.totalDuration,
        actionsPreview: plan.actionsPreview || [],
        recommended: selected,
      }
    );
    planCard.status = selected ? "selected" : "ready";
    planCard.reasonText = plan.reason || "";
    planCard.riskText = (plan.risks || []).join("；");
    planCard.evidenceItems = (plan.recommendationReasons || []).slice(0, 4);
    planCard.actions.push(addAction(payload, context, {
      type: "select_plan",
      label: selected ? "已选择" : "选择此方案",
      targetRef: planRef,
      status: selected ? "disabled" : "enabled",
      disabledReason: selected ? "当前已选方案" : null,
      meta: { legacyPlanId: plan.id },
    }));
    payload.cards.push(planCard);

    const activity = plan.activity || {};
    const activityEntity = makeEntity(
      "activity",
      activity.name || "待确认活动",
      [activity.type, activity.distance, activity.price].filter(Boolean).join(" · ") || "活动信息待确认",
      activity.name ? "ready" : "placeholder",
      context,
      {
        legacyPlanId: plan.id,
        activityType: activity.type,
        distanceText: activity.distance,
        priceText: activity.price,
        tags: activity.tags || [],
        canBook: Boolean(activity.canBook),
        selectedSlot: activity.selectedSlot || null,
      }
    );
    payload.entities.push(activityEntity);
    const activityRef = makeRef("activity", activityEntity.id, context);
    const activityCard = makeCard(
      "activity",
      activityEntity.title,
      activityEntity.summaryText,
      "entityRef",
      activityRef,
      context,
      Object.assign({ planRefId: planEntity.id, legacyPlanId: plan.id }, activityEntity.meta)
    );
    addCandidateActions(payload, context, activityCard, activityRef, {
      blockType: "activity",
      legacyPlanId: plan.id,
      switcherKey: plan.id + ":activity",
      replanEvent: "activity_sold_out",
    });
    payload.cards.push(activityCard);

    const restaurant = plan.restaurant || {};
    const restaurantEntity = makeEntity(
      "restaurant",
      restaurant.name || "待确认餐厅",
      [restaurant.cuisine, restaurant.distance, restaurant.price, restaurant.wait].filter(Boolean).join(" · ") || "餐厅信息待确认",
      restaurant.name ? "ready" : "placeholder",
      context,
      {
        legacyPlanId: plan.id,
        cuisine: restaurant.cuisine,
        distanceText: restaurant.distance,
        priceText: restaurant.price,
        waitText: restaurant.wait,
        tags: restaurant.tags || [],
        canReserve: Boolean(restaurant.canReserve),
        selectedSlot: restaurant.selectedSlot || null,
      }
    );
    payload.entities.push(restaurantEntity);
    const restaurantRef = makeRef("restaurant", restaurantEntity.id, context);
    const restaurantCard = makeCard(
      "restaurant",
      restaurantEntity.title,
      restaurantEntity.summaryText,
      "entityRef",
      restaurantRef,
      context,
      Object.assign({ planRefId: planEntity.id, legacyPlanId: plan.id }, restaurantEntity.meta)
    );
    addCandidateActions(payload, context, restaurantCard, restaurantRef, {
      blockType: "restaurant",
      legacyPlanId: plan.id,
      switcherKey: plan.id + ":restaurant",
      replanEvent: "restaurant_full",
    });
    payload.cards.push(restaurantCard);

    (plan.route || []).slice(0, 2).forEach(function (routeText, segmentIndex) {
      const transportEntity = makeEntity(
        "transport",
        segmentIndex === 0 ? "前往活动" : "前往餐厅",
        routeText,
        "ready",
        context,
        {
          legacyPlanId: plan.id,
          routeSegmentId: context.makeUuid(),
          segmentIndex: segmentIndex,
          routeText: routeText,
        }
      );
      payload.entities.push(transportEntity);
      const transportRef = makeRef("transport", transportEntity.id, context);
      const transportCard = makeCard(
        "transport",
        transportEntity.title,
        routeText,
        "entityRef",
        transportRef,
        context,
        Object.assign({
          planRefId: planEntity.id,
          legacyPlanId: plan.id,
          switcherKey: plan.id + ":transport:" + segmentIndex,
          blockType: "transport",
          segmentIndex: segmentIndex,
          fromRef: segmentIndex === 0 ? planRef : activityRef,
          toRef: segmentIndex === 0 ? activityRef : restaurantRef,
        }, transportEntity.meta)
      );
      addCandidateActions(payload, context, transportCard, transportRef, {
        blockType: "transport",
        legacyPlanId: plan.id,
        switcherKey: plan.id + ":transport:" + segmentIndex,
        routeSegmentId: transportEntity.meta.routeSegmentId,
        segmentIndex: segmentIndex,
      });
      payload.cards.push(transportCard);
    });

    const timelineEntity = makeEntity(
      "timeline_block",
      plan.name + "时间安排",
      (plan.timeline || []).length + " 个时间节点",
      (plan.timeline || []).length ? "ready" : "placeholder",
      context,
      { legacyPlanId: plan.id, planRefId: planEntity.id }
    );
    payload.entities.push(timelineEntity);
    const timelineRef = makeRef("timeline", timelineEntity.id, context);
    const timelineIds = [];
    (plan.timeline || []).forEach(function (item, index) {
      const isRestaurant = index >= Math.max(0, plan.timeline.length - 2);
      const entityRef = isRestaurant ? restaurantRef : activityRef;
      const timelineItem = {
        id: scopedId("timeline", context),
        timeLabel: item.time || "待确认",
        title: item.title || "待确认安排",
        detailText: item.detail || "",
        entityRef: entityRef,
        status: "ready",
      };
      timelineIds.push(timelineItem.id);
      payload.timeline.push(timelineItem);
    });
    if (timelineIds.length) {
      payload.cards.push(makeCard(
        "timeline",
        "时间表",
        "按顺序完成 " + timelineIds.length + " 个行程节点",
        "entityRef",
        timelineRef,
        context,
        { planRefId: planEntity.id, legacyPlanId: plan.id, timelineItemIds: timelineIds }
      ));
    }
    return planRef;
  }

  function summarizeTrace(result) {
    const stages = result.agentLoopTrace && result.agentLoopTrace.stages || [];
    const done = stages.filter(function (stage) { return stage.status === "done"; }).length;
    return stages.length ? "已完成 " + done + "/" + stages.length + " 个规划阶段" : "使用本地稳定规划链路";
  }

  function adaptAgentCoreResult(result, options) {
    if (!result || typeof result !== "object") throw new Error("legacy result is required");
    const context = createContext(options);
    const payload = {
      ok: true,
      uiSchemaVersion: "v5-p0",
      requestId: context.requestId,
      sessionId: context.sessionId,
      lineageId: context.lineageId,
      version: context.version,
      planningMode: "adapter_fallback",
      source: "agent_core_adapter",
      fallback: {
        enabled: true,
        mode: "adapter",
        usesAgentCore: true,
        reason: "backend_unavailable",
      },
      runtimeSummary: null,
      errorRecovery: makeRecovery(),
      cards: [],
      entities: [],
      timeline: [],
      actions: [],
      warnings: [],
      requiredCapabilities: [
        "minimum_ui_contract",
        "cards_entities_timeline_actions",
        "p0_card_type_whitelist",
        "p0_action_type_whitelist",
        "adapter_fallback",
      ],
      optionalCapabilities: ["local_replan_contract"],
    };

    let activePlanRef;
    if (result.needsClarification || !(result.plans || []).length) {
      const placeholder = makeEntity("plan", "待补充信息的方案", "确认关键信息后继续", "placeholder", context, {
        legacyPlanId: null,
      });
      payload.entities.push(placeholder);
      activePlanRef = makeRef("plan", placeholder.id, context);
      adaptClarification(result, payload, context, placeholder);
    } else {
      (result.plans || []).forEach(function (plan) {
        const ref = adaptPlan(plan, result, payload, context);
        if (plan.id === result.recommendedPlanId) activePlanRef = ref;
      });
      activePlanRef = activePlanRef || makeRef("plan", payload.entities[0].id, context);
      buildAssumptionBanner(result, payload, context, activePlanRef);
    }

    payload.runtimeSummary = {
      sessionId: context.sessionId,
      lineageId: context.lineageId,
      version: context.version,
      runtimeState: result.needsClarification ? "clarifying" : "ready_for_confirmation",
      displayPhase: result.needsClarification ? "clarification" : "confirmation",
      allowedActions: payload.actions.map(function (action) {
        return { actionId: action.id, targetRef: action.targetRef };
      }),
      activePlanRef: activePlanRef,
      recoverableErrors: [payload.errorRecovery],
      summaryText: summarizeTrace(result),
      usesPostRuntimeCompatibility: false,
    };
    return payload;
  }

  return {
    adaptAgentCoreResult: adaptAgentCoreResult,
  };
});
