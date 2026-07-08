# Contributing to FidusGate

> **Canonical copy:** [`CONTRIBUTING.md`](../CONTRIBUTING.md) at the repository root (GitHub Community Standards). This file mirrors that document for `.github/` discovery.

Thank you for your interest in contributing to FidusGate! As a zero-trust governance platform for AI-agent workflows, we maintain high standards for system integrity, code validation, and security auditing.

## 📐 Monorepo Workspace Structure

FidusGate is organized as an npm Workspaces monorepo. Please keep changes modular and tightly scoped:

*   **`apps/secure-gateway`**: Node.js/Express API proxy gate. Enforces Cedar policy decisions and redacts PII.
*   **`apps/admin-dashboard`**: Vite-React operations console. Houses simulated token budgets and offline ledger verifiers.
*   **`packages/cedar-daemon`**: Rust Tiny-HTTP wrapper parsing schema-guided Cedar rules.
*   **`packages/crypto-utils`**: Encapsulates Ed25519 signature signing, HSM wrappers, and verifiers.
*   **`packages/database`**: Persistence layer utilizing local JSON file flat-stores and relational Prisma ORM wrappers.
*   **`packages/core-types`**: Shareable TypeScript declarations.

---

## 🛠️ Local Development & Testing

1.  **Bootstrap Environment:**
    Install dependencies, audit toolchains, and setup local pre-commit hooks:
    ```bash
    npm run bootstrap
    ```

2.  **Run Development Servers:**
    Starts both the gateway and portal concurrently in watch mode:
    ```bash
    npm run dev
    ```

3.  **Run Test Suites:**
    We require 100% passing tests before code reviews. Run all unit and integration checks:
    ```bash
    npm run test
    ```

4.  **Lint & Code Quality:**
    Verify there are no style or syntax compile warnings:
    ```bash
    npm run lint
    ```

---

## 🔒 Policy Contributor Standards

*   **Access Control Modifications:** Changes to `policy.cedar` must always have corresponding typological definitions inside `policy.cedarschema`. 
*   **Audit Checkers:** Ensure that modifying or adding sandbox operations does not bypass our tokenizer limits in `command-auditor.ts` (e.g. command chaining, directory traversals, or raw shell escapes are rejected by design).
*   **Verification:** Verify that any local script execution is safely wrapped in Docker ephemeral sandbox environments (`scripts/sandbox-execute.sh`).

---

## 🚀 Pull Request Checklist

Before submitting a Pull Request, please ensure:
*   [ ] The codebase compiles successfully with `npm run build`.
*   [ ] All 22/22 integration test suites pass successfully with `npm run test`.
*   [ ] Local files are free of secrets, access keys, or developer credentials.
*   [ ] You have added descriptive testing notes and manual verification steps in your PR description.
