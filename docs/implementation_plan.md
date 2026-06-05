# ⚖️ Implementation Plan: FidusGate Enterprise Upgrades & Security Hardening

This plan outlines the technical design, architectural additions, and implementation details for integrating our four high-value security, operations, and AI developer experience recommendations into FidusGate.

---

## 🏛️ Goal Description
The objective is to mature FidusGate from a local, single-developer agent sandbox into an enterprise-grade, high-performance, and mathematically tamper-proof **AI DevSecOps Governance Platform**. 

These upgrades establish:
1. **Self-Correcting Agent loops** via structured JSON autofix schemas.
2. **Conversation-to-Policy playgrounds** powered by live Gemini integration.
3. **Bulletproof non-repudiation** through cryptographic audit hash-chaining and AWS/GCP KMS key integration wrappers.
4. **Real-time operator controls** with live telemetry tracing and visual circuit breakers.
5. **High-speed sandboxing** using WebAssembly/WASI runtimes to eliminate Docker container latency.

---

## 📢 User Review Required

We have designed these modifications to be fully backward-compatible with FidusGate's current npm Workspaces and Prisma configurations. However, the following key architectural items warrant administrative review:

> [!IMPORTANT]
> **KMS Asymmetric Key Providers:** Production deployments will require provisioning an asymmetric signing key (Ed25519 or ES256) inside AWS KMS or Google Cloud KMS. Local setups will continue to use flat-file mock key generators.

> [!WARNING]
> **Prisma Database Schema Migration:** Adding hash-chain linkages (`previousReceiptHash`) to the `AuditReceipt` model requires executing a database migration (`npx prisma migrate dev --name receipt_hash_chain`). Running this on production PostgreSQL databases will necessitate a brief maintenance window.

---

## ❓ Open Questions

To align our implementation with your specific deployment ecosystem, please review the following design questions:

1. **Cloud KMS Infrastructure:** Do you prefer AWS KMS, Google Cloud KMS, or HashiCorp Vault Transit Engine as the primary target for hardware HSM cryptographic operations in production?
2. **Wasm Toolchain:** Which high-risk command-line utilities (e.g., compilers, linters, or code formatters) should be prioritized for compilation to WASI (WebAssembly System Interface) sandboxes?

---

## 📐 Proposed Changes

Separate changes are logically mapped by workspace components, ordering dependencies first:

---

### 🔑 Cryptographic Utilities (`packages/crypto-utils`)

Hardens signature routines, integrates cloud KMS wrappers, and supports hash-chain hashing.

#### [MODIFY] [crypto.ts](../packages/crypto-utils/src/crypto.ts)
* Add a `hashReceipt(payload: Omit<AuditReceipt, 'signature_sig'>): string` helper to compute cryptographically secure SHA-256 digests of receipts.
* Refactor signing routes to accept a `KmsConfig` block, supporting transit calls targeting Google Cloud KMS `AsymmetricSign` or AWS KMS `Sign` endpoints when active, falling back to local `keypair` generation if unconfigured.

---

### 💾 Core Database Client (`packages/database`)

Introduces schema fields for receipt hash-chaining, drift patch logging, and active circuit breaker states.

#### [MODIFY] [schema.prisma](../packages/database/prisma/schema.prisma)
* Update `AuditReceipt` model to add:
  * `receiptHash String @default("")`
  * `previousReceiptHash String @default("")`
* Add a new `SystemConfig` model to track stateful settings:
  * `id String @id @default("active_config")`
  * `circuitBreakerActive Boolean @default(false)`
  * `agentTokenBudget Float @default(1000.0)`

#### [MODIFY] [index.ts](../packages/database/src/index.ts)
* Update `addReceipt(receipt)`: Retrieve the latest recorded receipt in the DB, extract its `receiptHash`, inject it as `previousReceiptHash` in the new receipt, calculate the new cryptographic `receiptHash`, and write the tamper-evident receipt block to store.
* Add stateful database helpers to toggle `circuitBreakerActive` and check state thresholds.

---

### 🛡️ Secure Gateway Backend (`apps/secure-gateway`)

Integrates structured SDLC remediation hooks, hot-swaps active rules via co-pilot controllers, and instruments OpenTelemetry.

#### [MODIFY] [command-auditor.ts](../apps/secure-gateway/src/command-auditor.ts)
* Update `AuditResult` structure to return `suggestedAutofix` as a structured object containing target tokens, parameters, and suggested replacements.
* Add rules to detect dynamic package commands and inject explicit, safe workspace replacements.

#### [MODIFY] [index.ts](../apps/secure-gateway/src/index.ts)
* **OTel Instrumentation:** Mount OpenTelemetry APIs (`@opentelemetry/api`, `@opentelemetry/sdk-trace-node`) to trace latency across Express handlers, Rust-daemon authorization requests, and database persistence checks.
* **Circuit Breaker Middleware:** Add a global gateway middleware that blocks all agent requests if `circuitBreakerActive === true` is queried in the DB.
* **Auto-Fix Endpoint:** Return structured autofix suggestions inside `/api/sandbox/execute` and MCP tool-call JSON blocks.
* **Hot-Apply endpoint:** Add a new route `POST /api/policy/apply` to securely commit in-memory draft policies verified in the sandbox simulator to host filesystem (`policy.cedar`).

---

### 🎨 Operations Dashboard (`apps/admin-dashboard`)

Renders interactive circuit breaker kill switches, conversation-to-policy sandbox chat panels, and live tracing telemetry charts.

#### [MODIFY] [App.tsx](../apps/admin-dashboard/src/App.tsx)
* **Co-Pilot Playground Sidebar:** Add a collapsible sidebar drawer showing conversational prompts. Tapping "Apply" executes co-pilot translations and mounts draft rules inside the visual simulator.
* **Emergency Kill-Switch UI:** Place a large, high-fidelity Obsidian Neon Red "Suspended" toggler inside the attestation grid to immediately trigger active circuit breakers.
* **OTel Telemetry Grid:** Integrate micro-sparkline charts displaying gateway authorization latency metrics and tool-call transaction rates.

---

## 🧪 Verification Plan

### Automated Verification
Run full integration tests inside the local monorepo and sandbox:
```bash
# Run unit and integration tests covering hash-chains and schema additions
npm run test

# Run offline local CI emulation inside Docker container
npm run ci
```

### Manual Verification
1. Boot development servers using `npm run dev`.
2. Inspect the **Operations Dashboard** on port 3000 to verify that the neon emergency Kill-Switch toggles the gateway into fully restrictive mode, blocking all command executions.
3. Open the **Co-Pilot Sidebar**, type *"permit admin to write *.json files"*, verify that the policy is parsed by Gemini, shown in-memory, and can be saved to disk.
4. Execute terminal transactions, export a forensic compliance packet, and verify that receipt hashes compile into a perfect, mathematically continuous chain.
