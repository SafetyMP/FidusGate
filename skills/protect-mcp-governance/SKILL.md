---
name: protect-mcp-governance
description: "Agent governance skill for MCP tool calls — Cedar policy authoring, shadow-to-enforce rollout, and Ed25519 receipt verification."
risk: safe
source: community
source_repo: scopeblind/scopeblind-gateway
source_type: official
date_added: "2026-04-05"
---

# MCP Agent Governance with protect-mcp

## Overview

Guidance for governing AI agent tool calls using Cedar policies and Ed25519 signed receipts. This skill teaches how to write access-control policies for MCP servers, run them in shadow mode for observation, and verify the cryptographic audit trail.

## When to Use This Skill

- Use when you need to control which MCP tools an agent can call and under what conditions
- Use when you want a tamper-evident audit trail for agent tool executions
- Use when rolling out governance policies gradually (shadow mode first, then enforce)
- Use when authoring Cedar policies for MCP tool access control
- Use when verifying that a receipt or audit bundle has not been tampered with

## Do Not Use This Skill

- When you need general application security auditing (use `@security-auditor`)
- When you need to scan code for vulnerabilities (use `@security-audit`)
- When you need compliance framework guidance without agent-specific governance

## How It Works

protect-mcp intercepts MCP tool calls, evaluates them against Cedar policies (the same policy engine used by AWS Verified Permissions), and signs every decision as an Ed25519 receipt. The receipt is a cryptographic proof that a specific policy was evaluated against a specific tool call at a specific time.

### July 2026 protocol notes (MCP `2026-07-28`)

FidusGate’s gateway is **dual-era**:

- **stdio** — legacy `initialize` handshake retained for Cursor/local clients (`2025-11-25` preferred; `2024-11-05` accepted).
- **HTTP** `POST /mcp` — stateless Streamable HTTP: require `MCP-Protocol-Version`, `Mcp-Method`, and (for named methods) `Mcp-Name`. Header/body disagreement is rejected **before** Cedar runs.
- Modern clients should call `server/discover` instead of relying on session init.
- Demo OAuth surface: `GET /.well-known/oauth-protected-resource` (RFC 9728); map residual risks via [OWASP MCP Top 10 ADR](../../docs/adr/0001-owasp-mcp-top-10.md).
- Operator guide: [mcp-2026-07-28-migration.md](../../docs/mcp-2026-07-28-migration.md).

```
Agent → protect-mcp → Cedar policy evaluation → MCP Server
                ↓
        Ed25519 signed receipt
```

Three modes of operation:

1. **Shadow mode** (default) — logs decisions without blocking. Use this to observe what your policies would do before enforcing them.
2. **Enforce mode** — blocks tool calls that violate policy. Use after shadow-mode validation.
3. **Hooks mode** — integrates with Claude Code hooks for pre/post tool-call governance.

## Core Concepts

### Cedar Policies

Cedar is a policy language designed for authorization. Policies are evaluated locally via WASM — no network calls required.

```cedar
// Allow read-only file operations
permit(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name in ["read_file", "list_directory", "search_files"]
};

// Deny destructive operations
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name in ["execute_command", "delete_file", "write_file"]
  && resource has args
  && resource.args.contains("rm -rf")
};
```

### Risk-Tiered Development Governance

To mitigate the four main latent development risks (Runaway Concurrency, Self-Authoring Rot, Yak-Shaving loops, and Micro-Auditing lockups), we map agentic tools to four explicit risk tiers:

| Tier | Name | Development Tools Affected | Cedar Governance Mode |
|---|---|---|---|
| **Tier 1** | Low Risk | `read_file`, `list_directory`, `grep_search` | **Auto-Approve** (No restrictions) |
| **Tier 2** | Medium Risk | `write_file`, `replace_file_content` outside `src/` | **Shadow-to-Enforce** (Alerts on directory drift) |
| **Tier 3** | High Risk | `execute_command` (Parallel Worker spawns, `skill-creator`) | **Interactive Authorization** (Requires `--yes` flags) |
| **Tier 4** | Critical Risk | Unsandboxed network downloads, global policy deletes | **Strict Interdiction** (Pre-authorized receipt required) |

#### Concrete Cedar Policies for Development De-Risking

```cedar
// 1. TIER 3: Prevent runaway token burn from parallel workers unless explicitly approved
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name == "execute_command"
  && resource.args.contains("orchestrate-batch-refactor")
  && !resource.args.contains("--yes")
};

// 2. TIER 3: Block dynamic, unverified skill creation to prevent Prompt Pollution
forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name == "execute_command"
  && resource.args.contains("skill-creator")
  && !resource.args.contains("--manual-auth")
};

// 3. TIER 2: Enforce a timeout block on loop-prone environment/Docker setups
permit(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name in ["execute_command", "write_file"]
  && resource.args.contains("devcontainer-setup")
} when {
  // Shadow-observe execution state to abort loops after 3 failures
  context.session.failure_count < 3
};
```

### Signed Receipts

Every policy decision produces a signed receipt:

```json
{
  "payload": {
    "type": "protectmcp:decision",
    "tool_name": "read_file",
    "decision": "allow",
    "policy_digest": "sha256:9d0fd4c9e72c1d5d",
    "issued_at": "2026-04-05T14:32:04.102Z",
    "issuer_id": "sb:issuer:de073ae64e43"
  },
  "signature": {
    "alg": "EdDSA",
    "kid": "sb:issuer:de073ae64e43",
    "sig": "2a3b5022..."
  }
}
```

The receipt format follows [IETF Internet-Draft draft-farley-acta-signed-receipts](https://datatracker.ietf.org/doc/draft-farley-acta-signed-receipts/).

## Step-by-Step Guide

### 1. Initialize Governance for a Project

```bash
# Install and initialize hooks (Claude Code integration)
npx protect-mcp init-hooks

# Or run as a standalone MCP gateway
npx protect-mcp serve
```

This creates a `protect-mcp.config.json` and a starter Cedar policy in your project root.

### 2. Write Your First Policy

Create `policy.cedar` in your project:

```cedar
// Start permissive — allow everything in shadow mode
permit(
  principal,
  action == Action::"call_tool",
  resource
);
```

### 3. Run in Shadow Mode (Observe First)

```bash
# Shadow mode is the default — logs decisions without blocking
npx protect-mcp --policy policy.cedar -- node your-mcp-server.js
```

Review the shadow log to understand what your agent is doing before writing restrictive policies.

### 4. Tighten and Enforce

Once you understand the tool-call patterns, write specific policies:

```cedar
// Allow file reads, deny writes outside src/
permit(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name == "read_file"
};

permit(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name == "write_file"
  && resource has args
  && resource.args.path like "src/*"
};

// Deny everything else
forbid(
  principal,
  action == Action::"call_tool",
  resource
);
```

Switch to enforce mode:

```bash
npx protect-mcp --policy policy.cedar --enforce -- node your-mcp-server.js
```

### 5. Verify Receipts

```bash
# Verify a single receipt
npx @veritasacta/verify receipt.json --key <public-key-hex>

# Verify an audit bundle (multiple receipts + keys)
npx @veritasacta/verify bundle.json --bundle

# Self-test the verifier (proves it works offline)
npx @veritasacta/verify --self-test
```

Exit codes: `0` = signature valid (proven authentic), `1` = signature invalid (proven tampered), `2` = verifier error (malformed input).

## Examples

### Example 1: Governance for a Claude Code Session

```bash
# Initialize hooks
npx protect-mcp init-hooks

# Claude Code now generates a signed receipt for every tool call.
# Receipts are stored in .protect-mcp/receipts/
```

**Explanation:** After initialization, every tool call Claude Code makes is logged with a signed receipt. No tool calls are blocked (shadow mode).

### Example 2: Restrict a Production MCP Server

```cedar
// Only allow approved tools with rate limiting
permit(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name in [
    "get_customer",
    "search_orders",
    "list_products"
  ]
};

forbid(
  principal,
  action == Action::"call_tool",
  resource
) when {
  resource.tool_name in [
    "delete_customer",
    "modify_payment",
    "execute_sql"
  ]
};
```

**Explanation:** A production MCP server that serves customer data. Read-only operations are permitted; destructive operations are blocked.

### Example 3: Verify an Audit Bundle After an Incident

```bash
# Export the session's audit bundle
npx protect-mcp export-bundle --session sess_abc123 --out audit.json

# Verify every receipt in the bundle
npx @veritasacta/verify audit.json --bundle

# Expected output:
# ✓ Bundle: VALID
#   Total:    47
#   Passed:   47
#   Failed:   0
```

**Explanation:** After an incident, export the audit bundle and verify that no receipts have been tampered with. The bundle contains all receipts from the session plus the signing keys needed for verification.

## Best Practices

- ✅ **Do:** Start in shadow mode and observe before enforcing
- ✅ **Do:** Use `policy_digest` to track which policy version produced each decision
- ✅ **Do:** Store receipts alongside your application logs for correlation
- ✅ **Do:** Pin the verifier version when integrating into CI (`@veritasacta/verify@0.2.5`)
- ❌ **Don't:** Skip shadow mode and go straight to enforce in production
- ❌ **Don't:** Trust `claimed_issuer_tier` without independent verification
- ❌ **Don't:** Treat a valid signature as proof the signer is trustworthy — it only proves the receipt has not been tampered with since signing

## Troubleshooting

### Problem: Receipts fail verification with `no_public_key`
**Symptoms:** `npx @veritasacta/verify receipt.json` returns exit 2 with `no_public_key`
**Solution:** Provide the public key explicitly: `--key <64 hex chars>`. The receipt does not embed the public key by default. Check `protect-mcp.config.json` for the issuer's public key.

### Problem: Shadow mode shows unexpected denials
**Symptoms:** Shadow log shows `deny` decisions for tools you expected to be allowed
**Solution:** Check your Cedar policy ordering. Cedar evaluates `forbid` rules before `permit` rules — a broad `forbid` will override specific `permit` rules.

### Problem: Enforce mode blocks a legitimate tool call
**Symptoms:** Agent reports a tool call was denied after switching to enforce mode
**Solution:** Add the tool to your permit policy or switch back to shadow mode: remove `--enforce` flag. Review the receipt's `deny_reason` field for the specific policy violation.

## Related Skills

- `@security-auditor` — General security auditing and compliance
- `@security-audit` — Code vulnerability scanning
- `@mcp-development` — MCP server development patterns

## Additional Resources

- [protect-mcp on npm](https://www.npmjs.com/package/protect-mcp) — MIT licensed
- [Cedar Policy Language](https://www.cedarpolicy.com/) — AWS open-source policy engine
- [IETF Draft: Signed Receipts](https://datatracker.ietf.org/doc/draft-farley-acta-signed-receipts/) — Receipt format specification
- [@veritasacta/verify](https://www.npmjs.com/package/@veritasacta/verify) — Apache-2.0 verifier, works offline

## Limitations
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
