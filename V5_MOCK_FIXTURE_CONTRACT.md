# V5 P0 Mock Fixture Contract

## Status

This document freezes the P0 mock fixture contract for `POST /api/generative-plan`.
It is a contract document only. It does not mean the fixtures, mock endpoint, or adapter implementation already exist.

Related schema: `ui-contract.schema.json`, especially `$defs.MockFixtureManifest`, `$defs.MockFixtureContract`, and `x-mockFixtureContract`.

## Frozen Decisions

1. `source` explicitly allows `agent_core_adapter`.
   This distinguishes backend `mock/planned` responses from legacy `agent-core.js` plans converted through the adapter.
2. Error fixtures must include `httpStatus` inside the fixture body.
   They must not rely only on `manifest.json`, so a single error fixture can be independently consumed by frontend, backend, or tests.
3. Adapter fallback fixtures must keep a paired legacy `agent-core.js` plan input sample.
4. Schema validation failure fixtures are split into:
   - shared fixture: legal error envelope that must pass `ui-contract.schema.json`.
   - invalid fixture: placed under `invalid/`, used only for negative tests, and not used as shared frontend/backend rendering sample.
5. `POST /api/generative-plan` P0 is fixture-driven first.
   The mock handler should read deterministic fixtures rather than inventing free-form responses.
6. P0 may include only a small deterministic branch table:
   - ordinary success
   - `unsafe_input`
   - `schema_validation_failed`
   - `version_conflict`
7. Any branch used by the mock handler must map to a golden fixture and pass contract tests.
   Lightweight branching must not become a hidden planning engine.
8. P0 fixtures should be generated from the current local `agent-core.js` planning result first.
   The initial `success.backend-planned.v5-p0.json` can be produced by running the stable local planning path, converting the result through the V5 adapter mapping, and marking the response as `source: "backend_mock"` for the mock endpoint sample.
9. Fixture generation must not invent backend-only fields that the adapter cannot produce.
   If the current local plan lacks a non-critical field, use the adapter degradation policy: `safe_placeholder`, `drop_noncritical_card`, `drop_action`, or structured `recoverable_error`.
10. P0 fixtures may include local collaboration state and simulated execution lifecycle state.
    They must not include external real merchant, payment, messaging, booking, reservation, or public sharing platform results.
11. P0 fixtures may include cancel, low-impact skip, and regeneration examples.
    Regeneration fixtures must use `/api/generative-plan` semantics with current snapshot and feedback summary. The generated result becomes a derived branch.
12. P0 fixtures may include lightweight Plan Branch examples: one active main, up to 3 derived branches, adoption, rejection, and previous-main rollback.
    They must not model complex version trees, partial merge, multi-level conflict resolution, or long-term permission systems.

## Recommended Directory

```text
fixtures/v5/generative-plan/
  manifest.json
  success.backend-planned.v5-p0.json
  success.adapter-fallback.v5-p0.json
  input.agent-core-plan.v5-p0.json
  error.schema-validation-failed.v5-p0.json
  error.unsafe-input.v5-p0.json
  error.version-conflict.v5-p0.json
  invalid/
```

## Required Fixtures

### 1. `success.backend-planned.v5-p0.json`

Purpose:
Backend mock, frontend card flow, and end-to-end happy path shared sample.
For P0 bootstrap, this fixture is derived from the current `agent-core.js` local planning output and converted into V5 JSON. This keeps backend mock, frontend rendering, and adapter fallback grounded in the same stable demo data.

Must include:

- `ok: true`
- `uiSchemaVersion: "v5-p0"`
- `planningMode: "backend_true_planning"`
- `source: "backend_mock"` during mock stage, or `source: "backend_planned"` after real planning lands
- `fallback.enabled: false`
- `runtimeSummary`
- `errorRecovery`
- `assumptionBanner`
- `cards`
- `entities`
- `timeline`
- `actions`

Minimum content coverage:

- 1 selected plan
- 1 activity
- 1 restaurant
- at least 1 transport route segment bound to `routeSegmentId + fromRef + toRef`
- 1 plan summary card
- 1 activity card
- 1 restaurant card
- 1 transport card
- 1 timeline card
- local share / feedback / execution summary coverage when the fixture exercises the refrozen P0 close loop
- 2 to 4 actions from:
  - `select_plan`
  - `refresh_block`
  - `preview_previous_candidate`
  - `preview_next_candidate`
  - `adopt_preview_candidate`
  - `restore_original_candidate`
  - `undo_candidate_adoption`
  - `open_reason`
  - `start_local_execution`
  - `create_local_share`
  - `advance_simulated_execution_step`
  - `skip_simulated_execution_step`
  - `cancel_simulated_execution_step`
  - `cancel_simulated_execution`
  - `regenerate_plan_from_feedback`
  - `view_plan_branch`
  - `adopt_derived_branch`
  - `reject_derived_branch`
  - `rollback_previous_main_branch`

Must not cover in P0:

- external real collaboration platform state
- external real execution results
- payment, booking, messaging, reservation, or merchant platform side effects
- public internet sharing
- real user identity system
- complex version tree
- partial merge
- multi-level conflict resolution
- long-term permission system
- full cascade engine

Generation rule:

- Input source: current deterministic local planning result from `agent-core.js`.
- Conversion path: local plan -> `agent-core-plan-to-ui-contract` mapping -> V5 UI Contract JSON.
- Mock endpoint source: use `source: "backend_mock"` until a real backend planner exists.
- Generated response must pass `ui-contract.schema.json` before becoming a shared fixture.

### 2. `success.adapter-fallback.v5-p0.json`

Purpose:
Frontend adapter acceptance sample. It proves a legacy `agent-core.js` plan can be converted to a legal UI Contract response.
It must be paired with the exact local planning input sample used to generate it, so the adapter test can reproduce the fixture instead of hand-maintaining a disconnected JSON sample.

Must include:

- `ok: true`
- `planningMode: "adapter_fallback"`
- `source: "agent_core_adapter"`
- `fallback.enabled: true`
- `fallback.mode: "adapter"` or `"local_agent_core"`
- `runtimeSummary.summaryText`
- valid `cards`
- valid `entities`
- valid `timeline`
- valid `actions`
- `meta.source: "agent_core_adapter"` on relevant generated objects

Paired input:

```text
input.agent-core-plan.v5-p0.json
```

Required degradation behavior:

- An activity or restaurant may miss non-critical fields.
- If `name` is missing, generate a placeholder.
- If `distance`, `price`, or `tags` is missing, keep it empty and do not block rendering.
- If an action target is missing, do not generate that action; record warning or evidence.

### 3. `error.schema-validation-failed.v5-p0.json`

Purpose:
Shared standard error envelope. It is not a dirty backend data example.

Must include:

- `ok: false`
- `error: "schema_validation_failed"`
- `httpStatus: 422`
- `recoverable: true`
- `fallback.enabled: true`
- `fallback.mode: "adapter"`
- `errorRecovery.recommendedAction: "use_adapter_fallback"`

Frontend behavior:

- Do not render dirty backend data.
- Use adapter fallback.

Important:
This fixture itself must pass `ui-contract.schema.json`.
If a test needs to assert that dirty backend response fails schema validation, put that sample under `invalid/` and use it only as a negative fixture.

## Recommended Error Fixtures

### 4. `error.unsafe-input.v5-p0.json`

Purpose:
Validate the Soft Prompt branch.

Field focus:

- `ok: false`
- `error: "unsafe_input"`
- `httpStatus: 422`
- `recoverable: true`
- `fallback.enabled: false`
- `errorRecovery.recommendedAction: "show_soft_prompt"`

UI behavior:
Do not fallback automatically. Wait for user confirmation.

### 5. `error.version-conflict.v5-p0.json`

Purpose:
Validate version conflict handling and old-plan preservation.

Field focus:

- `ok: false`
- `error: "version_conflict"`
- `httpStatus: 409`
- `recoverable: true`
- `fallback.enabled: false`
- `errorRecovery.recommendedAction: "keep_old_plan"`
- include `lineageId`, `sessionId`, and `version`

UI behavior:
Keep old plan and prompt refresh or regenerate.

## `manifest.json` Suggested Content

```json
{
  "fixtureVersion": "v5-p0-fixture-1",
  "schema": "ui-contract.schema.json",
  "baseDir": "fixtures/v5/generative-plan/",
  "fixtures": [
    {
      "file": "success.backend-planned.v5-p0.json",
      "kind": "success",
      "requiredFor": ["backend_mock", "frontend_render", "contract_test"],
      "mustPassSchema": true,
      "httpStatus": 200
    },
    {
      "file": "success.adapter-fallback.v5-p0.json",
      "kind": "adapter_fallback",
      "requiredFor": ["frontend_adapter", "fallback_test", "contract_test"],
      "mustPassSchema": true,
      "pairedInput": "input.agent-core-plan.v5-p0.json",
      "httpStatus": 200
    },
    {
      "file": "error.schema-validation-failed.v5-p0.json",
      "kind": "error",
      "requiredFor": ["http_error", "fallback_test", "contract_test"],
      "mustPassSchema": true,
      "httpStatus": 422
    }
  ],
  "validationRules": [
    {
      "rule": "shared_fixtures_must_pass_ui_contract_schema",
      "required": true
    },
    {
      "rule": "success_fixtures_must_be_frontend_renderable",
      "required": true
    },
    {
      "rule": "adapter_fallback_must_have_agent_core_input_pair",
      "required": true
    },
    {
      "rule": "error_fixtures_must_be_structured_envelopes",
      "required": true
    },
    {
      "rule": "fixtures_use_fixed_uuid_or_ulid",
      "required": true
    }
  ]
}
```

## Validation Rules

- All shared fixtures must pass `ui-contract.schema.json`.
- Success fixtures must be directly renderable by the frontend card flow.
- Adapter fallback fixture must prove the legacy plan to UI Contract mapping is stable.
- All core responses must be covered by golden fixtures and contract tests.
- Error fixtures must be standard structured envelopes.
- Error fixtures must not use natural language errors as a substitute for structured fields.
- Invalid backend output samples must live under `invalid/`.
- Fixtures must use fixed UUID or ULID values to avoid snapshot churn.

## P0 Boundary

These fixtures freeze shape and shared examples only.
They do not require implementation of:

- external real collaboration
- external real execution
- payment, booking, messaging, reservation, or merchant integrations
- public sharing platform
- real user identity system
- full cascade engine
