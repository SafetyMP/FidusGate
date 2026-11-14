# Security policy

FidusGate is a reference implementation with real authorization and signature checks alongside explicitly labeled development and simulated components. It is not a production-hardened security product or a compliance certification. See the [threat model](docs/adr/0000-threat-model.md), [architecture](docs/ARCHITECTURE.md), and [connected console boundaries](docs/CONNECTED-CONSOLE-REDESIGN.md).

## Supported scope

Security fixes target the current `main` branch and latest release. Older releases do not have a separate maintenance commitment. A passing CI run or published container does not establish production suitability.

The public Pages demo has synthetic records and a public demo key. The connected development console uses bootstrap authentication, local keys, and JSON storage by default. Do not expose development credentials or treat development login as production OIDC.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/SafetyMP/FidusGate/security/advisories/new). **Do not open a public issue with undisclosed vulnerability details, exploits, credentials, or affected private data.**

If private reporting is unavailable, ask the repository maintainer through a public issue to enable it without disclosing the vulnerability. No alternative security email address is currently published here.

Include the affected commit/release and component, a minimal synthetic reproduction, expected and actual behavior, impact, and relevant redacted logs. Coordinate disclosure through the private report. Reports are reviewed on a best-effort basis; this project does not offer a response-time SLA.

## Security invariants

Authorization, kill-switch, policy decision point, principal-signature, production-profile, and KMS prerequisite failures must remain fail-closed. Never silently fall back from enforce to shadow. Preserve role checks, sensitive-operation confirmations, and authenticated API/WebSocket boundaries.

Receipt signatures and hash-chain checks must remain independent: integrity against a key does not establish issuer trust, complete history, or tool execution. Development seed repair must not rewrite arbitrary audit history or disable verification. Preserve original evidence when investigating a failure.
