# GitHub presentation playbook

Audience: **maintainers**. This page captures the repository's GitHub "storefront" — the About panel, README trust signals, the demo image, and the community-health surface — plus how to keep them fresh. None of this changes the merge bar; it is presentation only.

## Repository About panel (GitHub UI)

Set in **Settings** or the gear icon next to About on the repo home. Keep it to a single sentence so it reads well in search results and the sidebar:

> Evergreen OSS reference for zero-trust AI agent governance — Cedar policy gates, Ed25519 receipts, and a runnable admin console demo. Not a production-hardened security product.

- **Website:** `https://github.com/SafetyMP/FidusGate#demo` (or a future hosted demo URL).
- **Topics:** `ai-agents`, `agent-security`, `zero-trust`, `cedar`, `mcp`, `devsecops`, `reference-architecture`, `open-source`, `typescript`, `react`, `nodejs`, `docker`, `supply-chain-security`.

## README badges

The badge row lives near the top of [`README.md`](../../README.md):

- **Docker Publish** — [`.github/workflows/docker-publish.yml`](../../.github/workflows/docker-publish.yml) (GHCR images for gateway + dashboard).
- **Release** — latest GitHub Release via shields.io.
- **OpenSSF Scorecard** — [`.github/workflows/scorecard.yml`](../../.github/workflows/scorecard.yml); badge populates after the first published run on `main`.
- **License** — Apache 2.0.

If a workflow file is renamed, update the matching badge URL and its link target.

## Demo image

The README hero references [`docs/assets/demo.gif`](../assets/demo.gif) — a cycling GIF (2s per frame) across the admin dashboard tabs: ledger, compliance, Cedar simulator, and sandbox. All frames use synthetic demo data (no production credentials).

### Regenerating the demo GIF

1. `npm ci && npm run bootstrap`
2. Start the stack: `npm run dev` (gateway on `:3001`, dashboard on `:3000`)
3. In another terminal: `npm run screenshots` (writes PNGs + `docs/assets/demo.gif`)

Optional: `SCREENSHOT_BASE_URL=http://localhost:3000 npm run screenshots` for a non-default host.

Rebuild the GIF from committed PNGs without a browser:

```bash
npm run screenshots:rebuild-gif
```

Re-capture when the admin console layout changes materially so the storefront does not drift from the product.

## Social preview (Open Graph card)

1. Source asset: [`docs/assets/social-preview.svg`](../assets/social-preview.svg) (1280×640).
2. Committed render: [`docs/assets/social-preview.png`](../assets/social-preview.png) (1280×640).
3. Upload: **Settings → General → Social preview** on the GitHub repo (GitHub has no API for this field — UI upload required).
4. Verify: paste the repo URL into Slack/LinkedIn and confirm the custom card renders.

## Community profile

Target **100%** on **Insights → Community Standards**: README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue templates, and a PR template. Issue templates live under [`.github/ISSUE_TEMPLATE/`](../../.github/ISSUE_TEMPLATE/). GitHub Discussions is intentionally not enabled; open-ended questions route through the documentation issue template (see [`.github/ISSUE_TEMPLATE/config.yml`](../../.github/ISSUE_TEMPLATE/config.yml)).

## Optional, later

- **OpenSSF Best Practices badge** — enroll at [bestpractices.dev](https://www.bestpractices.dev/en) after community files and CI are stable on `main` (complements Scorecard).
- **CodeQL workflow** — add dedicated SAST workflow if org Advanced Security is enabled.

Related: [github-branch-protection.md](github-branch-protection.md) for optional required checks after Scorecard's first run.
