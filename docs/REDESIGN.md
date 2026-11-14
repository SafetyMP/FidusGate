# FidusGate console redesign

## Brief

The original project targets signed MCP tool-call receipts and an operator console. The working hypothesis is that a focused inspect → simulate → verify loop makes that purpose clearer than the previous payment-led dashboard. This is a design hypothesis supported by source inspection, not measured customer research or evidence of improved engagement.

Source evidence: `docs/DESIGN-PIVOT.md` defines the receipt-focused product, while `src/tabs/LedgerTab.tsx` in the admin dashboard opens with money-transfer inputs. The old `App.tsx` mounts broad operational controls and an automatic tour, and `ForensicsTab.tsx` separates receipt verification from decision inspection. Existing health and verification labels are not suitable for a static demonstration.

## Delivered scope

- A calm, responsive decision log with search, allow/deny filtering, explicit selection, and a contextual explanation panel.
- Four named scenarios with recorded outcomes and preserved signed timestamps. Replays are labeled in the log and detail view.
- Browser-local Ed25519 verification of pre-signed synthetic receipts, including malformed/unsupported input, tampering, and stale asynchronous results.
- A demo scope explanation accessible on desktop and mobile; no forced tour or login.
- A GitHub Pages workflow on `main`, with a static build flag and repository-relative assets. Initial preview publication used `codex/fidusgate-redesign` before the redesign was merged.

The static demo and gateway-connected console use separate lazy entry points. The static bundle excludes the old console's API polling and operational controls. No gateway authorization, policy, key-management, or fail-closed behavior changed. This work does not migrate the connected console to the new interaction model.

The existing React/Vite/TypeScript stack is retained without adding dependencies or changing the lockfile. Vite explicitly resolves React and ReactDOM from the repository root so the compiler runtime, application, and external test renderer share the same pinned runtime.

## Acceptance and evidence

Acceptance covers first-load clarity; search/filter/empty recovery; selected decision → receipt handoff; allow/deny scenarios; original-signature success and tamper failure; reset; keyboard focus; 390px and desktop layouts; a static subpath build; and exact-commit deployment verification.

- Dashboard tests: 20 passing, including 10 cryptographic/fixture checks and six operator journey tests.
- Demo production build: passed with `/FidusGate/` base path. Only the demo console is emitted.
- Existing lint command: passed with existing core-type `any` warnings; Rust linter reports its existing bypass when unavailable.
- Independent read-only review: corrected mobile scope access, low-contrast text/status labels, view-change focus, and misleading timestamp sort presentation.
- Browser checks: selected receipt handoff, valid signature, altered signature rejection, mobile selection focus, and 390px layout without horizontal overflow.
- Repository-wide `scripts/harness/verify.sh`: attempted; blocked at Cedar Docker build because Docker is unavailable locally. This is not a green full-repository gate. Full output retained locally at `/private/tmp/fidusgate-verification/verify.log`.
- Threat-model YAML gate: passed. Cedar CLI is absent; the existing validation script reported a skip. Backend integration and live enforcement were not validated by the frontend checks.

Publication and live-page checks are recorded in `docs/github-pages-demo.md`. Neither a deployment nor these checks establish customer adoption or production security readiness.
