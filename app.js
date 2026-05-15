(function () {
  "use strict";

  const core = window.LocalLifeAgentCore;

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
    { id: "understand", label: "Understand" },
    { id: "planner", label: "Ask/Plan" },
    { id: "researchers", label: "Research" },
    { id: "merger", label: "Merger" },
    { id: "verifier", label: "Verifier" },
    { id: "revise", label: "Revise" },
    { id: "reflect", label: "Reflect" },
    { id: "confirm_execute", label: "Confirm/Execute" },
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
  };

  const els = {
    input: document.getElementById("goal-input"),
    generate: document.getElementById("generate-btn"),
    reset: document.getElementById("reset-btn"),
    clarification: document.getElementById("clarification-panel"),
    understanding: document.getElementById("understanding"),
    parseStatus: document.getElementById("parse-status"),
    toolCalls: document.getElementById("tool-calls"),
    toolCount: document.getElementById("tool-count"),
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
    els.feedbackSubmit.addEventListener("click", function () {
      submitFeedback();
    });
  }

  els.sampleButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      els.input.value = samples[button.dataset.sample];
      state.overrides = Object.assign({}, sampleOverrides[button.dataset.sample] || {});
      runPlanning({ resetOverrides: false });
    });
  });

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
    render();
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
    els.generate.textContent = isBusy ? "识别中..." : "生成方案";
  }

  function selectPlan(planId) {
    state.selectedPlanId = planId;
    state.executedActions = [];
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
    els.clarification.classList.add("hidden");
    els.understanding.className = "kv-list empty-state";
    els.understanding.textContent = "输入需求后会展示识别出的时间、同行人、人数和偏好。";
    els.parseStatus.textContent = "等待输入";
    els.toolCalls.className = "tool-list empty-state";
    els.toolCalls.textContent = "生成方案后会显示 Agent Loop Trace 和原始 Mock Tool 调用。";
    els.toolCount.textContent = "0 次";
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
    els.resultPanel.classList.add("hidden");
    renderFeedback();
  }

  function render() {
    renderStages();
    renderClarification();
    renderUnderstanding();
    renderTools();
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
    els.understanding.className = "kv-list";
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

  function renderTools() {
    const calls = state.result ? state.result.toolCalls : [];
    els.toolCount.textContent = calls.length + " 次";
    if (!state.result) {
      els.toolCalls.className = "tool-list empty-state";
      els.toolCalls.textContent = "生成方案后会显示 Agent Loop Trace 和原始 Mock Tool 调用。";
      return;
    }

    els.toolCalls.className = "tool-list";
    els.toolCalls.innerHTML = "";
    if (state.result.agentLoopTrace) {
      els.toolCalls.appendChild(createLoopTrace(state.result.agentLoopTrace));
    }

    const label = document.createElement("div");
    label.className = "tool-section-label";
    label.textContent = calls.length
      ? "原始 Mock Tool 调用"
      : "补充关键信息后才会调用 Mock Tools；当前没有进入 researchers。";
    els.toolCalls.appendChild(label);

    if (!calls.length) return;

    calls.forEach(function (call) {
      const item = document.createElement("details");
      item.className = "tool-item";
      const summary = document.createElement("summary");
      summary.className = "tool-summary";
      const name = document.createElement("span");
      name.className = "tool-name";
      name.textContent = formatToolTitle(call);
      const status = document.createElement("span");
      status.className = "tag green";
      status.textContent = formatToolStatus(call);
      summary.append(name, status);

      const readable = document.createElement("p");
      readable.className = "tool-readable";
      readable.textContent = formatToolReadable(call);

      const body = document.createElement("pre");
      body.className = "tool-body";
      body.textContent = JSON.stringify({ input: call.input, output: call.output }, null, 2);
      item.append(summary, readable, body);
      els.toolCalls.appendChild(item);
    });
  }

  function createLoopTrace(trace) {
    const wrap = document.createElement("div");
    wrap.className = "loop-trace";

    const head = document.createElement("div");
    head.className = "loop-trace-head";
    const title = document.createElement("div");
    title.className = "loop-trace-title";
    const eyebrow = document.createElement("span");
    eyebrow.textContent = "single orchestrator";
    const h = document.createElement("strong");
    h.textContent = "Agent Loop Trace";
    title.append(eyebrow, h);
    const mode = document.createElement("code");
    mode.textContent = trace.mode;
    head.append(title, mode);

    const desc = document.createElement("p");
    desc.className = "loop-trace-desc";
    desc.textContent = trace.description;

    const stages = document.createElement("div");
    stages.className = "loop-stage-list";
    trace.stages.forEach(function (stage) {
      stages.appendChild(createLoopStage(stage));
    });

    wrap.append(head, desc, stages);
    return wrap;
  }

  function createLoopStage(stage) {
    const card = document.createElement("article");
    card.className = "loop-stage " + stage.status;

    const head = document.createElement("div");
    head.className = "loop-stage-head";
    const title = document.createElement("strong");
    title.textContent = stage.label;
    const status = document.createElement("span");
    status.className = "loop-stage-status " + getLoopTone(stage.status);
    status.textContent = formatLoopStatus(stage.status);
    head.append(title, status);

    const summary = document.createElement("p");
    summary.textContent = stage.summary;

    const findings = document.createElement("div");
    findings.className = "loop-findings";
    (stage.findings || []).slice(0, 5).forEach(function (finding) {
      const item = document.createElement("div");
      item.className = "loop-finding " + getLoopTone(finding.status);
      const label = document.createElement("span");
      label.textContent = finding.label;
      const text = document.createElement("p");
      text.textContent = finding.summary;
      item.append(label, text);
      findings.appendChild(item);
    });

    card.append(head, summary);
    if (stage.lanes && stage.lanes.length) card.appendChild(createResearchLanes(stage.lanes));
    if (stage.findings && stage.findings.length) card.appendChild(findings);
    return card;
  }

  function createResearchLanes(lanes) {
    const wrap = document.createElement("div");
    wrap.className = "research-lanes";
    lanes.forEach(function (lane) {
      const item = document.createElement("div");
      item.className = "research-lane " + getLoopTone(lane.status) + (lane.fallbackUsed ? " fallback" : "");
      const head = document.createElement("div");
      const label = document.createElement("strong");
      label.textContent = lane.label;
      const latency = document.createElement("code");
      latency.textContent = lane.mockLatencyMs + "ms";
      head.append(label, latency);
      const summary = document.createElement("p");
      summary.textContent = lane.resultSummary;
      const status = document.createElement("span");
      status.textContent = lane.fallbackUsed ? "已启用兜底" : formatLoopStatus(lane.status);
      item.append(head, summary, status);
      wrap.appendChild(item);
    });
    return wrap;
  }

  function formatLoopStatus(status) {
    const labels = {
      done: "完成",
      active: "进行中",
      pending: "等待",
      ready: "就绪",
      pass: "通过",
      warn: "需注意",
      missing: "缺失",
      recommended: "推荐",
      applied: "已应用",
    };
    return labels[status] || status;
  }

  function getLoopTone(status) {
    if (status === "done" || status === "pass" || status === "recommended" || status === "applied") return "success";
    if (status === "active") return "active";
    if (status === "warn" || status === "missing") return "warning";
    if (status === "ready") return "ready";
    return "pending";
  }

  function formatToolTitle(call) {
    const names = {
      get_weather: "已查天气",
      search_activities: "已查活动票/体验",
      search_restaurants: "已查餐厅与套餐",
      check_route: "已查路线",
      check_availability: "已查订座/票务",
    };
    return names[call.name] || call.name;
  }

  function formatToolStatus(call) {
    if (call.name === "check_availability" && call.output && call.output.available === false) return "需重排";
    return "完成";
  }

  function formatToolReadable(call) {
    const output = call.output || {};
    if (call.name === "get_weather") {
      return output.weather + "，" + output.risk;
    }
    if (call.name === "search_activities") {
      return "找到 " + output.length + " 个可组合活动，继续按同行关系和时间窗筛选。";
    }
    if (call.name === "search_restaurants") {
      return "找到 " + output.length + " 个餐厅候选，检查排队、订座和团购可用性。";
    }
    if (call.name === "check_route") {
      return output.summary || "路线已计算。";
    }
    if (call.name === "check_availability") {
      return output.available
        ? "可锁定 " + output.selected_slot + "，进入待确认服务包。"
        : "不可自动锁定：" + output.reason;
    }
    return "工具调用完成。";
  }

  function renderPlans() {
    const plans = state.result ? state.result.plans : [];
    els.planCount.textContent = plans.length + " 个";
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

    const reason = document.createElement("p");
    reason.className = "reason-text";
    reason.textContent = plan.reason;

    const risks = document.createElement("ul");
    risks.className = "risk-list";
    plan.risks.forEach(function (risk) {
      const li = document.createElement("li");
      li.textContent = risk;
      risks.appendChild(li);
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
    actions.append(preview, select);

    const blocks = [head];
    if (issueNotices) blocks.push(issueNotices);
    blocks.push(grid, timeline);
    if (reasonList) blocks.push(reasonList);
    if (scoreDetails) blocks.push(scoreDetails);
    blocks.push(reason, risks, actions);
    card.append.apply(card, blocks);
    return card;
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
