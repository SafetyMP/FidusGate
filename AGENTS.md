# AGENTS.md

Harness profile: **compose** (Cursor harness v4 — monorepo + docker-compose).

## Commands

| Command | Purpose |
|---------|---------|
| `./scripts/verify.sh` | Hermetic Definition of Done (stop hook) |
| `./scripts/integration-smoke.sh` | Integration E2E (CI + main root; not worktrees) |
| `./scripts/adversarial.sh` | Tier-3 adversarial oracle (worktree denial) |
| `./scripts/check-stub-canary.sh` | Stub/placeholder detector (via verify) |

## Definition of Done

Hermetic (stop hook / PR verify job):

```bash
npx npm@10.9.2 ci
./scripts/verify.sh
```

Integration (main repo root or CI `integration` job — never from `.worktrees/`):

```bash
./scripts/integration-smoke.sh
./scripts/adversarial.sh
```

Do **not** put Docker or integration smoke inside `verify.sh`. Child green in a worktree does not imply main-stack green — see `docs/harness/false-green-checklist.md`.

CI (`.github/workflows/ci.yml`) mirrors this two-tier split:

| Job | Runs |
|-----|------|
| `verify` | `./scripts/verify.sh` (stub canary → `npm ci` → lint → test → threat-model) |
| `integration` | `./scripts/integration-smoke.sh` then `./scripts/adversarial.sh` |

## Layout

| Path | Purpose |
|------|---------|
| `.harness/profile.yaml` | Repo harness contract |
| `.cursor/hooks/` | Vendored guards + verify-on-stop + session-start |
| `specs/threat-model.yaml` | Adversarial deny cases |
| `docs/adr/0000-threat-model.md` | Threat-model ADR |

## Verify-on-stop

When `.cursor/hooks.json` is loaded, `stop` runs `./scripts/verify.sh` after code edits (max 3 loops). Emergency override only: `CURSOR_VERIFY_SKIP=1`.
