# ADR 0003: Production KMS Signing and Postgres Audit Persistence

**Status:** Proposed for fidusgate-production site delivery  
**Date:** 2026-07-19  
**Product:** FidusGate

## Context

CR-11 requires KMS fail-closed signing and Postgres-required persistence with no
JSON DB fallback under production markers.

## Decision

Production requires a validated `DATABASE_URL` for Postgres and a configured
KMS/HSM signing provider. Missing, unreachable, malformed, or failing dependencies
cause startup or privileged-operation denial; no JSON datastore, generated local
key, default Vault token, mock cloud credential, or local verification fallback is
allowed in production.

Audit receipts are append-only, hash-chained, and signed by the configured KMS/HSM
key. Key identifiers and provider configuration are injected by the platform secret
manager; Vault development compose is not production secret-path evidence. Local
JSON persistence and local cryptographic providers remain explicitly demo/test-only.

## Evidence

Production boot-deny tests; receipt-chain tampering/signing tests; secret-scan;
`json_db_fallback_denied` and `kms_missing_fail_closed` probe cells.
