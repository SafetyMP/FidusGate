# FidusGate roadmap

The direction is a clear operator loop: inspect a tool-call decision, understand its reason, and verify its receipt. This roadmap describes priorities, not release dates or a claim of production readiness. Proposed work should identify its user problem and acceptance evidence before implementation.

## Available now

- Public browser demo with synthetic decisions, non-executing scenarios, and real Ed25519 verification.
- Redesigned gateway-connected Decisions, Policy playground, and Receipt verifier workspaces.
- Retained Transactions, Governance, Forensics, and Sandbox workflows with existing role and confirmation controls.
- Signed and chained development receipts, explicit legacy-seed repair with backups, and separate chain/signature results.
- Main-branch Pages deployment and repository CI, integration, CodeQL, and container workflows.

## Next priorities

| Priority | Intended result | Evidence needed |
| --- | --- | --- |
| First-run experience | A new contributor can start the console and understand each prerequisite | Fresh-checkout setup exercise; explicit failures for unavailable services |
| Decision explanations | Operators can identify the relevant request, reason, and evidence quickly | Task-based usability checks with representative allowed and denied cases |
| Receipt portability | Reviewers can carry original receipts between inspection and verification without losing context | Known-good, tampered, malformed, unknown-issuer, and stale-result cases |
| Documentation maintenance | Human and agent entry points stay aligned with actual runtime behavior | Link checks, build checks, and source-backed review for changed claims |
| Evidence clarity | Sample, simulated, connected, verified, and executed states remain distinguishable | UI and API tests that reject misleading success states |

## Separate future decisions

Production identity, deployment qualification, external KMS/PostgreSQL validation, and broader integrations require their own designs, operational evidence, and reviews. They are not delivered by the console redesign. Production authentication remains blocked until the required implementation exists; adding environment variables is not a substitute.

MCP registry publication, new integrations, and additional agent tooling should follow demonstrated use cases. Repository topics describe implemented subject matter, not registry listing or endorsement.

## What to preserve

Do not weaken authorization, principal-signature checks, circuit breakers, KMS behavior, or production guards to improve onboarding. Do not make the public demo execute tools or silently connect it to a gateway. Do not rewrite historical receipts to make verification appear successful.

See [product principles](DESIGN-PIVOT.md), [contribution guidance](../CONTRIBUTING.md), and [GitHub Issues](https://github.com/SafetyMP/FidusGate/issues) for proposed work. Historical phase plans remain available for context; they are not current commitments.
