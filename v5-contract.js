(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LocalLifeV5Contract = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_FLAGS = Object.freeze({
    v5GenerativeUI: false,
    adapterFallback: true,
    localReplan: true,
    collaborationPlaceholder: false,
    executionImplementationRequired: false,
    localCollaborationState: true,
    simulatedExecutionLifecycle: true,
  });

  const MAIN_CARD_TYPES = Object.freeze([
    "plan_summary",
    "assumption_banner",
    "activity",
    "restaurant",
    "transport",
    "timeline",
    "soft_prompt",
    "share_summary",
    "feedback_summary",
    "execution_summary",
  ]);

  const INITIAL_RENDER_CARD_TYPES = Object.freeze([
    "plan_summary",
    "assumption_banner",
    "activity",
    "restaurant",
    "transport",
    "timeline",
    "soft_prompt",
  ]);

  const ACTION_TYPES = Object.freeze([
    "select_plan",
    "refresh_block",
    "preview_previous_candidate",
    "preview_next_candidate",
    "adopt_preview_candidate",
    "restore_original_candidate",
    "undo_candidate_adoption",
    "edit_assumption",
    "undo_replan",
    "open_reason",
    "answer_soft_prompt",
    "open_collaboration_placeholder",
    "create_local_share",
    "submit_share_feedback",
    "start_local_execution",
    "advance_simulated_execution_step",
    "skip_simulated_execution_step",
    "cancel_simulated_execution_step",
    "regenerate_plan_from_feedback",
    "cancel_simulated_execution",
    "view_plan_branch",
    "adopt_derived_branch",
    "reject_derived_branch",
    "rollback_previous_main_branch",
  ]);

  const SUPPORTED_CAPABILITIES = Object.freeze([
    "minimum_ui_contract",
    "cards_entities_timeline_actions",
    "p0_card_type_whitelist",
    "p0_action_type_whitelist",
    "adapter_fallback",
    "error_recovery_matrix",
    "feature_flag_resolution",
    "local_replan_contract",
  ]);

  function parseBoolean(value) {
    if (typeof value === "boolean") return value;
    if (value === "1" || value === "true" || value === "on") return true;
    if (value === "0" || value === "false" || value === "off") return false;
    return undefined;
  }

  function readStorage(storage) {
    if (!storage || typeof storage.getItem !== "function") return {};
    const values = {};
    Object.keys(DEFAULT_FLAGS).forEach(function (key) {
      try {
        const value = parseBoolean(storage.getItem("localLife." + key));
        if (typeof value === "boolean") values[key] = value;
      } catch (error) {
        // Storage can be unavailable in privacy modes; defaults remain safe.
      }
    });
    return values;
  }

  function readUrl(search) {
    if (!search || typeof URLSearchParams === "undefined") return {};
    const params = new URLSearchParams(search);
    const values = {};
    Object.keys(DEFAULT_FLAGS).forEach(function (key) {
      const value = parseBoolean(params.get(key));
      if (typeof value === "boolean") values[key] = value;
    });
    return values;
  }

  function resolveFeatureFlags(options) {
    const opts = options || {};
    return Object.assign(
      {},
      DEFAULT_FLAGS,
      opts.runtimeConfig || {},
      readStorage(opts.localStorage),
      readStorage(opts.sessionStorage),
      readUrl(opts.search),
      opts.requestOverrides || {},
      opts.safetyGuards || {}
    );
  }

  function isRef(value) {
    return Boolean(
      value &&
      typeof value === "object" &&
      value.kind &&
      value.id &&
      value.lineageId &&
      value.sessionId &&
      Number.isInteger(value.version)
    );
  }

  function validatePayload(payload) {
    const errors = [];
    if (!payload || typeof payload !== "object") {
      return { valid: false, errors: ["payload must be an object"] };
    }
    if (payload.ok !== true) errors.push("ok must be true");
    if (!/^v5(?:-[a-z0-9]+)*$/.test(String(payload.uiSchemaVersion || ""))) {
      errors.push("uiSchemaVersion must belong to the v5 family");
    }
    ["requestId", "sessionId", "lineageId"].forEach(function (key) {
      if (!payload[key]) errors.push(key + " is required");
    });
    if (!Number.isInteger(payload.version) || payload.version < 1) errors.push("version must be positive");
    if (!Array.isArray(payload.cards) || payload.cards.length === 0) errors.push("cards must not be empty");
    if (!Array.isArray(payload.entities)) errors.push("entities must be an array");
    if (!Array.isArray(payload.timeline)) errors.push("timeline must be an array");
    if (!Array.isArray(payload.actions)) errors.push("actions must be an array");
    if (!payload.runtimeSummary || typeof payload.runtimeSummary !== "object") {
      errors.push("runtimeSummary is required");
    }
    if (!payload.errorRecovery || typeof payload.errorRecovery !== "object") {
      errors.push("errorRecovery is required");
    }

    (payload.cards || []).forEach(function (card, index) {
      if (!card || !card.id || !card.type || !card.title || !card.summaryText) {
        errors.push("card " + index + " misses required display fields");
      }
      if (!isRef(card && (card.entityRef || card.targetRef))) {
        errors.push("card " + index + " misses a complete ref");
      }
      if (!Array.isArray(card && card.actions)) errors.push("card " + index + " actions must be an array");
    });

    (payload.actions || []).forEach(function (action, index) {
      if (!action || !action.id || !action.type || !action.label || !isRef(action.targetRef)) {
        errors.push("action " + index + " is incomplete");
      }
    });

    const unsupportedRequired = (payload.requiredCapabilities || []).filter(function (capability) {
      return SUPPORTED_CAPABILITIES.indexOf(capability) < 0;
    });
    if (unsupportedRequired.length) {
      errors.push("unsupported required capabilities: " + unsupportedRequired.join(", "));
    }
    return { valid: errors.length === 0, errors: errors };
  }

  function getRenderableCards(payload) {
    return (payload && Array.isArray(payload.cards) ? payload.cards : []).filter(function (card) {
      return INITIAL_RENDER_CARD_TYPES.indexOf(card.type) >= 0;
    });
  }

  function isExecutableAction(action) {
    return Boolean(
      action &&
      ACTION_TYPES.indexOf(action.type) >= 0 &&
      action.status === "enabled" &&
      isRef(action.targetRef)
    );
  }

  return {
    DEFAULT_FLAGS: DEFAULT_FLAGS,
    MAIN_CARD_TYPES: MAIN_CARD_TYPES,
    INITIAL_RENDER_CARD_TYPES: INITIAL_RENDER_CARD_TYPES,
    ACTION_TYPES: ACTION_TYPES,
    SUPPORTED_CAPABILITIES: SUPPORTED_CAPABILITIES,
    resolveFeatureFlags: resolveFeatureFlags,
    validatePayload: validatePayload,
    getRenderableCards: getRenderableCards,
    isExecutableAction: isExecutableAction,
  };
});
