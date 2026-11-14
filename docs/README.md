# FidusGate documentation

FidusGate is a reference MCP policy gateway and console for understanding tool-call decisions and verifying signed receipts. Start with the [interactive demo](https://safetymp.github.io/FidusGate/) or [local setup](getting-started.md).

## Start here

| Guide | What it answers |
| --- | --- |
| [Getting started](getting-started.md) | How do I install, launch, sign in, and verify a local receipt? |
| [Product vision](DESIGN-PIVOT.md) | Who is this for, and what does the redesigned experience prioritize? |
| [Architecture](ARCHITECTURE.md) | Where are the runtime paths, source files, and trust boundaries? |
| [Roadmap](ROADMAP.md) | What is available, what comes next, and what remains a separate decision? |
| [Connected console](CONNECTED-CONSOLE-REDESIGN.md) | What can each workspace do, and which controls are preserved? |
| [Public demo and Pages](github-pages-demo.md) | How does the browser-only demo work and deploy? |
| [Redesign rationale](REDESIGN.md) | Which interaction and visual decisions shaped the new experience? |
| [Development receipt seeds](development-receipt-seeds.md) | Why are local examples signed, and how is the exact old seed repaired safely? |

## Contribute and operate

- [Contributing](../CONTRIBUTING.md): setup, scoped checks, and pull requests.
- [AGENTS.md](../AGENTS.md): agent commands, source navigation, and fail-closed invariants.
- [llms.txt](../llms.txt): compact linked index for machine-assisted discovery.
- [Security policy](../SECURITY.md): private vulnerability reporting.
- [Support](../SUPPORT.md) and [code of conduct](../CODE_OF_CONDUCT.md).
- [GitHub presentation](community/github-presentation.md): repository metadata, preview assets, and discovery maintenance.
- [Branch protection](community/github-branch-protection.md): maintainer guidance for required checks.
- [Visual assets](assets/README.md): current and historical screenshots.
- [Local CI emulation](local-ci-emulation.md): Docker/`act` tooling and its requirements.
- [False-green checklist](harness/false-green-checklist.md): distinguish executed checks from unsupported success claims.

## Security and design records

These records explain boundaries and decisions. Read them alongside current code; a planned integration is not evidence that production behavior is implemented.

| Record | Subject |
| --- | --- |
| [Threat model](adr/0000-threat-model.md) | Objectives and exclusions |
| [OWASP MCP mapping](adr/0001-owasp-mcp-top-10.md) | Reference control mapping |
| [Production authentication](adr/0002-production-auth-mcp.md) | Missing OIDC/BFF/JWKS implementation and fail-closed startup |
| [KMS and PostgreSQL](adr/0003-production-kms-postgres.md) | Provider and persistence boundaries |
| [Sandbox and supply chain](adr/0004-production-sandbox-supply-chain.md) | Runtime requirements and isolation boundaries |
| [Console information architecture](adr/0005-admin-console-ia.md) | Earlier console structure; see the connected redesign for current workspaces |
| [Data and AI honesty](adr/0006-data-ai-honesty.md) | Distinguishing real operations and simulated surfaces |
| [MCP transport migration](mcp-2026-07-28-migration.md) | Implemented protocol-version handling and transport notes |

## Repository skills and historical material

The focused [cedar-mcp-receipts skill](../.github/skills/cedar-mcp-receipts/SKILL.md) describes Cedar tool gates and receipt verification. Its adapted source is attributed in the skill. The [code-review skill](../.github/skills/code-review/SKILL.md) and [path-specific instructions](../.github/instructions/) support repository work. Additional [skills](../skills/) are reference playbooks, not evidence of enabled integrations or authority to execute actions.

Earlier [Phase 3 walkthrough](walkthrough.md), [Phase 4/5 walkthrough](walkthrough_v2.md), implementation plans ([original](implementation_plan.md), [v2](implementation_plan_v2.md), [v3](implementation_plan_v3.md)), and task lists ([original](task.md), [v2](task_v2.md)) are retained as historical project records. They may describe superseded interfaces, aspirations, or simulations. Use the current guides above for setup and capability claims. The [factory overlay](factory-overlay.md) is historical/internal workflow context, not a prerequisite for community contributions.
