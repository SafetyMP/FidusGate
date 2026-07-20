# ADR 0004: Production Sandbox and Release Supply-Chain Boundary

**Status:** Proposed for fidusgate-production site delivery  
**Date:** 2026-07-19  
**Product:** FidusGate

## Context

CR-12 and R-SEC-008 require sandbox isolation honesty and supply-chain evidence.
Tag-based images and host/Docker fallbacks must not pass production gates.

## Decision

Production execution paths require an approved sandbox runtime and deny when it is
unavailable; they never execute through host shell, eval, or standard-container
fallback. Release images are immutable digest references and release verification
checks their signatures. gVisor and host-kernel isolation are out of scope unless
separately evidenced; UI and documentation must describe the actual isolation
boundary.

Release evidence includes SBOM, lockfile audit, secret scan, image digest/signature
verification, and an authorized local/isolated `pentest-rN.json` explicitly labeled
as authorized adversarial testing, not a formal external penetration test.

## Evidence

Deny cells for host sandbox fallback and command injection; supply-chain CI;
fresh two-tier adversarial + production-config evidence; no archived r1 reuse.
