# Copilot instructions — FidusGate

FidusGate is a reference MCP policy gateway and a receipt-first console: Decisions, Policy playground, and Receipt verifier are the primary journey. Transactions, Governance, Forensics, and Sandbox remain available in the connected console. It is not a production-hardened security product.

Read [`AGENTS.md`](../AGENTS.md) and [`docs/DESIGN-PIVOT.md`](../docs/DESIGN-PIVOT.md) before changing behavior. Factory/site overlay: [`docs/factory-overlay.md`](../docs/factory-overlay.md).

## Do

- Keep Cedar authorization and Ed25519 receipt issuance on the MCP tool-call path.
- Prefer changes that make decisions, policy exploration, or receipt verification clearer and honest.
- Run `./scripts/harness/verify.sh` (or `./scripts/verify.sh`) before claiming done.
- Keep authorize, kill-switch, PDP, principal-signature, production-profile, and KMS-missing paths fail-closed. Preserve role checks and confirmations.
- Keep the static synthetic demo separate from the gateway-connected build. A demo scenario is not Cedar evaluation or execution.
- Distinguish signature integrity, hash-chain linkage, issuer trust, and tool execution.
- Run gateway/database tests and the full harness in a disposable checkout with disposable data. They can reset `packages/database/data`; never test against a running user console or symlink the database package to it.
- Consult [current docs](../docs/README.md) and [development seed custody](../docs/development-receipt-seeds.md); do not reseed arbitrary logs to clear failures.

## Do not

- Weaken fail-closed into fail-open, including “helpful” silent fallbacks from enforce to shadow.
- Compete with OpenFirma / Vectimus / Symbiont / Permit Cedar Agent by adding sidecar features.
- Claim originality of the Cedar skill material — `.github/skills/cedar-mcp-receipts/` is adapted from `scopeblind/scopeblind-gateway`.
- Treat this skill as a prompt-injection classifier. Use `cedar-mcp-receipts` only for tool gates, shadow-to-enforce rollout, and receipt verification.
- Rewrite Prisma schemas or Vitest majors unless the task explicitly asks for app code.

## Key paths

`policy.cedar`, `policy.cedarschema`, `protect-mcp.config.json`, `packages/cedar-daemon`, `apps/secure-gateway`, `packages/crypto-utils`, `apps/admin-dashboard`.

## Coding standards

Follow path-specific files in [`.github/instructions/`](instructions/). Copilot code review loads [`.github/skills/code-review/`](skills/code-review/).
