## Problem and change

Explain the user-visible problem and resulting behavior. Link a related issue when applicable.

## Verification

List commands/checks and outcomes on this commit. State blocked prerequisites or checks not run. For visual changes, include screenshots with synthetic data and identify public demo versus connected console.

## Review checklist

- [ ] The change fits the receipt-first reference implementation and updates relevant docs.
- [ ] No credentials, signing secrets, personal/customer data, or live receipt payloads are committed.
- [ ] Existing fail-closed, role, confirmation, signature, and sandbox controls are preserved.
- [ ] Relevant tests were run with disposable data; a running console's store was not reset.
- [ ] Full harness outcome is recorded, including any blocked stage; focused checks are not presented as full verification.
- [ ] If policy behavior changed, schema validation and relevant allow/deny tests are included (otherwise not applicable).
- [ ] Demo/simulation results, chain validity, signature validity, issuer trust, and execution claims remain distinct.
