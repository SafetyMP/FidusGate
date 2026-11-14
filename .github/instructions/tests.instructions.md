---
applyTo: "**/*.{test,spec}.ts,**/*.{test,spec}.tsx,**/tests/**/*.ts,**/tests/**/*.tsx"
---

# Test standards

- Ship behavior with a test in the existing layout (co-located `*.test.ts` or `tests/`).
- Do not skip, delete, or weaken verify, lint, typecheck, or adversarial gates to land a change.
- Do not invent a passing gate from prose. Run the documented verify command.
- Fixtures are synthetic. Never commit real PII, PHI, payroll, or credentials.

## This repository

- Definition of Done: `./scripts/harness/verify.sh`.
- Cedar: `bash scripts/cedar-validate.sh`.

- Gateway/database tests can call `clearDatabase()` on `packages/database/data`. Run the full harness and those tests in a disposable checkout with disposable data, never in the checkout serving a user console; do not symlink the database package back to live data.
- Verify public demo and gateway-connected behavior separately. Cover signature failure, malformed input, unavailable verification, and stale responses without weakening existing checks.
- An intact chain is not signature verification, issuer trust, complete-history proof, or execution proof. Make each assertion explicit.
