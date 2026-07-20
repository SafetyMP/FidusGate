# ADR 0002: Production Authentication, Session, and MCP Authorization

**Status:** Proposed for fidusgate-production site delivery  
**Date:** 2026-07-19  
**Product:** FidusGate

## Context

Production program `fidusgate-production` requires fail-closed AuthN/Z (CR-10).
Demo patterns (DISABLE_AUTH, HS256 bootstrap minting, localStorage bearer tokens)
must not satisfy production gates.

## Decision

Production uses an external OIDC/OAuth authorization server. Browser login uses
authorization code with PKCE through a BFF that issues HttpOnly, Secure, SameSite
session cookies. The dashboard stores no bearer access token or role in
localStorage. Machine and MCP callers present bearer tokens validated against
configured JWKS with issuer, audience, expiry/not-before, and asymmetric algorithm
allowlists.

Production rejects startup when OIDC/JWKS configuration is incomplete and rejects
requests when verification fails. `DISABLE_AUTH`, HS256 bootstrap minting, mock
identity widgets, and unauthenticated WebSocket connections are demo/test-only and
must hard-fail under either production marker (`NODE_ENV=production` or
`FIDUSGATE_RUNTIME=production`). Cedar daemon use requires authenticated transport
and fail-closed behavior on daemon failure or evaluator mismatch.

## Consequences

Amend ADRs 0000 and 0001 threat-model cells for unauthenticated/wrong-audience MCP
denial, unsigned policy reload denial, and unauthenticated WebSocket denial. Each
MCP01–MCP10 entry must be EXEC or OOS with a named residual-risk owner.

## Evidence

Hermetic OIDC/JWKS fixtures; production-config CI deny cases; route and WebSocket
authorization tests; `./scripts/harness/verify.sh` and `./scripts/harness/adversarial.sh`.
