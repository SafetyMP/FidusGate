# Design pivot: receipts, not a generic governance platform

**Date:** September 2026  
**Scope:** Positioning and documentation only. This change does not rewrite the app.

## Stop competing here

OpenFirma, Vectimus, Symbiont, and Permit Cedar Agent already put Cedar on the authorization hot path. FidusGate should not present itself as another generic “zero-trust agent governance platform.” That category is contested, and the phrase over-claims what this repository is.

## What the product is

FidusGate is **signed Ed25519 receipts for MCP tool calls**, plus a **runnable admin console** (transaction ledger, Cedar policy simulator, receipt verifier).

Cedar still authorizes each tool call. The differentiated surface is the receipt and the console that lets a human inspect, simulate, and verify those decisions.

This remains a **reference implementation — not a production-hardened security product.** Local key storage, the JSON datastore, and simulated syscall/OIDC pieces are illustrative. Do not market them as production controls.

## Why not OpenFirma

OpenFirma is a sidecar enforcement boundary: intercept outbound calls, evaluate Cedar locally, fail closed, and write a signed audit event. It does not ship this console or receipt UX.

- OpenFirma wraps an agent process. FidusGate is a demo MCP gateway plus an admin console you run to see Cedar decisions and receipts.
- OpenFirma signs capability tokens and sidecar audit events. FidusGate signs a per-tool-call Ed25519 decision receipt that the dashboard verifier can check.
- OpenFirma has no in-repo ledger, Cedar simulator, or paste-a-receipt console. That operator loop is FidusGate’s product.

Vectimus, Symbiont, and Permit Cedar Agent likewise already do Cedar-on-the-hot-path. Do not add features to “keep up” with those sidecars. Deepen receipts and the console.

## Next build slice (not in this PR)

- If the MCP gateway is a real server an operator can point a client at, **publish an MCP server listing**.
- If `mcp` is only a GitHub topic or label, **drop the `mcp` topic** so the storefront does not imply a listed server.

## Invariants that do not change

- Fail-closed authorize, kill-switch, PDP, principal-signature, and production-profile paths stay fail-closed.
- Demo and mock surfaces stay labeled as demo.
- Do not claim production hardening, certification, or originality of Cedar-on-the-hot-path.
