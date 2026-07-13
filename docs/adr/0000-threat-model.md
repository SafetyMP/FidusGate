# ADR 0000: Threat Model — Caller, Trust Boundary, Authentication

**Status:** Accepted  
**Date:** 2026-07-13  
**Product:** FidusGate

## Context

FidusGate integration smoke validates HAM memory drift on the **main repo root** — a fleet/integration executor boundary, not an HTTP API. Tier-3 adversarial verifies integration scripts refuse execution from agent worktrees (false-green prevention).

See `specs/threat-model.yaml` and `scripts/adversarial.sh`.

## Decision

### Principals

| Principal | May run integration |
|-----------|---------------------|
| `parent_on_main_root` | yes — `./scripts/integration-smoke.sh` |
| `agent_worktree` | no — must not satisfy integration claims |

### Trust boundary

Integration E2E cwd must be repository root, not `.worktrees/*` (compose-false-green pattern).

### Authentication mechanism

Mechanical: `guard-shell` + cwd probe — not HTTP bearer. Failure: non-zero exit with worktree denial message.

## References

- `specs/threat-model.yaml`, `scripts/adversarial.sh`
