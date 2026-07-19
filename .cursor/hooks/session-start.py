#!/usr/bin/env python3
"""sessionStart: log harness profile summary for the workspace."""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import allow, log_event, read_input, read_repo_profile  # noqa: E402


def main() -> int:
    _ = read_input()
    prof = read_repo_profile()
    summary = None
    if prof:
        summary = {
            "profile": prof.get("profile"),
            "primary": (prof.get("stack") or {}).get("primary"),
            "bundles": prof.get("bundles_applied", []),
        }
    log_event("session_start", {"harness_profile": summary})
    allow()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
