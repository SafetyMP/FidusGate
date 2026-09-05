# Security Policy

FidusGate is a reference implementation of **signed Ed25519 receipts for MCP tool calls** plus an admin console. It is **not** a production-hardened security product. Reports that weaken fail-closed authorize, Cedar, or receipt-verification paths are still in scope.

## Supported Versions

Only the latest active release on `main` is supported for security updates:

| Version | Supported |
| ------- | --------- |
| v1.0.x  | ✅ Yes     |
| < v1.0  | ❌ No      |

## Reporting a Vulnerability

If you discover a vulnerability, access-control bypass (e.g. in the Cedar policy logic), receipt forgery or verification bypass, container jailbreak (e.g. escaping the gVisor sandbox), or a prompt-injection vulnerability:

1. **Do not open a public GitHub issue.**
2. Report privately via **[GitHub Security Advisories](https://github.com/SafetyMP/FidusGate/security/advisories/new)** (preferred).
3. If that link returns 404, ask a repo admin to enable **Settings → Code security → Privately report a security vulnerability**, then retry.
4. Do **not** email `security@fidusgate.io` — that domain currently has no public DNS/MX and reports will bounce.
5. Include detailed steps, sample payloads, and configurations to reproduce where safe.
6. We aim to acknowledge within **72 hours** and coordinate patches under a **90-day responsible disclosure window** before publishing details.

Thank you for helping keep FidusGate secure!
