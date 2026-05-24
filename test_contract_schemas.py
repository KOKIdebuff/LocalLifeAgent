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
    "feedback_capture": ["memory_candidate_review", "done"],
    "memory_candidate_review": ["memory_committed", "done"],
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


class ContractSchemaTests(unittest.TestCase):
    def test_contract_schema_files_parse(self):
        for name in ["intent.schema.json", "feedback-memory.schema.json", "runtime.schema.json"]:
            with self.subTest(name=name):
                schema = load_json(name)
                self.assertEqual(schema["$schema"], "https://json-schema.org/draft/2020-12/schema")
                self.assertIn("$defs", schema)

    def test_runtime_transition_table_is_fixed_and_complete(self):
        schema = load_json("runtime.schema.json")
        states = set(schema["$defs"]["RuntimeState"]["enum"])
        transitions = schema["x-runtimeTransitions"]

        self.assertEqual(transitions, EXPECTED_TRANSITIONS)
        self.assertEqual(set(transitions), states)
        for from_state, next_states in transitions.items():
            with self.subTest(from_state=from_state):
                self.assertTrue(set(next_states).issubset(states))
        self.assertEqual(transitions["done"], [])
        self.assertEqual(transitions["failed_recoverable"], ["planning_local"])

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
        self.assertEqual(privacy["memoryConflictPriority"], "current_request_overrides_memory")

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
