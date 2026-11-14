# FidusGate agent entry point

Read [AGENTS.md](AGENTS.md) for the repository contract, commands, source map, and fail-closed requirements. [Getting started](docs/getting-started.md) covers the local gateway-connected console; [llms.txt](llms.txt) is a short documentation index.

FidusGate helps operators inspect MCP tool-call decisions, understand their reasons, and verify signed receipts. The [public demo](https://safetymp.github.io/FidusGate/) uses synthetic data and browser verification. The connected console reads its configured gateway. Neither a valid signature nor an intact receipt chain proves that a tool executed or that its issuer is trustworthy.

## Working in this repository

- Preserve user edits and the existing TypeScript, React/Vite, Rust/Cedar, and npm workspace structure.
- Follow the path-specific [Copilot instructions](.github/instructions/) as well as the repository contract.
- Keep credentials, generated signing keys, and local database records out of commits and logs.
- Run reset-capable gateway/database tests and the full verification harness in a disposable checkout. Do not point that checkout's database package at a running console's store.
- Do not apply policy changes, reset data, reconcile drift, or run sandbox commands merely to read documentation or check the UI. These are operator actions with separate effects.
- Preserve authentication, role restrictions, principal signatures, kill switches, Cedar denial behavior, production guards, and KMS requirements. Do not enable fallback flags to make a check pass.

## Gateway scope

FidusGate evaluates tool calls that a client sends to its MCP server. It does not intercept another application's native shell or file tools. A healthy gateway endpoint is a reachability signal, not proof of enforcement or production readiness.

For an explicitly gateway-connected workflow, consult the [MCP transport guide](docs/mcp-2026-07-28-migration.md), [Cedar and receipt skill](.github/skills/cedar-mcp-receipts/SKILL.md), and current policy/schema. Privileged MCP principals require signatures as enforced by the server; setting a role name or an HTTP header alone is not equivalent to satisfying those checks. PLM and governance prerequisites apply where the gateway enforces them, not as an invented precondition on every native repository edit.

The internal [factory overlay](docs/factory-overlay.md) describes a separate site-delivery contract. Historical plans and retained evidence do not authorize new deployments, provider connections, or changes to security controls.
