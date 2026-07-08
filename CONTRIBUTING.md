# Contributing to FidusGate

Thank you for your interest in contributing to FidusGate! As a zero-trust governance platform for AI-agent workflows, we maintain high standards for system integrity, code validation, and security auditing.

Read [`SECURITY.md`](SECURITY.md) before reporting vulnerabilities. Maintainer storefront docs: [`docs/community/github-presentation.md`](docs/community/github-presentation.md).

## Monorepo workspace structure

FidusGate is organized as an npm Workspaces monorepo. Please keep changes modular and tightly scoped:

* **`apps/secure-gateway`**: Node.js/Express API proxy gate. Enforces Cedar policy decisions and redacts PII.
* **`apps/admin-dashboard`**: Vite-React operations console. Houses simulated token budgets and offline ledger verifiers.
* **`packages/cedar-daemon`**: Rust Tiny-HTTP wrapper parsing schema-guided Cedar rules.
* **`packages/crypto-utils`**: Encapsulates Ed25519 signature signing, HSM wrappers, and verifiers.
* **`packages/database`**: Persistence layer utilizing local JSON file flat-stores and relational Prisma ORM wrappers.
* **`packages/core-types`**: Shareable TypeScript declarations.

## Local development and testing

1. **Bootstrap environment** — install dependencies, audit toolchains, and set up local pre-commit hooks:

   ```bash
   npm run bootstrap
   ```

2. **Run development servers** — starts both the gateway and portal concurrently:

   ```bash
   npm run dev
   ```

   Admin dashboard: [http://localhost:3000](http://localhost:3000) · Gateway API: [http://localhost:3001](http://localhost:3001)

3. **Run test suites**:

   ```bash
   npm run test
   ```

4. **Lint and code quality**:

   ```bash
   npm run lint
   ```

5. **Regenerate README demo assets** (when changing the admin console):

   ```bash
   npm run screenshots
   ```

## Policy contributor standards

* **Access control modifications:** Changes to `policy.cedar` must have corresponding typological definitions inside `policy.cedarschema`.
* **Audit checkers:** Ensure sandbox operations do not bypass tokenizer limits in `command-auditor.ts`.
* **Verification:** Verify local script execution is safely wrapped in Docker ephemeral sandbox environments (`scripts/sandbox-execute.sh`).

## Pull request checklist

Before submitting a pull request:

* [ ] The codebase compiles successfully with `npm run build`.
* [ ] Integration test suites pass with `npm run test`.
* [ ] Local files are free of secrets, access keys, or developer credentials.
* [ ] You added descriptive testing notes and manual verification steps in the PR description (use [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md)).
