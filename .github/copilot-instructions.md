# Copilot instructions — FidusGate

FidusGate is **signed Ed25519 receipts for MCP tool calls** plus a runnable admin console (ledger, Cedar simulator, verifier). It is a reference implementation — **not** a production-hardened security product and not a generic zero-trust agent governance platform.

Read [`AGENTS.md`](../AGENTS.md) and [`docs/DESIGN-PIVOT.md`](../docs/DESIGN-PIVOT.md) before changing behavior. Factory/site overlay: [`docs/factory-overlay.md`](../docs/factory-overlay.md).

## Do

- Keep Cedar authorization and Ed25519 receipt issuance on the MCP tool-call path.
- Prefer changes that make the ledger, simulator, or verifier clearer and honest.
- Run `./scripts/harness/verify.sh` (or `./scripts/verify.sh`) before claiming done.
- Keep fail-closed authorize, kill-switch, PDP, principal-signature, and production-profile paths fail-closed.

## Do not

- Weaken fail-closed into fail-open, including “helpful” silent fallbacks from enforce to shadow.
- Compete with OpenFirma / Vectimus / Symbiont / Permit Cedar Agent by adding sidecar features.
- Claim originality of the Cedar skill material — `.github/skills/cedar-mcp-receipts/` is adapted from `scopeblind/scopeblind-gateway`.
- Treat this skill as a prompt-injection classifier. Use `cedar-mcp-receipts` only for tool gates, shadow-to-enforce rollout, and receipt verification.
- Rewrite Prisma schemas or Vitest majors unless the task explicitly asks for app code.

## Key paths

`policy.cedar`, `policy.cedarschema`, `protect-mcp.config.json`, `packages/cedar-daemon`, `apps/secure-gateway`, `packages/crypto-utils`, `apps/admin-dashboard`.
