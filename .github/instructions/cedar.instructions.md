---
applyTo: "**/*.cedar,**/*.cedarschema"
---

# Cedar coding standards (September 2026)

- Keep authorization fail-closed. A missing policy, schema mismatch, or unavailable PDP is a deny.
- Do not introduce a silent fallback from enforce to shadow.
- Validate against the checked-in schema (`policy.cedarschema` or the service equivalent).
- Pair policy edits with the existing Cedar validation script or tests.
