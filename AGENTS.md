# AGENTS.md

Harness profile: **solo** (v4 scaffold — fill commands from CI).

## Commands

| Command | Purpose |
|---------|---------|
| `./scripts/verify.sh` | Definition of Done |

## Definition of Done

```bash
npx npm@10.9.2 ci
./scripts/verify.sh
```

CI also runs `npm run lint` and `npm run test` via `.github/workflows/ci.yml`.
