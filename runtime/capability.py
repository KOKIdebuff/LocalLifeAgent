from __future__ import annotations

import sqlite3
from pathlib import Path

from .repositories import migrate_runtime


CAPABILITY_VERSION = "v4-runtime-capabilities-3"


TARGET_CAPABILITIES = [
    {"name": "session_lifecycle", "status": "supported", "version": "v4-p0", "limits": {}},
    {"name": "state_machine", "status": "supported", "version": "v4-p0", "limits": {}},
    {"name": "event_stream", "status": "supported", "version": "v4-p0", "limits": {}},
    {"name": "persistence", "status": "supported", "version": "v4-p0", "limits": {}},
    {"name": "recovery_point", "status": "supported", "version": "v4-p0", "limits": {"latestRecoveryPointOnly": True}},
    {
        "name": "rollback_primitive",
        "status": "degraded",
        "version": "v4-p0",
        "limits": {"latestRecoveryPointOnly": True, "externalCompensation": False, "taskReplay": False},
    },
    {"name": "runtime_adapter", "status": "supported", "version": "v4-p0", "limits": {}},
    {"name": "capability_query", "status": "supported", "version": "v4-p0", "limits": {}},
    {"name": "contract_tests", "status": "supported", "version": "v4-p0", "limits": {}},
    {"name": "task_replay", "status": "unsupported", "version": "v4-p0", "limits": {"taskReplay": False}},
    {"name": "external_compensation", "status": "unsupported", "version": "v4-p0", "limits": {"externalCompensation": False}},
]


def get_runtime_capabilities(db_path: Path | str) -> dict:
    db_available = True
    db_error = None
    try:
        migrate_runtime(db_path)
    except (sqlite3.Error, OSError) as exc:
        db_available = False
        db_error = str(exc)

    effective = []
    for item in TARGET_CAPABILITIES:
        name = item["name"]
        if name in {"task_replay", "external_compensation"}:
            effective.append({"name": name, "availability": "unavailable", "version": "v4-p0", "limits": item["limits"]})
        elif name == "rollback_primitive":
            effective.append(
                {
                    "name": name,
                    "availability": "degraded" if db_available else "unavailable",
                    "version": "v4-p0",
                    "limits": item["limits"],
                    "reason": "Latest-only rollback storage is defined; full restore/replay is not enabled.",
                }
            )
        elif db_available:
            effective.append({"name": name, "availability": "available", "version": "v4-p0", "limits": item["limits"]})
        else:
            effective.append(
                {
                    "name": name,
                    "availability": "unavailable",
                    "version": "v4-p0",
                    "limits": item["limits"],
                    "reason": "Runtime SQLite storage is unavailable.",
                }
            )

    return {
        "ok": True,
        "capabilityVersion": CAPABILITY_VERSION,
        "targetCapabilities": TARGET_CAPABILITIES,
        "effectiveCapabilities": effective,
        "effectiveCapabilitiesAreAuthoritative": True,
        "storageAvailable": db_available,
        "storageError": db_error,
    }
