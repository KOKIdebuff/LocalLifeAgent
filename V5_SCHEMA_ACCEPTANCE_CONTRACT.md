# V5 P0 Schema Acceptance Contract

## Status

This document freezes the P0 schema acceptance contract for V5 Generative UI.
It is a contract document only. It does not mean type generation, backend tests, adapter tests, golden tests, or fixture JSON files already exist.

Related schema: `ui-contract.schema.json`, especially `$defs.SchemaAcceptanceContract`, `$defs.SchemaGeneratedTypeTarget`, `$defs.SchemaAcceptanceTestSuite`, and `x-schemaAcceptanceContract`.

## Decision

P0 uses this acceptance path:

```text
ui-contract.schema.json
  -> schema validation tests
  -> TS type generation or TS type validation
  -> Python JSON Schema validation
  -> backend contract tests
  -> adapter contract tests
  -> fixture golden tests
```

Core idea:

`ui-contract.schema.json` is the source of truth. Types, backend responses, adapter output, and golden fixtures must derive from or validate against this schema instead of creating parallel hand-maintained contracts.

P0 must first establish schema validation tests. Type generation is allowed, but P0 does not block on building a full backend model layer.

The lack of schema / fixture / adapter contract tests should not block all feature development, but V5 P0 should not truly connect the new frontend path until a minimum quality gate exists.

## Minimum Quality Gate

P0 must establish the required layers below before the V5 card flow, local collaboration, and simulated execution lifecycle are treated as the main experience:

| Layer | Required check | Purpose |
| --- | --- | --- |
| schema baseline | `ui-contract.schema.json` parses, core `$defs` exist, P0 card/action whitelist exists. | Prevent broken contract files. |
| fixture golden | At least 3 shared fixtures pass schema. | Unify frontend and backend samples. |
| backend contract | `/api/generative-plan` mock success and standard error responses pass schema. | Prove backend mock is integrable. |
| adapter contract | Legacy `agent-core.js` plan converted by adapter passes schema. | Prove fallback remains available. |
| execution contract | `/api/executions` create/query/advance/skip/cancel success and error envelopes pass schema. | Prove simulated execution lifecycle is integrable. |
| collaboration contract | local share page, token snapshot, feedback submit, and feedback回流 responses pass schema. | Prove local real collaboration state is integrable. |
| persistence contract | SQLite-backed share / feedback / execution / audit state has minimal schema and readback tests. | Prove local state is persisted, queryable, and replayable. |
| plan branch contract | Main / Derived Branch generation, view, adopt, reject, and previous-main rollback pass schema. | Prove lightweight formal Plan Branch lifecycle is integrable. |

Recommended P0 priority:

| Phase | Work | Required for P0 |
| --- | --- | --- |
| P0-1 | schema parse + core defs / enum checks | yes |
| P0-2 | 3 golden fixtures pass schema | yes |
| P0-3 | `/api/generative-plan` mock contract test | yes |
| P0-4 | adapter output contract test | yes |
| P0-5 | `/api/executions` simulated lifecycle contract test, including cancel and low-impact skip | yes |
| P0-6 | local share / feedback contract test | yes |
| P0-7 | local SQLite collaboration / execution / audit readback test | yes |
| P0-8 | regeneration request contract test through `/api/generative-plan` | yes |
| P0-9 | lightweight Plan Branch contract test | yes |
| P0-10 | unsafe / version / error negative extensions | recommended |
| V5.1 | TS type generation, full Pydantic model layer, complex snapshots | later |

Minimum Done When:

- `ui-contract.schema.json` is parseable.
- Three golden fixtures pass schema: `success.backend-planned.v5-p0.json`, `success.adapter-fallback.v5-p0.json`, and `error.schema-validation-failed.v5-p0.json`.
- `/api/generative-plan` mock success and standard error responses pass contract tests.
- Adapter fallback output from legacy `agent-core.js` passes schema.
- `/api/executions` create/query/advance/skip/cancel responses pass contract tests and never imply external execution.
- Local share / feedback responses pass contract tests and never imply public sharing or real identity.
- Local SQLite share / feedback / execution / audit state can be saved and read back.
- Regeneration through `/api/generative-plan` carries current snapshot and feedback summary, saves regeneration event fields, and falls back to `agent-core.js` adapter on failure.
- Plan Branch supports one active main, up to 3 derived branches, proposed / adopted / rejected / archived statuses, adoption, rejection, and rollback to previous main.
- Plan Branch tests must assert no complex version tree, partial merge, multi-level conflict resolution, or long-term permission system in P0.
- Unknown card types are not rendered; unknown action types are not executed.
- Schema validation failure does not render backend dirty data and uses fallback.

Technical tradeoff:

- Add a lightweight JSON Schema validation dependency for Python tests, for example `jsonschema>=4,<5`, when implementing the tests.
- Do not require a complete TypeScript generation pipeline, complete Pydantic model layer, large end-to-end UI automation, all future card/action types, public sharing tests, real identity tests, external execution tests, or payment / booking / messaging integration tests in P0.

## Generated Types

| Target | Purpose | P0 requirement |
| --- | --- | --- |
| TypeScript | Frontend contract types | Generate or at least validate against `ui-contract.schema.json`. |
| Python | Backend contract validation | Use JSON Schema validation first; full Pydantic model hierarchy is not required in P0. |

Rules:

- Generated types must use `ui-contract.schema.json` as their source.
- Hand-written TS/Python contract types must not drift from the schema.
- P0 may satisfy the TypeScript requirement through generated types or a deterministic type validation check.
- P0 Python validation should use JSON Schema first. Complete Pydantic contract models can be added later when the backend surface stabilizes.

## Required Test Suites

| Test suite | Purpose | Required |
| --- | --- | --- |
| `schema_parse_test` | Validate that `ui-contract.schema.json` is valid JSON schema. | yes |
| `backend_contract_tests` | Validate backend planned or mock responses against the schema. | yes |
| `adapter_contract_tests` | Validate legacy `agent-core.js` adapter output against the schema. | yes |
| `fixture_golden_tests` | Validate golden fixtures against schema and stable snapshots. | yes |
| `execution_lifecycle_contract_tests` | Validate `/api/executions` create/query/advance/skip/cancel and blocked/cancelled error paths. | yes |
| `collaboration_feedback_contract_tests` | Validate local share token, plan snapshot, feedback submit, read state, and initiator feedback回流. | yes |
| `local_state_persistence_tests` | Validate SQLite share / feedback / execution / audit write and readback. | yes |
| `regeneration_contract_tests` | Validate `/api/generative-plan` regeneration requests with snapshot, feedback summary, lineage, and adapter fallback. | yes |
| `plan_branch_contract_tests` | Validate main / derived branch generation, view, adoption, rejection, previous-main rollback, and no-merge boundary. | yes |
| `typescript_type_check` | Generate or validate frontend contract types from schema. | yes |

All core responses must be exercised through golden fixtures and contract tests.

## Golden Fixtures

P0 should maintain these golden fixtures:

```text
success.backend-planned.v5-p0.json
success.adapter-fallback.v5-p0.json
error.schema-validation-failed.v5-p0.json
error.unsafe-input.v5-p0.json
error.version-conflict.v5-p0.json
```

Recommended directory:

```text
fixtures/v5/generative-plan/
```

Negative fixtures must live under:

```text
fixtures/v5/generative-plan/invalid/
```

Rules:

- Shared golden fixtures must pass `ui-contract.schema.json`.
- Error golden fixtures must be structured envelopes, not dirty backend payloads.
- Invalid fixtures are for negative tests only and must not become shared render samples.
- Golden fixtures should use fixed UUID or ULID values to avoid snapshot churn.

## Acceptance Rules

- `ui-contract.schema.json` is the P0 UI Contract fact source.
- Type generation, backend contract tests, adapter contract tests, and fixture golden tests must use the same schema.
- Backend and adapter outputs must not introduce undeclared fields to carry critical state.
- Golden fixture changes should be treated as contract changes, not harmless sample updates.
- If schema and generated types disagree, schema wins.
- If schema and fixture disagree, either update the fixture or explicitly revise the schema contract.

## P0 Boundary

This contract does not implement:

- TS type generation
- Python type generation
- backend contract tests
- adapter contract tests
- fixture golden tests
- actual golden fixture JSON files
