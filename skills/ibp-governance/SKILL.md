---
name: ibp-governance
description: "Enforce Integrated Business Planning (IBP) principles across Strategy, Finance, and Operations, ensuring cross-functional synthesis and budget alignment in agentic pipelines."
category: meta
risk: safe
source: self
source_type: official
date_added: "2026-05-30"
author: Google DeepMind Advanced Agentic Coding
tags: [ibp, strategy, finance, operations, cross-functional, budget-gating, synthesis]
---

# Integrated Business Planning (IBP) Governance Playbook

## Overview

A comprehensive playbook for running AI agent coding projects in full alignment with Integrated Business Planning (IBP) foundations. This playbook ensures that technical coding work does not occur in an operational silo, but is statefully aligned with both **Strategic Goals** and **Financial/Resource Budgets**.

These principles are statefully enforced by the **Veritas Security Gateway** (the agent harness). If an agent attempts high-risk actions (like code commits or publishing) without completing mandatory IBP synthesis reviews, or if they exceed token budgets, the gateway will programmatically block the operations using Cedar access controls.

---

## The IBP Pillars for AI Agents

IBP integrates three core organizational planning horizons into a unified "single source of truth":

```
  ┌──────────────────────────────────────────────────────────┐
  │                        STRATEGY                          │
  │  (Sprint & Backlog Alignment, High-Value Feature Focus)  │
  └────────────────────────────┬─────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
 ┌──────────────────────┐              ┌──────────────────────┐
 │       FINANCE        │              │      OPERATIONS      │
 │  (API Token Budgets, │◀────────────▶│   (Dual Execution &  │
 │   Resource Costing)  │              │ Cross-Functional Sync│
 └──────────────────────┘              └──────────────────────┘
```

1. **Strategy (Strategic Intent):** Every task must be mapped to registered business values and project sprint goals, rather than performing arbitrary code edits.
2. **Finance (Resource & Token Costing):** Heavy CLI command executions and LLM API calls accumulate financial costs. Every session operates under a strict, gated token budget.
3. **Operations (Dual Execution & Cross-Functional Synthesis):** Agents must avoid technical narrow-mindedness by executing tasks in both **specialized** (backend, DB schemas, APIs) and **generic** (security audits, accessibility, documentation) ways, and synthesizing those outcomes before final release.

---

## Step-by-Step IBP Workflow

Follow this step-by-step pipeline to achieve stateful IBP compliance:

### Step 1: Strategic Intent Alignment
Before modifying any files, verify that your active task aligns with the project backlog and current sprint goals:
- Inspect the registered sprint goals in `.memory/ibp-compliance-state.json`.
- Document how your proposed technical implementation satisfies the strategic business value.

### Step 2: Dual Execution Planning
Break down your work into two distinct execution channels to avoid technical silos:
1. **Specialized Implementation:** Writing precise, high-performance code (e.g. implementing Express routes, database schemas, complex logic).
2. **Generic Auditing & Verification:** Conducting broad, cross-functional reviews:
   - Run accessibility DevTools checks (`a11y-debugging`).
   - Run workflow security scanners (`agentic-actions-auditor`).
   - Audit context drift (`ham-drift-watcher.sh`).

### Step 3: Stateful Execution & Budget Tracking
Execute both specialized and generic tasks inside the secure unprivileged Docker sandbox.
- The Veritas Security Gateway will accumulate estimated token costs for all tool calls in real time.
- If your running consumption (`tokensConsumed`) exceeds the session limit (`tokenBudget`), the gateway will transition to an **Un-Aligned** state, blocking all subsequent Tier 3 and Tier 4 commands.

### Step 4: Cross-Functional IBP Synthesis
Once both specialised edits and generic audits are complete, you must compile and submit a unified **Cross-Functional Synthesis Report** to the gateway via the `/api/ibp/synthesize` endpoint:
- **API Target:** `POST /api/ibp/synthesize`
- **Payload Format:**
  ```json
  {
    "report": "### IBP Cross-Functional Synthesis Report\n\n1. **Strategic Value:** Resolved bottleneck in transactions database...\n2. **Specialized Edits:** Updated database index inside packages/database...\n3. **Generic Quality Audits:** Audited workflow security and verified zero High findings...\n4. **Financial Summary:** Consumed 45,200 tokens (within sprint budget bounds)..."
  }
  ```
- Submitting this report transitions the IBP compliance gate to **Compliant** and releases the commit/push gate.

### Step 5: Secure Commit & Logging
With both DevOps and IBP compliance gates successfully released, commit the changes securely and write the cryptographic receipts to `.memory/audit-log.md`.

---

## Best Practices

- ✅ **Do:** Monitor your token spend by querying `GET /api/ibp/state` during long-running tasks.
- ✅ **Do:** Make sure to execute a generic audit (like a security scan or accessibility check) for every major code change.
- ✅ **Do:** Write highly detailed and actionable cross-functional reports for your synthesis submissions.
- ❌ **Don't:** Over-engineer simple tasks to avoid burning through the token budget.
- ❌ **Don't:** Try to commit code without submitting your synthesis report first.

---

## Loop Protection & Budget Circuit Breakers (Tier 2 Governance)

- **Financial Circuit Breaker:** If token budget consumption exceeds **120% of forecast** during task execution, the agent MUST immediately stop spawning new workers, halt all tool calls, and escalate to the developer.
- **Action:** Output a detailed financial report in chat showing the exact token burn, active operations, and wait for explicit developer approval or budget expansion.

---

## Related Skills

- `@protect-mcp-governance` — Access control policies and Ed25519 signed receipts.
- `@devops-compliance` — Stateful build, test, and pre-commit verification gates.
