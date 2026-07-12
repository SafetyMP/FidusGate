# AGENTS.md

FidusGate harness. Profile: **solo**.

## Purpose

Policy-gated AI gateway monorepo (Turbo/npm workspaces, Rust cedar-daemon, WASM crypto). Reference architecture — not production-hardened without your own auth and deployment review.

## Prerequisites

- Node.js ≥20 (`package.json` engines)
- `npm run bootstrap` on first clone (builds WASM + installs deps; may install mise)

## Commands

| Command | Purpose |
|---------|---------|
| `./scripts/verify.sh` | Definition of Done (build + test) |
| `npm run bootstrap` | First-time setup (WASM + deps) |
| `npm run dev` | Start dev stack (ports 3000 admin, 3001 gateway) |
| `npm run build` | Turbo build all workspaces |
| `npm run test` | Turbo test all workspaces |
| `npm run ci` | Local workflow emulation via `act` (requires Docker + act CLI) |

## Layout

- `apps/secure-gateway` — API gateway
- `apps/admin-dashboard` — admin UI
- `packages/cedar-daemon` — Rust HTTP policy daemon (:50051)
- `packages/crypto-utils` — WASM receipt/crypto helpers

## Definition of Done

```bash
./scripts/verify.sh
```

For release parity with GitHub Actions, also run `npm run ci` when Docker and `act` are available.

## Review focus

Block on P0/P1: broken auth flows, secret exposure, policy bypass, incorrect Cedar evaluation paths.
