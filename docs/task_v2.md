# ⚖️ FidusGate Phase 2 Hardening Tasks Tracker (task_v2.md)

This checklist tracks our progress during the execution of FidusGate's Phase 2 Enterprise Hardening & WASI Optimization plan.

---

## 📋 Task Checklist

- `[x]` **Phase 1: Cryptographic KMS Integrations (`packages/crypto-utils`)**
  - `[x]` Create `kms-provider.ts` defining `KmsProvider`, `AwsKmsProvider`, `GcpKmsProvider`, and mock fallback logic.
  - `[x]` Update `crypto.ts` to dynamically resolve the KMS provider based on active config.
  - `[x]` Compile and verify `@fidusgate/crypto-utils`.
- `[x]` **Phase 2: Database Schema & Client Upgrades (`packages/database`)**
  - `[x]` Add `ConsensusRequest` and `SignatureAttestation` models to `schema.prisma`.
  - `[x]` Implement `createPendingAction`, `addConsensusApproval`, and active list queries inside `database/src/index.ts`.
  - `[x]` Re-generate database client classes (`npx prisma generate`).
- `[x]` **Phase 3: Secure Gateway WASI & Consensus API (`apps/secure-gateway`)**
  - `[x]` Create native Node.js WebAssembly system runner (`wasi-runner.ts`).
  - `[x]` Mount unprivileged compiler WASI bypass routing inside `/api/sandbox/execute`.
  - `[x]` Add new consensus endpoints `/api/consensus/requests` (GET & POST) inside `secure-gateway/src/index.ts`.
- `[x]` **Phase 4: Operations Dashboard Gating Controls (`apps/admin-dashboard`)**
  - `[x]` Integrate visual "Pending Approvals" multi-sig attestation card under the Compliance Tab.
  - `[x]` Create "Approve Action" triggers that append SME-attested cryptographic signatures.
  - `[x]` Hook real-time OTel metrics into active dashboard chart panels.
- `[x]` **Phase 5: Verification & Compilation**
  - `[x]` Compile all monorepo packages.
  - `[x]` Run full test suite (`npm run test`) to confirm zero regressions.
