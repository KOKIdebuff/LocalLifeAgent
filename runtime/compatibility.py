from __future__ import annotations


class CompatibilityAdapter:
    """Conversion-only adapter for future legacy `/api/runtime` projection.

    The current legacy endpoint remains on the thin handler by default. This
    adapter deliberately does not own transition, persistence, or failure rules.
    """

    def project_legacy_response(self, *, thin_response: dict) -> dict:
        return dict(thin_response)

    def shadow_compare(self, *, legacy_response: dict, projected_response: dict) -> dict:
        return {
            "ok": legacy_response == projected_response,
            "dualWrite": False,
            "differences": [] if legacy_response == projected_response else ["legacy_response_projection_mismatch"],
        }
