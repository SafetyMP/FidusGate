# Getting started

Choose the [public browser demo](https://safetymp.github.io/FidusGate/) to explore synthetic decisions without installing anything. Use the steps below to run the gateway-connected console with local development data.

## Requirements

- Node.js 22 and npm 10.9.2, matching CI.
- Git and a fresh local checkout.
- Rust/Cargo only if running the Cedar daemon natively.
- Docker for the sandbox and full repository verification harness. It is not needed to browse the console or verify seeded receipts.

Run all commands from the repository root unless stated otherwise. Use a dedicated development checkout: gateway tests and administrator reset operations can change its local datastore. Keep the development stack on a trusted local machine; the gateway HTTP listener is not restricted to loopback by its current startup code. Do not expose it as a public service.

## Install and build

```sh
git clone https://github.com/SafetyMP/FidusGate.git
cd FidusGate
npx --yes npm@10.9.2 ci
npm run build --workspace=@fidusgate/core-types
npm run build --workspace=@fidusgate/crypto-utils
npm run build --workspace=@fidusgate/database
npm run build --workspace=@fidusgate/secure-gateway
```

These targeted builds prepare the connected console’s backend dependencies without invoking the Docker-based Cedar build. `npm run build` builds all workspaces and requires Docker. `npm run bootstrap` additionally generates illustrative WASM files, installs local Git hooks, runs `npm ci`, and audits drift; it is optional for this console walkthrough. The generated WASM files are not a Cedar engine.

## Start the gateway

In the first terminal, generate a development bootstrap key and launch from the repository root:

```sh
export NODE_ENV=development
export FIDUSGATE_RUNTIME=demo
export FIDUSGATE_BOOTSTRAP_KEY="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")"
printf 'Development bootstrap key: %s\n' "$FIDUSGATE_BOOTSTRAP_KEY"
node apps/secure-gateway/dist/index.js
```

Copy the displayed key for local sign-in, and keep it private; do not include it in screenshots or bug reports. This key can mint any of the development roles; it is not an end-user production credential. The gateway creates a per-checkout JWT secret when `JWT_SECRET` is unset and uses locally stored development signing keys. Never commit the generated key or data files.

The default gateway API is on port **3001**, with metrics on loopback port **3002**. The local JSON datastore is under `packages/database/data/`. Start with no `DATABASE_URL` configured for this walkthrough; a configured PostgreSQL URL selects a different persistence path and is not silently ignored.

## Start the console

In a second terminal at the repository root:

```sh
npm run dev --workspace=@fidusgate/admin-dashboard -- --host 127.0.0.1
```

Open [http://localhost:3000](http://localhost:3000). In **Development gateway session**, enter a local email identifier, choose a role, and enter the bootstrap key from the gateway terminal. The key and issued bearer token remain in browser memory. Production OIDC login is not implemented.

On a fresh JSON store, **Decisions** displays three signed development examples. Their reasons say no tool was executed. Check **Gateway chain check**, open a decision, then select **Verify this receipt** to check its signature separately. Existing stores are preserved, including intentionally empty stores; they are not automatically reseeded.

`npm run dev` is the repository’s aggregate Turbo development command, but it does not build all shared dependencies or start Cedar. The explicit commands above also keep the gateway working directory and environment clear. After changing gateway TypeScript, rebuild that workspace and restart its process.

## Run Cedar for gateway policy decisions

The console can display records and verify receipts without Cedar. Supported MCP tool authorization calls use the separately running Rust daemon. An unreachable daemon denies by default; do not enable a fallback simply to make a check appear green.

With Rust/Cargo installed, start it in a third terminal at the repository root:

```sh
cargo run --release --manifest-path packages/cedar-daemon/Cargo.toml
```

The daemon listens on `127.0.0.1:50051` by default and reads `policy.cedar` and `policy.cedarschema`. The gateway defaults to `http://localhost:50051/authorize`; set `CEDAR_DAEMON_URL=http://127.0.0.1:50051/authorize` before launching the gateway if your localhost resolution requires an explicit IPv4 address. If using `CEDAR_DAEMON_TOKEN`, configure the same token in both processes.

The connected policy simulator includes a TypeScript permit/forbid subset. It is not a replacement for the Rust Cedar engine on the enforcement path. Sandbox execution has additional Docker/runtime requirements; a reachable gateway or daemon does not establish sandbox readiness.

## Common setup problems

| Symptom | Check |
| --- | --- |
| Token minting returns 503 | Set `FIDUSGATE_BOOTSTRAP_KEY` in the gateway process environment and restart it. |
| Sign-in returns 403 | Enter the same bootstrap key used by that gateway. |
| Gateway unavailable | Confirm port 3001 is free and the gateway is running; inspect its terminal output. |
| Authorization denies while the console loads | Start the Cedar daemon and inspect the decision reason. Unavailability must remain a denial. |
| Chain check fails on an old checkout | Read [development receipt seed repair](development-receipt-seeds.md). Repair only recognizes the exact historical placeholder set and preserves a backup; do not reset unknown evidence. |
| Build fails at Cedar Docker task | Use the targeted builds above for console exploration, or install/start Docker for the full harness. |
| Production startup refuses | Expected: production OIDC/BFF/JWKS authentication is not implemented. Do not bypass the guard. |

The Vite proxy can target nondefault local ports with `FIDUSGATE_API_TARGET` and `FIDUSGATE_METRICS_TARGET`. See [connected-console controls](CONNECTED-CONSOLE-REDESIGN.md) for session behavior and polling.

## Next steps

- [Architecture](ARCHITECTURE.md): source map, receipt semantics, and enforcement boundaries.
- [Static demo build](github-pages-demo.md): build and preview the browser-only experience.
- [Contributing](../CONTRIBUTING.md): appropriate checks and pull request expectations.
- [Security policy](../SECURITY.md): private vulnerability reports.
