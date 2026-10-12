# Antigravity Custom Dev Scoped Memory Map (CLAUDE.md)

## Workspace Overview
This repository contains a set of custom developed playbooks, automation scripts, and local CI/CD pipelines engineered to build and run highly secure, governed, and optimized agentic coding skills.

---

## 🤖 Agent Session Bootstrap (MANDATORY — Run Before Any Code Changes)

Before performing any file writes or command executions, agents MUST complete this three-step pre-coding checklist. Skipping these steps will result in Cedar policy blocks on the first write operation.

### Step 1: Check All Gate States
Call the agent-readiness endpoint to see exactly which gates are open and what action to take next:
```bash
curl -s -H "Authorization: Bearer <your_token>" http://localhost:3001/api/status/agent-readiness | jq .
```
Read the `next_action` field. If `ready_to_write` is `false`, complete Step 2 before writing any files.

### Step 2: Register an Active PLM Requirement
Cedar will **block all writes** to `apps/*` or `packages/*` until a requirement ID is registered:
```bash
curl -X POST http://localhost:3001/api/plm/requirement \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{"id": "REQ-XXX", "description": "Brief description of the task being implemented"}'
```

### Step 3: Confirm Your SME Role Principal
Write operations on specialized paths require a matching SME principal. Set the `X-Agent-Principal` header on tool calls:
- Database schema changes → `sb:issuer:backend-sme`
- Dashboard UI changes → `sb:issuer:frontend-sme`
- Test files (`*.test.ts`, `*.spec.ts`) → `sb:issuer:qa-sme`
- Policy files → `sb:issuer:security-sme`
- CI/CD workflows, Dockerfiles → `sb:issuer:devops-sme`
- CHANGELOG.md → `sb:issuer:pm-sme`

> If you receive a Cedar `deny` response, check the `blocked_gates` and `remediation` fields in the response body for the exact action needed to clear the blocking gate.

### Step 4: Verify Session Health
Before initiating any write operations, perform a health check on the gateway to confirm enforcement status:
```bash
curl -s http://localhost:3001/health | jq .
```

---

## 🛡️ Tool Routing Policy (MANDATORY)

The gateway only sees tool calls that a client sends to its MCP server. A native tool in another program is not intercepted. Use the MCP tools below when you intend the call to be evaluated.

| Operation | Not seen by the gateway | Evaluated when a client calls it |
|---|---|---|
| Command Execution | `run_command` | `call_mcp_tool fidusgate-secure-gateway/execute_command` |
| File Write / Create | `write_to_file` | `call_mcp_tool fidusgate-secure-gateway/write_file` |
| File Modification | `replace_file_content` | `call_mcp_tool fidusgate-secure-gateway/patch_file` |
| File Read | `view_file` | `call_mcp_tool fidusgate-secure-gateway/read_file` |
| Directory Listing | `list_dir` | `call_mcp_tool fidusgate-secure-gateway/list_directory` |
| Code Search | `grep_search` | `call_mcp_tool fidusgate-secure-gateway/search_code` |
| IBP Synthesis | (N/A) | `call_mcp_tool fidusgate-secure-gateway/submit_ibp_synthesis` |

---

## 🛠️ Essential Commands

### Environment Bootstrapping
Configure local git hooks, verify toolchains (`mise`, `docker`), and run initial checks:
```bash
bash scripts/bootstrap.sh
```

### Context Drift Auditing (HAM Memory)
Verify that scoped `CLAUDE.md` sheets across directories are fresh and up to date with code changes:
```bash
bash scripts/ham-drift-watcher.sh
```

### Sandboxed Command Execution
Execute tests or scripts inside a secure, unprivileged Docker sandbox container:
```bash
bash scripts/sandbox-execute.sh "<command>" "<absolute_path_to_mount_dir>"
```

### Applying Diff Patches
Review and apply the latest sandboxed diff patch generated inside the `/tmp/` directory:
```bash
bash scripts/apply-patch.sh
```

### Cognitive Memory Retrieval
Retrieve historical developer lessons matching current changes:
```bash
npm run memory:context
```

### Cedar Policy Dry-Run
Simulate and dry-run Cedar policies locally before executing actions:
```bash
npm run policy:dry-run -- --principal <role> --tool <tool> [--path <file_path>] [--cmd <cmd>]
```

### Local CI/CD Pipeline Emulation
Verify GitHub Action workflows locally using `act`:
```bash
bash scripts/ci-verify.sh
```

### Active Filesystem Drift Audits & Reconciliation
Detect modified or untracked changes relative to the git index, and perform rollbacks:
```bash
# Detect drift
bash scripts/sandbox-drift-detect.sh <workspace_path>

# Reconcile/Rollback untracked & modified files
curl -X POST http://localhost:3001/api/sandbox/reconcile -H "Authorization: Bearer <admin_token>"
```

### Cedar Policy Co-Pilot Conversations
Generate policies conversational-style using the Gemini API:
```bash
curl -X POST http://localhost:3001/api/policy/co-pilot \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <developer_token>" \
  -d '{"prompt": "allow pm-sme to write md files"}'
```

---

## 📐 Coding Guidelines & Standards

1. **Bash Scripting Best Practices:**
   - Always include descriptive comments and header metadata (Author, Purpose).
   - Validate input parameters and prerequisites (`command -v`, `-d`, `-f`).
   - Use clean logging prefix indicators (🚀, ⚙️, ✅, ⚠️, ❌, 🛡️, 🧪).
   - Enforce sandbox isolation limits strictly for unprivileged code execution.

2. **Skill Playbook Structure (`SKILL.md`):**
   - Must include proper frontmatter: `name`, `description`, `risk`, `source`, `date_added`.
   - Maintain Tier-based governance guidelines (Tiers 1 to 4) mapping tools to Cedar access controls.
   - Separate playbooks logically, avoiding duplicate or overlapping boundaries.

3. **Cross-Agent Learning & Feedback:**
   - Always retrieve context from the learning ledger before starting a task by running `npm run memory:context` (or specifying a role like `npm run memory:context -- --role=backend-sme`). This helps identify past critiques and solutions relevant to your active workspace changes.
   - If a commit is blocked due to unaligned PLM feedback, run `node scripts/assimilate-feedback.js` (or trigger it automatically by staging changes and committing) to record the lesson and clear the gate.
