# ADR 0001: OWASP MCP Top 10 Mapping

**Status:** Accepted  
**Date:** 2026-07-18  
**Product:** FidusGate

## Context

The [OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/) (beta) is the industry taxonomy for Model Context Protocol risks. MCP specification revision `2026-07-28` adds Streamable HTTP routing headers (`Mcp-Method`, `Mcp-Name`) and hardens OAuth resource-server expectations. FidusGate is a reference MCP gateway with Cedar enforcement; this ADR records how product controls map to MCP01–MCP10 and where gaps remain.

## Decision

| OWASP ID | Risk | FidusGate control | Gap / note |
|---|---|---|---|
| MCP01 | Token mismanagement & secret exposure | Short-lived JWT (`expiresIn: 1h`); bootstrap-key gated minting; log sanitization | Demo HS256 secret; not a production IdP |
| MCP02 | Privilege escalation via scope creep | Cedar risk tiers 0–9; SME principals; PLM requirement gate | Scope expiry is session/gate based, not OAuth scopes |
| MCP03 | Tool poisoning | Fixed tool catalog in `mcp-server.ts`; header/body name agreement on `/mcp` | No SHA-256 tool-description pinning yet |
| MCP04 | Supply chain / dependency tampering | Command auditor blocks host `curl`/`npm install`; sandbox execution | Relies on lockfile/CI; not MCP package signing |
| MCP05 | Command injection & execution | `isCommandLineSecure` + Docker/WASI sandbox | Host kernel compromise out of scope |
| MCP06 | Intent flow subversion | Cedar on every `tools/call`; native IDE tool deny (Tier 9) | Prompt-layer injection still model-side |
| MCP07 | Insufficient authn/authz | JWT on `/mcp`; Cedar; Ed25519 privileged signatures; quarantine | RFC 9728 PRM is demo-grade; no CIMD |
| MCP08 | Lack of audit & telemetry | Ed25519 receipts; structured logs; optional Trace Context from `_meta` | OpenTelemetry backend optional |
| MCP09 | Shadow MCP servers | Documented single gateway entry (`--mcp` stdio + `POST /mcp`) | No org-wide shadow inventory |
| MCP10 | Context injection & over-sharing | Per-principal quarantine; cacheScope `private` on `tools/list` | No cross-tenant context store |

### Executable deny evidence

- `integration_from_worktree_denied` — false-green prevention (`specs/threat-model.yaml`)
- `mcp_header_body_desync_denied` — Streamable HTTP header/body consistency via `scripts/check-mcp-protocol.sh`
- Privileged signature failure and quarantine write deny — covered in `bypass-validation.test.ts` (MCP07)

## Consequences

Operators treating FidusGate as a reference should map their deployment checklist to this table and close gaps (tool pinning, IdP CIMD, shadow MCP inventory) before production use. Cursor Auto-review / `permissions.json` remains a host-side complement, not a substitute for Cedar at the gateway.
