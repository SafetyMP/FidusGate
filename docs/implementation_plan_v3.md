# ⚖️ Technical Implementation Plan: FidusGate Enterprise Phase 3 Hardening

This plan outlines the technical specifications, component-level changes, and verification plans to execute the final five enterprise-grade enhancements to FidusGate.

---

## 🏛️ Goal Description

Phase 2 successfully integrated native WASI runs, mock AWS KMS providers, and visual consensus approval boards. **Phase 3** focuses on locking down the production trust-chain by replacing mock/local cryptographic operations with HSM-enforced cloud checks, executing real WASI compiler binaries, streaming native OTel pipelines, validating policy schemas statically, and purging expired requests automatically.

---

## 📢 User Review Required

> [!IMPORTANT]
> **KMS Verification HSM Authorization:** 
> Routing verification requests directly to Google Cloud KMS or AWS KMS requires the cloud IAM service account to possess `kms.verifier` or `kms.verify` permissions. If missing, verification queries will log warnings and fall back to local cryptographic checks.

> [!WARNING]
> **Cedar CLI Engine Dependencies:** 
> Executing static Cedar policy validations against the active schema requires compiling the Rust-based `cedar-policy` CLI binary into a WASI-compliant WebAssembly module (`cedar.wasm`) and mounting it inside the gateway's binary storage namespace.

---

## ❓ Open Questions

1. **WASM Toolchain Compilers:** Do we have pre-compiled WASM modules for our TypeScript compilers (`tsc.wasm`) and linters (`eslint.wasm`) ready in our devops deployment registries, or should we build them as part of our automated package pipelines?
2. **Prometheus Aggregator URL:** What is the target Prometheus/OTel collector gateway URL inside your production staging namespace where the Port 3002 exporter should dispatch spans?

---

## 📐 Proposed Changes

Logical mappings of the upcoming Phase 3 changes:

---

### 🔑 Cryptographic Utilities (`packages/crypto-utils`)
Upgrades KMS wrappers to execute hardware-secured signature verification.

#### [MODIFY] [index.ts](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/packages/crypto-utils/src/index.ts)
* **AWS KMS Verification:** Modify `AwsKMSProvider.verifyReceipt` to call AWS KMS `Verify` endpoint via synchronous curl commands, ensuring signature validation occurs strictly inside the HSM.
* **GCP KMS Verification:** Modify `GcpKMSProvider.verifyReceipt` to dispatch to Google Cloud KMS `AsymmetricVerify` endpoint using the active project service token.

---

### 🛡️ Secure Gateway Backend (`apps/secure-gateway`)
Integrates static policy schema validations, background consensus expiry schedulers, and real OTel metrics streams.

#### [NEW] [cron-worker.ts](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/apps/secure-gateway/src/cron-worker.ts)
* Implement a lightweight, background cron timer that polls pending consensus actions:
  ```typescript
  import { FidusGateDatabase } from '@fidusgate/database';
  
  export function startConsensusExpiryWorker(db: FidusGateDatabase, intervalMs: number = 60000) {
    setInterval(async () => {
      try {
        const pending = await db.getPendingActions();
        const now = Date.now();
        
        for (const action of pending) {
          if (action.status === 'pending' && new Date(action.expiresAt).getTime() < now) {
            // Statefully update action status to expired
            action.status = 'expired';
            // Save updated state and broadcast WebSocket alert
            console.log(`⏰ CONSENSUS EXPIRED: Action ID: ${action.id} has expired.`);
          }
        }
      } catch (err: any) {
        console.error('Failed to run consensus expiry worker:', err.message);
      }
    }, intervalMs);
  }
  ```

#### [MODIFY] [index.ts](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/apps/secure-gateway/src/index.ts)
* **Static Schema Validation:** Modify `/api/policy/co-pilot` translation handler. When receivingtranslated Cedar code blocks from Gemini, programmatically execute a dry-run validate task calling `wasi-runner` on the `cedar.wasm` binary using `policy.cedarschema`. Block the transaction if static type validation fails.
* **Background Worker Boot:** Trigger `startConsensusExpiryWorker` inside the HTTP server startup hook.
* **OTel Prometheus Pipeline:** Bind Port 3002's Prometheus `/metrics` stream to dispatch telemetry spans to active local OpenTelemetry Daemon collectors.

---

### 🎨 Operations Dashboard (`apps/admin-dashboard`)
Injects real OTel metrics synchronization and expired action alerts.

#### [MODIFY] [App.tsx](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/apps/admin-dashboard/src/App.tsx)
* **Prometheus Metrics Polling:** Refactor `fetchData` to fetch actual Prometheus metric arrays directly from port 3002's `/metrics` exporter, feeding live Gateway latency and request rates directly into our dashboard sparkline elements.
* **Consensus Expiry Notifications:** If a pending consensus action is marked as `'expired'` in the WS stream, render a glowing orange alert warning inside the attestation panel.

---

## 🧪 Verification Plan

### Automated Verification
We will verify all integrations using structural monorepo integration tests:
```bash
# Validate HSM-backed signature verification
npm run test:kms-verify

# Confirm expired consensus actions are automatically purged by cron workers
npm run test:expiry-worker

# Test static validator rejects mismatched Cedar schemas
npm run test:cedar-validate
```

### Manual Verification
1. Boot development servers using `npm run dev`.
2. Inspect the **Attestation Center** inside the dashboard. Request a high-privileged action and let it sit for 15 minutes. Verify that the card turns orange, displays `EXPIRED`, and disables the signature buttons automatically.
3. Submit a conversational policy request to Gemini that includes an invalid principal or action attribute. Verify that the gateway blocks the action and outputs a schema type-error before it can be applied to disk.
