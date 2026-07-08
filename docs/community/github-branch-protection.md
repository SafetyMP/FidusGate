# GitHub branch protection — maintainer playbook

Audience: **maintainers / org admins**. GitHub Rules are not fully representable as committed files — mirror these checks in **Settings → Rules → Rulesets** or classic branch protection.

## Recommended checks on `main`

After at least one clean run on `main`, consider requiring:

| Check | Source |
|-------|--------|
| **`Build & Publish Containers`** | [`.github/workflows/docker-publish.yml`](../../.github/workflows/docker-publish.yml) |
| **`Scorecard analysis`** | [`.github/workflows/scorecard.yml`](../../.github/workflows/scorecard.yml) |
| **`Generate GitHub Release`** (optional) | [`.github/workflows/release.yml`](../../.github/workflows/release.yml) — usually informational, not merge-blocking |

The **Self-Refactoring Code Review Agent** workflow ([`ci-agent-pipeline.yml`](../../.github/workflows/ci-agent-pipeline.yml)) is a demonstration pipeline for AI-assisted review — do not treat it as the primary build/test gate until a dedicated `ci.yml` runs `npm run test` on every PR.

## Pull request policy

- Require a pull request before merging to `main`.
- Block force pushes and branch deletion on `main`.
- Map [`CODEOWNERS`](../../.github/CODEOWNERS) teams (`@SafetyMP/fidusgate-core`, `security-core`, etc.) before enabling required owner review.

## Dependabot

[`.github/dependabot.yml`](../../.github/dependabot.yml) opens weekly npm and GitHub Actions updates. Require the same green checks you use for contributor PRs before merging dependency bumps.
