# Site contract

## Gates

| Command | Purpose |
|---|---|
| `./scripts/verify.sh` | Functional and static acceptance |
| `./scripts/adversarial.sh` | Authorized local adversarial probes |

The corporate handoff fixes scope. The site manager assigns ADRs; site specialists write;
the root orchestrator dispatches nondelegating workers and runs gate commands; operations
excellence reviews immutable root-produced evidence. Work in isolated roots, never edit
corporate approval state, and never self-approve. A site role cannot return work to
corporate design; that boundary requires an explicit user rework authorization.

Site id: `fidusgate`. Prior Cursor Harness v4 (compose profile) is under `_archives/harness-v4/`.

## Definition of Done

Hermetic (PR verify job):

```bash
npx npm@10.9.2 ci
./scripts/verify.sh
```

Integration (main repo root or CI `integration` job — never from `.worktrees/`):

```bash
./scripts/integration-smoke.sh
./scripts/adversarial.sh
```

Do **not** put Docker or integration smoke inside `verify.sh`. Child green in a worktree does not imply main-stack green — see [`docs/harness/false-green-checklist.md`](docs/harness/false-green-checklist.md).

CI (`.github/workflows/ci.yml`) mirrors this two-tier split:

| Job | Runs |
|-----|------|
| `verify` | `./scripts/verify.sh` (stub canary → `npm ci` → lint → test → threat-model) |
| `integration` | `./scripts/integration-smoke.sh` then `./scripts/adversarial.sh` |

## Layout

| Path | Purpose |
|------|---------|
| `.corp-harness/site.json` | Corp-site binding (unbound until a program) |
| `specs/threat-model.yaml` | Adversarial deny cases |
| `docs/adr/0000-threat-model.md` | Threat-model ADR |
| `_archives/harness-v4/` | Archived Cursor Harness v4 compose surface |

## Commands

| Command | Purpose |
|---------|---------|
| `./scripts/verify.sh` | Hermetic Definition of Done |
| `./scripts/integration-smoke.sh` | Integration E2E (CI + main root; not worktrees) |
| `./scripts/adversarial.sh` | Tier-3 adversarial oracle (worktree denial) |
| `./scripts/check-stub-canary.sh` | Stub/placeholder detector (via verify) |
