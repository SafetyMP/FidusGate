# MCP 2026-07-28 Operator Migration Note

FidusGate speaks a **dual-era** MCP surface aligned to the July 2026 specification revision.

## What changed

| Surface | Behavior |
|---|---|
| **stdio** (`node … --mcp`) | Legacy `initialize` / `notifications/initialized` kept for Cursor and older clients. Negotiates `2025-11-25` by default; echoes `2024-11-05` if requested. |
| **HTTP** `POST /mcp` | Stateless Streamable HTTP for `2026-07-28`. Requires JWT (`developer` or `admin`). |
| **Discover** | Modern clients call `server/discover` (no session handshake). |
| **List cache** | `tools/list` returns `ttlMs` and `cacheScope: private`. |
| **Auth metadata** | `GET /.well-known/oauth-protected-resource` (RFC 9728 demo). Unauthenticated `/mcp` responses include `WWW-Authenticate` with `resource_metadata`. |

## HTTP client checklist

Every `POST /mcp` must include:

1. `Authorization: Bearer <jwt>`
2. `MCP-Protocol-Version: 2026-07-28` (or negotiated legacy value if dual-serving)
3. `Mcp-Method` — must match JSON-RPC `method`
4. `Mcp-Name` — required for `tools/call` (and other named methods); must match `params.name`

Header/body disagreement is rejected **before** Cedar evaluation (desync / confused-routing control).

Streamable HTTP rebuilds a trusted JSON-RPC envelope from allowlisted methods/tools. Filesystem-mutating tools (`write_file`, `patch_file`, `submit_ibp_synthesis`) are **not** available over `POST /mcp` — use stdio MCP for those. HTTP supports protocol methods plus `execute_command`, `read_file`, `search_code`, and `list_directory`.

Optional: put W3C Trace Context (`traceparent`, `tracestate`, `baggage`) under `params._meta` for correlated logs.

## Cursor / stdio

No change required for local `--mcp` stdio wiring. Continue to use `initialize` then `tools/call`. Roots, Sampling, and Logging are not offered (deprecated in `2026-07-28`).

## Client auth responsibilities

- Validate authorization-response `iss` (RFC 9207) when using an external IdP.
- Send Resource Indicators (RFC 8707) when requesting tokens for this gateway.
- Full Client ID Metadata Documents (CIMD) / Dynamic Client Registration are **out of scope** for this reference implementation.

## Related

- ADR: [docs/adr/0001-owasp-mcp-top-10.md](./adr/0001-owasp-mcp-top-10.md)
- Probe: `./scripts/check-mcp-protocol.sh`
