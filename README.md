# ⚖️ FidusGate

### Cryptographically Verified, Self-Governing AI DevSecOps Governance Platform

FidusGate is an enterprise-grade, zero-trust repository repository governance and runtime verification framework specifically engineered for **Autonomous AI-Agent Operations**. It shifts security left, enforcing real-time programmatic access controls, deterministic signature verification, and automated static security analysis on agentic workflows.

Designed with a **risk-centric architecture**, FidusGate establishes mathematically verifiable boundaries around AI tool execution, preventing unauthorized environment modifications, privilege escalation, and prompt-injection-driven system compromise.

---

## 🏛️ Regulatory & Risk Control Alignment

FidusGate is modeled to align with international risk management and cybersecurity controls (e.g., **NIST SP 800-53, ISO/IEC 27001, SOC 2 Common Criteria**), translating corporate compliance structures into deterministic code policies:

*   **Separation of Duties (SoD):** Programmatically separates code compilation, infrastructure modification, and security policy modifications. AI agents are locked out of modifying policy boundaries (`policy.cedar`) or core scripts (`scripts/*`) directly.
*   **Auditability & Non-Repudiation:** Generates cryptographically signed **Ed25519 receipts** for all gateway transactions, establishing an immutable, verifiable ledger of agent actions.
*   **Access Control & Least Privilege:** Restricts tool invocation in real-time based on risk severity, forcing high-risk terminal commands into isolated Docker sandboxes.
*   **System Integrity Protection:** Automatically audits agentic pipelines to scan for dynamic prompt injection vectors and insecure runtime variables.

---

## 📖 Documentation & Playbooks Portal

FidusGate includes a comprehensive set of engineering references, operational manuals, and domain-scoped SME playbooks to assist security officers and developers in managing agentic boundaries.

* **[Documentation Portal](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/docs/README.md):** The primary index mapping all guides and governance skills.
* **[Monorepo Architecture Guide](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/docs/ARCHITECTURE.md):** Deep dive into high-level topologies, component details, and Docker sandbox configurations.
* **[Local CI/CD Emulation Manual](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/docs/local-ci-emulation.md):** Offline pipeline execution using `act` and prompt injection verification checks.
* **[Phase 3 Verification Walkthrough](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/docs/walkthrough.md):** Concrete operational runbooks for filesystem drift auto-reconciliation, Gemini Cedar Co-Pilots, and conventional commit tags.

---

## 📐 Unified Monorepo Architecture

The workspace is structured as a modular **npm Workspaces** monorepo, promoting strict dependency scoping and isolated boundaries:

```mermaid
graph TD
    %% Root Governance Boundaries
    subgraph Root [Root Workspace & Governance]
        direction TB
        RootConfig["package.json & tsconfig.json"]
        TurboCache["turbo.json (Task Caching)"]
        CedarPolicy["policy.cedar (Cedar Policies)"]
        GatewayConfig["protect-mcp.config.json"]
    end

    %% Application Layer
    subgraph Apps [Applications Layer]
        direction LR
        Gateway["apps/secure-gateway (Port 3001)"]
        Dashboard["apps/admin-dashboard (Port 3000)"]
    end

    %% Shared Library Layer
    subgraph Packages [Shared Modules Layer]
        direction LR
        Types["packages/core-types (Models)"]
        Crypto["packages/crypto-utils (Ed25519)"]
        DB["packages/database (Mock Store)"]
        Action["packages/github-action (CI Gate)"]
    end

    %% Sandboxed Verification Pipelines
    subgraph CI [CI/CD & Verification]
        direction TB
        Bootstrap["scripts/bootstrap.sh"]
        Sandbox["scripts/sandbox-execute.sh"]
        CIVerify["scripts/ci-verify.sh (act local CI)"]
        GitHook["scripts/pre-commit-ham-audit.sh"]
    end

    %% Dependencies
    Gateway --> Types
    Gateway --> Crypto
    Gateway --> DB
    Dashboard --> Types
    Action --> Crypto
    Action --> Types

    %% Flow of Controls
    CedarPolicy --> Gateway
    Sandbox --> Apps
    GitHook --> Root
```

### Component Details
1.  **`packages/core-types`**: Declares strictly typed boundaries for transactions, security findings, logs, and verifiable receipts.
2.  **`packages/crypto-utils`**: Encapsulates cryptographic signing and verification routines powered by modern **Ed25519** public-key cryptography.
3.  **`packages/database`**: A mock thread-safe database backed by persistent, seeded JSON records for immediate offline display.
4.  **`packages/github-action`**: A custom GitHub Action guard that validates workflows, scans for prompt injections, and verifies commit receipts.
5.  **`apps/secure-gateway`**: High-security Express microservice exposing transaction APIs with automatic PII (Personally Identifiable Information) masking and signature signing.
6.  **`apps/admin-dashboard`**: A premium Vite-React operations control center styled with deep HSL space colors, glassmorphic card overlays, and Outfitted typography. Includes a standalone receipt signature verifier, live log streams, and interactive command consoles.

---

## 🔒 The Risk-Tiered Governance Framework

FidusGate establishes a four-tier risk classification for tools available to autonomous agents. These categories map directly to Cedar access-control policies parsed at the gateway:

| Risk Tier | Scope of Actions | Cedar Permission Rule | Enforcement Strategy |
| :--- | :--- | :--- | :--- |
| **Tier 1 (Low)** | File reads, directory listing, regex searches | `permit` tool call globally | **Auto-Approved:** Read-only tasks run without blockages to prevent developer friction. |
| **Tier 2 (Medium)** | Source directory file modifications (`apps/*`, `packages/*`) | `permit` for source directories | **Shadow-Enforced:** Permitted in source paths, but forbidden from editing configuration files (`policy.cedar`, `protect-mcp.config.json`). |
| **Tier 3 (High)** | Terminal scripting, execution of compilation tasks | `permit` strictly within sandbox wrappers | **Interactive MFA:** Requires script-spawning to happen inside secure, isolated sandboxes (`sandbox-execute.sh`). Raw host access is blocked. |
| **Tier 4 (Critical)** | Global networking, arbitrary package installations (`npm i`, `curl`) | `forbid` globally | **Strict Interdiction:** Blocked at the gateway level to prevent supply chain attacks and untrusted package pollution. |

---

## 🔍 CI/CD Static Security Audit Showcase

To demonstrate the robustness of our scanning controls, we modeled three distinct prompt-injection vector exposures in our local GitHub Actions pipeline (`.github/workflows/ci-agent-pipeline.yml`):

1.  **Vector A (Env Var Intermediary):** Unauthenticated variables in AI prompts that allow an external contributor to hijack the review agent.
2.  **Vector D (PR Target + Checkout):** Unprivileged checking out of head commits inside a privileged workflow container.
3.  **Vector H (Dangerous Sandbox Configurations):** AI agent config profiles granting administrative capabilities (`danger-full-access`).

### Remediated Controls Staged
All workflows have been hardened by default:
*   Transitioned triggers from `pull_request_target` to unprivileged `pull_request` triggers.
*   Enforced read-only content scopes (`contents: read`).
*   Stripped dynamically interpolated environment strings from AI prompts.
*   Pristined agent runtime settings to use a strict `"sandbox": "workspace-read"` context with zero execution capabilities.

---

## 💎 Premium Enterprise Feature Suites

FidusGate includes a robust, high-performance suite of SecOps observability and simulation tools fully integrated into the Operations Dashboard:

### 🧬 1. Live + Draft Cedar Policy Simulator
* **Interactive dry-runs:** Toggles the simulator to `"Enable Custom Draft Policy Overlay (In-Memory Dry Run)"`. This mounts a high-performance in-memory text editor containing your active Cedar authorization code.
* **Typographical diagnostics:** Write new rules or modify existing entries in real-time, instantly evaluating simulated agent actions (e.g. `sb:issuer:agent-80` calling `write_file`) against your draft policy.
* **AST evaluation logs:** Returns dynamic permission statuses (`ALLOW` in neon green or `DENY` in glowing ruby) accompanied by the exact matching line rules from the AST engine.
* **Production safety:** All custom draft changes are kept strictly in-memory, ensuring production policies remain isolated and untouched until formally approved.

### 💼 2. Forensic JSON Compliance Package Exporter
* **Tamper-proof receipts:** The Forensic Command Timeline shows all audited commands executed inside our gVisor microVM shell.
* **Unified package format:** Click **"Download Forensic Compliance Receipt"** on any timeline entry to compile sandboxed logs, SPIFFE workloads, OIDC attestation claims, and cryptographic signatures into a structured JSON envelope.
* **Role-based security:** Gated so only authenticated roles of `admin` or `auditor` can pull forensic details, preventing credential harvesting.

### 🤖 3. AI-Agent Auto-Remediation Suggestions
* **Corrective guidance:** When the Command Auditor intercepts a blocked/forbidden command (e.g. a developer trying to run `curl http://...`), it dynamically returns a tailored remediation suggestion (e.g. *Suggesting safe mirrors or local cache stores*).
* **Self-Refactoring SDLC:** These corrective suggestion hooks are packed inside `/api/sandbox/execute` responses, allowing automated coding tools to self-correct and learn security requirements autonomously.

### 📐 4. Polished Collapsible Server Architecture Guide
* **Native Flow Integration:** Designed in response to user feedback, the interactive guide is integrated as a dedicated, space-obsidian glassmorphic accordion section positioned naturally right before the terminal console.
* **Smooth Micro-Animations:** A clickable header toggle slides the guide body open or closed with smooth CSS slide-down animations and updates a reactive chevron indicator.
* **Component Profiling:** SecOps administrators can interactively select component cards (Secure Gateway, Operations Console, Rust Cedar Daemon, Cryptographic Utilities, Database Clients, Core Types, and Sandbox execution layers) to instantly view their **Purpose & Security Value**, **Operational Runbook instructions (ports, triggers, scripts)**, and **Key Capabilities & Functions**.

### 📡 5. Phase 3 Active Filesystem Drift Auto-Reconciliation
* **Real-Time Drift Detection:** The Secure Gateway utilizes `scripts/sandbox-drift-detect.sh` to track untracked, modified, or deleted files inside the workspace relative to git index status (excluding environment, node_modules, and cache files).
* **Stateful Logging & WebSockets:** Logs all drift files, change types (`added`, `modified`, `deleted`), and raw diffs into the database, instantly broadcasting them via WebSockets (`filesystem_drift_detected`) to update the Operations Console UI with warning status overlays.
* **One-Click Reconcile Rollbacks:** Security administrators can trigger `POST /api/sandbox/reconcile` directly from the dashboard, executing a clean and restore sequence (`git restore . && git clean -fd`) inside the workspace to instantly revert the environment to a clean git status, reconcile database records, and update WebSocket clients.

### 🧠 6. Phase 3 Gemini-Powered Cedar Co-Pilot
* **Natural Language to Policy Translation:** Provides conversational policy generation inside the `/api/policy/co-pilot` endpoint. SecOps developers submit conversational prompts (e.g. *"allow pm-sme to write .md files"*).
* **Gemini-1.5-Pro API Integration:** Leverages the official Google Gemini API (with `gemini-1.5-pro` model) to interpret user intent, generating a syntactically correct Cedar authorization rule and a concise plain-English explanation returned as JSON.
* **Resilient Mock Fallback Engine:** Implements a robust rule-based mock parser that handles key policies (for roles like `pm-sme` and `security-sme`) when `GEMINI_API_KEY` is not set, providing robust fail-safes during offline development.

---


## ⚙️ Quick Start & Execution Guide

### Prerequisites
*   **Node.js** >= 20.0.0
*   **Docker** (Optional, for full sandbox isolation)

### 🚀 1. Bootstrapping the Repository
Run the unified repository bootstrapper. This script configures local git hooks, audits runtime toolchains, and verifies directory-scoped memory consistency:
```bash
npm run bootstrap
```

### 💻 2. Running the Applications
To run both the secure gateway backend and the administration dashboard in parallel:
```bash
npm run dev
```
*   **Admin Dashboard:** [http://localhost:3000](http://localhost:3000)
*   **Secure Gateway:** [http://localhost:3001](http://localhost:3001)

### 🛡️ 3. Simulating a Sandboxed Security Audit
You can execute a secure static audit of your workflows or local compilation within the unprivileged Docker container:
```bash
npm run sandbox
```

### 🧪 4. Local CI/CD Emulation
To run your hardened workflows entirely offline inside a Docker container using `act`:
```bash
npm run ci
```

### 🚨 5. Cryptographic Receipt Verification
You can copy any cryptographically signed transaction receipt from the dashboard log grid, paste it into the **Receipt Verifier Tool** inside the admin portal, or verify it offline using:
```bash
node packages/crypto-utils/dist/index.js --verify <path_to_receipt_json>
```

### 📡 6. Filesystem Drift Detection & Auto-Reconciliation
To manually audit filesystem drift in a sandbox or workspace:
```bash
bash scripts/sandbox-drift-detect.sh <workspace_path>
```
To trigger the active rollback and reconcile all untracked or modified changes:
```bash
curl -X POST http://localhost:3001/api/sandbox/reconcile -H "Authorization: Bearer <admin_token>"
```

### 🧠 7. Gemini Cedar Policy Co-Pilot
To generate a Cedar policy from a natural language request using the Co-Pilot API:
```bash
curl -X POST http://localhost:3001/api/policy/co-pilot \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <developer_token>" \
  -d '{"prompt": "allow pm-sme to write md files"}'
```

---

## 📦 Continuous Delivery & Automated Releases

FidusGate implements a highly standardized, trunk-based delivery model governed by conventional commits and automated release pipelines:

* **Conventional Commit Compliance:** Code changes are prefixed using semantic scopes (e.g. `feat(secops)`, `chore(release)`, `fix(crypto)`). This enables deterministic dependency mapping and machine-readable changelog logs.
* **Semantic Release Automation (`.releaserc.json`):** Leverages automated release steps during the main branch pipeline build to:
  1. Parse commit messages and automatically calculate the next semantic version (Major/Minor/Patch).
  2. Auto-generate comprehensive changelogs based on standard templates.
  3. Publish release tags and drafts directly to GitHub.
* **Release Pipeline Workflow (`.github/workflows/release.yml`):** Runs on push to the `main` branch, performing automated test validation (`npm run test`), monorepo type-checking (`tsc`), and launching the release runner securely.

---

## 🔬 Enterprise Production & Hardening Guide

While FidusGate is designed to scaffold zero-trust structures with local configurations for development, transitioning to a highly available enterprise-grade production environment requires upgrading the following layers:

### 1. Database Architecture & Persistence Strategy
* **Current Setup**: By default, `@fidusgate/database` operates in a zero-dependency local JSON file store mode. However, a fully relational database capability is already integrated using the **Prisma ORM**.
* **Transition to Production**:
  1. Define a `DATABASE_URL` pointing to your PostgreSQL cluster in the `.env` file of the gateway.
  2. Run `npx prisma db push` to generate and apply the structured database schema.
  3. Deploy PostgreSQL with a highly available, clustered setup (e.g., using multi-AZ deployments, Aurora PostgreSQL, or PgBouncer for connection pooling to survive traffic spikes).
  4. Implement regular database backup routines and read-replicas for audit trail analytics.

### 2. Audit Log Security & Append-Only Guarantees
* **Current Setup**: Storing transaction receipts under `.memory/receipts` and logs in `.memory/audit-log.md` is convenient for local inspection, but flat files lack tamper-evident guarantees, retention compliance, or lock concurrency.
* **Transition to Production**:
  1. **SIEM / Centralized Logging**: Configure the secure-gateway's security log streams to pipe directly to centralized, secure audit systems (e.g. AWS CloudWatch, Datadog, or Grafana Loki).
  2. **Centralized Ledger Database**: Integrate a dedicated ledger store like Amazon QLDB or a tamper-evident blockchain ledger to record cryptographic transaction hashes, ensuring absolute non-repudiation.
  3. **Hash-Chain Auditing**: Implement cryptographic chaining where each new receipt contains the signature of the previous receipt block, rendering any history deletions immediately visible to validators.
  4. **Retention Policies**: Configure log group resource policies to enforce strict write-once-read-many (WORM) parameters with standardized retention rules (e.g., 7 years for SOC 2 / ISO 27001 compliance).

### 3. Gateway Configuration Modes
The `protect-mcp.config.json` governs the gateway runtime enforcement behavior via the `"mode"` key:
* `"shadow"`: Evaluates all incoming transaction requests against Cedar access-control rules and logs the decisions, but does not block requests. This is useful for auditing and testing policies against real-world developer workflows before enforcement.
* `"enforce"`: Full zero-trust active gatekeeping. The secure-gateway actively blocks any tool execution, receipt submission, or console command that fails Ed25519 cryptographic validation or evaluates to `"deny"` under Cedar access controls.

---

## 🔬 Audit & Production Quality Status
* **Junk Files**: 100% Cleared. Build directories (`dist`, `.turbo`), cache files, and OS noise have been clean-pruned.
* **Secrets Check**: 100% Secure. Absolutely no passwords, raw private keys, or actual developer credentials are committed.
* **Lockfile Fidelity**: Standardized with an `npm` lockfile (`package-lock.json`).
* **Test Coverage**: Tested and verified with a built-in zero-dependency Node.js test runner covering Ed25519 cryptography, Cedar dynamic AST parser evaluation, and shell command allowlist audits.
