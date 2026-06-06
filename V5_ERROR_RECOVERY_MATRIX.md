# V5 P0 Error Recovery Matrix Contract

## Status

This document freezes the P0 error recovery matrix for V5 Generative UI.
It is a contract document only. It does not mean the backend handler, frontend recovery UI, or telemetry pipeline has already been implemented.

Related schema: `ui-contract.schema.json`, especially `$defs.ErrorRecovery`, `$defs.ErrorRecoveryMatrix`, `$defs.ErrorRecoveryMatrixRow`, and `x-errorRecoveryMatrix`.

## Matrix

| error | HTTP | User display key | fallback | blocking | preserved state | CTA | recommendedAction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `bad_request` | `400` | `input_unrecognized` | no | yes | no new plan | fix input | `fix_input` |
| `schema_validation_failed` | `422` | `stable_generation_mode` | yes, `adapter` | no | do not render backend data | view stable plan | `use_adapter_fallback` |
| `unsafe_input` | `422` | `confirm_safety_info` | no | yes | current safe route | confirm info | `show_soft_prompt` |
| `version_conflict` | `409` | `version_conflict_refresh` | no | yes | old plan | refresh / regenerate | `keep_old_plan` |
| `candidate_load_failed` | `503` | `candidate_load_failed_preserved` | no | no | current candidate preview and Main | retry load more | `preserve_candidate_preview` |
| `candidate_adoption_validation_failed` | `409` | `candidate_adoption_failed_preserved` | no | yes | current candidate preview and Main | review impact | `preserve_candidate_preview` |
| `cascade_conflict` | `409` | `cascade_conflict_preserved` | no | yes | `lastStablePlanSnapshot` | view conflict | `keep_last_stable_plan` |
| `planning_unavailable` | `503` | `stable_generation_mode` | yes, `adapter` | no | adapter output | continue view | `use_adapter_fallback` |
| `backend_timeout` | `504` | `stable_generation_mode` | yes, `local_agent_core` | no | local plan | continue view | `use_local_agent_core` |
| `backend_unavailable` | `503` | `stable_generation_mode` | yes, `local_agent_core` | no | local plan | continue view | `use_local_agent_core` |
| `internal_error` | `500` | `stable_generation_mode` | yes, `local_agent_core` | no | local plan | continue view | `use_local_agent_core_and_log` |
| `runtime_state_conflict` | `409` | `runtime_state_changed` | no | yes | current view | refresh | `refresh_runtime_state` |
| `snapshot_missing` | `409` | `snapshot_missing_regenerate` | no | yes | current visible plan | regenerate | `regenerate_plan` |

## Data Structure

`ErrorRecovery` must not only keep `recommendedAction`.
P0 freezes the expanded structure:

```json
{
  "code": "schema_validation_failed",
  "httpStatus": 422,
  "severity": "recoverable",
  "recoverable": true,
  "blocking": false,
  "fallback": {
    "enabled": true,
    "mode": "adapter",
    "usesAgentCore": true,
    "reason": "schema_validation_failed"
  },
  "userMessageKey": "stable_generation_mode",
  "recommendedAction": "use_adapter_fallback",
  "preserve": {
    "keepOldPlan": false,
    "keepLastStableSnapshot": false,
    "doNotRenderBackendData": true,
    "visibleState": "adapter_output"
  },
  "telemetry": {
    "logLevel": "warning",
    "auditRequired": true
  }
}
```

## Recovery Rules

- `bad_request` is blocking. Do not generate a new plan; ask the user to fix input.
- `schema_validation_failed` is not blocking. Do not render dirty backend data; use adapter fallback.
- `unsafe_input` is blocking. Do not auto-fallback; show Soft Prompt and wait for user confirmation.
- `version_conflict` is blocking. Keep the old plan and ask the user to refresh or regenerate.
- `candidate_load_failed` is not blocking. Keep the current candidate, position, preview, Main plan, and saved snapshots.
- `candidate_adoption_validation_failed` is blocking for adoption only. Keep the preview available, preserve Main, and show the failed time, budget, risk, or schema check.
- `cascade_conflict` is blocking. Keep `lastStablePlanSnapshot` and show conflict explanation.
- `planning_unavailable` uses adapter fallback.
- `backend_timeout`, `backend_unavailable`, and `internal_error` use local `agent-core.js`; `internal_error` must be logged.
- `runtime_state_conflict` is blocking. Keep the current view and refresh runtime state.
- `snapshot_missing` is blocking. Keep the current visible plan and ask the user to regenerate.

## User Copy Boundary

The UI should not say "backend failed".

Use message keys instead of hard-coded copy in the error payload:

- `input_unrecognized`
- `stable_generation_mode`
- `confirm_safety_info`
- `version_conflict_refresh`
- `candidate_load_failed_preserved`
- `candidate_adoption_failed_preserved`
- `cascade_conflict_preserved`
- `runtime_state_changed`
- `snapshot_missing_regenerate`

Concrete localized copy can be resolved by frontend UI copy tables.

## P0 Boundary

This contract freezes recovery semantics only.
It does not require implementing:

- telemetry persistence
- audit database writes
- full runtime state refresh endpoint
- full cascade engine
- production incident reporting
