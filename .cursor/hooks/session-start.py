#!/usr/bin/env python3
"""sessionStart: log harness profile summary for the workspace."""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import (  # noqa: E402
    allow,
    log_event,
    read_input,
    read_repo_profile,
    resolve_workspace_root,
)


def main() -> int:
    payload = read_input()
    root = resolve_workspace_root(payload)
    prof = read_repo_profile(root)
    summary = None
    if prof:
        summary = {
            "profile": prof.get("profile"),
            "primary": (prof.get("stack") or {}).get("primary"),
            "bundles": prof.get("bundles_applied", []),
            "workspace_root": root,
        }
    log_event("session_start", {"harness_profile": summary}, context=payload)
    allow()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
