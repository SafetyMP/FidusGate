# ⚖️ Technical Implementation Plan: FidusGate Enterprise Phase 2 Hardening

This plan outlines the architectural specifications, component additions, and integration strategies to evolve FidusGate into a fully cloud-resilient, hardware-secured, and sub-millisecond sandboxed **AI DevSecOps Governance Platform**.

---

## 🏛️ Goal Description

Phase 1 established mathematically verified audit chains, stateful circuit breakers, and conversational Cedar playgrounds. **Phase 2** focuses on removing development-to-production gaps by replacing mock infrastructure with true enterprise-grade cloud integrations and optimizing execution latency.

We will achieve this by:
1. **Accelerating unprivileged tools:** Implementing a Node-native **WebAssembly (WASI) runtime** to bypass Docker startup overhead.
2. **Hardening non-repudiation:** Migrating from local key generation to hardware-backed **Google Cloud KMS and AWS KMS** HSM signing providers.
3. **Transitioning to live telemetry:** Piping native OpenTelemetry hooks directly into Prometheus metrics and the dashboard.
4. **Implementing multi-signature controls:** Establishing a **Multi-Agent Consensus Gate** requiring multiple SME approvals for critical actions.
5. **Enforcing type safety:** Validating co-pilot generated Cedar policies against the platform's active entity schema before committing.

---

## 📢 User Review Required

> [!IMPORTANT]
> **Cloud KMS Provider Credentials:** 
> Transitioning to AWS/GCP KMS requires active cloud IAM service accounts with `kms.signer` or `kms.verifier` permissions mounted into the Gateway environment variables (`AWS_ACCESS_KEY_ID`, `GOOGLE_APPLICATION_CREDENTIALS`). Local mock fallbacks will remain in place as standard development modes if variables are empty.

> [!WARNING]
> **Database Schema Migrations:** 
> The introduction of the Multi-Agent Consensus Gating protocol requires three new Prisma tables (`ConsensusRequest`, `SignatureAttestation`, and `SmeKeypair`). Applying this migration (`npx prisma migrate dev --name consensus_gating`) will modify the local SQLite/PostgreSQL schema and wipe database tables in mock mode.

---

## ❓ Open Questions

1. **Wasm Target Binaries:** Do you prefer using **Wasmer** or Node's native `node:wasi` (UVwasi) module as the primary sandboxed execution runner inside the Gateway backend?
2. **Prometheus Metric Ingestion:** Should the gateway push metrics directly to an active **OTel Collector** endpoint (`OTLP/gRPC`) or host a polling `/metrics` endpoint for **Prometheus** scraper agents?

---

## 📐 Proposed Changes

Logical mappings of the upcoming Phase 2 code modifications separated by components:

---

### 🔑 Cryptographic Utilities (`packages/crypto-utils`)
Implements official cloud providers for KMS Transit encryption.

#### [NEW] [kms-provider.ts](../packages/crypto-utils/src/kms-provider.ts)
* Create `KmsProvider` interface with `signDigest` and `verifySignature` signatures.
* Implement `AwsKmsProvider` utilizing `@aws-sdk/client-kms` to dispatch KMS Transit signatures.
* Implement `GcpKmsProvider` utilizing `@google-cloud/kms` to execute HSM-backed signatures.

#### [MODIFY] [crypto.ts](../packages/crypto-utils/src/crypto.ts)
* Integrate KMS provider resolution routing:
  ```typescript
  export function resolveKmsProvider(config: KmsConfig): KmsProvider {
    if (config.provider === 'aws') return new AwsKmsProvider(config);
    if (config.provider === 'gcp') return new GcpKmsProvider(config);
    return new LocalMockKmsProvider();
  }
  ```

---

### 💾 Core Database Client (`packages/database`)
Adapts schema tables to track pending multi-sig consensus requests and verified authorizations.

#### [MODIFY] [schema.prisma](../packages/database/prisma/schema.prisma)
* Add `ConsensusRequest` model:
  ```prisma
  model ConsensusRequest {
    id            String                 @id @default(uuid())
    actionType    String                 // e.g. "apply_policy" or "execute_script"
    payload       String                 // JSON payload of action
    status        String                 @default("pending") // pending, approved, rejected
    attestations  SignatureAttestation[]
    createdAt     DateTime               @default(now())
  }
  ```
* Add `SignatureAttestation` model:
  ```prisma
  model SignatureAttestation {
    id                 String           @id @default(uuid())
    requestId          String
    request            ConsensusRequest @relation(fields: [requestId], references: [id])
    smeRole            String           // "devops", "security", "architecture"
    signature          String
    verificationKid    String
    attestedAt         DateTime         @default(now())
  }
  ```

#### [MODIFY] [index.ts](../packages/database/src/index.ts)
* Add database client methods:
  * `createConsensusRequest(actionType, payload)`
  * `submitAttestation(requestId, smeRole, signature, kid)`
  * `getPendingConsensusRequests()`

---

### 🛡️ Secure Gateway Backend (`apps/secure-gateway`)
Instruments native WASI unprivileged executors, native OTel exporters, and consensus routers.

#### [NEW] [wasi-runner.ts](../apps/secure-gateway/src/wasi-runner.ts)
* Implement sub-millisecond unprivileged WASI compilation runner utilizing Node's built-in `node:wasi` classes:
  ```typescript
  import { WASI } from 'node:wasi';
  import { readFile } from 'node:fs/promises';
  
  export async function runWasmCommand(wasmPath: string, args: string[], preopens: Record<string, string>) {
    const wasi = new WASI({ version: 'preview1', args, preopens });
    const wasmCode = await readFile(wasmPath);
    const wasmModule = await WebAssembly.compile(wasmCode);
    const instance = await WebAssembly.instantiate(wasmModule, {
      wasi_snapshot_preview1: wasi.wasiImport
    });
    return wasi.start(instance);
  }
  ```

#### [MODIFY] [index.ts](../apps/secure-gateway/src/index.ts)
* **Wasm Route Integration:** In `/api/sandbox/execute`, inspect command targets. If targeting compilation tools (like TypeScript `tsc`), dynamically route execution through `wasi-runner.ts` instead of launching Docker containers.
* **Consensus API Router:** Mount `/api/consensus/requests` (`GET`/`POST`) to query, request, and verify role signatures.
* **OTel Integration:** Pipe native trace metrics into the `/metrics` Prometheus collector backend on port 3002.

---

### 🎨 Operations Dashboard (`apps/admin-dashboard`)
Provides operations panels for multi-sig attestations and live OTel tracing metrics.

#### [MODIFY] [App.tsx](../apps/admin-dashboard/src/App.tsx)
* **Consensus Control Center:** Add a "Pending Approvals" alert grid next to active findings. Tapping "Approve" dispatches SME keypair signatures to the secure gateway backend consensus API.
* **OTel Prometheus Integration:** Fetch active Prometheus performance stats directly from port 3002 in the data syncer, replacing simulated metrics with real traces.

---

## 🧪 Verification Plan

### Automated Verification
We will verify all additions using structural monorepo integration tests:
```bash
# Verify the WASI runner can compile simple scripts in sub-milliseconds
npm run test:wasi

# Validate the Google/AWS KMS transit routing
npm run test:kms

# Execute consensus signature flows across multiple SME key pairs
npm run test:consensus
```

### Manual Verification
1. Boot development servers using `npm run dev`.
2. Inspect the **Operations Tab** inside the dashboard. Request a critical policy update, and verify that the request sits in a "Pending Consensus" state.
3. Authenticate as `security-sme` and `devops-sme` respectively inside OIDC, sign the request, and verify that the Gateway automatically merges changes once consensus is met.
4. Execute `tsc` compilation inside the sandbox terminal, and verify that processing time drops to **< 50 milliseconds** due to WebAssembly bypass routing.
