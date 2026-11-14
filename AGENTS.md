# Agent guide

FidusGate is a reference MCP policy gateway and a console for understanding tool-call decisions and verifying signed receipts. The core journey is **inspect a decision → understand its reason → explore a policy scenario → verify a receipt**. Start with [README.md](README.md), [the documentation index](docs/README.md), and [product direction](docs/DESIGN-PIVOT.md). Internal factory/site guidance remains in [docs/factory-overlay.md](docs/factory-overlay.md).

## Two experiences, explicit boundaries

- **Public demo:** the static React/Vite build uses synthetic decisions, deterministic scenarios, and a public demo key. It makes no gateway calls and executes no tools. A scenario is not a Cedar evaluation.
- **Connected console:** Decisions, Policy playground, Receipt verifier, Transactions, Governance, Forensics, and Sandbox use the configured gateway and role-scoped session. Development bootstrap authentication is not production OIDC. See [connected console behavior](docs/CONNECTED-CONSOLE-REDESIGN.md).
- A valid receipt signature establishes integrity against a key; a valid hash chain establishes linkage of the checked records. Neither alone establishes issuer trust, complete history, tool execution, or production readiness. Keep those statuses separate.

## Commands and verification

Use Node.js 22 and npm 10.9.2, matching CI. [Getting started](docs/getting-started.md) covers installation, workspace builds, and local sessions.

| Command | Purpose |
| --- | --- |
| `./scripts/harness/verify.sh` | Definition of Done: install, lint, tests, Cedar and threat-model checks |
| `./scripts/verify.sh` | Wrapper for the harness |
| `npm run bootstrap` | Build WASM helpers, configure hooks, install locked dependencies, audit drift |
| `npm run dev` | Gateway `:3001` and connected console `:3000`; does not start Cedar |
| `npm test` | Workspace tests; requires a disposable checkout/data store |
| `npm test --workspace apps/admin-dashboard` | Dashboard behavior tests |
| `npm run lint` | Biome and workspace lint |
| `bash scripts/cedar-validate.sh` | Validate `policy.cedar` against `policy.cedarschema` |
| `./scripts/adversarial.sh` | Authorized adversarial probes (main root / CI; not worktrees) |

Run the verify script and retain its output before claiming the full gate passed. Report prerequisites that block it; narrower successful tests do not substitute for the full gate. Docker is required for the full build/test graph and sandbox workflows.

**Preserve active local data.** Gateway/database tests can call `clearDatabase()` against `packages/database/data`. Run them and the full harness in a disposable checkout or CI with disposable data, not the checkout serving a user's console. Do not symlink the tested database package back to a live checkout. Do not reset, delete, reseed, or rotate keys to make a verification result green. The [legacy development seed repair](docs/development-receipt-seeds.md) is an explicit, backed-up maintenance operation for exact historical fixtures only.

## Source map

| Path | Role |
| --- | --- |
| `policy.cedar` / `policy.cedarschema` | Authorization policy and schema |
| `protect-mcp.config.json` | Gateway mode, issuer, receipt configuration |
| `packages/cedar-daemon` | Rust Cedar policy decision point |
| `apps/secure-gateway` | MCP / `/api/authorize`, receipt issuance, authenticated APIs |
| `packages/crypto-utils` | Ed25519 signing, verification, hash-chain checks, KMS providers |
| `packages/database` | JSON/Prisma persistence and seed custody |
| `apps/admin-dashboard/src/demo` | Browser-only synthetic experience |
| `apps/admin-dashboard/src/connected` | Gateway-connected console |
| `.github/workflows/pages.yml` | Static demo deployment from `main` |
| `.github/skills/cedar-mcp-receipts/` | Tool gates, shadow-to-enforce rollout, receipt verification |

## Never weaken security controls

Do not convert authorize, kill-switch, PDP, principal-signature, production-profile, or KMS-missing paths to fail-open. If Cedar, its daemon, or a production prerequisite is unavailable, deny. Shadow mode may log without blocking only when `protect-mcp.config.json` explicitly sets `mode` to `shadow`; never silently fall back from enforce. Preserve authentication, role checks, policy/reset confirmations, resource validation, and WebSocket authorization.

Keep synthetic data, local keys, JSON storage, simulated syscall events, and development identity labeled. Do not imply certification or measured performance without evidence. Deepen the receipts and console experience; do not expand into competing generic sidecar features for OpenFirma, Vectimus, Symbiont, or Permit Cedar Agent. The Cedar skill is adapted from `scopeblind/scopeblind-gateway`; retain its attribution and do not treat it as a prompt-injection classifier.

## Coding and review

Preserve user changes, existing stacks, and permission boundaries. Use the existing formatter and tests; no new production `any`. Follow [repository Copilot guidance](.github/copilot-instructions.md), [path-specific instructions](.github/instructions/), and the [code review skill](.github/skills/code-review/SKILL.md). Update relevant docs when behavior changes. Keep historical plans and changelogs clearly distinguished from current capabilities.
