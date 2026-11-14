# Development receipt seeds

The gateway creates three signed development-example receipts when this process creates a new JSON receipt store. It signs them only after resolving the active gateway keypair, then links hashes oldest-to-newest and stores them newest-first. Every seed must pass the existing signature and chain verifiers before persistence. Their reasons explicitly state that no tool was executed; the scenario-set digest is not a claim that Cedar evaluated these examples.

A confirmed administrator reset supplies a fresh set signed by the same active gateway key. Production and configured PostgreSQL paths do not generate development seeds. Existing stores, including an intentionally empty ledger, are never automatically populated or repaired. Missing, malformed, or non-array receipt files surface as read errors instead of silently becoming sample evidence.

## Repairing the old placeholder records

The older seed consisted of three records with placeholder signatures and no chain links. It cannot become trustworthy by adding hashes. The explicit repair replaces only that exact placeholder set with newly issued development examples and first saves the original bytes to a private `receipts.json.legacy-seed-<id>.bak` file beside the receipt store.

Stop the local gateway, retain its existing signing keys, and run from the same repository-root working directory and development environment used to launch it:

```sh
npm run build --workspace=@fidusgate/core-types
npm run build --workspace=@fidusgate/crypto-utils
npm run build --workspace=@fidusgate/database
npm run build --workspace=@fidusgate/secure-gateway
npm run seed:receipts:repair
```

Restart the gateway afterward. If it uses `MASTER_PRIVATE_KEY_HEX` / `MASTER_PUBLIC_KEY_HEX`, supply the same pair to the repair process; otherwise the command reads the existing `packages/database/data/test-keys.json`. It does not generate or rotate keys. Never commit local key material or receipt data.

Repair refuses production, configured PostgreSQL, malformed input, modified legacy fields, extra records, or mixed real/seed logs. The only tolerated variation in the old placeholders is a valid issuance timestamp, because older startup code generated those timestamps dynamically. Refusal leaves the receipt file untouched; repair does not attempt to salvage, re-sign, or hide unknown historical evidence. Stop and investigate any non-seed chain failure separately.

## Verification

- Confirm `/api/receipts/verify-chain` reports `valid: true` and the expected receipt count.
- Verify each receipt individually using `/api/receipts/verify`.
- Tamper only with an in-memory copy: signature verification must reject it even if its chain hash is recomputed.
- Confirm unauthenticated receipt-log access remains rejected.

The automated tests cover these checks, append/reset behavior, two database instances during gateway startup, existing-store preservation, backup fidelity, signer failure, and production guards. Signature verification, chain verification, key trust maps, authorization, and circuit-breaker controls are not relaxed by this change.
