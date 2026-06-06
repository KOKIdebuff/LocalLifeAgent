# V5 P0 Frontend Adapter Field Mapping Contract

## Status

This document freezes the P0 mapping contract for `agent-core-plan-to-ui-contract`.
It records how the legacy `agent-core.js` plan output must be converted into the V5 UI Contract.

This is a contract document only. It does not mean the adapter has already been implemented.

Related schema: `ui-contract.schema.json`, especially `$defs.AdapterMappingSet` and `x-adapterFieldMapping`.

## Adapter Boundary

- Adapter name: `agent-core-plan-to-ui-contract`.
- P0 adapter implementation lives in the frontend codebase.
- Adapter interface, input shape, output shape, and mapping rules are governed by `ui-contract.schema.json` and this adapter mapping contract.
- Input shape: legacy `agent-core.js` plan result.
- Output shape: `ui-contract.schema.json#/$defs/GenerativePlanSuccessResponse`.
- Output must pass `ui-contract.schema.json` validation before V5 UI rendering.
- If schema validation fails, V5 output must not be rendered; the UI falls back to the old UI path.
- Cards are display objects only. `entities`, `timeline`, and `actions` own business objects and interaction targets.
- V5 must not bind directly to V4 Runtime internals. If a future complete Runtime replaces the current V4 alpha backend, it should feed the same adapter / UI Contract surface without requiring a large V5 UI Contract rewrite.
- The adapter is also the P0 fixture bootstrap path: current `agent-core.js` output is converted into `success.adapter-fallback.v5-p0.json`, and the backend mock success fixture may reuse the same converted shape with backend mock source metadata.
- Unknown card types must be dropped from the P0 main rendering chain. Unknown action types must be hidden and must not execute.
- Schema validation failure is a hard guard: do not render converted output, do not partially render dirty backend data, and fall back to the old UI path.

## Runtime Adapter Boundary

This document governs the V5 frontend fallback adapter
`agent-core-plan-to-ui-contract`. It is not the same thing as the V4
`RuntimeAdapter`.

The V4 `RuntimeAdapter` is the stable, UI-agnostic access surface for the
headless Runtime Core. It exposes Runtime operations such as session lifecycle,
event-intent submission, event listing, capability query, recovery point
creation, and rollback to a recovery point. The public `submit_event` input
does not carry a trusted `fromState`; only Runtime creates authoritative Events.

V5 UI must use the V4 `RuntimeAdapter`, `RuntimeCapabilityContract`, and
`RuntimeEventContract`
when it needs Runtime state. It must not read Runtime internal tables, depend on
Runtime internal classes, or require Runtime to return UI cards. The frontend
adapter in this document may convert legacy `agent-core.js` plans into UI
Contract responses, but it must not become a shortcut around Runtime contracts.

`RuntimeSummary` carries both fields:

- `runtimeState`: authoritative Runtime state from `runtime.schema.json`.
- `displayPhase`: V5 presentation-only phase derived from the frozen mapping in
  `ui-contract.schema.json`.

## 1. Top-Level Mapping

| Old field | New field | Mapping rule |
| --- | --- | --- |
| `result.recommendedPlanId` | `activePlanRef` | Convert to `Ref(kind=plan)`. |
| `result.plans[]` | `entities[] + cards[]` | Each legacy plan generates one plan entity and one plan summary card. |
| `result.executionQueue` | `actions[] + execution seed` | Convert to simulated execution lifecycle actions only; do not call external platforms. |
| `result.agentLoopTrace` | `runtimeSummary.summaryText / runtimeSummary.evidenceItems` | Keep summary and selected evidence only; do not fully map trace internals. |
| `result.needsClarification` | `soft_prompt card` | Generate a Soft Prompt card. |
| `result.clarification` | `UIAction(type=answer_soft_prompt)` | Convert options to soft prompt answer actions. |
| `result.parsed.assumptions` | `assumptionBanner.items[]` | Convert to assumption items. |

## 2. Plan Mapping

| Old `plan` field | New UI Contract field | Rule |
| --- | --- | --- |
| `plan.id` | `UIEntity.id` | If old id is already `plan-*`, keep it; otherwise normalize to a schema-compatible plan scoped id. |
| `plan.name` | `UIEntity.title / UICard.title` | Plan title. |
| `plan.reason` | `UICard.reasonText` | Put into expandable explanation. |
| `plan.risks[]` | `risk_notice card` | Generate only when risk content exists. |
| `plan.score` | `meta.score` | Metadata only; do not show as primary status. |
| `plan.fit` | `meta.fit` | Audience or preference fit. |
| `plan.budget` | `summaryText` or `meta.budget` | Short display. |
| `plan.totalDuration` | `meta.totalDuration` | Display metadata. |
| `plan.recommended` | `status=selected` | Recommended plan becomes selected. |

## 3. Activity Mapping

| Old field | New field | Rule |
| --- | --- | --- |
| `plan.activity.name` | `UIEntity.title` | Activity name. |
| `plan.activity.type` | `meta.activityType` | Activity type. |
| `plan.activity.distance` | `meta.distanceText` | Display distance. |
| `plan.activity.price` | `meta.priceText` | Display price. |
| `plan.activity.tags[]` | `meta.tags[]` | Tags. |
| `plan.activity.canBook` | `meta.canBook` | Booking status. |
| `plan.activity.selectedSlot` | `meta.selectedSlot` | Bookable slot. |

Generated objects:

```text
UIEntity(kind=activity)
UICard(type=activity)
```

Missing field policy:

- If `name` is missing, generate a placeholder with title `待确认活动`.
- If `distance`, `price`, or `tags` is missing, leave it empty and do not block rendering.
- If `canBook` is missing, default to `false` to avoid implying automatic booking.

## 4. Restaurant Mapping

| Old field | New field | Rule |
| --- | --- | --- |
| `plan.restaurant.name` | `UIEntity.title` | Restaurant name. |
| `plan.restaurant.cuisine` | `meta.cuisine` | Cuisine. |
| `plan.restaurant.distance` | `meta.distanceText` | Distance. |
| `plan.restaurant.price` | `meta.priceText` | Per-person price or total price text. |
| `plan.restaurant.wait` | `meta.waitText` | Queue information. |
| `plan.restaurant.canReserve` | `meta.canReserve` | Reservation availability. |
| `plan.restaurant.selectedSlot` | `meta.selectedSlot` | Reservation slot. |
| `plan.restaurant.tags[]` | `meta.tags[]` | Tags. |

Missing field policy:

- If `name` is missing, generate a placeholder with title `待确认餐厅`.
- If `canReserve` is missing, default to `false`.
- If `wait` is missing, do not display queue information and do not invent it.

## 5. Timeline Mapping

| Old field | New field | Rule |
| --- | --- | --- |
| `plan.timeline[].time` | `UITimelineItem.timeLabel` | Display the original label. |
| `plan.timeline[].title` | `UITimelineItem.title` | Timeline block title. |
| `plan.timeline[].detail` | `UITimelineItem.detailText` | Details. |
| `index` | `UITimelineItem.id` | Generate `timeline-{planId}-{index}` style scoped id, normalized to schema format. |
| Corresponding activity or restaurant | `entityRef` | Link when possible; otherwise use a placeholder entity. Do not blindly point to the plan. |

P0 does not force precise parsing of `startTime` or `endTime`.
If the legacy field only has `time`, keep it in `timeLabel` and avoid introducing complex time formatting logic.

## 6. Actions Mapping

| Old field | New `UIAction` | Rule |
| --- | --- | --- |
| `plan.actionsPreview[]` | Display only; no real `UIAction` | Preview text is not executable action. |
| `plan.servicePackage.meituanActions[]` | `UIAction[]` | P0 local simulated execution actions. |
| `action.type=reserve_table` | `start_local_execution` or `open_reason` | Do not connect to a real backend reservation service. |
| `action.type=send_message` | `create_local_share` | Create a local share token / snapshot only; do not send external messages. |
| execution queue step | `advance_simulated_execution_step` | Advance a persisted simulated execution step after `/api/executions` creates the record. |
| low-impact execution queue step | `skip_simulated_execution_step` | Skip only when the step is low impact. |
| execution queue step cancel | `cancel_simulated_execution_step` | Cancel a step and require audit fields. |
| feedback-triggered regeneration | `regenerate_plan_from_feedback` | Call `/api/generative-plan` with current snapshot and feedback summary; output becomes a derived branch. |
| derived branch view | `view_plan_branch` | Open a proposed / adopted / rejected / archived branch snapshot. |
| derived branch adoption | `adopt_derived_branch` | Adopt a derived branch as the new active main and record `previousMainBranchId`. |
| derived branch rejection | `reject_derived_branch` | Reject a derived branch while retaining audit history. |
| previous main rollback | `rollback_previous_main_branch` | Roll back only to the immediately previous main. |
| `replanEvents[]` | `refresh_block` | Refresh entry for activity, restaurant, or transport blocks. |

P0 action allowlist:

```text
select_plan
refresh_block
edit_assumption
undo_replan
open_reason
answer_soft_prompt
create_local_share
submit_share_feedback
start_local_execution
advance_simulated_execution_step
skip_simulated_execution_step
cancel_simulated_execution_step
regenerate_plan_from_feedback
cancel_simulated_execution
view_plan_branch
adopt_derived_branch
reject_derived_branch
rollback_previous_main_branch
```

## 7. Assumption Banner Mapping

| Source | New field |
| --- | --- |
| `result.parsed.partySize` | `partySize` |
| `result.parsed.budgetPerPerson` or budget inference | `budgetPerPerson` |
| `result.parsed.location` | `area` |
| `result.parsed.timeRange.label` | `timePreset` |
| Transport default from local rules | `transportMode` |

Missing field policy:

- Missing assumptions must not block rendering.
- The banner should show that the system temporarily uses default values.
- `source` should be `local_rules` or `adapter_fallback` when values are inferred by the adapter.

## 8. Risk / Notice Mapping

| Old field | New field |
| --- | --- |
| `plan.risks[]` | `risk_notice card.summaryText / riskText` |
| `plan.issueNotices[]` | `risk_notice card.evidenceItems[]` |
| `parsed.warnings[]` | `risk_notice card` |

Policy:

- Generate risk cards only when risk content exists.
- Do not mix risks into the normal plan summary.
- Safety risks should prefer `soft_prompt`.

## 9. Degradation Policy

| Situation | Handling |
| --- | --- |
| `plans` is empty | Generate `soft_prompt` or `recoverable_error`. |
| A single plan misses activity | Keep plan card; use placeholder activity card. |
| A single plan misses restaurant | Keep plan card; use placeholder restaurant card. |
| Timeline is missing | Generate plan summary only; do not generate timeline card. |
| Action target is missing | Do not generate that action; record warning. |
| Schema validation fails | Do not render V5; fall back to the old UI path. |

## Implementation Notes

- The adapter must never infer action targets from display text.
- Every generated `entityRef` or `targetRef` must include `kind`, `id`, `lineageId`, `sessionId`, and `version`.
- External real execution, external real collaboration, public sharing, real reservation, payment, and messaging are not part of P0.
- Local share state, local feedback persistence, and simulated execution records are part of the refrozen P0 contract.
- P0 only freezes this mapping contract and keeps `agent-core.js` fallback available.
- P0 main experience is the UI Contract card flow. The old plan card remains only as fallback, debug, or compatibility view.
