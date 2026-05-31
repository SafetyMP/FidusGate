## 📝 Description

Please provide a summary of the changes, the objective of the pull request, and any background context:

*   Fixes #[Issue Number]

---

## 🔒 SecOps & Compliance Checklist

FidusGate requires strict alignment with our repository risk boundaries. Please verify each of the following:

- [ ] **No Secrets Committed:** I have audited this diff line-by-line to ensure no API keys, private tokens, system credentials, or passwords are committed.
- [ ] **Cedar Policy Compliance:** Any changes to `policy.cedar` have been formally verified against `policy.cedarschema`.
- [ ] **Containment Safe:** All test scripts and dynamic command executions have been safely wrapped inside ephemeral Docker sandboxes.
- [ ] **Least Privilege Enforced:** AI tool permissions do not grant raw host-level bash access or unauthenticated packages installation commands.

---

## 🧪 Verification & Testing Details

Describe the tests run to verify your changes. Provide commands and sample output where applicable:

### Automated Unit Tests
*   Commands run: `npm run test`
*   Test output: [Paste test suite results or attach screenshots]

### Manual Compliance Playbook Verification
*   How did you verify this change manually? (e.g. "Logged in as developer via the simulator and verified tool write blocks...")
