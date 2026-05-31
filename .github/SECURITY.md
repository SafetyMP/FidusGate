# Security Policy

## Supported Versions

Only the latest active release on `main` is supported for security updates:

| Version | Supported |
| ------- | --------- |
| v1.0.x  | ✅ Yes     |
| < v1.0  | ❌ No      |

## Reporting a Vulnerability

FidusGate takes repository governance and AI sandbox containment security very seriously. If you discover a vulnerability, access-control bypass (e.g. in the Cedar policy logic), container jailbreak (e.g. escaping the gVisor sandbox), or a prompt-injection vulnerability:

1. **Do not open a public GitHub issue.** Instead, report the vulnerability privately by emailing the security engineering team at `security@fidusgate.io`.
2. Please provide detailed steps, sample payloads, and configurations to reproduce the vulnerability.
3. Our security team will acknowledge receipt of your report within 24 hours and provide an estimated timeline for remediation.
4. We coordinate updates and patches under a standard **90-day responsible disclosure window** before publishing details.

Thank you for helping keep FidusGate secure!
