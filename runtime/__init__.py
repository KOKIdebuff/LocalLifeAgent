"""Product-grade headless Runtime package."""

from .adapter import RuntimeAdapter
from .capability import get_runtime_capabilities
from .compatibility import CompatibilityAdapter

__all__ = ["RuntimeAdapter", "CompatibilityAdapter", "get_runtime_capabilities"]
