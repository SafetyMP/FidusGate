---
name: code-review
description: "Review FidusGate PRs for fail-closed Cedar authorize and Ed25519 receipt integrity. Use on pull requests that touch policy.cedar, the secure gateway, crypto-utils, or the admin console. Flag silent enforce-to-shadow fallbacks."
---

# Copilot code review — FidusGate

Use this skill when reviewing a pull request in this repository.

FidusGate issues **signed Ed25519 receipts for MCP tool calls**.

- Reject fail-open authorize, kill-switch, PDP, or production-profile paths.
- Reject silent fallback from enforce to shadow.
- Do not treat Cedar work as a prompt-injection classifier.
- Verify with `./scripts/harness/verify.sh` and `bash scripts/cedar-validate.sh` when policies change.


## Always flag

- Secrets, `.env` values, private keys, or real personal data in the diff
- Weakened or skipped verify / lint / typecheck / adversarial gates
- Invented success (prose claiming a gate passed with no command output)
- Fail-open authorization, skipped human approval, or agents recording `--actor user`

## Never request

- Drive-by major upgrades, formatter churn, or unrelated refactors
- Softening honesty disclaimers or certification claims
