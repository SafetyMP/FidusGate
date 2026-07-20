# ADR 0000: Threat Model — Caller, Trust Boundary, Authentication

**Status:** Accepted  
**Date:** 2026-07-13  
**Product:** FidusGate

## Context

FidusGate integration smoke validates HAM memory drift on the **main repo root** — a fleet/integration executor boundary, not an HTTP API. Tier-3 adversarial verifies integration scripts refuse execution from agent worktrees (false-green prevention).

A second EXEC cell covers Streamable HTTP MCP header/body consistency (`Mcp-Method` / `Mcp-Name` vs JSON-RPC body) for MCP `2026-07-28` (OWASP MCP07 / MCP03). Production-marker auth configuration and MCP/WebSocket bearer authorization are EXEC cells: the current demo HS256 flow is explicitly refused when production is marked, pending an OIDC BFF/JWKS verifier.

See `specs/threat-model.yaml` and `scripts/adversarial.sh`.

## Decision

### Principals

| Principal | May run integration | May claim MCP header consistency |
|-----------|---------------------|----------------------------------|
| `parent_on_main_root` | yes — `./scripts/integration-smoke.sh` | n/a |
| `agent_worktree` | no — must not satisfy integration claims | n/a |
| `gateway_operator` | n/a | yes — `./scripts/check-mcp-protocol.sh`; may verify production auth configuration denial |
| `mcp_caller` / `websocket_client` | n/a | bearer and audience required |
| unauthenticated MCP/WebSocket caller | no | denied |

### Trust boundary

| Cell | Boundary |
|------|----------|
| `integration_smoke_main_root` | Integration E2E cwd must be repository root, not `.worktrees/*` (compose-false-green pattern). |
| `mcp_streamable_http_header_consistency` | Streamable HTTP `POST /mcp` routing headers must agree with the JSON-RPC body before Cedar evaluation. |
| `production_auth_configuration` | Production markers may not enable `DISABLE_AUTH`, HS256 verification/bootstrap, incomplete OIDC/JWKS settings, or an unimplemented OIDC BFF. |
| `mcp_and_websocket_bearer_authorization` | Streamable MCP and WebSocket upgrades require a bearer token with the MCP audience. |

### Authentication mechanism

| Cell | Mechanism | Establishment failure |
|------|-----------|------------------------|
| `integration_smoke_main_root` | Mechanical: `guard-shell` + cwd probe — not HTTP bearer | Non-zero exit with worktree denial message |
| `mcp_streamable_http_header_consistency` | Header/body agreement (`MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`) | Probe exit non-zero on desync or dual-era regression |
| `production_auth_configuration` | Marker configuration assertion | Startup configuration rejection |
| `mcp_and_websocket_bearer_authorization` | Bearer signature and audience verification | Request/upgrade rejection |

### Deny cases

| Deny case | Cell | Expect |
|-----------|------|--------|
| `integration_from_worktree_denied` | `integration_smoke_main_root` | status `1` from worktree cwd |
| `mcp_header_body_desync_denied` | `mcp_streamable_http_header_consistency` | status `0` — probe proves desync is rejected |
| `production_disable_auth_denied` | `production_auth_configuration` | status `0` — test proves startup rejects production `DISABLE_AUTH` |
| `production_hs256_bootstrap_denied` | `production_auth_configuration` | status `0` — test proves startup rejects legacy HS256/bootstrap configuration |
| `mcp_missing_or_wrong_audience_denied` | `mcp_and_websocket_bearer_authorization` | status `0` — test proves MCP bearer denial |
| `websocket_unauthenticated_denied` | `mcp_and_websocket_bearer_authorization` | status `0` — test proves WebSocket upgrade denial |

## References

- `specs/threat-model.yaml`, `scripts/adversarial.sh`, `scripts/check-mcp-protocol.sh`
- OWASP MCP mapping: [0001-owasp-mcp-top-10.md](./0001-owasp-mcp-top-10.md)
- Operator note: [../mcp-2026-07-28-migration.md](../mcp-2026-07-28-migration.md)
