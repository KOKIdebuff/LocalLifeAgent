(function (root, factory) {
  const contract = root.LocalLifeV5Contract || (typeof require === "function" ? require("./v5-contract") : null);
  const api = factory(contract);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LocalLifeV5Renderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (contract) {
  "use strict";

  const IMPLEMENTED_ACTION_TYPES = [
    "select_plan",
    "preview_previous_candidate",
    "preview_next_candidate",
    "adopt_preview_candidate",
    "restore_original_candidate",
    "undo_candidate_adoption",
    "edit_assumption",
    "answer_soft_prompt",
  ];
  const CANDIDATE_ACTION_TYPES = [
    "preview_previous_candidate",
    "preview_next_candidate",
    "adopt_preview_candidate",
    "restore_original_candidate",
    "undo_candidate_adoption",
  ];

  const PLAN_MEDIA = [
    "assets/workbench/plan-heritage.jpg",
    "assets/workbench/plan-city.jpg",
    "assets/workbench/plan-food.jpg",
  ];

  function getMediaForIndex(index) {
    return PLAN_MEDIA[index % PLAN_MEDIA.length];
  }

  function makeTag(text, tone) {
    const tag = document.createElement("span");
    tag.className = "tag " + (tone || "");
    tag.textContent = text;
    return tag;
  }

  function appendMeta(container, meta, keys) {
    const row = document.createElement("div");
    row.className = "chip-row";
    keys.forEach(function (entry) {
      const value = meta && meta[entry[0]];
      if (value === null || value === undefined || value === "") return;
      row.appendChild(makeTag(entry[1] ? entry[1] + value : value, entry[2]));
    });
    if (row.childNodes.length) container.appendChild(row);
  }

  function resolveActions(card, actionMap) {
    return (card.actions || []).map(function (ref) {
      return actionMap.get(ref.actionId);
    }).filter(Boolean);
  }

  function appendActions(container, actions, onAction) {
    const allowed = actions.filter(function (action) {
      return IMPLEMENTED_ACTION_TYPES.indexOf(action.type) >= 0 &&
        CANDIDATE_ACTION_TYPES.indexOf(action.type) < 0;
    });
    if (!allowed.length) return;
    const row = document.createElement("div");
    row.className = "v5-card-actions";
    allowed.forEach(function (action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = action.type === "select_plan" ? "plan-select-btn" : "ghost-btn";
      button.textContent = action.label;
      button.disabled = action.status !== "enabled";
      if (action.disabledReason) button.title = action.disabledReason;
      button.addEventListener("click", function () {
        if (contract.isExecutableAction(action)) onAction(action);
      });
      row.appendChild(button);
    });
    container.appendChild(row);
  }

  function formatDelta(value, suffix, prefix) {
    const number = Number(value || 0);
    if (!number) return (prefix || "") + "无变化";
    return (prefix || "") + (number > 0 ? "+" : "") + number + suffix;
  }

  function renderCandidateSwitcher(card, actions, onAction) {
    const state = card.meta && card.meta.candidateSwitcher;
    if (!state) return null;
    const wrap = document.createElement("div");
    wrap.className = "candidate-switcher";

    const status = document.createElement("div");
    status.className = "candidate-switcher-status";
    const badge = document.createElement("span");
    badge.className = "candidate-status " + state.previewStatus;
    badge.textContent = state.previewStatus === "adopted"
      ? "已采用"
      : state.previewStatus === "restored"
        ? "已恢复原方案"
        : state.currentIndex === 0
          ? "原方案"
          : "预览中";
    const position = document.createElement("strong");
    position.textContent = (state.currentIndex + 1) + " / " + state.candidateCount;
    status.append(badge, position);

    const actionByType = new Map(actions.map(function (action) { return [action.type, action]; }));
    const navigation = document.createElement("div");
    navigation.className = "candidate-navigation";
    [
      ["preview_previous_candidate", "← 上一个"],
      ["preview_next_candidate", "下一个 →"],
    ].forEach(function (entry) {
      const action = actionByType.get(entry[0]);
      if (!action) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "candidate-nav-btn";
      button.textContent = entry[1];
      button.disabled = action.status !== "enabled";
      button.addEventListener("click", function () { onAction(action); });
      navigation.appendChild(button);
    });
    navigation.insertBefore(position, navigation.children[1] || null);

    const impact = document.createElement("div");
    impact.className = "candidate-impact";
    impact.append(
      makeTag(formatDelta(state.impact.timeDeltaMinutes, " 分钟", "时间 "), state.impact.timeDeltaMinutes > 0 ? "amber" : "green"),
      makeTag(formatDelta(state.impact.budgetDelta, " 元", "预算 "), state.impact.budgetDelta > 0 ? "amber" : "green")
    );
    if (card.type === "transport") {
      impact.append(
        makeTag("拥堵 " + state.impact.congestionRisk),
        makeTag("步行 " + state.impact.walkingRisk),
        makeTag("换乘 " + state.impact.transferRisk)
      );
    } else {
      impact.append(makeTag("风险 " + state.impact.riskDelta));
    }

    if (state.affectedTimeline && state.affectedTimeline.length) {
      const timeline = document.createElement("div");
      timeline.className = "candidate-timeline-preview";
      const title = document.createElement("span");
      title.textContent = "受影响时间线";
      const text = document.createElement("p");
      text.textContent = state.affectedTimeline.slice(0, 3).map(function (item) {
        return item.time + " " + item.title;
      }).join(" · ");
      timeline.append(title, text);
      wrap.append(status, navigation, impact, timeline);
    } else {
      wrap.append(status, navigation, impact);
    }

    const commitRow = document.createElement("div");
    commitRow.className = "candidate-commit-actions";
    [
      ["adopt_preview_candidate", "采用这个", "primary"],
      ["restore_original_candidate", "恢复原方案", "secondary"],
      ["undo_candidate_adoption", "撤销采用", "ghost"],
    ].forEach(function (entry) {
      const action = actionByType.get(entry[0]);
      if (!action) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "candidate-" + entry[2] + "-btn";
      button.textContent = entry[1];
      button.disabled = action.status !== "enabled";
      button.addEventListener("click", function () { onAction(action); });
      commitRow.appendChild(button);
    });
    wrap.appendChild(commitRow);
    return wrap;
  }

  function renderAssumptionCard(card, actions, onAction, assumptionBanner) {
    const wrap = document.createElement("section");
    wrap.className = "v5-assumption-banner";
    const text = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = card.title;
    const summary = document.createElement("p");
    summary.textContent = card.summaryText;
    text.append(title, summary);
    if (assumptionBanner && assumptionBanner.items) {
      appendMeta(text, assumptionBanner.items.reduce(function (meta, item) {
        meta[item.key] = item.value;
        return meta;
      }, {}), [
        ["partySize", "人数 "],
        ["budgetPerPerson", "人均 ¥"],
        ["area", ""],
        ["timePreset", ""],
      ]);
    }
    wrap.appendChild(text);
    appendActions(wrap, actions, onAction);
    return wrap;
  }

  function renderSoftPrompt(card, actions, onAction) {
    const wrap = document.createElement("section");
    wrap.className = "v5-soft-prompt";
    const text = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = card.title;
    const summary = document.createElement("p");
    summary.textContent = card.summaryText;
    text.append(title, summary);
    wrap.appendChild(text);
    appendActions(wrap, actions, onAction);
    return wrap;
  }

  function renderBlockCard(card, actions, onAction) {
    const wrap = document.createElement("section");
    wrap.className = "v5-block-card " + card.type;
    const label = document.createElement("span");
    label.className = "v5-card-label";
    label.textContent = card.type === "activity"
      ? "活动安排"
      : card.type === "restaurant"
        ? "餐厅安排"
        : "交通行程段";
    const title = document.createElement("h3");
    title.textContent = card.title;
    const summary = document.createElement("p");
    summary.textContent = card.summaryText;
    wrap.append(label, title, summary);
    appendMeta(wrap, card.meta, card.type === "activity" ? [
      ["activityType", ""],
      ["distanceText", ""],
      ["priceText", ""],
      ["selectedSlot", "可预约 "],
    ] : card.type === "restaurant" ? [
      ["cuisine", ""],
      ["distanceText", ""],
      ["priceText", ""],
      ["waitText", "排队 "],
      ["selectedSlot", "可预约 "],
    ] : [
      ["routeLabel", ""],
      ["modeLabel", ""],
      ["durationText", ""],
      ["budgetText", ""],
    ]);
    if (card.meta.tags && card.meta.tags.length) {
      const tags = document.createElement("div");
      tags.className = "chip-row v5-tags";
      card.meta.tags.forEach(function (tag) {
        tags.appendChild(makeTag(tag));
      });
      wrap.appendChild(tags);
    }
    const switcher = renderCandidateSwitcher(card, actions, onAction);
    if (switcher) wrap.appendChild(switcher);
    appendActions(wrap, actions, onAction);
    return wrap;
  }

  function renderTimelineCard(card, timelineMap) {
    const wrap = document.createElement("section");
    wrap.className = "timeline v5-timeline";
    const title = document.createElement("h3");
    title.textContent = card.title;
    const list = document.createElement("ol");
    list.className = "timeline-list";
    (card.meta.timelineItemIds || []).forEach(function (id) {
      const item = timelineMap.get(id);
      if (!item) return;
      const row = document.createElement("li");
      row.className = "timeline-item";
      const time = document.createElement("span");
      time.className = "time";
      time.textContent = item.timeLabel;
      const content = document.createElement("div");
      const itemTitle = document.createElement("div");
      itemTitle.className = "timeline-title";
      itemTitle.textContent = item.title;
      const detail = document.createElement("div");
      detail.className = "timeline-detail";
      detail.textContent = item.detailText || "";
      content.append(itemTitle, detail);
      row.append(time, content);
      list.appendChild(row);
    });
    wrap.append(title, list);
    return wrap;
  }

  function appendRiskButton(container, planCard, onOpenRisk) {
    if (!planCard.reasonText && !planCard.riskText) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "v5-risk-button";
    const icon = document.createElement("span");
    icon.className = "material-symbols-rounded";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "shield";
    const text = document.createElement("span");
    text.textContent = "查看风险校验与推荐依据";
    button.append(icon, text);
    button.addEventListener("click", function () {
      onOpenRisk(planCard);
    });
    container.appendChild(button);
  }

  function renderPlanGroup(planCard, childCards, actionMap, timelineMap, onAction, onOpenRisk, index) {
    const article = document.createElement("article");
    article.className = "plan-card v5-plan-card" + (planCard.status === "selected" ? " selected" : "");
    if (planCard.meta && planCard.meta.legacyPlanId) {
      article.dataset.planId = planCard.meta.legacyPlanId;
    }

    const hero = document.createElement("div");
    hero.className = "v5-plan-hero";
    const image = document.createElement("img");
    image.src = getMediaForIndex(index);
    image.alt = planCard.title + "场景图";
    image.loading = index === 0 ? "eager" : "lazy";
    const heroContent = document.createElement("div");
    heroContent.className = "v5-plan-hero-content";
    const titleWrap = document.createElement("div");
    const eyebrow = document.createElement("span");
    eyebrow.className = "v5-card-label";
    eyebrow.textContent = planCard.meta.recommended ? "推荐方案" : "备选方案";
    const title = document.createElement("h2");
    title.textContent = planCard.title;
    const summary = document.createElement("p");
    summary.className = "v5-plan-summary";
    summary.textContent = planCard.summaryText;
    titleWrap.append(eyebrow, title, summary);
    heroContent.appendChild(titleWrap);
    if (planCard.meta.score !== undefined) {
      const score = document.createElement("span");
      score.className = "score-badge";
      score.textContent = planCard.meta.score + " 分";
      heroContent.appendChild(score);
    }
    hero.append(image, heroContent);
    article.appendChild(hero);

    const body = document.createElement("div");
    body.className = "v5-plan-body";
    appendMeta(body, planCard.meta, [
      ["fit", ""],
      ["totalDuration", ""],
      ["budget", ""],
    ]);

    const grid = document.createElement("div");
    grid.className = "v5-block-grid";
    childCards.filter(function (card) {
      return card.type === "activity" || card.type === "restaurant" || card.type === "transport";
    }).forEach(function (card) {
      grid.appendChild(renderBlockCard(card, resolveActions(card, actionMap), onAction));
    });
    if (grid.childNodes.length) body.appendChild(grid);

    childCards.filter(function (card) { return card.type === "timeline"; }).forEach(function (card) {
      body.appendChild(renderTimelineCard(card, timelineMap));
    });

    if (planCard.evidenceItems && planCard.evidenceItems.length) {
      const evidence = document.createElement("div");
      evidence.className = "reason-list";
      const evidenceTitle = document.createElement("h3");
      evidenceTitle.textContent = "关键推荐依据";
      const list = document.createElement("ul");
      planCard.evidenceItems.forEach(function (item) {
        const li = document.createElement("li");
        li.textContent = item;
        list.appendChild(li);
      });
      evidence.append(evidenceTitle, list);
      body.appendChild(evidence);
    }

    appendRiskButton(body, planCard, onOpenRisk);
    appendActions(body, resolveActions(planCard, actionMap), onAction);
    article.appendChild(body);
    return article;
  }

  function render(options) {
    const container = options.container;
    const payload = options.payload;
    const onAction = options.onAction || function () {};
    const onOpenRisk = options.onOpenRisk || function () {};
    const validation = contract.validatePayload(payload);
    if (!validation.valid) return { rendered: false, errors: validation.errors, planCount: 0 };

    const cards = contract.getRenderableCards(payload);
    const actionMap = new Map((payload.actions || []).map(function (action) { return [action.id, action]; }));
    const timelineMap = new Map((payload.timeline || []).map(function (item) { return [item.id, item]; }));
    const planCards = cards.filter(function (card) { return card.type === "plan_summary"; });
    container.innerHTML = "";
    container.className = "plan-list v5-card-flow";

    cards.filter(function (card) { return card.type === "assumption_banner"; }).forEach(function (card) {
      container.appendChild(renderAssumptionCard(
        card,
        resolveActions(card, actionMap),
        onAction,
        payload.assumptionBanner
      ));
    });
    cards.filter(function (card) { return card.type === "soft_prompt"; }).forEach(function (card) {
      container.appendChild(renderSoftPrompt(card, resolveActions(card, actionMap), onAction));
    });
    planCards.forEach(function (planCard, index) {
      const children = cards.filter(function (card) {
        return card.meta && card.meta.planRefId === planCard.entityRef.id;
      });
      container.appendChild(renderPlanGroup(
        planCard,
        children,
        actionMap,
        timelineMap,
        onAction,
        onOpenRisk,
        index
      ));
    });

    if (!container.childNodes.length) {
      return { rendered: false, errors: ["no supported cards"], planCount: 0 };
    }
    return { rendered: true, errors: [], planCount: planCards.length };
  }

  return {
    render: render,
    getMediaForIndex: getMediaForIndex,
    implementedActionTypes: IMPLEMENTED_ACTION_TYPES.slice(),
  };
});
