# V5 P0 Capability Negotiation and Feature Flag Contract

## Status

This document freezes the P0 capability negotiation and feature flag resolution contract for V5 Generative UI.
It is a contract document only. It does not mean the flag resolver or backend capability declaration has already been implemented.

Related schema: `ui-contract.schema.json`, especially `$defs.FeatureFlags`, `$defs.FeatureFlagResolution`, `$defs.FeatureFlagContract`, `$defs.BackendCapabilityDeclaration`, `$defs.CapabilityNegotiationContract`, `x-featureFlagContract`, and `x-capabilityNegotiationContract`.

## 0. Separation Principle

P0 uses feature flags as a capability negotiation layer, not as a simple set of boolean switches.

The three concepts must stay separate:

| Layer | Owner | Purpose | Must not do |
| --- | --- | --- | --- |
| Contract defaults | Contract | Provide safe defaults so the old demo path does not break. | Enable V5 by surprise. |
| Client effective flags | Frontend | Decide whether the client attempts a V5 experience from URL, storage, request, and safety guards. | Claim backend support. |
| Backend capability declaration | Backend | Declare which P0 capabilities the backend currently supports. | Force the frontend to render V5 or expand P0 scope. |
| Safety and recovery guards | Shared contract | Override everything on schema failure, unsafe input, timeout, version conflict, and similar hard guards. | Be bypassed by flags or capabilities. |

Core rule:

```text
featureFlags control whether the frontend attempts an experience.
capabilities control whether the backend currently has the needed ability.
errorRecovery controls how state is preserved and how fallback happens after failure.
```

Do not mix these fields. A backend capability can only reduce or disable a client experience. It cannot force `v5GenerativeUI=true`, bypass schema validation, turn simulated execution into external real execution, or turn local collaboration into a public collaboration platform.

## Runtime Capability Boundary

V5 backend capability declaration is the UI-facing capability negotiation layer.
V4 Runtime Capability Contract separates the Runtime product target from the
current running implementation.

They may be mapped, but they are not the same contract:

- `targetCapabilities` describes the frozen Runtime substrate target for
  planning and acceptance. Its `status=supported` means the contract is frozen,
  not that the current Runtime operation is callable.
- `effectiveCapabilities` describes what the current Runtime implementation can
  actually provide and is the only Runtime capability list V5 may use for
  enablement, disabled state, mock, or fallback decisions. It uses
  `availability=available|degraded|unavailable`.
- V5 backend capability declaration describes whether the V5 P0 experience can
  use backend mock planning, UI schema validation, runtime summary, adapter
  fallback, local collaboration state, simulated execution lifecycle, and audit
  events.

V5 may consume Runtime capabilities only through `RuntimeAdapter`,
`RuntimeCapabilityContract`, and `RuntimeEventContract`. V5 must not read Runtime internal persistence,
depend on Runtime internal classes, or require Runtime to add a capability just
because a UI button exists.

V5 must never treat `targetCapabilities.status=supported` as proof that an
operation is available. Missing, degraded, or unavailable effective capability
must result in the contract-defined disabled, mock, or fallback behavior.

The V5 backend capability declaration below is a separate UI-facing contract and
continues to use `supported / degraded / unsupported` for backend experience
availability. Those values must not be conflated with Runtime target contract
status.

## 1. Flag Names

P0 keeps exactly these 7 feature flags:

```text
v5GenerativeUI
adapterFallback
localReplan
collaborationPlaceholder
executionImplementationRequired
localCollaborationState
simulatedExecutionLifecycle
```

No implementation should introduce an undeclared V5 flag for core flow control without updating this contract.

## 2. Contract Defaults

```json
{
  "v5GenerativeUI": false,
  "adapterFallback": true,
  "localReplan": true,
  "collaborationPlaceholder": false,
  "executionImplementationRequired": false,
  "localCollaborationState": true,
  "simulatedExecutionLifecycle": true
}
```

Meaning:

- `v5GenerativeUI=false`: default behavior must not break the old demo path.
- `adapterFallback=true`: any unstable V5 path can fall back.
- `localReplan=true`: local simulated replan remains allowed.
- `collaborationPlaceholder=false`: placeholder-only collaboration is not the P0 main flow.
- `executionImplementationRequired=false`: the V5 contract may be consumed through fixtures, adapter fallback, mock capability, or degraded mode without requiring the V4 Runtime P0 implementation to be complete.
- `localCollaborationState=true`: P0 includes local persisted share, reviewer, feedback, read state, execution gate, and audit state.
- `simulatedExecutionLifecycle=true`: P0 includes `/api/executions` create/query/advance lifecycle, while all external outcomes remain mocked.

These defaults are contract defaults. The frontend may compute different client effective flags from URL, storage, request, and safety guards, but the defaults must remain safe for the old demo path.

## 3. Client Effective Flags

Client effective flags should be composed in this order:

```text
schema/defaults
  -> runtime config / build config
  -> localStorage or sessionStorage
  -> URL query override
  -> per-request override
  -> safety hard guards
```

Source meaning:

- `schema/defaults`: fallback baseline so every environment has stable defaults.
- `runtime config / build config`: demo, development, and deployment environment differences.
- `localStorage/sessionStorage`: local debugging and demo switching.
- `URL query override`: temporary demo override, for example `?v5GenerativeUI=1`.
- `per-request override`: tests or explicit entry points.
- `safety hard guards`: highest priority and cannot be overridden by any flag.

P0 UI entry policy:

- V5 switches must support URL query and localStorage/sessionStorage.
- A development-only debug entry may exist for local integration.
- The debug entry is not a formal user-facing feature and must not be required for the normal demo path.

## 4. Conflict Priority

Hard guards are highest priority:

```text
unsafe_input
schema_validation_failed
version_conflict
cascade_conflict
backend_timeout
planning_unavailable
```

Hard guard behavior:

- `schema_validation_failed`: do not render V5; use adapter fallback.
- `unsafe_input`: do not fallback automatically; show Soft Prompt.
- `version_conflict`: preserve old plan.
- `cascade_conflict`: preserve `lastStablePlanSnapshot`.
- `backend_timeout` / `planning_unavailable`: use fallback.

Business flag priority:

```text
per-request override
> URL query override
> session/localStorage
> runtime/build config
> schema defaults
```

Backend authority:

- Backend can only reduce capability.
- Backend cannot force frontend to render V5 when frontend effective `v5GenerativeUI=false`.
- Backend capability declaration must be evaluated separately from client effective flags.
- `errorRecovery` hard guards override both feature flags and backend capabilities.

Example:

- If frontend effective `v5GenerativeUI=false`, backend cannot force V5 rendering.
- If backend returns `schema_validation_failed`, frontend must not render V5 even if `v5GenerativeUI=true`.

## 5. Backend Capability Declaration

The backend should declare what it can support for the current response or environment. P0 capability declaration is conservative and descriptive.

Minimum P0 capability names:

```text
backend_mock_generative_plan
schema_validation
runtime_summary
error_recovery_envelope
golden_fixture_contract
agent_core_fixture_generation
adapter_fallback_output
p0_card_flow
refresh_block
candidate_switcher_preview
api_executions_lifecycle
local_share_token_access
local_plan_snapshot_share
share_feedback_persistence
collaboration_read_state
execution_gate
local_sqlite_collaboration_state
local_sqlite_execution_state
audit_events
```

Capability status values:

```text
supported
degraded
unsupported
```

Rules:

- `supported` means the capability can be used inside the already-frozen P0 contract.
- `degraded` means the frontend may render a lower-fidelity version or fallback.
- `unsupported` means the frontend must hide, disable, mock, or fallback for that feature.
- `candidate_switcher_preview` is the authoritative capability for stable previous/next preview, impact diff, explicit adoption, restore original, and one-step adoption undo.
- `refresh_block` is retained only for fixture / adapter compatibility. It must initialize the candidate switcher or preview the next stable candidate and must not directly mutate Main. It cannot be removed until the user personally experiences the new flow and explicitly approves removal.
- A backend capability declaration is not a product requirement. It records current ability only.
- Capabilities must not be used to introduce new card/action types outside the P0 whitelist.
- Capabilities must not imply external real execution, payment, booking, messaging, public sharing, or a real user identity system.

## 6. Request Contract

Requests should continue to carry `featureFlags`:

```json
{
  "featureFlags": {
    "v5GenerativeUI": false,
    "adapterFallback": true,
    "localReplan": true,
    "collaborationPlaceholder": false,
    "executionImplementationRequired": false,
    "localCollaborationState": true,
    "simulatedExecutionLifecycle": true
  }
}
```

Optional debug field:

```json
{
  "featureFlagResolution": {
    "source": ["defaults", "runtime_config", "storage", "url", "request", "safety_guard"],
    "defaultsVersion": "v5-p0-flags-1",
    "reason": "string"
  }
}
```

Rules:

- `featureFlags` are the effective values used by the request.
- `featureFlagResolution` is optional and debug-only.
- UI rendering must not depend on `featureFlagResolution`.
- `featureFlagResolution` helps explain why V5 did not render or why fallback happened during integration.
- Backend capability declaration belongs in the response or runtime config, not inside `featureFlags`.
- `errorRecovery` belongs in success/error response recovery semantics, not inside `featureFlags`.

## 7. P0 Boundary

This contract freezes names, defaults, source order, capability declaration semantics, and priority only.
It does not require implementing:

- remote feature flag service
- persistent user-level rollout
- percentage rollout
- multi-tenant policy
- production experimentation platform
- formal user-facing V5 settings UI
- backend forcing V5 rendering
- external real execution
- public collaboration platform
- real user identity system
- payment, booking, messaging, or reservation platform integration
