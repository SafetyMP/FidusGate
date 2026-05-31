# Antigravity Custom Dev Scoped Memory Map (CLAUDE.md)

## Workspace Overview
This repository contains a set of custom developed playbooks, automation scripts, and local CI/CD pipelines engineered to build and run highly secure, governed, and optimized agentic coding skills.

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
