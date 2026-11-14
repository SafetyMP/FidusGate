# Presentation and discovery

FidusGate helps developers and reviewers inspect MCP tool-call decisions, understand policy outcomes, and verify Ed25519 receipts. Keep the GitHub repository, hosted demo, and agent guidance consistent with that scope.

## GitHub About panel

**Description:** Inspect MCP tool-call decisions, explore Cedar policies, and verify Ed25519 receipts. Open-source reference gateway and console with an interactive demo.

**Website:** https://safetymp.github.io/FidusGate/

**Topics:** `mcp`, `model-context-protocol`, `ai-agents`, `agent-security`, `cedar`, `policy-as-code`, `authorization`, `ed25519`, `digital-signatures`, `audit-trail`, `developer-tools`, `typescript`, `react`, `reference-implementation`.

Use terms that describe implemented functionality. Avoid claims of universal prompt-injection prevention, production certification, or complete agent interception. GitHub [topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics) help people find related repositories; they do not guarantee ranking.

## Public demo discovery

The [Pages workflow](../../.github/workflows/pages.yml) publishes the browser-only demo from `main`. Its build provides a descriptive title, description, canonical URL, social metadata, structured project information, and a static overview with ordinary links before JavaScript runs. The connected console receives `noindex` metadata and no public-demo canonical. `noindex` is a crawler hint, never an access control.

The demo artifact includes a sitemap and an `llms.txt` navigation index sourced from the repository root. Keep the [root index](../../llms.txt) concise and link to canonical documentation. `llms.txt` is supplemental navigation for tools that choose to use it, not a recognized guarantee of agent ingestion or search indexing. `AGENTS.md` describes contribution rules, not instructions to bypass a reader's own authority boundaries.

GitHub project Pages lives under `/FidusGate/`. A `robots.txt` placed there would not govern the origin; only `https://safetymp.github.io/robots.txt` can do that. This repository does not control that origin-level file. Do not publish a misleading project-level robots file or add synthetic per-tab sitemap URLs for views without routes. Search Console submission requires a verified site owner; no indexing, ranking, or rich-result claim follows from a build.

Reference: Google's [JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) and [robots.txt scope](https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt).

## Screenshots and social card

The README shows the redesigned Decisions workspace using synthetic demo records. [Asset provenance](../assets/README.md) distinguishes current captures from retained older screenshots.

To capture the static demo locally, first build and preview it using the [Pages guide](../github-pages-demo.md), then run:

```sh
SCREENSHOT_BASE_URL=http://127.0.0.1:4173/FidusGate/ npm run screenshots
```

The capture script refuses a gateway-connected console. It captures Decisions, Policy playground, and Receipt verifier without signing in or changing gateway data. Browser screenshots require an installed Chrome or, with `CI=1`, Playwright Chromium. `npm run screenshots:rebuild-gif` rebuilds the animation from existing captures.

The 1280×640 [social card source](../assets/social-preview.svg) and [PNG](../assets/social-preview.png) reflect the same product description. The Pages build copies the PNG into its artifact. GitHub's repository social preview is a separate upload under **Settings → General → Social preview**; committing the PNG does not update that setting. A maintainer can upload it following [GitHub's guide](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview). No third-party social posting is needed to validate the file.

## Keep the repository usable

Maintain one canonical README, contribution guide, security policy, code of conduct, support guide, and issue/PR templates. Keep badges tied to real workflows and the Apache-2.0 license. Preserve CHANGELOG entries and historical plans as history, not current feature guarantees. GitHub's [repository best practices](https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories) inform these choices.

Before merging, check relative documentation links, both dashboard build modes, discovery artifacts, and applicable CI. After merging, verify the exact deployment commit and public URL before claiming the new metadata is live.
