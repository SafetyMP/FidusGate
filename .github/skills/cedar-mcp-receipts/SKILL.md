---
name: cedar-mcp-receipts
description: "Work on FidusGate MCP tool authorization, Cedar policies, and Ed25519 receipt verification without weakening fail-closed controls."
risk: safe
source: community
source_repo: scopeblind/scopeblind-gateway
source_type: adapted
date_added: "2026-04-05"
---

# FidusGate Cedar policies and signed receipts

The earlier skill text was adapted from `scopeblind/scopeblind-gateway` (`protect-mcp`). This version documents the implementation in this repository; that provenance does not imply third-party CLI compatibility or ownership of the original material.

Use this skill for changes to FidusGate's MCP tool gates, Cedar policy/schema, receipt issuance, or verification. Start with [AGENTS.md](../../../AGENTS.md). This is not a prompt-injection classifier, production deployment guide, or permission to alter security controls.

## Source map

| Source | Responsibility |
| --- | --- |
| [policy.cedar](../../../policy.cedar) and [policy.cedarschema](../../../policy.cedarschema) | Policy rules and validated entity/context shape |
| [Cedar daemon](../../../packages/cedar-daemon/src/main.rs) | Rust Cedar engine over HTTP |
| [cedar-remote.ts](../../../apps/secure-gateway/src/cedar-remote.ts) | Daemon request, bounded inputs, and fail-closed resolution |
| [mcp-server.ts](../../../apps/secure-gateway/src/mcp-server.ts) | MCP tool dispatch, principal checks, and receipt issuance |
| [tool-call-receipt.ts](../../../apps/secure-gateway/src/tool-call-receipt.ts) | Payload and response receipt-reference format |
| [crypto-utils](../../../packages/crypto-utils/src/index.ts) | Ed25519 signing/signature verification and hash-chain checks |
| [gateway routes](../../../apps/secure-gateway/src/index.ts) | Receipt retrieval, verification, and role restrictions |
| [database](../../../packages/database/src/index.ts) | Stored receipts and chain ordering |

## Understand the two console modes

The [Pages demo](../../../docs/github-pages-demo.md) uses synthetic records and deterministic browser scenarios. Its receipt signature check uses a public demo key. It does not call Cedar, connect an agent, or execute tools.

The [connected console](../../../docs/CONNECTED-CONSOLE-REDESIGN.md) uses the configured gateway. Its Decisions, Policy playground, and Receipt verifier workspaces expose decision reasons and verification results; Transactions, Governance, Forensics, and Sandbox retain operational workflows. Local bootstrap authentication is a development mechanism, not production OIDC.

## Authorization boundaries

- The gateway sees only calls routed to its MCP tools. It does not intercept another application's native tools.
- The checked-in [configuration](../../../protect-mcp.config.json) uses `enforce`. Never silently downgrade it to shadow or disable checks to make an example pass.
- The Cedar daemon is a separate HTTP service. `npm run dev` does not start it. An unavailable daemon denies by default. The explicit non-production TypeScript fallback is a limited evaluator, not the Cedar engine; production rejects that fallback flag.
- The repository's generated WASM files are not a Cedar runtime. Do not document `npx protect-mcp` or another project's hook/verification commands as FidusGate commands.
- Preserve authentication, principal-signature verification, quarantine/kill-switch decisions, role restrictions, and production/KMS guards. A privileged principal name alone is not authorization.
- Pair policy changes with schema validation. A broad Cedar `forbid` overrides matching `permit` rules; do not propose “deny everything else” with an unconditional forbid.

## Interpret receipts precisely

A valid Ed25519 signature confirms that the signed payload verifies against a particular key. It does not independently establish issuer trust, policy execution, tool execution, or completeness of the record. An intact hash chain checks stored order/link consistency; it is a separate check and does not verify signatures.

On the MCP tool path, decisions made by Cedar, command auditing, or sensitive-file checks can append a signed receipt when a development signing key is available. The tool response preserves the original output in its first text block and adds a **receipt reference** in a second block when issuance succeeds. Retrieve the receipt through the gateway; that reference is not the receipt JSON. Not every early failure produces a receipt. `submit_ibp_synthesis` does not mint one.

`policy_digest` is path-dependent: the MCP helper may record an engine label or matching policy ID, not a hash of evaluated policy bytes. Do not upgrade that field into stronger provenance than the implementation provides.

| Gateway operation | Meaning |
| --- | --- |
| `GET /api/receipts` | Authenticated receipt records for developer, administrator, or auditor roles |
| `GET /api/receipts/verify-chain` | Authenticated hash-chain consistency result and record count |
| `POST /api/receipts/verify` | Verify supplied receipt JSON against the gateway's configured issuer-key map without storing it; currently a public route |
| `POST /api/receipts` | Role-restricted verification and record submission; mutates the receipt store |

Use the verifier for inspection. Do not submit, reset, or replace receipts merely to test a signature. For placeholder seeds, follow the explicit backed-up [development seed repair](../../../docs/development-receipt-seeds.md); do not change the verifier to accept fake signatures.

## Validation workflow

1. Read the affected source, policy/schema, and existing tests. Identify which runtime and receipt path the change touches.
2. Keep the change scoped; preserve deny behavior when prerequisites are missing.
3. Validate policy changes with `bash scripts/cedar-validate.sh`. Report if the real CLI was unavailable rather than equating a skipped check with Cedar evaluation.
4. Run relevant tests and `./scripts/harness/verify.sh` in a disposable checkout. Gateway/database tests can reset local JSON data; never share its database package with the active console's checkout.
5. Include negative checks appropriate to the change: modified payload/signature, unknown issuer, unavailable PDP, invalid principal signature, or production fallback rejection. Keep hash-chain and signature assertions separate.
6. Record the exact checks and their outcomes. Local tests, CI, deployed demo behavior, and production assurance are different evidence.

See [getting started](../../../docs/getting-started.md), [architecture](../../../docs/ARCHITECTURE.md), and [MCP transport notes](../../../docs/mcp-2026-07-28-migration.md) for current operational details.
