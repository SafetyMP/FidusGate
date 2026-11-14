# Local verification and GitHub Actions emulation

The authoritative job definitions are in [ci.yml](../.github/workflows/ci.yml). Local checks help diagnose changes; only the exact commit's GitHub Actions results establish remote CI status.

## Protect the local console's data

Use a disposable checkout for the full harness and gateway/database tests. Several tests reset the JSON datastore under `packages/database/data`; a checkout serving a console is not a safe test fixture. Install workspace dependencies in that disposable checkout so its database package does not resolve back to the live checkout. Do not copy local keys, database records, `.env`, or `.secrets` into it.

## Repository checks

Use Node.js 22 and npm 10.9.2, matching CI. From the disposable repository root:

```sh
npx --yes npm@10.9.2 ci
./scripts/harness/verify.sh
```

The harness runs the stub canary, locked dependency installation, lint, workspace tests, Cedar validation, and threat-model checks, followed by profile/honesty checks. Its test dependency graph includes a Docker build for the Cedar daemon. A machine without Docker cannot complete that graph; report the blocked step rather than treating a partial run as green. The script's historical “Hermetic verify” job name does not mean dependency installation is offline.

CI also runs these distinct jobs:

| Job | Commands and scope |
| --- | --- |
| `cedar-validate` | `./scripts/install-cedar-cli.sh`, then `REQUIRE_CEDAR_CLI=true ./scripts/cedar-validate.sh` |
| `integration` | After `verify`, run `./scripts/integration-smoke.sh` and `bash ./scripts/adversarial.sh` in CI |

Integration/adversarial checks must follow the repository's main-root/CI restrictions; do not bypass their worktree guards. Read [the false-green checklist](harness/false-green-checklist.md) before claiming integration success. Preserve logs and distinguish completed checks, failures, skipped checks, and environment blockers.

## Optional `act` emulation

`act` is optional and requires a running Docker daemon. Obtain it through a trusted package manager or the project's official distribution; this repository does not install it automatically. From a disposable checkout with the prerequisites already installed:

```sh
# Inspect only this workflow's pull-request job graph.
act pull_request -W .github/workflows/ci.yml --dryrun

# Run the verification job locally.
act pull_request -W .github/workflows/ci.yml -j verify
```

The existing `npm run ci -- <arguments>` wrapper calls `scripts/ci-verify.sh`. With no arguments it performs `act -n`; it also automatically loads local `.secrets` and `.env` files when present. Inspect those files before using the wrapper, and never provide production credentials to a local emulation. Scope emulation to CI checks rather than release, container publication, or Pages deployment workflows.

Emulation may download runner images, actions, toolchains, and npm packages. GitHub-hosted permissions, OIDC, environment protection, and deployment behavior are not reproduced by a local success. Static workflow checks and successful emulation do not establish immunity to prompt injection or comprehensive security assurance.

For the browser-only demo's narrower test/build path, see [GitHub Pages demo](github-pages-demo.md). For contributor workflow and PR evidence, see [CONTRIBUTING.md](../CONTRIBUTING.md).
