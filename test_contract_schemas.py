import json
import unittest
from pathlib import Path


ROOT = Path(__file__).parent

EXPECTED_TRANSITIONS = {
    "intent_loading": ["clarifying", "planning_local", "failed_recoverable"],
    "clarifying": ["planning_local"],
    "planning_local": ["researching_tools"],
    "researching_tools": ["merging_plans"],
    "merging_plans": ["verifying_plan"],
    "verifying_plan": ["ready_for_confirmation", "replanning"],
    "replanning": ["verifying_plan"],
    "ready_for_confirmation": ["executing_mock_actions", "feedback_capture"],
    "executing_mock_actions": ["feedback_capture"],
    "feedback_capture": ["feedback_capture", "memory_candidate_review", "done"],
    "memory_candidate_review": ["memory_candidate_review", "memory_committed", "done"],
    "memory_committed": ["done"],
    "failed_recoverable": ["planning_local"],
    "done": [],
}


def load_json(name):
    with (ROOT / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def resolve_ref(schema, ref):
    prefix = "#/$defs/"
    if not ref.startswith(prefix):
        raise AssertionError(f"Unsupported local ref: {ref}")
    return schema["$defs"][ref.removeprefix(prefix)]


def load_state_machine():
    return load_json("runtime-state-machine.json")


def source_runtime_transitions(machine):
    return {
        (item["from"], item["event"], item["to"])
        for item in machine["runtimeTransitions"]
    }


def schema_runtime_transitions(schema):
    transitions = set()
    for item in schema["$defs"]["RuntimeTransition"]["oneOf"]:
        transition_def = resolve_ref(schema, item["$ref"])
        constraints = transition_def["allOf"][1]["properties"]
        transitions.add(
            (
                constraints["fromState"]["const"],
                constraints["eventType"]["const"],
                constraints["toState"]["const"],
            )
        )
    return transitions


class ContractSchemaTests(unittest.TestCase):
    def test_contract_schema_files_parse(self):
        for name in [
            "intent.schema.json",
            "feedback-memory.schema.json",
            "runtime.schema.json",
            "runtime-state-machine.json",
        ]:
            with self.subTest(name=name):
                schema = load_json(name)
                if name.endswith(".schema.json"):
                    self.assertEqual(schema["$schema"], "https://json-schema.org/draft/2020-12/schema")
                    self.assertIn("$defs", schema)

    def test_runtime_transition_table_is_fixed_and_complete(self):
        schema = load_json("runtime.schema.json")
        machine = load_state_machine()
        states = {item["name"] for item in machine["runtimeStates"]}
        transitions = schema["x-runtimeTransitions"]

        self.assertEqual(transitions, EXPECTED_TRANSITIONS)
        self.assertEqual(set(schema["$defs"]["RuntimeState"]["enum"]), states)
        self.assertEqual(set(transitions), states)
        for from_state, next_states in transitions.items():
            with self.subTest(from_state=from_state):
                self.assertTrue(set(next_states).issubset(states))
        self.assertEqual(transitions["done"], [])
        self.assertEqual(transitions["failed_recoverable"], ["planning_local"])

    def test_state_machine_source_matches_generated_schema_contracts(self):
        schema = load_json("runtime.schema.json")
        machine = load_state_machine()

        source_states = [item["name"] for item in machine["runtimeStates"]]
        source_events = machine["runtimeEventTypes"]
        self.assertEqual(schema["$defs"]["RuntimeState"]["enum"], source_states)
        self.assertEqual(schema["$defs"]["RuntimeEventType"]["enum"], source_events)
        self.assertEqual(
            schema["$defs"]["RuntimeTransitionEventType"]["enum"],
            machine["runtimeTransitionEventTypes"],
        )
        self.assertEqual(schema_runtime_transitions(schema), source_runtime_transitions(machine))
        self.assertEqual(schema["x-stateMachineSource"]["path"], "runtime-state-machine.json")
        self.assertEqual(machine["machineVersion"], "v4-p0-2")
        self.assertEqual(machine["schemaVersion"], "v4-runtime-schema-2")
        self.assertEqual(schema["x-stateMachineSource"]["machineVersion"], "v4-p0-2")
        self.assertTrue(schema["x-stateMachineSource"]["ciMustDetectDrift"])

    def test_v4_p0_2_corrects_transition_event_semantics(self):
        machine = load_state_machine()
        transitions = source_runtime_transitions(machine)

        self.assertIn(
            ("ready_for_confirmation", "confirmation_accepted", "executing_mock_actions"),
            transitions,
        )
        self.assertIn(
            ("executing_mock_actions", "mock_execution_completed", "feedback_capture"),
            transitions,
        )
        self.assertIn(
            ("failed_recoverable", "recovery_resumed", "planning_local"),
            transitions,
        )
        self.assertNotIn(
            ("ready_for_confirmation", "mock_execution_completed", "executing_mock_actions"),
            transitions,
        )
        self.assertNotIn(
            ("executing_mock_actions", "feedback_captured", "feedback_capture"),
            transitions,
        )
        self.assertNotIn(
            ("failed_recoverable", "planning_completed", "planning_local"),
            transitions,
        )

    def test_all_declared_and_undeclared_runtime_transition_combinations(self):
        schema = load_json("runtime.schema.json")
        machine = load_state_machine()
        declared = source_runtime_transitions(machine)
        schema_declared = schema_runtime_transitions(schema)
        states = [item["name"] for item in machine["runtimeStates"]]
        events = machine["runtimeEventTypes"]

        for transition in declared:
            with self.subTest(transition=transition):
                self.assertIn(transition, schema_declared)

        for from_state in states:
            for event_type in events:
                for to_state in states:
                    transition = (from_state, event_type, to_state)
                    with self.subTest(transition=transition):
                        self.assertEqual(transition in schema_declared, transition in declared)

    def test_terminal_states_cannot_continue(self):
        machine = load_state_machine()
        transitions = source_runtime_transitions(machine)
        terminal_runtime = set(machine["p0Rules"]["terminalRuntimeStates"])
        terminal_lifecycle = set(machine["p0Rules"]["terminalLifecycleStates"])

        self.assertFalse(any(from_state in terminal_runtime for from_state, _, _ in transitions))
        self.assertFalse(
            any(
                item["from"] in terminal_lifecycle
                for item in machine["lifecycleTransitions"]
            )
        )

    def test_commands_produce_declared_events_and_lifecycle_transitions_are_complete(self):
        schema = load_json("runtime.schema.json")
        machine = load_state_machine()
        declared_events = set(machine["runtimeEventTypes"])
        command_types = set(schema["$defs"]["RuntimeCommandType"]["enum"])
        source_command_types = {item["name"] for item in machine["commands"]}
        source_command_events = {item["produces"] for item in machine["commands"]}

        self.assertEqual(command_types, source_command_types)
        self.assertTrue(source_command_events.issubset(declared_events))
        self.assertEqual(len(machine["lifecycleTransitions"]), 4)
        self.assertEqual(
            schema["$defs"]["RuntimeLifecycleStatus"]["enum"],
            [item["name"] for item in machine["lifecycleStates"]],
        )

    def test_command_event_session_and_recovery_contracts(self):
        schema = load_json("runtime.schema.json")
        machine = load_state_machine()
        request_properties = schema["$defs"]["RuntimeRequest"]["properties"]
        command = schema["$defs"]["RuntimeCommand"]
        session = schema["$defs"]["PersistedRuntimeSession"]
        recovery = schema["$defs"]["RuntimeRecoveryPoint"]
        engine = schema["$defs"]["RuntimeTransitionEngineContract"]["properties"]

        self.assertNotIn("event", request_properties)
        self.assertIn("idempotencyKey", command["required"])
        self.assertIn("expectedVersion", command["required"])
        self.assertNotIn("fromState", command["properties"])
        self.assertIn("version", session["required"])
        self.assertIn("lastEventId", session["required"])
        self.assertTrue(
            {
                "latestRecoveryPointId",
                "pausedAt",
                "closedAt",
                "updatedAt",
            }.issubset(session["required"]),
        )
        self.assertEqual(
            engine["clientInput"]["const"],
            "event_intent_via_runtime_adapter",
        )
        self.assertEqual(engine["stateAuthority"]["const"], "persisted_session")
        self.assertEqual(engine["writeAtomicity"]["const"], "event_and_session_same_transaction")
        self.assertEqual(engine["concurrency"]["const"], "optimistic_lock_session_version")
        self.assertEqual(engine["idempotency"]["const"], "unique_idempotency_key_per_write")
        self.assertEqual(
            set(recovery["required"]),
            {
                "recoveryPointId",
                "sessionId",
                "sessionVersion",
                "runtimeState",
                "snapshot",
                "createdAt",
            },
        )
        self.assertEqual(machine["recoveryPoint"]["retention"], "latest_only")
        self.assertFalse(machine["p0Rules"]["businessReplaySupported"])

    def test_runtime_adapter_lifecycle_and_error_contracts(self):
        schema = load_json("runtime.schema.json")
        machine = load_state_machine()
        methods = schema["$defs"]["RuntimeAdapterMethod"]["enum"]
        write_input = schema["$defs"]["RuntimeAdapterWriteInput"]
        errors = schema["$defs"]["RuntimeAdapterErrorCode"]["enum"]
        lifecycle = schema["x-sessionLifecycleRules"]

        self.assertIn("submit_event", methods)
        self.assertNotIn("submit_command", methods)
        self.assertEqual(
            set(write_input["required"]),
            {"sessionId", "expectedVersion", "idempotencyKey"},
        )
        self.assertEqual(
            set(errors),
            {
                "session_not_found",
                "session_paused",
                "session_closed",
                "invalid_transition",
                "version_conflict",
                "recovery_point_not_found",
                "rollback_not_supported",
                "mutually_exclusive_operations",
            },
        )
        self.assertEqual(lifecycle["active"]["pause_session"], "paused")
        self.assertEqual(lifecycle["paused"]["resume_session"], "active")
        self.assertEqual(lifecycle["paused"]["submit_event"], "session_paused")
        self.assertEqual(lifecycle["closed"]["any_write"], "session_closed")
        self.assertTrue(machine["p0Rules"]["submitEventIsIntentOnly"])
        self.assertFalse(machine["p0Rules"]["clientFromStateTrusted"])

    def test_lifecycle_events_do_not_require_fake_business_transition(self):
        schema = load_json("runtime.schema.json")
        envelope = schema["$defs"]["RuntimeEventEnvelope"]
        event_types = schema["$defs"]["RuntimeEventType"]["enum"]
        lifecycle_condition = envelope["allOf"][0]
        runtime_condition = envelope["allOf"][1]

        self.assertTrue(
            {
                "session_created",
                "session_paused",
                "session_resumed",
                "session_closed",
                "recovery_point_created",
                "rollback_completed",
                "rollback_failed",
            }.issubset(event_types),
        )
        self.assertEqual(
            set(lifecycle_condition["then"]["required"]),
            {"fromLifecycleStatus", "toLifecycleStatus", "reason"},
        )
        self.assertEqual(len(lifecycle_condition["then"]["oneOf"]), 4)
        self.assertNotIn("lifecycleTransition", envelope["properties"])
        self.assertIn("runtimeTransition", runtime_condition["then"]["required"])
        self.assertNotIn("runtimeTransition", lifecycle_condition["then"]["required"])
        self.assertTrue({"actor", "traceId"}.issubset(envelope["required"]))

    def test_runtime_p0_capability_and_persistence_profiles(self):
        schema = load_json("runtime.schema.json")
        machine = load_state_machine()
        capability_profile = schema["x-runtimeP0Capabilities"]
        target_capabilities = {
            item["name"]: item
            for item in capability_profile["targetCapabilities"]
        }
        effective_capabilities = {
            item["name"]: item
            for item in capability_profile["effectiveCapabilities"]
        }
        persistence = schema["x-persistencePolicy"]
        recovery = schema["x-recoveryPointPolicy"]

        self.assertEqual(
            capability_profile["capabilityVersion"],
            "v4-runtime-capabilities-3",
        )
        self.assertTrue(capability_profile["effectiveCapabilitiesAreAuthoritative"])
        self.assertEqual(
            capability_profile["targetStatusMeaning"]["supported"],
            "contract_frozen",
        )
        self.assertEqual(
            capability_profile["effectiveAvailabilityMeaning"]["available"],
            "implemented_and_callable",
        )
        self.assertEqual(
            capability_profile["targetStatusValues"],
            ["supported", "degraded", "unsupported"],
        )
        self.assertEqual(
            capability_profile["effectiveAvailabilityValues"],
            ["available", "degraded", "unavailable"],
        )
        self.assertEqual(target_capabilities["session_lifecycle"]["status"], "supported")
        self.assertEqual(target_capabilities["state_machine"]["status"], "supported")
        self.assertEqual(target_capabilities["event_stream"]["status"], "supported")
        self.assertEqual(target_capabilities["persistence"]["status"], "supported")
        self.assertEqual(target_capabilities["recovery_point"]["status"], "supported")
        self.assertEqual(target_capabilities["rollback_primitive"]["status"], "degraded")
        self.assertTrue(
            target_capabilities["rollback_primitive"]["limits"]["latestRecoveryPointOnly"],
        )
        self.assertFalse(
            target_capabilities["rollback_primitive"]["limits"]["externalCompensation"],
        )
        self.assertFalse(
            target_capabilities["rollback_primitive"]["limits"]["taskReplay"],
        )
        self.assertEqual(target_capabilities["runtime_adapter"]["status"], "supported")
        self.assertEqual(target_capabilities["capability_query"]["status"], "supported")
        self.assertEqual(target_capabilities["contract_tests"]["status"], "supported")
        self.assertEqual(target_capabilities["task_replay"]["status"], "unsupported")
        self.assertEqual(
            target_capabilities["external_compensation"]["status"],
            "unsupported",
        )

        self.assertEqual(
            set(target_capabilities),
            set(effective_capabilities),
        )
        self.assertEqual(
            effective_capabilities["session_lifecycle"]["availability"],
            "unavailable",
        )
        self.assertEqual(
            effective_capabilities["state_machine"]["availability"],
            "degraded",
        )
        self.assertEqual(
            effective_capabilities["event_stream"]["availability"],
            "degraded",
        )
        self.assertEqual(
            effective_capabilities["persistence"]["availability"],
            "unavailable",
        )
        self.assertEqual(
            effective_capabilities["recovery_point"]["availability"],
            "unavailable",
        )
        self.assertEqual(
            effective_capabilities["rollback_primitive"]["availability"],
            "unavailable",
        )
        self.assertEqual(
            effective_capabilities["runtime_adapter"]["availability"],
            "unavailable",
        )
        self.assertEqual(
            effective_capabilities["capability_query"]["availability"],
            "unavailable",
        )
        self.assertEqual(
            effective_capabilities["contract_tests"]["availability"],
            "available",
        )
        self.assertEqual(
            persistence["tables"],
            [
                "runtime_sessions",
                "runtime_events",
                "runtime_recovery_points",
                "runtime_schema_migrations",
            ],
        )
        self.assertEqual(
            persistence["databaseStrategy"],
            "existing_sqlite_file_independent_runtime_tables",
        )
        self.assertTrue(persistence["eventAndSessionWriteAtomic"])
        self.assertFalse(persistence["migrateThinTemporarySessions"])
        self.assertTrue(persistence["runtimeTablesIndependentFromMemorySchema"])
        self.assertTrue(persistence["eventPayloadAllowlistRequired"])
        self.assertTrue(persistence["busyTimeoutRequired"])
        self.assertTrue(recovery["rollbackCreatesNewVersion"])
        self.assertFalse(recovery["rollbackOverwritesHistory"])
        schema_capabilities = []
        for item in capability_profile["targetCapabilities"]:
            normalized = {
                key: value
                for key, value in item.items()
                if key not in {"version", "reason"}
                and not (key == "limits" and not value)
            }
            schema_capabilities.append(normalized)
        self.assertEqual(machine["targetCapabilities"], schema_capabilities)
        self.assertEqual(machine["persistence"], persistence)

        contract = schema["$defs"]["RuntimeCapabilityContract"]
        self.assertEqual(
            set(contract["required"]),
            {
                "capabilityVersion",
                "targetCapabilities",
                "effectiveCapabilities",
                "targetStatusValues",
                "effectiveAvailabilityValues",
                "uiDependency",
                "effectiveCapabilitiesAreAuthoritative",
            },
        )

    def test_dual_entry_single_core_and_execution_boundary_are_frozen(self):
        schema = load_json("runtime.schema.json")
        machine = load_state_machine()
        compatibility = schema["x-compatibilityArchitecture"]
        session_api = schema["x-sessionApi"]
        execution = schema["x-executionBoundary"]

        self.assertEqual(compatibility, machine["compatibilityArchitecture"])
        self.assertEqual(compatibility["mode"], "dual_entry_single_runtime_core")
        self.assertEqual(compatibility["legacyEntry"], "POST /api/runtime")
        self.assertEqual(compatibility["singleStateAuthority"], "RuntimeCore")
        self.assertFalse(compatibility["dualWriteAllowed"])
        self.assertTrue(compatibility["rollbackRequiresLegacyPath"])
        self.assertEqual(session_api["version"], "v4-p0-2")
        self.assertIn("GET /api/runtime/capabilities", session_api["routes"])

        self.assertEqual(execution, machine["executionBoundary"])
        self.assertFalse(execution["runtimeOwnsTaskStepLifecycle"])
        self.assertEqual(execution["executionImplementationPhase"], "P1")
        self.assertIn("attempt_history", execution["executionOwns"])
        self.assertIn("activeExecutionId", execution["runtimeP0Owns"])

    def test_runtime_request_feedback_and_memory_decision_are_mutually_exclusive(self):
        schema = load_json("runtime.schema.json")
        request = schema["$defs"]["RuntimeRequest"]
        exclusion = request["allOf"][0]["not"]
        rules = request["x-operationRules"]
        conflict = schema["$defs"]["RuntimeOperationConflictError"]

        self.assertEqual(set(exclusion["required"]), {"feedback", "memoryDecision"})
        self.assertNotIn("properties", exclusion)
        self.assertIn("feedback", request["properties"])
        self.assertIn("memoryDecision", request["properties"])
        self.assertTrue(rules["feedbackSupported"])
        self.assertTrue(rules["memoryDecisionSupported"])
        self.assertFalse(rules["sameRequestAllowed"])
        self.assertEqual(rules["conflictError"], "mutually_exclusive_operations")
        self.assertEqual(
            set(rules["conflictingFields"]),
            {"feedback", "memoryDecision"},
        )
        invalid_values = [
            item["value"]
            for item in request["x-invalidExamples"]
        ]
        self.assertTrue(
            all(
                "feedback" in value and "memoryDecision" in value
                for value in invalid_values
            ),
        )
        self.assertTrue(
            any(value["feedback"] is None for value in invalid_values),
        )
        self.assertEqual(
            conflict["properties"]["error"]["const"],
            "mutually_exclusive_operations",
        )
        self.assertEqual(
            conflict["properties"]["conflictingFields"]["const"],
            ["feedback", "memoryDecision"],
        )
        self.assertTrue(conflict["properties"]["recoverable"]["const"])

    def test_v5_runtime_summary_uses_runtime_state_and_display_phase(self):
        runtime_schema = load_json("runtime.schema.json")
        ui_schema = load_json("ui-contract.schema.json")
        summary = ui_schema["$defs"]["RuntimeSummary"]
        mapping = ui_schema["x-runtimeStateDisplayMapping"]
        flags = ui_schema["$defs"]["FeatureFlags"]

        self.assertNotIn("currentState", summary["properties"])
        self.assertIn("runtimeState", summary["required"])
        self.assertIn("displayPhase", summary["required"])
        self.assertEqual(
            summary["properties"]["runtimeState"]["$ref"],
            "runtime.schema.json#/$defs/RuntimeState",
        )
        self.assertEqual(
            set(mapping["mapping"]),
            set(runtime_schema["$defs"]["RuntimeState"]["enum"]),
        )
        display_phases = set(ui_schema["$defs"]["RuntimeDisplayPhase"]["enum"])
        self.assertTrue(set(mapping["mapping"].values()).issubset(display_phases))
        self.assertNotIn("executionContractOnly", flags["properties"])
        self.assertFalse(
            flags["properties"]["executionImplementationRequired"]["default"],
        )
        self.assertFalse(
            ui_schema["x-featureFlagContract"]["defaults"]["executionImplementationRequired"],
        )

    def test_runtime_response_contract_covers_minimum_scenarios(self):
        schema = load_json("runtime.schema.json")
        response = schema["$defs"]["RuntimeResponse"]
        refs = [item["$ref"] for item in response["oneOf"]]
        response_defs = [resolve_ref(schema, ref) for ref in refs]
        statuses = {
            item["properties"]["status"]["const"]
            for item in response_defs
            if "status" in item.get("properties", {})
        }

        self.assertTrue(
            {
                "planning_ready",
                "clarification_required",
                "recoverable_failure",
                "feedback_captured",
                "memory_committed",
                "memory_decision_rejected",
                "operation_recoverable_failure",
            }.issubset(statuses),
        )
        self.assertEqual(
            schema["$defs"]["RuntimeClarificationResponse"]["properties"]["currentState"]["const"],
            "clarifying",
        )
        self.assertEqual(
            schema["$defs"]["RuntimeRecoverableFailureResponse"]["properties"]["currentState"]["const"],
            "failed_recoverable",
        )
        self.assertEqual(
            schema["$defs"]["RuntimeMemoryCommittedResponse"]["properties"]["currentState"]["const"],
            "memory_committed",
        )
        self.assertEqual(
            schema["$defs"]["RuntimeMemoryDecisionRejectedResponse"]["properties"]["currentState"]["const"],
            "memory_candidate_review",
        )

    def test_feedback_memory_contract_preserves_candidate_first_loop(self):
        schema = load_json("feedback-memory.schema.json")
        decision_request = schema["$defs"]["CandidateDecisionRequest"]
        decision_response = schema["$defs"]["CandidateDecisionSuccessResponse"]
        feedback_response = schema["$defs"]["FeedbackResponse"]
        privacy = schema["x-privacyRules"]

        self.assertEqual(decision_request["properties"]["action"]["enum"], ["adopt", "ignore", "correct"])
        self.assertEqual(decision_response["properties"]["status"]["enum"], ["adopted", "ignored"])
        self.assertIn("null", feedback_response["properties"]["candidate"]["oneOf"][1]["type"])
        self.assertEqual(privacy["longTermMemoryRequires"], ["adopt", "correct"])
        self.assertEqual(privacy["blockedByDefault"], ["L2", "L3"])
        self.assertEqual(privacy["authorizedExecutionDataStorage"], "separate_future_channel")
        self.assertEqual(privacy["auditDurability"], "best_effort_non_blocking")
        self.assertEqual(privacy["memoryConflictPriority"], "current_request_overrides_memory")
        decision_error = schema["$defs"]["CandidateDecisionErrorResponse"]
        self.assertFalse(decision_error["additionalProperties"])
        self.assertNotIn("candidate", decision_error["properties"])
        self.assertIn("candidateStatus", decision_error["properties"])
        self.assertIn(
            "sensitive_correction_blocked",
            decision_error["properties"]["error"]["enum"],
        )
        self.assertIn(
            "sensitive_candidate_blocked",
            decision_error["properties"]["error"]["enum"],
        )

    def test_runtime_request_and_failure_paths_are_structured(self):
        schema = load_json("runtime.schema.json")
        request = schema["$defs"]["RuntimeRequest"]["properties"]
        event_types = schema["$defs"]["RuntimeEventType"]["enum"]

        self.assertEqual(request["feedback"]["oneOf"][0]["$ref"], "#/$defs/RuntimeFeedbackRequest")
        self.assertEqual(request["memoryDecision"]["oneOf"][0]["$ref"], "#/$defs/RuntimeMemoryDecisionRequest")
        self.assertNotIn("input", schema["$defs"]["RuntimeFeedbackRequest"]["properties"])
        self.assertIn("memory_decision_rejected", event_types)
        self.assertIn("operation_recoverable_failure", event_types)
        decision_error = schema["$defs"]["RuntimeMemoryDecisionErrorResult"]
        self.assertFalse(decision_error["additionalProperties"])
        self.assertNotIn("candidate", decision_error["properties"])
        self.assertNotIn("value", decision_error["properties"])
        self.assertNotIn("evidence", decision_error["properties"])

    def test_intent_contract_includes_storage_fallback_source(self):
        schema = load_json("intent.schema.json")
        sources = schema["$defs"]["IntentErrorResponse"]["properties"]["source"]["enum"]

        self.assertIn("sqlite_unavailable", sources)

    def test_memory_usage_records_current_request_priority(self):
        schema = load_json("feedback-memory.schema.json")
        usage = schema["$defs"]["MemoryUsageEvent"]

        self.assertIn("priorityRule", usage["required"])
        self.assertEqual(
            usage["properties"]["priorityRule"]["const"],
            "current_request_overrides_memory",
        )

    def test_runtime_schema_marks_thin_runtime_and_hybrid_frontend_dependency(self):
        schema = load_json("runtime.schema.json")

        self.assertEqual(schema["x-apiStatus"], "thin_runtime_implemented")
        self.assertEqual(schema["x-frontendMigration"]["target"], "hybrid_dependency")
        self.assertEqual(schema["x-frontendMigration"]["planningEngine"], "agent-core.js")
        self.assertEqual(schema["x-frontendMigration"]["runtimeRole"], "state_and_backend_enhancement")
        self.assertFalse(schema["x-frontendMigration"]["planResultInRuntime"])

    def test_runtime_contract_documents_hybrid_frontend_rule(self):
        contract = (ROOT / "specs/001-v4-runtime-state-machine-memory-loop/contracts/runtime-memory-contract.md").read_text(
            encoding="utf-8"
        )

        self.assertIn("Frontend Migration Rule", contract)
        self.assertIn("agent-core.js", contract)
        self.assertIn("hybrid dependency model", contract)


if __name__ == "__main__":
    unittest.main()
