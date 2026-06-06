# V5 Version Compatibility Contract

## Status

This document freezes the P0 version compatibility contract for V5 Generative UI.
It is a contract document only. It does not mean the frontend compatibility parser has already been implemented.

Related schema: `ui-contract.schema.json`, especially `$defs.UiSchemaVersion`, `$defs.CardSchemaVersion`, `$defs.VersionCompatibilityContract`, `$defs.VersionCompatibilityRules`, `$defs.KnownUICardType`, `$defs.KnownUIActionType`, and `x-versionCompatibilityContract`.

## Core Idea

The frontend should no longer only compare the full version string.
It should recognize the version family.

If the response is in the `v5` family and the minimum UI Contract fields still validate, the frontend may downgrade-render it.

```text
v5-p0
v5-p1
v5-p2
```

All of these are `v5` family versions. P0 may render a later `v5-*` response only through the minimum contract and downgrade rules.

## Required Capabilities

If all `requiredCapabilities` are supported, the frontend may render.

P0 minimum required capabilities:

```text
minimum_ui_contract
cards_entities_timeline_actions
p0_card_type_whitelist
p0_action_type_whitelist
adapter_fallback
```

If any required capability is unsupported, the frontend must not guess. It should fallback.

## Optional Capabilities

If an `optionalCapabilities` item is unsupported:

- ignore it, or
- merge-degrade it into existing P0 cards, or
- hide the related UI.

Unsupported optional capabilities must not block the P0 main card flow.

## Unknown Card Types

Unknown card types must not enter the main rendering chain.

Rules:

- Keep the raw payload if needed for debugging.
- Do not render the unknown card in the P0 main flow.
- Do not infer business behavior from unknown card text.
- Use `x-cardTypeWhitelist.p0MainRenderTypes` for P0 rendering.

## Unknown Action Types

Unknown action types must be hidden and must not execute.

Rules:

- Do not show an executable button for unknown action types.
- Do not call backend or local execution logic for unknown action types.
- Preserve the raw action only for debugging or future compatibility.

## Unknown Fields

Unknown fields may be preserved, but rendering and business logic must not depend on them.

This means:

- Unknown fields are not allowed to carry critical state.
- Unknown fields may be retained in raw payload, `meta`, or future `extensions` storage.
- P0 rendering must rely only on the minimum UI Contract fields.

This preserves the earlier strict-contract principle: unknown fields are tolerated for compatibility, not trusted for behavior.

## Schema Validation Failure

If schema validation fails, the frontend must fallback.

```text
schema_validation_failed -> adapter fallback
```

The version compatibility layer must not be used to render invalid data.

## Wire Format Decisions

- `uiSchemaVersion` accepts `v5` family strings such as `v5-p0`, `v5-p1`, or `v5-p2`.
- `cardSchemaVersion` accepts `v5` family card versions such as `v5-p0-card`.
- `UICard.type` and `UIAction.type` wire format allow forward-compatible strings.
- Known card and action types remain separately defined by `KnownUICardType` and `KnownUIActionType`.

This separation is intentional:

- Wire format stays forward-compatible.
- Renderer behavior stays whitelist-based and conservative.

## P0 Boundary

This contract does not implement:

- frontend compatibility parser
- capability negotiation UI
- migration tooling
- P1/P2 card renderers
- unknown action execution
