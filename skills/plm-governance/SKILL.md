---
name: plm-governance
description: "Enforce end-to-end Product Lifecycle Management (PLM) and Product Development Lifecycle (PDLC) guardrails, covering requirements traceability, API drift prevention, and SemVer release gating."
category: meta
risk: safe
source: self
source_type: official
date_added: "2026-05-30"
author: Google DeepMind Advanced Agentic Coding
tags: [plm, pdlc, requirements, traceability, api-drift, semver, release-gating]
---

# Product Lifecycle Management (PLM) Governance Playbook

## Overview

A premium playbook for running AI agent coding projects in full alignment with Product Lifecycle Management (PLM) and Product Development Lifecycle (PDLC) foundations. This playbook ensures that technical implementations follow a disciplined, quality-controlled, and audited engineering thread from requirements definition to final release.

These gates are programmatically enforced by the **Veritas Security Gateway** (the agent harness). If an agent attempts high-risk actions (like code commits or publishing) without maintaining bidirectional requirement traceability, checking for API drift, or documenting releases, the gateway will programmatically block the operations using Cedar access controls.

---

## The PDLC Gated Life Cycle

The secure development lifecycle is split into 4 key planning horizons statefully tracked by the gateway:

```
    PLANNING PHASE          IMPLEMENTATION & QA          RELEASE PHASE
  ┌─────────────────┐       ┌───────────────────┐     ┌──────────────────┐
  │   Requirements  │ ────> │ Traceability Gate │ ──> │   SemVer Gating  │
  │   Registration  │       │ (Code-to-Test Mapping)  │ (package.json Bump)
  └─────────────────┘       └─────────┬─────────┘     └────────┬─────────┘
                                      │                        │
                                      ▼                        ▼
                            ┌───────────────────┐     ┌──────────────────┐
                            │  API Drift Check  │     │ Changelog Gate   │
                            │ (Schema & Types)  │     │ (CHANGELOG.md)   │
                            └───────────────────┘     └──────────────────┘
```

---

## The Gated Compliance Phases

### 1. Requirements & Backlog Gating (Planning Phase)
AI agents must align their code modifications with registered business values.
* **Requirement Registration:** Before any file write operations (`write_file`, `replace_file_content`) are permitted inside source code directories (`apps/*`, `packages/*`), the active requirement/issue ID must be registered via `POST /api/plm/requirement` (e.g. `{ "id": "REQ-101", "description": "Add database migration tracker" }`).
* **Enforcement:** Cedar rules programmatically block code writes if `plm.active_requirement_id` is null or empty.

### 2. Bidirectional Traceability Gating (QA & Implementation Phase)
To guarantee code quality and prevent technical regression, every feature modification must have associated tests.
* **Test Verification:** When source files are updated, the gateway statefully requires that corresponding test files (`*.test.ts` or `*.spec.ts`) are also written or updated in the same requirement session.
* **Enforcement:** Committing code (`git commit`) is forbidden if source files have been modified but `plm.associated_tests_written` is false.

### 3. API & Schema Drift Prevention Gate (Design & Architecture Phase)
Unplanned schema modifications can break downstream components. Veritas tracks interface stability statefully.
* **Drift Monitoring:** Modifying sensitive interface contracts (such as `prisma/schema.prisma` or exported types inside `packages/core-types/`) marks the session with a `has_api_drift = true` risk flag.
* **Drift Verification:** The agent must execute the project's contract or schema verification tests (e.g. `npm run test` or running specific migration compilations) and push confirmation to the gateway via `POST /api/plm/drift-verify` to clear the blockade.
* **Enforcement:** Committing code is forbidden if `plm.has_api_drift` is true and `plm.drift_verified` is false.

### 4. Semantic Versioning & Documentation Gate (Release Phase)
Releases must be clearly versioned and documented to maintain consistency.
* **Versioning & Changelog Check:** Before performing a release command (`npm publish` or creating release tags), the agent must update the project's semantic version inside `package.json` and append a summary of changes to `CHANGELOG.md`.
* **Enforcement:** Publishing code is forbidden if `plm.release_version_updated` or `plm.changelog_updated` is false.

---

## Step-by-Step Compliant Agent Workflow

Follow this pipeline to maintain perfect PLM compliance:

### Step 1: Register Active Requirement
Identify the target requirement/issue ID from the sprint board and submit it to the gateway:
* **API Target:** `POST /api/plm/requirement`
* **Payload:**
  ```json
  {
    "id": "REQ-202",
    "description": "Refactor secure-gateway to support Tier 7 PLM Compliance Rules"
  }
  ```

### Step 2: Implement Code and Associated Tests
Write both specialized implementation code and the verification test suites concurrently.
* **Implementation:** Modify source files in `apps/` or `packages/`.
* **Verification:** Write/update `*.test.ts` or `*.spec.ts` files mapping to the modified files to clear the `associated_tests_written` gate.

### Step 3: Handle API Drift (If Schema/Contracts Changed)
If database schemas (`schema.prisma`) or type schemas (`packages/core-types/`) were modified:
1. Generate the database migration (`npx prisma migrate dev`).
2. Run compiler and contract validation tests inside the Docker sandbox.
3. Call `POST /api/plm/drift-verify` to notify the gateway that drift is verified and cleared.

### Step 4: Secure Code Commit
Execute the pre-commit audits (pipeline tests, security audits, drift checks) and issue the secure git commit command inside the sandbox.

### Step 5: Release Version Bump & Changelog Update
Prior to production publishes or tag generation:
1. Increment the semantic version in `package.json` matching change impact (SemVer major/minor/patch rules).
2. Append the change log in `CHANGELOG.md`.
3. Execute `npm publish` to deploy the package.

---

## Related Skills

- `@protect-mcp-governance` — Access control policies and receipt checks.
- `@devops-compliance` — Stateful build, test, and security audit gates.
- `@ibp-governance` — Strategy backlog alignment and token budgeting gates.
