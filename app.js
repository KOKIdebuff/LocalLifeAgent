(function () {
  "use strict";

  const core = window.LocalLifeAgentCore;
  const v5Contract = window.LocalLifeV5Contract;
  const v5Adapter = window.LocalLifeV5Adapter;
  const v5Renderer = window.LocalLifeV5Renderer;
  const candidateRuntime = window.LocalLifeCandidateSwitcher;
  const savedPlans = window.LocalLifeSavedPlans;

  const v5Flags = v5Contract
    ? v5Contract.resolveFeatureFlags({
      search: window.location.search,
      localStorage: window.localStorage,
      sessionStorage: window.sessionStorage,
    })
    : { v5GenerativeUI: false, adapterFallback: true, localReplan: true };

  const samples = {
    weekend: "周六下午想和老婆孩子出去玩 4 小时，孩子 5 岁，别离家太远，老婆最近在减肥，帮我把玩的、吃的、订座和通知都安排好。",
    friends: "下午和 4 个朋友出去玩，2 男 2 女，不想太累，晚上一起吃饭。",
    rain: "周六下午想和老婆孩子出去玩 4 小时，孩子 5 岁，别离家太远，老婆最近在减肥。",
    soldout: "周六下午想和老婆孩子出去玩 4 小时，孩子 5 岁，别离家太远，老婆最近在减肥。",
    partyChanged: "下午和 4 个朋友出去玩，2 男 2 女，不想太累，晚上一起吃饭。",
    missing: "今天下午有空，帮我安排一下。",
    conflict: "下午 2 点出发，只能玩 1 小时，还想去很远的地方吃饭。",
  };

  const sampleOverrides = {
    rain: { replanEvent: "rain" },
    soldout: { replanEvent: "activity_sold_out" },
    partyChanged: { replanEvent: "party_changed" },
  };

  const stageDefs = [
    { id: "understand", label: "理解需求" },
    { id: "planner", label: "确认信息" },
    { id: "researchers", label: "整理选择" },
    { id: "merger", label: "生成方案" },
    { id: "verifier", label: "检查方案" },
    { id: "revise", label: "调整兜底" },
    { id: "reflect", label: "复盘沉淀" },
    { id: "confirm_execute", label: "确认执行" },
  ];

  const state = {
    input: "",
    overrides: {},
    intentMeta: null,
    result: null,
    selectedPlanId: null,
    executedActions: [],
    feedbackStatus: "",
    memoryCandidate: null,
    memoryDecision: null,
    v5Payload: null,
    v5Notice: "",
    v5Context: null,
    v5CandidateSwitchers: {},
    lastStableResult: null,
    pendingAssumptionAction: null,
    modalReturnFocus: null,
    route: savedPlans ? savedPlans.parseRoute(window.location.pathname) : { name: "home" },
    detailWorkspace: null,
    detailCandidate: null,
    pendingMockRefresh: null,
  };

  const els = {
    input: document.getElementById("goal-input"),
    generate: document.getElementById("generate-btn"),
    reset: document.getElementById("reset-btn"),
    clarification: document.getElementById("clarification-panel"),
    understanding: document.getElementById("understanding"),
    parseStatus: document.getElementById("parse-status"),
    plans: document.getElementById("plans"),
    planCount: document.getElementById("plan-count"),
    queue: document.getElementById("execution-queue"),
    queueStatus: document.getElementById("queue-status"),
    execute: document.getElementById("execute-btn"),
    resultPanel: document.getElementById("result-panel"),
    summary: document.getElementById("final-summary"),
    feedbackPanel: document.getElementById("feedback-panel"),
    feedbackInput: document.getElementById("feedback-input"),
    feedbackSubmit: document.getElementById("feedback-submit"),
    feedbackStatus: document.getElementById("feedback-status"),
    feedbackLesson: document.getElementById("feedback-lesson"),
    stages: document.getElementById("agent-stages"),
    servicePackage: document.getElementById("service-package"),
    replanEvents: document.getElementById("replan-events"),
    sampleButtons: Array.from(document.querySelectorAll(".sample-btn")),
    agentTabs: Array.from(document.querySelectorAll("[data-agent-tab]")),
    agentPanels: Array.from(document.querySelectorAll("[data-agent-panel]")),
    agentOpeners: Array.from(document.querySelectorAll("[data-agent-open]")),
    agentClosers: Array.from(document.querySelectorAll("[data-agent-close]")),
    navTabTargets: Array.from(document.querySelectorAll("[data-agent-tab-target]")),
    assumptionModal: document.getElementById("assumption-modal"),
    assumptionTitle: document.getElementById("assumption-modal-title"),
    assumptionInput: document.getElementById("assumption-input"),
    assumptionError: document.getElementById("assumption-error"),
    assumptionSave: document.getElementById("assumption-save"),
    riskModal: document.getElementById("risk-modal"),
    riskContent: document.getElementById("risk-modal-content"),
    feedbackModal: document.getElementById("feedback-modal"),
    feedbackOpen: document.getElementById("feedback-open-btn"),
    modalCloseButtons: Array.from(document.querySelectorAll("[data-modal-close]")),
    homeView: document.getElementById("workbench-home"),
    routePage: document.getElementById("route-page"),
    routeLinks: Array.from(document.querySelectorAll("[data-route-link]")),
    routeBreadcrumbCurrent: document.getElementById("route-breadcrumb-current"),
    routeKicker: document.getElementById("route-kicker"),
    routeTitle: document.getElementById("route-title"),
    routeSubtitle: document.getElementById("route-subtitle"),
    routeActions: document.getElementById("route-primary-actions"),
    routeNotice: document.getElementById("route-notice"),
    routeContent: document.getElementById("route-content"),
    openSelectedPlan: document.getElementById("open-selected-plan"),
    refreshConfirmModal: document.getElementById("refresh-confirm-modal"),
    refreshConfirmCopy: document.getElementById("refresh-confirm-copy"),
    refreshConfirmApply: document.getElementById("refresh-confirm-apply"),
  };

  els.generate.addEventListener("click", function () {
    runPlanning({ resetOverrides: true });
  });

  els.reset.addEventListener("click", function () {
    resetDemo();
  });

  els.execute.addEventListener("click", function () {
    executeSelectedPlan();
  });

  if (els.feedbackSubmit) {
    els.feedbackSubmit.addEventListener("click", async function () {
      await submitFeedback();
      if (state.memoryCandidate) {
        closeModal(els.feedbackModal);
        setAgentTab("memory", true);
      }
    });
  }

  els.agentTabs.forEach(function (button) {
    button.addEventListener("click", function () {
      setAgentTab(button.dataset.agentTab);
    });
  });

  els.navTabTargets.forEach(function (button) {
    button.addEventListener("click", function () {
      setAgentTab(button.dataset.agentTabTarget, true);
    });
  });

  els.agentOpeners.forEach(function (button) {
    button.addEventListener("click", function () {
      document.body.classList.add("agent-drawer-open");
    });
  });

  els.agentClosers.forEach(function (button) {
    button.addEventListener("click", function () {
      document.body.classList.remove("agent-drawer-open");
    });
  });

  els.modalCloseButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      closeModal(button.closest(".modal-shell"));
    });
  });

  if (els.feedbackOpen) {
    els.feedbackOpen.addEventListener("click", function () {
      openModal(els.feedbackModal, els.feedbackInput);
    });
  }

  if (els.assumptionSave) {
    els.assumptionSave.addEventListener("click", function () {
      saveV5Assumption();
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    const activeModal = document.querySelector(".modal-shell:not(.hidden)");
    if (activeModal) {
      closeModal(activeModal);
      return;
    }
    document.body.classList.remove("agent-drawer-open");
  });

  Array.from(document.querySelectorAll(".modal-shell")).forEach(function (modal) {
    modal.addEventListener("click", function (event) {
      if (event.target === modal) closeModal(modal);
    });
  });

  if (els.assumptionInput) {
    els.assumptionInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") saveV5Assumption();
    });
  }

  els.routeLinks.forEach(function (link) {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      navigateTo(link.dataset.routeLink);
    });
  });

  if (els.openSelectedPlan) {
    els.openSelectedPlan.addEventListener("click", function () {
      const plan = getSelectedPlan();
      if (!plan) return;
      openPlanDetail(plan.id);
    });
  }

  if (els.refreshConfirmApply) {
    els.refreshConfirmApply.addEventListener("click", function () {
      applyConfirmedMockRefresh();
    });
  }

  window.addEventListener("popstate", function () {
    state.route = savedPlans.parseRoute(window.location.pathname);
    renderRoute();
  });

  els.sampleButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      els.input.value = samples[button.dataset.sample];
      state.overrides = Object.assign({}, sampleOverrides[button.dataset.sample] || {});
      runPlanning({ resetOverrides: false });
    });
  });

  function setAgentTab(tabName, openDrawer) {
    els.agentTabs.forEach(function (button) {
      const active = button.dataset.agentTab === tabName;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    els.agentPanels.forEach(function (panel) {
      panel.classList.toggle("active", panel.dataset.agentPanel === tabName);
    });
    if (openDrawer) document.body.classList.add("agent-drawer-open");
  }

  function openModal(modal, preferredFocus) {
    if (!modal) return;
    state.modalReturnFocus = document.activeElement;
    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
    window.setTimeout(function () {
      const target = preferredFocus || modal.querySelector("button, input, textarea");
      if (target) target.focus();
    }, 0);
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.add("hidden");
    if (!document.querySelector(".modal-shell:not(.hidden)")) {
      document.body.classList.remove("modal-open");
    }
    if (state.modalReturnFocus && typeof state.modalReturnFocus.focus === "function") {
      state.modalReturnFocus.focus();
    }
    state.modalReturnFocus = null;
    if (modal === els.assumptionModal) state.pendingAssumptionAction = null;
  }

  function navigateTo(path) {
    const search = window.location.search || "";
    window.history.pushState({}, "", path + search);
    state.route = savedPlans.parseRoute(path);
    renderRoute();
  }

  function openPlanDetail(planId) {
    state.detailWorkspace = createDetailWorkspace(planId);
    persistDetailWorkspace();
    navigateTo("/plans/" + encodeURIComponent(planId));
  }

  function setRouteNotice(message, tone) {
    if (!message) {
      els.routeNotice.className = "route-notice hidden";
      els.routeNotice.textContent = "";
      return;
    }
    els.routeNotice.className = "route-notice " + (tone || "");
    els.routeNotice.textContent = message;
  }

  function createLifecyclePayload(result, context) {
    if (!v5Adapter || !result) return null;
    return v5Adapter.adaptAgentCoreResult(result, {
      requestId: context.requestId || context.sessionId,
      sessionId: context.sessionId,
      lineageId: context.lineageId,
      version: context.version,
    });
  }

  function createDetailWorkspace(planId) {
    if (!savedPlans || !state.result) return null;
    const context = cloneValue(createV5Context());
    const payload = createLifecyclePayload(state.result, context);
    if (!payload) return null;
    const executionActions = state.executedActions.length
      ? state.executedActions
      : core.createExecutionQueue(
        state.result.plans.find(function (plan) { return plan.id === planId; }),
        state.result.parsed
      );
    const draftSnapshot = savedPlans.buildSnapshot({
      result: state.result,
      payload: payload,
      selectedPlanId: planId,
      executedActions: executionActions,
      context: context,
    });
    return {
      context: context,
      selectedPlanId: planId,
      selectedPayload: draftSnapshot.selectedPlan,
      candidateSummaries: draftSnapshot.candidateSummaries,
      result: cloneValue(state.result),
      dirty: false,
      undoWorkspace: null,
      lastChange: null,
      sourceSnapshotId: null,
    };
  }

  function persistDetailWorkspace() {
    if (savedPlans && state.detailWorkspace) {
      savedPlans.saveWorkspace(window.localStorage, state.detailWorkspace);
    }
  }

  function restoreDetailWorkspace(planId) {
    if (state.detailWorkspace && state.detailWorkspace.selectedPlanId === planId) {
      return state.detailWorkspace;
    }
    if (state.result && state.result.plans.some(function (plan) { return plan.id === planId; })) {
      return createDetailWorkspace(planId);
    }
    const stored = savedPlans.loadWorkspace(window.localStorage);
    return stored && stored.selectedPlanId === planId ? stored : null;
  }

  function renderRoute() {
    if (!savedPlans) return;
    const secondary = state.route.name !== "home";
    els.homeView.classList.toggle("hidden", secondary);
    els.routePage.classList.toggle("hidden", !secondary);
    document.body.classList.toggle("secondary-route", secondary);
    els.routeLinks.forEach(function (link) {
      if (!link.classList.contains("nav-item")) return;
      const active = state.route.name === "home"
        ? link.dataset.routeLink === "/"
        : state.route.name.indexOf("saved-plan") === 0 && link.dataset.routeLink === "/saved-plans";
      link.classList.toggle("active", active);
    });
    if (!secondary) return;
    if (state.route.name === "saved-plans") {
      renderSavedPlansPage();
      return;
    }
    renderPlanDetailPage();
  }

  function renderSavedPlansPage() {
    const snapshots = savedPlans.listSnapshots(window.localStorage);
    els.routeBreadcrumbCurrent.textContent = "已保存方案";
    els.routeKicker.textContent = "SAVED PLAN LIBRARY";
    els.routeTitle.textContent = "已保存方案";
    els.routeSubtitle.textContent = "每条记录只保存一个完整选中方案，其他候选保持轻量摘要。";
    els.routeActions.innerHTML = "";
    els.routeContent.innerHTML = "";
    setRouteNotice("", "");
    if (!snapshots.length) {
      els.routeContent.className = "route-content empty-state";
      els.routeContent.textContent = "还没有已保存方案。先从工作台生成方案并进入详情保存。";
      return;
    }
    els.routeContent.className = "route-content saved-plan-grid";
    snapshots.forEach(function (snapshot) {
      const card = document.createElement("article");
      card.className = "saved-plan-card";
      const heading = document.createElement("div");
      const kicker = document.createElement("p");
      kicker.className = "section-kicker";
      kicker.textContent = "版本 " + snapshot.version;
      const title = document.createElement("h2");
      title.textContent = snapshot.selectedPlan.name;
      const summary = document.createElement("p");
      summary.textContent = [
        snapshot.selectedPlan.durationText,
        snapshot.selectedPlan.budgetText,
        new Date(snapshot.savedAt).toLocaleString("zh-CN"),
      ].filter(Boolean).join(" · ");
      const tags = document.createElement("div");
      tags.className = "chip-row";
      tags.append(
        makeTag(snapshot.selectedPlan.cards.length + " 张卡片", "blue"),
        makeTag(snapshot.candidateSummaries.length + " 个候选摘要"),
        makeTag((snapshot.selectedPlan.lockedRefs || []).length + " 个执行锁定", "amber")
      );
      heading.append(kicker, title, summary, tags);
      const open = document.createElement("button");
      open.type = "button";
      open.className = "secondary-btn";
      open.textContent = "打开已保存方案";
      open.addEventListener("click", function () {
        navigateTo("/saved-plans/" + encodeURIComponent(snapshot.snapshotId));
      });
      card.append(heading, open);
      els.routeContent.appendChild(card);
    });
  }

  function loadSavedDetailWorkspace(snapshot) {
    const stored = savedPlans.loadSnapshotWorkspace(window.localStorage, snapshot.snapshotId);
    if (stored) return stored;
    return savedPlans.reopenSnapshot(snapshot, null);
  }

  function renderPlanDetailPage() {
    let snapshot = null;
    if (state.route.name === "plan-detail") {
      state.detailWorkspace = restoreDetailWorkspace(state.route.planId);
    } else {
      snapshot = savedPlans.getSnapshot(window.localStorage, state.route.snapshotId);
      if (snapshot && (!state.detailWorkspace || state.detailWorkspace.sourceSnapshotId !== snapshot.snapshotId)) {
        state.detailWorkspace = loadSavedDetailWorkspace(snapshot);
      }
    }

    const workspace = state.detailWorkspace;
    els.routeContent.className = "route-content";
    els.routeContent.innerHTML = "";
    els.routeActions.innerHTML = "";
    state.detailCandidate = null;

    if (!workspace || (!workspace.result && !snapshot)) {
      els.routeBreadcrumbCurrent.textContent = "方案不可用";
      els.routeTitle.textContent = "未找到稳定方案";
      els.routeSubtitle.textContent = "当前地址没有可恢复的本地方案数据。";
      setRouteNotice("已保留现有已保存记录，没有覆盖任何方案。", "warning");
      return;
    }

    const isSaved = state.route.name === "saved-plan-detail";
    const plan = workspace.result && workspace.result.plans.find(function (item) {
      return item.id === workspace.selectedPlanId;
    });
    const selected = workspace.selectedPayload;
    els.routeBreadcrumbCurrent.textContent = isSaved ? "已保存方案详情" : "行程详情";
    els.routeKicker.textContent = isSaved ? "SAVED PLAN SNAPSHOT" : "PLAN DETAIL";
    els.routeTitle.textContent = plan ? plan.name : selected.name;
    els.routeSubtitle.textContent = isSaved
      ? "按执行状态恢复。模拟状态变化只会进入当前编辑副本，不会自动覆盖快照。"
      : "活动、餐厅、交通和时间块支持局部调整；未影响引用保持稳定。";

    const listButton = document.createElement("button");
    listButton.type = "button";
    listButton.className = "ghost-btn";
    listButton.textContent = "已保存方案";
    listButton.addEventListener("click", function () { navigateTo("/saved-plans"); });
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "primary-btn";
    saveButton.textContent = isSaved && !workspace.dirty ? "另存为新快照" : "保存方案";
    saveButton.addEventListener("click", saveCurrentDetail);
    els.routeActions.append(listButton, saveButton);

    if (workspace.dirty) {
      setRouteNotice("版本 " + workspace.context.version + " 有未保存调整。已保留调整前稳定快照，可撤销本次调整。", "warning");
    } else {
      setRouteNotice("当前为稳定版本 " + workspace.context.version + "。外部商家、库存、支付和订座状态均为 Mock。", "success");
    }

    els.routeContent.appendChild(createDetailLifecyclePanel(workspace, isSaved));
    if (plan) {
      els.routeContent.appendChild(createDetailReplanControls(workspace, plan));
      const planCard = createPlanCard(plan);
      planCard.classList.add("detail-plan-card");
      els.routeContent.appendChild(planCard);
    } else {
      els.routeContent.appendChild(createSnapshotFallbackCard(selected));
    }
    if (selected.executionSummary) {
      els.routeContent.appendChild(createReopenPolicyPanel(workspace));
    }
  }

  function createDetailLifecyclePanel(workspace, isSaved) {
    const panel = document.createElement("section");
    panel.className = "detail-lifecycle-panel";
    const summary = document.createElement("div");
    const title = document.createElement("h2");
    title.textContent = "方案生命周期";
    const text = document.createElement("p");
    text.textContent = isSaved
      ? "已从快照恢复。成功步骤保持只读，其余步骤按 reopenPolicy 处理。"
      : "当前详情以稳定方案为基线，局部提交会生成新版本。";
    const tags = document.createElement("div");
    tags.className = "chip-row";
    tags.append(
      makeTag("版本 " + workspace.context.version, "blue"),
      makeTag(workspace.dirty ? "未保存" : "已稳定", workspace.dirty ? "amber" : "green"),
      makeTag((workspace.selectedPayload.lockedRefs || []).length + " 个锁定区块")
    );
    summary.append(title, text, tags);
    const actions = document.createElement("div");
    actions.className = "detail-inline-actions";
    if (workspace.undoWorkspace) {
      const undo = document.createElement("button");
      undo.type = "button";
      undo.className = "ghost-btn";
      undo.textContent = "撤销本次调整";
      undo.addEventListener("click", undoDetailAdjustment);
      actions.appendChild(undo);
    }
    if (workspace.lastChange) {
      const diff = document.createElement("span");
      diff.className = "change-diff";
      diff.textContent = "变更：" + workspace.lastChange.label;
      actions.appendChild(diff);
    }
    panel.append(summary, actions);
    return panel;
  }

  function createDetailReplanControls(workspace, plan) {
    const section = document.createElement("section");
    section.className = "detail-replan-section";
    const heading = document.createElement("div");
    heading.className = "section-heading";
    heading.innerHTML = "<div><p class=\"section-kicker\">局部重排</p><h2>只调整受影响区块</h2></div>";
    const grid = document.createElement("div");
    grid.className = "detail-replan-grid";
    [
      ["activity", "活动", 0],
      ["restaurant", "餐厅", 0],
      ["transport", "第一段交通", 0],
      ["transport", "第二段交通", 1],
    ].forEach(function (entry) {
      const card = createReplanControlCard(workspace, entry[0], entry[1], entry[2]);
      grid.appendChild(card);
    });
    const timeline = document.createElement("article");
    timeline.className = "replan-control-card timeline-control";
    const timelineTitle = document.createElement("h3");
    timelineTitle.textContent = "时间块";
    const timelineText = document.createElement("p");
    timelineText.textContent = "后移某个时间块时，只重算该节点及后续时间。";
    const timelineActions = document.createElement("div");
    timelineActions.className = "timeline-adjust-actions";
    plan.timeline.forEach(function (item, index) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ghost-btn";
      button.textContent = item.time + " " + item.title + " 后移 15 分钟";
      button.addEventListener("click", function () {
        commitTimelineAdjustment(index);
      });
      timelineActions.appendChild(button);
    });
    timeline.append(timelineTitle, timelineText, timelineActions);
    grid.appendChild(timeline);
    section.append(heading, grid);
    return section;
  }

  function createReplanControlCard(workspace, type, label, segmentIndex) {
    const card = document.createElement("article");
    card.className = "replan-control-card";
    const targetCard = (workspace.selectedPayload.cards || []).find(function (item) {
      return item.type === type && (type !== "transport" ||
        Number(item.meta && item.meta.segmentIndex || 0) === segmentIndex);
    });
    const locked = targetCard && savedPlans.isRefLocked(
      { selectedPlan: workspace.selectedPayload },
      targetCard.entityRef
    );
    const title = document.createElement("h3");
    title.textContent = label;
    const text = document.createElement("p");
    text.textContent = locked
      ? "该区块已模拟执行成功，按契约只读锁定。"
      : "先预览稳定候选及时间、预算、风险影响，再显式采用。";
    const button = document.createElement("button");
    button.type = "button";
    button.className = locked ? "ghost-btn" : "secondary-btn";
    button.disabled = Boolean(locked);
    button.textContent = locked ? "已锁定" : "预览下一个候选";
    button.addEventListener("click", function () {
      previewDetailCandidate(type, segmentIndex, label);
    });
    card.append(title, text, button);
    return card;
  }

  function previewDetailCandidate(type, segmentIndex, label) {
    const workspace = state.detailWorkspace;
    if (!workspace || !workspace.result || !candidateRuntime) return;
    const key = workspace.selectedPlanId + ":" + type + (type === "transport" ? ":" + segmentIndex : "");
    let switcher = candidateRuntime.create(workspace.result, {
      key: key,
      planId: workspace.selectedPlanId,
      blockType: type,
      segmentIndex: segmentIndex,
    });
    if (!switcher || switcher.candidates.length < 2) {
      setRouteNotice("没有可用的稳定候选，已保留当前方案。", "warning");
      return;
    }
    switcher = candidateRuntime.move(switcher, "next");
    const preview = candidateRuntime.preview(workspace.result, switcher);
    state.detailCandidate = {
      switcher: switcher,
      preview: preview,
      type: type,
      segmentIndex: segmentIndex,
      label: label,
      expectedVersion: workspace.context.version,
    };
    renderDetailCandidatePreview();
  }

  function renderDetailCandidatePreview() {
    const pending = state.detailCandidate;
    if (!pending) return;
    const old = els.routeContent.querySelector(".detail-preview-panel");
    if (old) old.remove();
    const panel = document.createElement("section");
    panel.className = "detail-preview-panel";
    const content = document.createElement("div");
    const title = document.createElement("h2");
    title.textContent = pending.label + "候选预览";
    const text = document.createElement("p");
    text.textContent = pending.preview.candidate.name + "。预览不会修改 Main 或已保存快照。";
    const impacts = document.createElement("div");
    impacts.className = "chip-row";
    impacts.append(
      makeTag("时间 " + formatSigned(pending.preview.impact.timeDeltaMinutes) + " 分钟", "blue"),
      makeTag("预算 " + formatSigned(pending.preview.impact.budgetDelta) + " 元"),
      makeTag("风险 " + pending.preview.impact.riskDelta, "amber")
    );
    content.append(title, text, impacts);
    const actions = document.createElement("div");
    actions.className = "detail-inline-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "ghost-btn";
    cancel.textContent = "取消预览";
    cancel.addEventListener("click", function () {
      state.detailCandidate = null;
      panel.remove();
    });
    const adopt = document.createElement("button");
    adopt.type = "button";
    adopt.className = "primary-btn";
    adopt.textContent = "采用并生成新版本";
    adopt.addEventListener("click", commitDetailCandidate);
    actions.append(cancel, adopt);
    panel.append(content, actions);
    const controls = els.routeContent.querySelector(".detail-replan-section");
    els.routeContent.insertBefore(panel, controls);
  }

  function formatSigned(value) {
    const number = Number(value || 0);
    return number > 0 ? "+" + number : String(number);
  }

  function commitDetailCandidate() {
    const pending = state.detailCandidate;
    const workspace = state.detailWorkspace;
    if (!pending || !workspace) return;
    if (pending.expectedVersion !== workspace.context.version) {
      setRouteNotice("版本已变化，未覆盖当前稳定方案。请重新预览候选。", "warning");
      state.detailCandidate = null;
      return;
    }
    const outcome = candidateRuntime.commit(workspace.result, pending.switcher, pending.switcher.currentIndex);
    if (!outcome.ok) {
      setRouteNotice("重排校验失败，已保留最后稳定方案。", "warning");
      return;
    }
    const nextContext = cloneValue(workspace.context);
    nextContext.version += 1;
    const nextPayload = createLifecyclePayload(outcome.result, nextContext);
    const nextSelected = savedPlans.collectSelectedPayload(nextPayload, workspace.selectedPlanId);
    const commit = savedPlans.commitPayloadReplan(
      workspace,
      outcome.result,
      nextSelected,
      { type: pending.type, segmentIndex: pending.segmentIndex, expectedVersion: pending.expectedVersion },
      pending.label + "调整为 " + pending.preview.candidate.name
    );
    if (!commit.ok) {
      setRouteNotice(
        commit.error === "locked_success_block"
          ? "该区块已模拟执行成功，不能重排。"
          : "重排失败，已保留最后稳定方案。",
        "warning"
      );
      return;
    }
    state.detailWorkspace = commit.workspace;
    state.detailCandidate = null;
    persistDetailWorkspace();
    renderPlanDetailPage();
  }

  function commitTimelineAdjustment(index) {
    const outcome = savedPlans.commitTimelineShift(state.detailWorkspace, index, 15);
    if (!outcome.ok) {
      setRouteNotice(
        outcome.error === "locked_success_block"
          ? "该时间块关联区块已模拟执行成功，不能调整。"
          : "时间重排失败，已保留最后稳定方案。",
        "warning"
      );
      return;
    }
    state.detailWorkspace = outcome.workspace;
    persistDetailWorkspace();
    renderPlanDetailPage();
  }

  function undoDetailAdjustment() {
    const outcome = savedPlans.undoLatest(state.detailWorkspace);
    if (!outcome.ok) return;
    state.detailWorkspace = outcome.workspace;
    persistDetailWorkspace();
    renderPlanDetailPage();
  }

  function saveCurrentDetail() {
    const workspace = state.detailWorkspace;
    if (!workspace) return;
    const snapshot = savedPlans.buildSnapshotFromWorkspace(workspace);
    savedPlans.storeSnapshot(window.localStorage, snapshot);
    const storedWorkspace = cloneValue(workspace);
    storedWorkspace.sourceSnapshotId = snapshot.snapshotId;
    storedWorkspace.dirty = false;
    storedWorkspace.undoWorkspace = null;
    storedWorkspace.lastChange = null;
    savedPlans.storeSnapshotWorkspace(window.localStorage, snapshot.snapshotId, storedWorkspace);
    state.detailWorkspace = storedWorkspace;
    savedPlans.saveWorkspace(window.localStorage, storedWorkspace);
    navigateTo("/saved-plans/" + encodeURIComponent(snapshot.snapshotId));
  }

  function createSnapshotFallbackCard(selected) {
    const card = document.createElement("article");
    card.className = "plan-card snapshot-fallback-card";
    const body = document.createElement("div");
    body.className = "v5-plan-body";
    const title = document.createElement("h2");
    title.textContent = selected.name;
    const summary = document.createElement("p");
    summary.textContent = [selected.durationText, selected.budgetText].filter(Boolean).join(" · ");
    const grid = document.createElement("div");
    grid.className = "v5-block-grid";
    (selected.cards || []).filter(function (item) {
      return ["activity", "restaurant", "transport"].indexOf(item.type) >= 0;
    }).forEach(function (item) {
      grid.appendChild(createInfoBox(item.type, item.title, [item.summaryText]));
    });
    body.append(title, summary, grid);
    card.appendChild(body);
    return card;
  }

  function createReopenPolicyPanel(workspace) {
    const panel = document.createElement("section");
    panel.className = "reopen-policy-panel";
    const heading = document.createElement("div");
    heading.className = "section-heading";
    heading.innerHTML = "<div><p class=\"section-kicker\">恢复策略</p><h2>按执行步骤恢复</h2></div>";
    const list = document.createElement("div");
    list.className = "reopen-step-list";
    workspace.selectedPayload.executionSummary.steps.forEach(function (step) {
      const row = document.createElement("article");
      row.className = "reopen-step " + step.status;
      const content = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = step.title;
      const behavior = document.createElement("p");
      behavior.textContent = reopenBehaviorLabel(savedPlans.getReopenBehavior(step.status));
      content.append(title, behavior);
      const action = document.createElement("button");
      action.type = "button";
      action.className = "ghost-btn";
      action.disabled = step.status === "success";
      action.textContent = step.status === "success" ? "执行快照只读" : reopenActionLabel(step.status);
      action.addEventListener("click", function () {
        requestMockRefresh(step);
      });
      row.append(content, makeTag(step.status, step.status === "success" ? "green" : "amber"), action);
      list.appendChild(row);
    });
    panel.append(heading, list);
    return panel;
  }

  function reopenBehaviorLabel(behavior) {
    const labels = {
      readonly_execution_snapshot: "保留执行时价格、时间和结果，只读锁定。",
      refresh_latest_mock_state: "可刷新最新 Mock 状态，确认后进入编辑副本。",
      refresh_and_offer_alternative: "刷新 Mock 状态，并允许选择替代候选。",
      allow_replan: "允许重新规划该未执行区块。",
      preserve_and_allow_manual_refresh: "保留原信息，可手动刷新 Mock 状态。",
    };
    return labels[behavior] || "保留当前稳定状态。";
  }

  function reopenActionLabel(status) {
    if (status === "failed_recoverable") return "刷新并查看替代";
    if (status === "cancelled") return "重新规划";
    return "刷新 Mock 状态";
  }

  function requestMockRefresh(step) {
    if (step.status === "success") return;
    state.pendingMockRefresh = cloneValue(step);
    els.refreshConfirmCopy.textContent =
      "此操作不会覆盖已保存快照，只会把“" + step.title + "”的模拟刷新结果应用到当前编辑副本，并标记为未保存。";
    openModal(els.refreshConfirmModal, els.refreshConfirmApply);
  }

  function applyConfirmedMockRefresh() {
    const pending = state.pendingMockRefresh;
    const workspace = state.detailWorkspace;
    if (!pending || !workspace || !workspace.selectedPayload.executionSummary) return;
    const next = cloneValue(workspace);
    next.undoWorkspace = cloneValue(workspace);
    const step = next.selectedPayload.executionSummary.steps.find(function (item) {
      return item.stepId === pending.stepId;
    });
    if (!step) return;
    step.mockResult = Object.assign({}, step.mockResult, {
      refreshedAt: new Date().toISOString(),
      userConfirmed: true,
    });
    if (step.status === "failed_recoverable") step.status = "pending";
    next.context.version += 1;
    next.selectedPayload.planRef.version = next.context.version;
    next.dirty = true;
    next.lastChange = { type: "mock_refresh", label: step.title + "已确认刷新", affectedRefs: [step.targetRef] };
    state.detailWorkspace = next;
    state.pendingMockRefresh = null;
    closeModal(els.refreshConfirmModal);
    persistDetailWorkspace();
    renderPlanDetailPage();
  }

  async function runPlanning(options) {
    const opts = options || {};
    state.input = els.input.value.trim();
    if (!state.input) return;
    if (opts.resetOverrides) state.overrides = {};
    state.executedActions = [];
    state.feedbackStatus = "";
    state.memoryCandidate = null;
    state.memoryDecision = null;
    setPlanningBusy(true);
    const baseOverrides = Object.assign({}, state.overrides);
    const intentResult = await requestIntent(state.input, baseOverrides);
    state.intentMeta = intentResult.meta;
    state.overrides = Object.assign({}, baseOverrides, intentResult.overrides);
    state.result = core.planRequest(state.input, state.overrides);
    state.selectedPlanId = state.result.recommendedPlanId;
    state.v5CandidateSwitchers = {};
    await prepareV5Payload();
    setPlanningBusy(false);
    render();
  }

  function applyReplanEvent(eventId) {
    if (!state.result || state.result.needsClarification) return;
    state.overrides.replanEvent = eventId;
    state.executedActions = [];
    state.result = core.planRequest(state.input, state.overrides);
    state.selectedPlanId = state.result.recommendedPlanId;
    render();
  }

  function answerClarification(key, value) {
    state.overrides[key] = value;
    if (Array.isArray(state.overrides.missingFields)) {
      state.overrides.missingFields = state.overrides.missingFields.filter(function (item) {
        return item !== key;
      });
    }
    state.result = core.planRequest(state.input, state.overrides);
    state.selectedPlanId = state.result.recommendedPlanId;
    refreshV5FromLegacy("soft_prompt_answered");
    render();
  }

  function createV5Context() {
    if (state.v5Context) return state.v5Context;
    const makeUuid = function () {
      if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
      }
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (char) {
        const random = Math.floor(Math.random() * 16);
        const value = char === "x" ? random : (random & 0x3) | 0x8;
        return value.toString(16);
      });
    };
    state.v5Context = {
      requestId: makeUuid(),
      sessionId: makeUuid(),
      lineageId: makeUuid(),
      version: 1,
    };
    return state.v5Context;
  }

  async function prepareV5Payload() {
    state.v5Payload = null;
    state.v5Notice = "";
    if (!v5Flags.v5GenerativeUI || !v5Contract || !v5Adapter || !v5Renderer) return;

    const context = createV5Context();
    try {
      const backendPayload = await requestGenerativePlan(context);
      const validation = v5Contract.validatePayload(backendPayload);
      if (!validation.valid) throw new Error("schema_validation_failed");
      const supportsCandidateSwitcher = (backendPayload.cards || []).some(function (card) {
        return card.meta && card.meta.switcherKey;
      });
      if (!supportsCandidateSwitcher) throw new Error("candidate_switcher_unavailable");
      state.v5Payload = backendPayload;
      decorateCandidateSwitchers();
      state.v5Notice = backendPayload.source === "backend_planned" ? "V5 后端规划" : "V5 契约卡片";
      return;
    } catch (error) {
      if (!v5Flags.adapterFallback) {
        state.v5Notice = "V5 暂不可用，已保留原方案";
        return;
      }
    }
    refreshV5FromLegacy("backend_unavailable");
  }

  async function requestGenerativePlan(context) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(function () { controller.abort(); }, 6000) : null;
    try {
      const response = await fetch("/api/generative-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: context.requestId,
          sessionId: context.sessionId,
          lineageId: context.lineageId,
          version: context.version,
          input: state.input,
          overrides: state.overrides,
          featureFlags: v5Flags,
          fallbackMode: "auto",
        }),
        signal: controller ? controller.signal : undefined,
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function refreshV5FromLegacy(reason) {
    if (!v5Flags.v5GenerativeUI || !v5Adapter || !state.result) return;
    const context = createV5Context();
    context.version += 1;
    state.v5Payload = v5Adapter.adaptAgentCoreResult(state.result, context);
    decorateCandidateSwitchers();
    const validation = v5Contract.validatePayload(state.v5Payload);
    if (!validation.valid) {
      state.v5Payload = null;
      state.v5Notice = "V5 契约校验未通过，已切回兼容视图";
      return;
    }
    state.v5Notice = reason === "backend_unavailable"
      ? "已切换到稳定生成模式"
      : "V5 本地契约卡片";
  }

  function cloneValue(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function ensureCandidateSwitcher(meta) {
    if (!candidateRuntime || !state.result || !meta || !meta.switcherKey) return null;
    if (!state.v5CandidateSwitchers[meta.switcherKey]) {
      state.v5CandidateSwitchers[meta.switcherKey] = candidateRuntime.create(state.result, {
        key: meta.switcherKey,
        planId: meta.legacyPlanId,
        blockType: meta.blockType,
        segmentIndex: meta.segmentIndex || 0,
      });
    }
    return state.v5CandidateSwitchers[meta.switcherKey];
  }

  function setActionStatus(action, enabled, reason) {
    action.status = enabled ? "enabled" : "disabled";
    action.disabledReason = enabled ? null : reason;
  }

  function decorateCandidateSwitchers() {
    if (!state.v5Payload || !candidateRuntime || !state.result) return;
    const actionMap = new Map((state.v5Payload.actions || []).map(function (action) {
      return [action.id, action];
    }));
    (state.v5Payload.cards || []).filter(function (card) {
      return card.type === "activity" || card.type === "restaurant" || card.type === "transport";
    }).forEach(function (card) {
      const switcher = ensureCandidateSwitcher(card.meta || {});
      if (!switcher) return;
      const preview = candidateRuntime.preview(state.result, switcher);
      if (!preview) return;
      const candidate = preview.candidate;
      card.title = candidate.name || card.title;
      if (card.type === "activity") {
        card.summaryText = [candidate.type, candidate.distance, candidate.price].filter(Boolean).join(" · ");
        Object.assign(card.meta, {
          activityType: candidate.type,
          distanceText: candidate.distance,
          priceText: candidate.price,
          selectedSlot: candidate.selectedSlot,
          tags: candidate.tags || [],
        });
      } else if (card.type === "restaurant") {
        card.summaryText = [candidate.cuisine, candidate.distance, candidate.price, candidate.wait].filter(Boolean).join(" · ");
        Object.assign(card.meta, {
          cuisine: candidate.cuisine,
          distanceText: candidate.distance,
          priceText: candidate.price,
          waitText: candidate.wait,
          selectedSlot: candidate.selectedSlot,
          tags: candidate.tags || [],
        });
      } else {
        card.summaryText = candidate.name;
        Object.assign(card.meta, {
          routeLabel: (card.meta.segmentIndex === 0 ? "出发地 → 活动" : "活动 → 餐厅"),
          modeLabel: candidate.mode,
          durationText: candidate.durationMinutes + " 分钟",
          budgetText: candidate.budget ? "约 " + candidate.budget + " 元" : "无需额外交通费",
        });
      }
      card.meta.candidateSwitcher = {
        currentIndex: switcher.currentIndex,
        candidateCount: switcher.candidates.length,
        originalCandidateId: switcher.originalCandidateId,
        adoptedCandidateId: switcher.adoptedCandidateId,
        previewStatus: switcher.previewStatus,
        impact: preview.impact,
        affectedTimeline: (preview.affectedTimeline || []).map(function (item) {
          return { time: item.time, title: item.title };
        }),
      };
      (card.actions || []).forEach(function (ref) {
        const action = actionMap.get(ref.actionId);
        if (!action) return;
        if (action.type === "preview_previous_candidate") {
          setActionStatus(action, switcher.currentIndex > 0, "已经是第一个候选");
        }
        if (action.type === "preview_next_candidate") {
          setActionStatus(action, switcher.currentIndex < switcher.candidates.length - 1, "已到最后一个候选");
        }
        if (action.type === "adopt_preview_candidate") {
          const current = switcher.candidates[switcher.currentIndex];
          setActionStatus(
            action,
            Boolean(current && current.id !== switcher.originalCandidateId && current.id !== switcher.adoptedCandidateId),
            "请选择尚未采用的替代候选"
          );
        }
        if (action.type === "restore_original_candidate") {
          setActionStatus(
            action,
            switcher.currentIndex !== 0 || Boolean(switcher.adoptedCandidateId),
            "当前就是原方案"
          );
        }
        if (action.type === "undo_candidate_adoption") {
          setActionStatus(action, switcher.canUndo, "暂无可撤销的采用");
        }
      });
    });
  }

  function applyCandidateAction(action) {
    if (!state.result || state.result.needsClarification || !v5Flags.localReplan || !candidateRuntime) return;
    const meta = action.meta || {};
    const switcher = ensureCandidateSwitcher(meta);
    if (!switcher) return;

    if (action.type === "preview_previous_candidate" || action.type === "preview_next_candidate" || action.type === "refresh_block") {
      const direction = action.type === "preview_previous_candidate" ? "previous" : "next";
      state.v5CandidateSwitchers[switcher.key] = candidateRuntime.move(switcher, direction);
      refreshV5FromLegacy("candidate_preview");
      state.v5Notice = "正在预览候选，Main 方案尚未修改";
      render();
      return;
    }

    let outcome;
    if (action.type === "adopt_preview_candidate") {
      outcome = candidateRuntime.commit(state.result, switcher, switcher.currentIndex);
    }
    if (action.type === "restore_original_candidate") {
      outcome = candidateRuntime.commit(state.result, switcher, 0);
    }
    if (action.type === "undo_candidate_adoption") {
      outcome = candidateRuntime.undo(state.result, switcher);
    }
    if (!outcome || !outcome.ok) {
      state.v5Notice = "候选操作失败，已保留当前方案";
      render();
      return;
    }

    state.lastStableResult = cloneValue(state.result);
    state.result = outcome.result;
    state.v5CandidateSwitchers[switcher.key] = outcome.switcher;
    state.selectedPlanId = switcher.planId;
    state.executedActions = [];
    refreshV5FromLegacy("candidate_committed");
    state.v5Notice = action.type === "undo_candidate_adoption"
      ? "已撤销最近一次采用"
      : action.type === "restore_original_candidate"
        ? "已恢复原方案，并重新校验时间、预算和风险"
        : "已采用候选，并重新校验时间、预算和风险";
    render();
  }

  function editV5Assumption(action) {
    const meta = action.meta || {};
    const labelMap = { partySize: "人数", budgetPerPerson: "人均预算", area: "区域" };
    state.pendingAssumptionAction = action;
    els.assumptionTitle.textContent = "修改" + (labelMap[meta.assumptionKey] || "默认信息");
    els.assumptionInput.value = meta.currentValue === undefined ? "" : meta.currentValue;
    els.assumptionInput.inputMode = meta.assumptionKey === "partySize" || meta.assumptionKey === "budgetPerPerson"
      ? "numeric"
      : "text";
    els.assumptionError.textContent = "";
    openModal(els.assumptionModal, els.assumptionInput);
  }

  function saveV5Assumption() {
    const action = state.pendingAssumptionAction;
    if (!action) return;
    const meta = action.meta || {};
    const value = els.assumptionInput.value.trim();
    if (!value) {
      els.assumptionError.textContent = "请输入一个有效值。";
      return;
    }
    if (meta.assumptionKey === "partySize" || meta.assumptionKey === "budgetPerPerson") {
      const number = Number(value);
      if (!Number.isFinite(number) || number <= 0) {
        els.assumptionError.textContent = "请输入大于 0 的数字。";
        return;
      }
      state.overrides[meta.assumptionKey] = number;
    } else if (meta.assumptionKey === "area") {
      state.overrides.location = String(value).trim();
    }
    state.result = core.planRequest(state.input, state.overrides);
    state.selectedPlanId = state.result.recommendedPlanId;
    state.executedActions = [];
    refreshV5FromLegacy("assumption_edited");
    closeModal(els.assumptionModal);
    render();
  }

  function openRiskModal(planCard) {
    if (!els.riskModal || !els.riskContent) return;
    els.riskContent.innerHTML = "";
    const risks = [];
    if (planCard.riskText) risks.push({ title: "需要留意", text: planCard.riskText });
    if (planCard.reasonText) risks.push({ title: "推荐判断", text: planCard.reasonText });
    (planCard.evidenceItems || []).forEach(function (item, index) {
      risks.push({ title: "校验依据 " + (index + 1), text: item });
    });
    if (!risks.length) risks.push({ title: "当前状态", text: "暂未发现需要额外确认的风险。" });
    risks.forEach(function (risk) {
      const item = document.createElement("article");
      item.className = "risk-item";
      const icon = document.createElement("span");
      icon.className = "material-symbols-rounded";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "verified_user";
      const content = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = risk.title;
      const text = document.createElement("p");
      text.textContent = risk.text;
      content.append(title, text);
      item.append(icon, content);
      els.riskContent.appendChild(item);
    });
    openModal(els.riskModal);
  }

  function handleV5Action(action) {
    if (!v5Contract.isExecutableAction(action)) return;
    if (action.type === "select_plan") {
      const legacyPlanId = action.meta && action.meta.legacyPlanId;
      if (legacyPlanId) {
        selectPlan(legacyPlanId);
        refreshV5FromLegacy("plan_selected");
      } else if (state.v5Payload) {
        const selectedId = action.targetRef.id;
        state.v5Payload.cards.forEach(function (card) {
          if (card.type === "plan_summary") {
            card.status = card.entityRef && card.entityRef.id === selectedId ? "selected" : "ready";
          }
        });
        state.v5Payload.entities.forEach(function (entity) {
          if (entity.kind === "plan") entity.status = entity.id === selectedId ? "selected" : "ready";
        });
        state.v5Payload.runtimeSummary.activePlanRef = action.targetRef;
      }
      render();
      return;
    }
    if (action.type === "answer_soft_prompt") {
      answerClarification(action.meta.clarificationKey, action.meta.clarificationValue);
      return;
    }
    if ([
      "refresh_block",
      "preview_previous_candidate",
      "preview_next_candidate",
      "adopt_preview_candidate",
      "restore_original_candidate",
      "undo_candidate_adoption",
    ].indexOf(action.type) >= 0) {
      applyCandidateAction(action);
      return;
    }
    if (action.type === "edit_assumption") {
      editV5Assumption(action);
    }
  }

  async function requestIntent(input, overrides) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(function () { controller.abort(); }, 9000) : null;
    try {
      const response = await fetch("/api/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: input, overrides: overrides || {} }),
        signal: controller ? controller.signal : undefined,
      });
      if (timer) clearTimeout(timer);
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      return buildIntentOverrides(data);
    } catch (error) {
      if (timer) clearTimeout(timer);
      return {
        overrides: { intentFallbackReason: "后端或 LLM 不可用，已回退本地规则" },
        meta: { source: "local_rules", label: "本地规则兜底", reason: error.message || String(error) },
      };
    }
  }

  function buildIntentOverrides(data) {
    if (!data || !data.ok || data.source !== "llm" || !data.intent) {
      const reason = data && data.error ? data.error : "LLM 未返回可用结果";
      return {
        overrides: { intentFallbackReason: reason },
        meta: { source: data && data.source ? data.source : "local_rules", label: "本地规则兜底", reason: reason },
      };
    }

    const intent = data.intent;
    const confidence = Number(intent.confidence || 0);
    if (confidence < 0.72) {
      return {
        overrides: { intentFallbackReason: "LLM 置信度低于阈值，已回退本地规则" },
        meta: { source: "low_confidence", label: "低置信度追问", confidence: confidence, reason: intent.reasoningSummary || "" },
      };
    }

    const overrides = {
      intentSource: "llm",
      intentConfidence: confidence,
      intentReasoningSummary: intent.reasoningSummary || "",
      lessonsUsed: data.lessonsUsed || [],
      preferences: intent.preferences || [],
      missingFields: intent.missingFields || [],
    };
    if (intent.groupType && intent.groupType !== "unknown") overrides.groupType = intent.groupType;
    if (intent.timePreset && intent.timePreset !== "unknown") overrides.timePreset = intent.timePreset;
    if (intent.partySize) overrides.partySize = intent.partySize;
    if (intent.childAge) overrides.childAge = intent.childAge;
    if (intent.budgetPerPerson) overrides.budgetPerPerson = intent.budgetPerPerson;

    return {
      overrides: overrides,
      meta: { source: "llm", label: "LLM 识别", confidence: confidence, lessonsUsed: data.lessonsUsed || [] },
    };
  }

  async function submitFeedback() {
    if (!state.input || !els.feedbackInput) return;
    const text = els.feedbackInput.value.trim();
    if (!text) {
      state.feedbackStatus = "请先写一句纠错或反馈。";
      renderFeedback();
      return;
    }
    state.feedbackStatus = "正在写入复盘记忆...";
    renderFeedback();
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: state.input,
          llmIntent: state.result ? state.result.parsed : null,
          userCorrection: text,
          failureType: "user_correction",
        }),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      state.feedbackStatus = data.message || "已生成待确认记忆候选。";
      state.memoryCandidate = data.candidate || null;
      state.memoryDecision = null;
      els.feedbackInput.value = "";
    } catch (error) {
      state.feedbackStatus = "后端不可用，暂未写入：" + (error.message || String(error));
      state.memoryCandidate = null;
      state.memoryDecision = null;
    }
    renderFeedback();
  }

  async function decideMemoryCandidate(action, correctedValue) {
    if (!state.memoryCandidate) return;
    state.feedbackStatus = "正在处理记忆候选...";
    renderFeedback();
    try {
      const response = await fetch("/api/memory-candidates/" + state.memoryCandidate.id + "/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action, correctedValue: correctedValue || null }),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "decision_failed");
      state.memoryDecision = data;
      state.feedbackStatus = action === "ignore" ? "已忽略候选记忆。" : "已采用并写入长期记忆。";
    } catch (error) {
      state.feedbackStatus = "处理失败：" + (error.message || String(error));
    }
    renderFeedback();
  }

  function setPlanningBusy(isBusy) {
    els.generate.disabled = isBusy;
    els.generate.innerHTML = isBusy
      ? '<span class="material-symbols-rounded" aria-hidden="true">progress_activity</span>识别中...'
      : '<span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>生成方案';
  }

  function selectPlan(planId) {
    state.selectedPlanId = planId;
    state.executedActions = [];
    if (els.openSelectedPlan) els.openSelectedPlan.disabled = false;
    renderPlans();
    renderServicePackage();
    renderReplanEvents();
    renderQueue();
    renderFinalSummary();
  }

  function executeSelectedPlan() {
    const plan = getSelectedPlan();
    if (!plan) return;
    const queue = core.createExecutionQueue(plan, state.result.parsed);
    state.executedActions = core.executeActionQueue(queue);
    renderStages();
    renderServicePackage();
    renderQueue();
    renderFinalSummary();
  }

  function resetDemo() {
    els.input.value = samples.weekend;
    state.input = "";
    state.overrides = {};
    state.intentMeta = null;
    state.result = null;
    state.selectedPlanId = null;
    state.executedActions = [];
    state.feedbackStatus = "";
    state.memoryCandidate = null;
    state.memoryDecision = null;
    state.v5Payload = null;
    state.v5Notice = "";
    state.v5Context = null;
    state.v5CandidateSwitchers = {};
    state.lastStableResult = null;
    els.clarification.classList.add("hidden");
    els.understanding.className = "requirements-card empty-state";
    els.understanding.textContent = "输入需求后会展示识别出的时间、同行人、人数和偏好。";
    els.parseStatus.textContent = "等待输入";
    renderStages();
    els.replanEvents.className = "replan-list empty-state";
    els.replanEvents.textContent = "生成方案后可模拟下雨、满座、孩子累了或预算太高。";
    els.servicePackage.className = "service-package empty-state";
    els.servicePackage.textContent = "选择方案后会展示闲时指标、团购套餐和加购动作。";
    els.plans.className = "plan-list empty-state";
    els.plans.textContent = "这里会展示 2-3 个可执行方案。";
    els.planCount.textContent = "0 个";
    els.queue.className = "queue-list empty-state";
    els.queue.textContent = "选择方案后会生成预约、下单、消息和提醒动作。";
    els.queueStatus.textContent = "待选择方案";
    els.execute.disabled = true;
    if (els.openSelectedPlan) els.openSelectedPlan.disabled = true;
    els.resultPanel.classList.add("hidden");
    renderFeedback();
    renderRoute();
  }

  function render() {
    renderStages();
    renderClarification();
    renderUnderstanding();
    renderPlans();
    renderServicePackage();
    renderReplanEvents();
    renderQueue();
    renderFinalSummary();
    renderFeedback();
  }

  function renderStages() {
    if (!els.stages) return;
    els.stages.innerHTML = "";
    stageDefs.forEach(function (stage) {
      const item = document.createElement("div");
      item.className = "stage-item " + getStageState(stage.id);
      const marker = document.createElement("span");
      marker.className = "stage-marker";
      const label = document.createElement("span");
      label.textContent = stage.label;
      item.append(marker, label);
      els.stages.appendChild(item);
    });
  }

  function getStageState(stageId) {
    if (!state.result) {
      return stageId === "understand" ? "active" : "pending";
    }
    if (stageId === "confirm_execute") {
      if (state.executedActions.length) return "done";
      if (state.result.needsClarification) return "pending";
      return getSelectedPlan() ? "active" : "pending";
    }
    const traceStage = state.result.agentLoopTrace && state.result.agentLoopTrace.stages.find(function (stage) {
      return stage.id === stageId;
    });
    if (traceStage) return traceStage.status;
    return "pending";
  }

  function renderClarification() {
    if (state.v5Payload && v5Flags.v5GenerativeUI) {
      els.clarification.classList.add("hidden");
      els.clarification.innerHTML = "";
      return;
    }
    if (!state.result || !state.result.needsClarification) {
      els.clarification.classList.add("hidden");
      els.clarification.innerHTML = "";
      return;
    }

    const clarification = state.result.clarification;
    els.clarification.classList.remove("hidden");
    els.clarification.innerHTML = "";
    const title = document.createElement("h2");
    title.textContent = "需要补充一个关键信息";
    const question = document.createElement("p");
    question.textContent = clarification.question;
    const options = document.createElement("div");
    options.className = "clarify-options";

    clarification.options.forEach(function (option) {
      const button = document.createElement("button");
      button.className = "clarify-btn";
      button.type = "button";
      button.textContent = option.label;
      button.addEventListener("click", function () {
        answerClarification(clarification.key, option.value);
      });
      options.appendChild(button);
    });

    els.clarification.append(title, question, options);
  }

  function renderUnderstanding() {
    if (!state.result) return;
    const parsed = state.result.parsed;
    els.parseStatus.textContent = state.result.needsClarification ? "等待追问" : "已识别";
    els.understanding.className = "requirements-card";
    els.understanding.innerHTML = "";

    const rows = [
      ["识别来源", formatIntentSource(parsed)],
      ["场景", parsed.groupLabel],
      ["人群", parsed.groupSummary],
      ["人数", parsed.partySize ? parsed.partySize + " 人" : "待确认"],
      ["时间", parsed.timeRange.label],
      ["地点", parsed.location],
      ["偏好", parsed.preferenceLabels.length ? parsed.preferenceLabels : ["未明确，按轻松中等预算处理"]],
    ];

    rows.forEach(function (row) {
      els.understanding.appendChild(createKvRow(row[0], row[1]));
    });

    if (parsed.assumptions.length) {
      els.understanding.appendChild(createKvRow("默认", parsed.assumptions));
    }
    if (parsed.warnings.length) {
      els.understanding.appendChild(createKvRow("风险", parsed.warnings, "amber"));
    }
    if (parsed.intentReasoningSummary) {
      els.understanding.appendChild(createKvRow("理解摘要", parsed.intentReasoningSummary));
    }
    if (parsed.lessonsUsed && parsed.lessonsUsed.length) {
      els.understanding.appendChild(createKvRow("参考经验", parsed.lessonsUsed.map(function (lesson) {
        return lesson.lesson;
      }), "green"));
    }
  }

  function formatIntentSource(parsed) {
    if (parsed.intentSource === "llm") {
      return "LLM 识别" + (typeof parsed.intentConfidence === "number" ? "（置信度 " + Math.round(parsed.intentConfidence * 100) + "%）" : "");
    }
    if (state.intentMeta && state.intentMeta.source === "low_confidence") return "低置信度，已回退本地规则";
    return "本地规则兜底";
  }

  function renderFeedback() {
    if (!els.feedbackPanel) return;
    if (els.feedbackStatus) {
      els.feedbackStatus.textContent = state.feedbackStatus || "反馈会先生成候选记忆，采用后才进入长期 SQLite 事实库。";
    }
    if (!els.feedbackLesson) return;
    els.feedbackLesson.innerHTML = "";
    if (!state.memoryCandidate) {
      els.feedbackLesson.classList.add("hidden");
      return;
    }

    els.feedbackLesson.classList.remove("hidden");
    const candidate = state.memoryCandidate;
    const title = document.createElement("strong");
    title.textContent = "建议沉淀：" + candidate.type + " / " + candidate.key;
    const value = document.createElement("p");
    value.textContent = candidate.value;

    const meta = document.createElement("div");
    meta.className = "chip-row";
    meta.append(
      makeTag("敏感级别 " + candidate.sensitivityLevel, candidate.sensitivityLevel === "L0" ? "green" : "amber"),
      makeTag("置信度 " + Math.round(candidate.confidence * 100) + "%", "blue"),
      makeTag(candidate.scope)
    );

    const correction = document.createElement("textarea");
    correction.rows = 2;
    correction.placeholder = "可选：自行更正这条记忆后再采用。";
    correction.value = candidate.value;

    const actions = document.createElement("div");
    actions.className = "memory-actions";
    const adopt = document.createElement("button");
    adopt.type = "button";
    adopt.className = "primary-btn";
    adopt.textContent = state.memoryDecision ? "已处理" : "采用";
    adopt.disabled = Boolean(state.memoryDecision);
    adopt.addEventListener("click", function () {
      decideMemoryCandidate("adopt");
    });

    const ignore = document.createElement("button");
    ignore.type = "button";
    ignore.className = "ghost-btn";
    ignore.textContent = "忽略";
    ignore.disabled = Boolean(state.memoryDecision);
    ignore.addEventListener("click", function () {
      decideMemoryCandidate("ignore");
    });

    const correct = document.createElement("button");
    correct.type = "button";
    correct.className = "ghost-btn";
    correct.textContent = "更正后采用";
    correct.disabled = Boolean(state.memoryDecision);
    correct.addEventListener("click", function () {
      decideMemoryCandidate("correct", correction.value.trim());
    });

    actions.append(adopt, ignore, correct);
    els.feedbackLesson.append(title, value, meta, correction, actions);
  }

  function createKvRow(key, value, tone) {
    const row = document.createElement("div");
    row.className = "kv-row";
    const keyEl = document.createElement("div");
    keyEl.className = "kv-key";
    keyEl.textContent = key;
    const valueEl = document.createElement("div");
    valueEl.className = "kv-value";

    if (Array.isArray(value)) {
      const wrap = document.createElement("div");
      wrap.className = "chip-row";
      value.forEach(function (item) {
        const tag = document.createElement("span");
        tag.className = "tag " + (tone || "blue");
        tag.textContent = item;
        wrap.appendChild(tag);
      });
      valueEl.appendChild(wrap);
    } else {
      valueEl.textContent = value;
    }

    row.append(keyEl, valueEl);
    return row;
  }

  function renderPlans() {
    if (state.v5Payload && v5Flags.v5GenerativeUI && v5Renderer) {
      const result = v5Renderer.render({
        container: els.plans,
        payload: state.v5Payload,
        onAction: handleV5Action,
        onOpenRisk: openRiskModal,
      });
      if (result.rendered) {
        els.planCount.textContent = result.planCount + " 个 · " + state.v5Notice;
        if (els.openSelectedPlan) els.openSelectedPlan.disabled = !getSelectedPlan();
        decoratePlanDetailEntrances();
        return;
      }
      state.v5Payload = null;
      state.v5Notice = "V5 渲染失败，已切回兼容视图";
    }
    const plans = state.result ? state.result.plans : [];
    els.planCount.textContent = plans.length + " 个";
    if (els.openSelectedPlan) els.openSelectedPlan.disabled = !getSelectedPlan();
    if (!plans.length) {
      els.plans.className = "plan-list empty-state";
      els.plans.textContent = state.result && state.result.needsClarification
        ? "回答追问后会继续生成候选方案。"
        : "这里会展示 2-3 个可执行方案。";
      return;
    }

    els.plans.className = "plan-list";
    els.plans.innerHTML = "";
    plans.forEach(function (plan) {
      els.plans.appendChild(createPlanCard(plan));
    });
  }

  function createPlanCard(plan) {
    const card = document.createElement("article");
    card.className = "plan-card" + (plan.id === state.selectedPlanId ? " selected" : "");
    card.dataset.planId = plan.id;

    const head = document.createElement("div");
    head.className = "plan-head";
    const titleWrap = document.createElement("div");
    const title = document.createElement("h2");
    title.textContent = plan.name;
    const meta = document.createElement("div");
    meta.className = "plan-meta";
    meta.append(makeTag(plan.fit, "blue"), makeTag(plan.totalDuration), makeTag(plan.budget));
    if (plan.recommended) meta.append(makeTag("推荐", "green"));
    titleWrap.append(title, meta);

    const score = document.createElement("span");
    score.className = "score-badge";
    score.textContent = plan.score + " 分";
    head.append(titleWrap, score);

    const issueNotices = createIssueNotices(plan.issueNotices || []);

    const grid = document.createElement("div");
    grid.className = "plan-grid";
    grid.append(
      createInfoBox("活动", plan.activity.name, [
        plan.activity.type,
        plan.activity.distance,
        plan.activity.price,
        plan.activity.needsBooking ? (plan.activity.canBook ? "可预约 " + plan.activity.selectedSlot : "暂无可预约时段") : "无需预约",
        plan.activity.tags.join(" / "),
      ]),
      createInfoBox("餐厅", plan.restaurant.name, [
        plan.restaurant.cuisine,
        plan.restaurant.distance,
        plan.restaurant.price,
        "排队 " + plan.restaurant.wait,
        plan.restaurant.canReserve ? "可预约 " + plan.restaurant.selectedSlot : "暂无可预约时段",
        plan.restaurant.tags.join(" / "),
      ])
    );

    const timeline = document.createElement("div");
    timeline.className = "timeline";
    const timelineTitle = document.createElement("h3");
    timelineTitle.textContent = "时间表";
    const timelineList = document.createElement("ol");
    timelineList.className = "timeline-list";
    plan.timeline.forEach(function (item) {
      const row = document.createElement("li");
      row.className = "timeline-item";
      row.innerHTML =
        '<span class="time"></span><div><div class="timeline-title"></div><div class="timeline-detail"></div></div>';
      row.querySelector(".time").textContent = item.time;
      row.querySelector(".timeline-title").textContent = item.title;
      row.querySelector(".timeline-detail").textContent = item.detail;
      timelineList.appendChild(row);
    });
    timeline.append(timelineTitle, timelineList);

    const reasonList = createRecommendationReasons(plan.recommendationReasons || []);
    const scoreDetails = createScoreDetails(plan.scoreDetails || []);

    const riskButton = document.createElement("button");
    riskButton.type = "button";
    riskButton.className = "v5-risk-button";
    riskButton.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">shield</span><span>查看风险校验与推荐依据</span>';
    riskButton.addEventListener("click", function () {
      openRiskModal({
        reasonText: plan.reason,
        riskText: plan.risks.join("；"),
        evidenceItems: plan.recommendationReasons || [],
      });
    });

    const actions = document.createElement("div");
    actions.className = "plan-actions";
    const preview = document.createElement("div");
    preview.className = "chip-row";
    plan.actionsPreview.forEach(function (item) {
      preview.appendChild(makeTag(item, "amber"));
    });
    const select = document.createElement("button");
    select.className = "plan-select-btn";
    select.type = "button";
    select.textContent = plan.id === state.selectedPlanId ? "已选择" : "选择此方案";
    select.addEventListener("click", function () {
      selectPlan(plan.id);
    });
    const detail = document.createElement("button");
    detail.className = "secondary-btn plan-detail-btn";
    detail.type = "button";
    detail.textContent = "查看详情与局部重排";
    detail.addEventListener("click", function () {
      openPlanDetail(plan.id);
    });
    actions.append(preview, detail, select);

    const blocks = [head];
    if (issueNotices) blocks.push(issueNotices);
    blocks.push(grid, timeline);
    if (reasonList) blocks.push(reasonList);
    if (scoreDetails) blocks.push(scoreDetails);
    blocks.push(riskButton, actions);
    card.append.apply(card, blocks);
    return card;
  }

  function decoratePlanDetailEntrances() {
    Array.from(els.plans.querySelectorAll(".plan-card[data-plan-id]")).forEach(function (card) {
      if (card.querySelector(".plan-detail-btn")) return;
      const planId = card.dataset.planId;
      const actions = card.querySelector(".v5-card-actions") || card.querySelector(".plan-actions");
      if (!planId || !actions) return;
      const detail = document.createElement("button");
      detail.type = "button";
      detail.className = "secondary-btn plan-detail-btn";
      detail.textContent = "查看详情与局部重排";
      detail.addEventListener("click", function () {
        openPlanDetail(planId);
      });
      actions.appendChild(detail);
    });
  }

  function createIssueNotices(notices) {
    if (!notices.length) return null;
    const wrap = document.createElement("div");
    wrap.className = "issue-list";
    notices.forEach(function (notice) {
      const item = document.createElement("div");
      item.className = "issue-item " + (notice.tone || "amber");
      const title = document.createElement("strong");
      title.textContent = notice.title;
      const text = document.createElement("span");
      text.textContent = notice.text;
      item.append(title, text);
      wrap.appendChild(item);
    });
    return wrap;
  }

  function createRecommendationReasons(reasons) {
    if (!reasons.length) return null;
    const wrap = document.createElement("div");
    wrap.className = "reason-list";
    const title = document.createElement("h3");
    title.textContent = "关键推荐依据";
    const list = document.createElement("ul");
    reasons.forEach(function (item) {
      const li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    });
    wrap.append(title, list);
    return wrap;
  }

  function createScoreDetails(details) {
    if (!details.length) return null;
    const wrap = document.createElement("div");
    wrap.className = "score-details";
    details.slice(0, 7).forEach(function (detail) {
      const item = document.createElement("div");
      item.className = "score-detail" + (detail.score < 0 ? " penalty" : "");
      const head = document.createElement("div");
      head.className = "score-detail-head";
      const label = document.createElement("span");
      label.textContent = detail.label;
      const value = document.createElement("strong");
      value.textContent = detail.max > 0 ? detail.score + "/" + detail.max : String(detail.score);
      head.append(label, value);
      const summary = document.createElement("p");
      summary.textContent = detail.summary;
      item.append(head, summary);
      wrap.appendChild(item);
    });
    return wrap;
  }

  function createInfoBox(titleText, mainText, facts) {
    const box = document.createElement("div");
    box.className = "info-box";
    const title = document.createElement("h3");
    title.textContent = titleText;
    const main = document.createElement("p");
    main.textContent = mainText;
    const chips = document.createElement("div");
    chips.className = "chip-row";
    facts.filter(Boolean).forEach(function (fact) {
      chips.appendChild(makeTag(fact));
    });
    box.append(title, main, chips);
    return box;
  }

  function makeTag(text, tone) {
    const tag = document.createElement("span");
    tag.className = "tag " + (tone || "");
    tag.textContent = text;
    return tag;
  }

  function renderServicePackage() {
    const plan = getSelectedPlan();
    const pkg = plan && plan.servicePackage;
    if (!pkg) {
      els.servicePackage.className = "service-package empty-state";
      els.servicePackage.textContent = state.result && state.result.needsClarification
        ? "回答追问后才能生成美团服务包。"
        : "选择方案后会展示闲时指标、团购套餐和加购动作。";
      return;
    }

    els.servicePackage.className = "service-package";
    els.servicePackage.innerHTML = "";

    const confirm = document.createElement("div");
    confirm.className = "package-confirm";
    const confirmText = document.createElement("div");
    const confirmTitle = document.createElement("strong");
    confirmTitle.textContent = state.executedActions.length ? "这个安排已确认" : "确认这个安排";
    const confirmDesc = document.createElement("p");
    confirmDesc.textContent = state.executedActions.length
      ? "下面的预约、排队、团购、通知和提醒已按模拟结果推进。"
      : "确认后才会模拟执行预约、排队、团购、通知和提醒。";
    confirmText.append(confirmTitle, confirmDesc);
    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = state.executedActions.length ? "ghost-btn" : "primary-btn";
    confirmButton.textContent = state.executedActions.length ? "已确认" : "确认并执行";
    confirmButton.disabled = Boolean(state.executedActions.length);
    confirmButton.addEventListener("click", function () {
      executeSelectedPlan();
    });
    confirm.append(confirmText, confirmButton);

    const metrics = document.createElement("div");
    metrics.className = "metric-grid";
    [
      ["少排队", pkg.businessMetrics.waitSavedMinutes + " 分钟"],
      ["优惠", pkg.businessMetrics.couponSavings + " 元"],
      ["预算", pkg.businessMetrics.totalBudget + " 元"],
      ["闲时匹配", pkg.businessMetrics.offPeakScore + " 分"],
    ].forEach(function (item) {
      const card = document.createElement("div");
      card.className = "metric-card";
      const label = document.createElement("span");
      label.textContent = item[0];
      const value = document.createElement("strong");
      value.textContent = item[1];
      card.append(label, value);
      metrics.appendChild(card);
    });

    const deal = createPackageBlock("团购套餐", pkg.deal.name, [
      "券后 " + pkg.deal.price + " 元",
      pkg.deal.coupon,
      "原价 " + pkg.deal.originalPrice + " 元",
    ]);
    const addOn = pkg.addOn
      ? createPackageBlock("加购动作", pkg.addOn.name, [
        pkg.addOn.target,
        pkg.addOn.deliveryTime,
        "约 " + pkg.addOn.price + " 元",
      ])
      : null;
    const strategy = createPackageBlock("错峰策略", pkg.offPeakStrategy.isOffPeak ? "已避开高峰" : "接近高峰", [
      pkg.offPeakStrategy.note,
      "用餐时间 " + pkg.offPeakStrategy.diningTime,
      pkg.businessMetrics.summary,
    ]);

    els.servicePackage.append(confirm, metrics, deal);
    if (addOn) els.servicePackage.appendChild(addOn);
    els.servicePackage.appendChild(strategy);
  }

  function createPackageBlock(titleText, mainText, facts) {
    const block = document.createElement("div");
    block.className = "package-block";
    const title = document.createElement("h3");
    title.textContent = titleText;
    const main = document.createElement("p");
    main.textContent = mainText;
    const chips = document.createElement("div");
    chips.className = "chip-row";
    facts.filter(Boolean).forEach(function (fact) {
      chips.appendChild(makeTag(fact, "blue"));
    });
    block.append(title, main, chips);
    return block;
  }

  function renderReplanEvents() {
    const plan = getSelectedPlan();
    const events = plan && plan.servicePackage ? plan.servicePackage.replanEvents : [];
    if (!events.length) {
      els.replanEvents.className = "replan-list empty-state";
      els.replanEvents.textContent = state.result && state.result.needsClarification
        ? "补充关键信息后才能模拟重排。"
        : "生成方案后可模拟下雨、满座、孩子累了或预算太高。";
      return;
    }

    els.replanEvents.className = "replan-list";
    els.replanEvents.innerHTML = "";
    events.forEach(function (event) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "replan-btn" + (event.active ? " active" : "");
      button.innerHTML = '<strong></strong><span></span>';
      button.querySelector("strong").textContent = event.label;
      button.querySelector("span").textContent = event.active ? "已应用：" + event.description : event.description;
      button.addEventListener("click", function () {
        applyReplanEvent(event.id);
      });
      els.replanEvents.appendChild(button);
    });
  }

  function renderQueue() {
    const plan = getSelectedPlan();
    if (!plan) {
      els.queue.className = "queue-list empty-state";
      els.queue.textContent = state.result && state.result.needsClarification
        ? "回答追问后才能生成执行队列。"
        : "选择方案后会生成预约、下单、消息和提醒动作。";
      els.queueStatus.textContent = "待选择方案";
      els.execute.disabled = true;
      return;
    }

    const queue = state.executedActions.length
      ? state.executedActions
      : core.createExecutionQueue(plan, state.result.parsed);

    els.queue.className = "queue-list";
    els.queue.innerHTML = "";
    queue.forEach(function (action) {
      els.queue.appendChild(createQueueCard(action));
    });

    const highImpact = queue.filter(function (action) {
      return action.requiresConfirmation;
    }).length;
    if (state.executedActions.length) {
      const skipped = queue.filter(function (action) { return action.status === "skipped"; }).length;
      const success = queue.filter(function (action) { return action.status === "success"; }).length;
      els.queueStatus.textContent = success + " 个成功 / " + skipped + " 个未执行";
    } else {
      els.queueStatus.textContent = highImpact + " 个高影响动作待确认";
    }
    els.execute.disabled = Boolean(state.executedActions.length);
  }

  function createQueueCard(action) {
    const card = document.createElement("article");
    card.className = "queue-card " + getActionClass(action);
    const content = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = action.title;
    const detail = document.createElement("p");
    detail.textContent = action.target + " | " + action.time + " | " + action.impact;
    content.append(title, detail);
    if (action.content) {
      const message = document.createElement("p");
      message.textContent = "消息草稿：" + action.content;
      content.appendChild(message);
    }
    if (action.shareCard) {
      content.appendChild(createShareCard(action.shareCard));
    }
    if (action.result) {
      const result = document.createElement("p");
      result.textContent = action.result;
      content.appendChild(result);
    }
    const status = makeTag(getActionStatusLabel(action), getActionTone(action));
    card.append(content, status);
    return card;
  }

  function createShareCard(cardData) {
    const card = document.createElement("div");
    card.className = "share-card";
    const title = document.createElement("strong");
    title.textContent = cardData.title + " -> " + cardData.recipient;
    const summary = document.createElement("p");
    summary.textContent = cardData.summary;
    const facts = document.createElement("div");
    facts.className = "chip-row";
    (cardData.facts || []).forEach(function (fact) {
      facts.appendChild(makeTag(fact, "blue"));
    });
    card.append(title, summary, facts);
    return card;
  }

  function getActionClass(action) {
    if (action.status === "success") return "success";
    if (action.status === "skipped") return "skipped";
    if (isManualAction(action)) return "manual";
    if (action.requiresConfirmation) return "pending-high";
    return "pending-low";
  }

  function getActionStatusLabel(action) {
    if (action.status === "success") return "成功";
    if (action.status === "skipped") return "已跳过";
    if (isManualAction(action)) return "需人工确认";
    return action.requiresConfirmation ? "待确认" : "低影响";
  }

  function getActionTone(action) {
    if (action.status === "success") return "green";
    if (action.status === "skipped") return "amber";
    if (isManualAction(action)) return "amber";
    return action.requiresConfirmation ? "blue" : "";
  }

  function isManualAction(action) {
    return action.type === "manual_restaurant_check" || action.type === "manual_activity_check";
  }

  function renderFinalSummary() {
    const plan = getSelectedPlan();
    if (!plan || !state.executedActions.length) {
      els.resultPanel.classList.add("hidden");
      els.summary.innerHTML = "";
      return;
    }

    els.resultPanel.classList.remove("hidden");
    els.summary.innerHTML = "";
    const p1 = document.createElement("p");
    const skipped = state.executedActions.filter(function (action) {
      return action.status === "skipped";
    });
    p1.textContent = skipped.length
      ? "已按「" + plan.name + "」完成可自动执行动作，" + skipped.length + " 个动作转为人工确认。"
      : "已按「" + plan.name + "」模拟执行完成，行程从 " + plan.timeline[0].time +
        " 开始，预计 " + plan.timeline[plan.timeline.length - 1].time + " 结束。";
    const p2 = document.createElement("p");
    p2.textContent = plan.servicePackage
      ? "活动：" + plan.activity.name + "；餐厅：" + plan.restaurant.name + "；服务包预算约 " + plan.servicePackage.businessMetrics.totalBudget + " 元，优惠约 " + plan.servicePackage.businessMetrics.couponSavings + " 元。"
      : "活动：" + plan.activity.name + "；餐厅：" + plan.restaurant.name + "；预算：" + plan.budget + "。";
    const reserveDone = state.executedActions.some(function (action) {
      return action.type === "reserve_table" && action.status === "success";
    });
    const p3 = document.createElement("p");
    p3.textContent = reserveDone
      ? "餐厅订座、团购/加购和通知动作已按队列结果模拟推进。"
      : "餐厅未自动预约成功，请按队列提示人工确认或稍后重查。";
    const done = document.createElement("div");
    done.className = "chip-row";
    state.executedActions.forEach(function (action) {
      const suffix = action.status === "success" ? "成功" : "未自动执行";
      done.appendChild(makeTag(action.title + suffix, getActionTone(action)));
    });
    const shareAction = state.executedActions.find(function (action) {
      return action.type === "send_message" && action.shareCard;
    });
    els.summary.append(p1, p2, p3);
    if (shareAction) els.summary.appendChild(createShareCard(shareAction.shareCard));
    els.summary.appendChild(done);
  }

  function getSelectedPlan() {
    if (!state.result || !state.result.plans.length) return null;
    return state.result.plans.find(function (plan) {
      return plan.id === state.selectedPlanId;
    }) || state.result.plans[0];
  }

  resetDemo();
})();
