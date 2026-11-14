# Product vision: understandable decisions, verifiable receipts

FidusGate helps a person answer three questions about an AI agent’s tool call: **What was requested? Why was it allowed or denied? Can I verify the decision receipt?**

The project is a reference MCP policy gateway and operator console. The gateway provides the authorization and receipt path; the console makes that path understandable. The redesign makes Decisions, Policy playground, and Receipt verifier the primary workflow while retaining connected Transactions, Governance, Forensics, and Sandbox operations.

## Who it serves

- Developers integrating MCP tools who need to inspect policy outcomes and diagnose denied requests.
- Operators reviewing gateway records who need reasons, arguments, issuer information, and the original receipt together.
- Reviewers exploring integrity and trust boundaries who need clear distinctions between a sample, a policy result, a signature check, and execution evidence.

## Product principles

**Lead with the decision.** Show the tool, resource, outcome, and reason before implementation details. Preserve the original receipt for inspection, download, and verification.

**Keep evidence claims separate.** Gateway reachability, an allow result, chain continuity, signature validity, issuer trust, and completed execution are different facts. Do not collapse them into one green badge.

**Make exploration accessible.** The static demo needs no account, backend, or local installation. It uses synthetic records and deterministic scenarios. It must never imply that a demo action executed a tool or evaluated Cedar.

**Preserve operational controls.** The connected console retains existing workflows, role restrictions, explicit confirmations, and gateway enforcement. A friendlier interface is not permission to weaken fail-closed behavior.

**Deepen the operator loop.** Prioritize useful explanations, receipt handling, trustworthy verification, and clear setup over adding unrelated platform features.

## Two delivery modes

| Mode | Promise |
| --- | --- |
| [Public demo](https://safetymp.github.io/FidusGate/) | Explore the workflow with synthetic examples and browser-only Ed25519 verification. No live enforcement or tool execution. |
| [Connected console](getting-started.md) | Inspect records from a local gateway and use its protected workflows through a development session. |

Both modes share the same visual language. They do not share a claim of production readiness.

## Scope and non-goals

FidusGate is not a generic autonomous-agent governance platform, a universal tool interceptor, a production identity provider, or a compliance certification. The current production authentication guard deliberately refuses startup because the OIDC BFF/JWKS verifier is not implemented. Local key storage, seeded data, and simulated telemetry remain explicitly developmental.

Cedar and Ed25519 are established technologies. The project’s focus is how people understand and verify the resulting records, not a claim of novel authorization or cryptography. Adapted skill material retains its source attribution.

## Success criteria

A first-time visitor can open the demo, find a denied decision, explain the reason, and verify its receipt. A local operator can reach the same workflow without mistaking sample data for executed work. A contributor or coding agent can find the relevant code, reproduce the appropriate checks, and preserve security boundaries.

These are design and acceptance goals, not measured adoption or usability outcomes. See the [roadmap](ROADMAP.md), [redesign rationale](REDESIGN.md), and [connected-console behavior](CONNECTED-CONSOLE-REDESIGN.md).

## History

The September 2026 positioning pivot established receipts and the console as the focus. The November 2026 redesign applies that direction to both the static demo and gateway-connected experience. Older phase plans and walkthroughs are historical records, not current setup instructions or delivery commitments.
