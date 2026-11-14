# Contributing to FidusGate

Help make tool-call decisions understandable and receipts independently checkable. FidusGate is a reference MCP gateway with a receipt-first console, not a production security product. Start with the [product direction](docs/DESIGN-PIVOT.md) and [documentation index](docs/README.md).

Use [GitHub Issues](https://github.com/SafetyMP/FidusGate/issues/new/choose) for reproducible bugs, documentation gaps, or feature proposals. Report undisclosed vulnerabilities privately through [SECURITY.md](SECURITY.md). Follow the [code of conduct](CODE_OF_CONDUCT.md).

## Set up a development checkout

Use Node.js 22 and npm 10.9.2, as in CI. The [getting-started guide](docs/getting-started.md) covers locked dependency installation, building shared packages, configuring a development session, and starting the console. `npm run bootstrap` also configures local Git hooks and runs a drift audit; inspect those scripts before using it in an existing checkout.

There are two experiences to test:

- The [public demo](docs/github-pages-demo.md) builds with `VITE_FIDUSGATE_DEMO=true`. It uses synthetic data, deterministic scenarios, and browser signature verification, without gateway calls or tool execution.
- The [connected console](docs/CONNECTED-CONSOLE-REDESIGN.md) runs with the gateway and uses authenticated API requests. `npm run dev` starts the dashboard on port 3000 and gateway on 3001, but does not start the Rust Cedar daemon. An unavailable policy decision point must remain a denial, not an implicit fallback.

## Locate the change

| Path | Responsibility |
| --- | --- |
| `apps/admin-dashboard` | Decisions, Policy playground, Receipt verifier, and retained operational workspaces |
| `apps/secure-gateway` | MCP tools, authenticated APIs, authorization, receipt issuance |
| `packages/cedar-daemon` | Rust Cedar policy evaluation |
| `packages/crypto-utils` | Signatures, hash-chain verification, KMS providers |
| `packages/database` | JSON / Prisma persistence, development fixtures |
| `packages/core-types` | Shared TypeScript models |
| `docs` | Current guides, architectural decisions, labeled historical plans |

## Validate without damaging a running console

**Gateway and database tests can reset the JSON store.** Run `npm test` and the full harness in a disposable checkout or CI, with disposable data and no live gateway using that checkout. The store resolves beside the database package; do not symlink that package back to a user's live checkout. Do not copy credentials or real records into test fixtures.

```sh
# Run in the disposable verification checkout.
npm run lint
npm test
./scripts/harness/verify.sh
```

The harness installs locked dependencies and runs the repository's full gate, including Cedar validation and threat-model checks. Docker and the documented toolchains are required for the complete graph. Keep the output and report any blocked stage honestly. For an isolated dashboard change, `npm test --workspace apps/admin-dashboard` is a useful focused check; it is not proof that the gateway or the full harness passed.

For console changes, verify both builds, keyboard/narrow-screen use, session cleanup, and receipt verification errors. Distinguish a valid signature from a valid hash chain, issuer trust, and evidence of execution. The [Pages checklist](docs/github-pages-demo.md#acceptance-checks) covers the static demo. Use synthetic data for screenshots.

## Preserve the security contract

- Keep authorize, kill-switch, PDP, principal-signature, production-profile, and KMS-missing paths fail-closed. Do not silently change enforce mode to shadow.
- Preserve role checks, confirmations for policy application and database reset, and WebSocket authorization.
- Pair `policy.cedar` edits with schema updates where needed and run `bash scripts/cedar-validate.sh`. Schema validation is not a proof of all policy behavior; include relevant allow/deny tests.
- Preserve command-auditor limits and sandbox boundaries. Do not weaken isolation to make a local test run.
- Use synthetic fixtures; never commit signing secrets, bearer tokens, bootstrap keys, or personal/customer data.
- Follow [AGENTS.md](AGENTS.md) and [path-specific coding standards](.github/instructions/). Keep dependency and schema changes scoped to the task.

## Submit a pull request

Use a descriptive title and explain the user-visible problem, resulting behavior, scope, and verification in the [PR template](.github/PULL_REQUEST_TEMPLATE.md). Use a conventional title such as `fix(receipts): preserve signed payloads` or `docs: clarify connected setup`; release automation uses conventional commits.

Include relevant issue links, tests with outcomes, limitations, and screenshots for visual changes. Update current docs and agent navigation when paths or behavior change. Keep generated changelog history and historical evidence intact. CI success and local checks are separate evidence; inspect the checks on the exact PR commit before claiming it is ready.
