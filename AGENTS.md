# AGENTS.md

Community contract for agents working in this repository. Internal factory/site overlay: [`docs/factory-overlay.md`](docs/factory-overlay.md). Positioning: [`docs/DESIGN-PIVOT.md`](docs/DESIGN-PIVOT.md).

FidusGate issues **signed Ed25519 receipts for MCP tool calls** and ships a runnable admin console (ledger, Cedar simulator, receipt verifier). It is not a generic “zero-trust agent governance platform” and **not a production-hardened security product**.

## Commands

| Command | Purpose |
|---------|---------|
| `./scripts/harness/verify.sh` | Hermetic Definition of Done (lint, test, Cedar, threat-model) |
| `./scripts/verify.sh` | Wrapper → harness verify |
| `npm run bootstrap` | WASM build + local hooks |
| `npm run dev` | Gateway `:3001` + admin console `:3000` |
| `npm test` | Workspace tests |
| `npm run lint` | Biome + workspace lint |
| `bash scripts/cedar-validate.sh` | `policy.cedar` against `policy.cedarschema` |
| `./scripts/adversarial.sh` | Authorized adversarial probes (main root / CI; not worktrees) |

Do not claim green from prose. Run the verify script and keep the output.

## Cedar and receipts

| Path | Role |
|------|------|
| `policy.cedar` / `policy.cedarschema` | Authorization policy and schema |
| `protect-mcp.config.json` | Gateway mode, issuer, receipts directory |
| `packages/cedar-daemon` | Rust Cedar PDP |
| `apps/secure-gateway` | MCP / `/api/authorize` hot path and receipt issuance |
| `packages/crypto-utils` | Ed25519 sign and verify |
| `apps/admin-dashboard` | Ledger, simulator, verifier |
| `.github/skills/cedar-mcp-receipts/` | Skill for tool gates, shadow-to-enforce, receipt verification |
| `docs/DESIGN-PIVOT.md` | Receipts-and-console positioning |

Skill body is adapted from `scopeblind/scopeblind-gateway` (`source_repo` on the skill). Do not claim originality of that material.

## Never weaken fail-closed

Do not convert authorize, kill-switch, PDP, principal-signature, production-profile, or KMS-missing paths to fail-open. If Cedar, the daemon, or a production prerequisite is unavailable, **deny**. Shadow mode may log-without-block only when `protect-mcp.config.json` `mode` is explicitly `shadow` — never as a silent fallback from enforce.

## Honesty

Keep demo and mock surfaces labeled as demo (local keys, JSON datastore, simulated syscalls/OIDC). Do not add sidecar features to compete with OpenFirma, Vectimus, Symbiont, or Permit Cedar Agent. Deepen receipts and the console.
