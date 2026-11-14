# Connected console redesign

Apply the receipt-first Pages design to the gateway console while retaining its operational workflows and server-side controls. The static Pages demo remains a separate build with synthetic data and browser verification. The connected console reads its configured gateway and submits receipt verification to that gateway.

## Workspaces and preserved operations

| Workspace | Operations |
| --- | --- |
| Decisions | Search/filter actual gateway receipts, inspect reasons and arguments, download the original JSON, hand a receipt to verification; show chain health separately |
| Policy playground | Active/draft simulation, editable request context, non-executing presets, co-pilot chat/history, load draft, confirmed admin policy application |
| Receipt verifier | Submit exact JSON to `/api/receipts/verify`; clear stale results on edits; distinguish failed signatures, malformed JSON, and unavailable verification |
| Transactions | Ledger, developer/admin submission, returned IDs and PII masking feedback |
| Governance | Circuit breaker, consensus approval/override, budgets, feedback/alignment, drift sync, patch application, local snapshot export |
| Forensics | Command timeline, search/status filters, role-gated compliance receipt exports, original receipt verification |
| Sandbox | Existing playbooks and allowlisted commands, throttle/consensus feedback, syscalls and autofix controls |

Role restrictions, policy-application confirmation, database-reset confirmation, resource-ID validation, and gateway enforcement remain in place. No gateway, Cedar, principal-signature, KMS, production-profile, or WebSocket authentication code is changed. Local snapshot exports contain actual records and no token fragments or fabricated signatures; they are explicitly unsigned.

## Running the connected console

Use the existing workspace build/bootstrap and `npm run dev` setup. The console is on port 3000 and proxies API requests to port 3001. Set `FIDUSGATE_BOOTSTRAP_KEY` in the development gateway environment; enter that key in the session panel to request a developer, administrator, or auditor session. Both the key and resulting bearer remain memory-only. This is development bootstrap authentication, not an implemented production OIDC login. The existing production startup guard remains fail-closed.

Authenticated reads refresh every four seconds after the previous batch finishes, with eight-second request timeouts. The browser cannot supply the gateway WebSocket's required Authorization header, so the console uses authenticated polling without weakening that WebSocket guard. Refresh generations prevent stale reads from replacing newer data. Disconnect resets the entire session-owned UI; pending playbook sequences stop before dispatching another request. Disconnect does not revoke an already issued JWT or cancel a server operation already submitted.

The Vite development proxy also reads the gateway's local health and metrics listeners. For isolated local testing, `FIDUSGATE_API_TARGET` and `FIDUSGATE_METRICS_TARGET` override their default targets (`http://localhost:3001` and `http://localhost:3002`). The container proxies health but deliberately does not expose the gateway's private metrics listener; unavailable metrics are labeled unavailable. Reachability, chain validity, signature validity, and production readiness are separate claims.

## Acceptance and verification

- Component and App integration tests cover receipt search/download/handoff, verification scope and stale responses, presets without side effects, all seven workspaces, role restrictions, bootstrap headers, session cleanup, and queued-playbook cancellation.
- Existing static demo tests remain part of the dashboard suite; both connected and Pages builds are checked.
- Gateway regression tests cover receipt signatures, consensus, production authentication/profile, principal signatures, and circuit-breaker behavior.
- A localhost-only isolated gateway smoke verifies bootstrap requirements, protected reads, developer/auditor restrictions, and genuine signed versus tampered test receipts. Temporary data and keys stay outside the repository; no sandbox commands or external-provider integrations are invoked.
- Browser checks cover connected sign-in, receipt verification, policy presets/evaluation, responsive navigation, and honest seeded-record failures. Fresh development seeds are signed and chained. Older placeholder seeds require the explicit, backed-up [development seed repair](development-receipt-seeds.md); the console continues to report any genuine verification failure.

The required `scripts/harness/verify.sh` must still run. On the development machine it completes installation/lint but the full test graph stops at the Cedar daemon Docker build because Docker is absent. CI supplies Docker; its results are separate from local verification.
