# ADR 0000: Threat Model — Caller, Trust Boundary, Authentication

**Status:** Accepted  
**Date:** 2026-07-13  
**Product:** FidusGate

## Context

FidusGate integration smoke validates HAM memory drift on the **main repo root** — a fleet/integration executor boundary, not an HTTP API. Tier-3 adversarial verifies integration scripts refuse execution from agent worktrees (false-green prevention).

A second EXEC cell covers Streamable HTTP MCP header/body consistency (`Mcp-Method` / `Mcp-Name` vs JSON-RPC body) for MCP `2026-07-28` (OWASP MCP07 / MCP03).

See `specs/threat-model.yaml` and `scripts/adversarial.sh`.

## Decision

### Principals

| Principal | May run integration | May claim MCP header consistency |
|-----------|---------------------|----------------------------------|
| `parent_on_main_root` | yes — `./scripts/integration-smoke.sh` | n/a |
| `agent_worktree` | no — must not satisfy integration claims | n/a |
| `gateway_operator` | n/a | yes — `./scripts/check-mcp-protocol.sh` |

### Trust boundary

| Cell | Boundary |
|------|----------|
| `integration_smoke_main_root` | Integration E2E cwd must be repository root, not `.worktrees/*` (compose-false-green pattern). |
| `mcp_streamable_http_header_consistency` | Streamable HTTP `POST /mcp` routing headers must agree with the JSON-RPC body before Cedar evaluation. |

### Authentication mechanism

| Cell | Mechanism | Establishment failure |
|------|-----------|------------------------|
| `integration_smoke_main_root` | Mechanical: `guard-shell` + cwd probe — not HTTP bearer | Non-zero exit with worktree denial message |
| `mcp_streamable_http_header_consistency` | Header/body agreement (`MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`) | Probe exit non-zero on desync or dual-era regression |

### Deny cases

| Deny case | Cell | Expect |
|-----------|------|--------|
| `integration_from_worktree_denied` | `integration_smoke_main_root` | status `1` from worktree cwd |
| `mcp_header_body_desync_denied` | `mcp_streamable_http_header_consistency` | status `0` — probe proves desync is rejected |

## References

- `specs/threat-model.yaml`, `scripts/adversarial.sh`, `scripts/check-mcp-protocol.sh`
- OWASP MCP mapping: [0001-owasp-mcp-top-10.md](./0001-owasp-mcp-top-10.md)
- Operator note: [../mcp-2026-07-28-migration.md](../mcp-2026-07-28-migration.md)
