# AGENTS.md

Harness profile: **solo** (v4 scaffold — fill commands from CI).

## Commands

| Command | Purpose |
|---------|---------|
| `./scripts/verify.sh` | Hermetic Definition of Done (stop hook) |
| `./scripts/integration-smoke.sh` | Integration E2E (CI + main root; not worktrees) |

## Definition of Done

```bash
npx npm@10.9.2 ci
./scripts/verify.sh
```

When touching HAM memory drift or integration paths, also run from **main repo root**:

```bash
./scripts/integration-smoke.sh
```

CI runs hermetic verify plus `./scripts/integration-smoke.sh` via `.github/workflows/ci.yml`.
