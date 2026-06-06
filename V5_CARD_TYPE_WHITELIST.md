# V5 P0 Card Type Whitelist Contract

## Status

This document freezes the P0 card type whitelist for V5 Generative UI.
It is a contract document only. It does not mean the renderer has already implemented these cards.

Related schema: `ui-contract.schema.json`, especially `$defs.UICardType`, `$defs.KnownUICardType`, `$defs.CardTypeWhitelistContract`, `$defs.CardTypePolicy`, and `x-cardTypeWhitelist`.

Note: `UICardType` is the forward-compatible wire string type. P0 rendering must use `KnownUICardType` plus `x-cardTypeWhitelist.p0MainRenderTypes`, not arbitrary unknown card types.

## Decision

P0 lightweight MVP implements 10 card types in the main card flow.
The machine-readable whitelist version is `v5-p0-card-types-2`.
The refrozen P0 includes local real collaboration state and a simulated execution lifecycle. That means share, feedback, and execution summary cards are no longer only future placeholders.

Other enum values remain in schema for future phases or compatibility, but they must not enter the first-version main rendering chain.

## P0 MVP Cards

| Card type | Required in P0 | Purpose | Why |
| --- | --- | --- | --- |
| `plan_summary` | yes | Show recommended plan overview. | Core card for validating whether the V5 card flow works. |
| `assumption_banner` | yes | Show default assumptions such as party size, budget, area, and time. | Handles ambiguous input without adding chatbot-style questioning cost. |
| `activity` | yes | Show one activity block. | Core local-life plan content. |
| `restaurant` | yes | Show one restaurant block. | Core local-life plan content. |
| `transport` | yes | Show one actionable route segment bound to `routeSegmentId`, `fromRef`, and `toRef`. | Transport alternatives need independent preview, adoption, and downstream timeline impact. |
| `timeline` | yes | Show a simple itinerary timeline. | Validates executability and schedule readability. |
| `soft_prompt` | yes | Ask for confirmation when safety or critical missing information exists. | Covers `unsafe_input` and avoids risky route gaps. |
| `share_summary` | yes | Show local share token, snapshot, and reviewer state. | P0 includes local real collaboration state. |
| `feedback_summary` | yes | Show submitted feedback and whether it blocks execution. | P0 requires feedback persistence and initiator-side回流. |
| `execution_summary` | yes | Show simulated execution record, steps, and status. | P0 includes `/api/executions` simulated lifecycle. |

## P0 Deferred Card Types

| Card type | P0 handling |
| --- | --- |
| `risk_notice` | Merge into `plan_summary.riskText` or route to `soft_prompt`; dedicated risk card moves to P1. |
| `collaboration_placeholder` | Compatibility only. Placeholder-only collaboration is superseded by `share_summary` and `feedback_summary` in P0. |

## Schema Rule

`UICard.type` may keep more enum values than P0 implements.
The P0 renderer must use `x-cardTypeWhitelist.p0MainRenderTypes` as the first-version rendering whitelist.

This distinction is intentional:

- Schema enum keeps future compatibility.
- P0 whitelist keeps implementation scope bounded to card flow, local collaboration, and simulated execution lifecycle.
- Deferred card types must not block P0 card flow.

## P0 Boundary

This contract does not require implementing:

- standalone risk notice card
- placeholder-only collaboration as the primary path
- P1/P2 card renderers
- external real execution, payment, messaging, reservation, or public collaboration platform integration
