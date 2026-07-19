# GitHub branch protection — maintainer playbook

Audience: **maintainers / org admins**. GitHub Rules are not fully representable as committed files — mirror these checks in **Settings → Rules → Rulesets** or classic branch protection.

## Required checks on `main` (configured)

| Check | Source |
|-------|--------|
| **`verify`** | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) |
| **`integration`** | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) |
| **`Build & Publish Containers`** | [`.github/workflows/docker-publish.yml`](../../.github/workflows/docker-publish.yml) |
| **`Scorecard analysis`** | [`.github/workflows/scorecard.yml`](../../.github/workflows/scorecard.yml) |
| **`Analyze (javascript-typescript)`** | [`.github/workflows/codeql.yml`](../../.github/workflows/codeql.yml) |

**`Compile & Publish Release`** / [`.github/workflows/release.yml`](../../.github/workflows/release.yml) stays informational (not merge-blocking).

The **Self-Refactoring Code Review Agent** workflow ([`ci-agent-pipeline.yml`](../../.github/workflows/ci-agent-pipeline.yml)) is a demonstration pipeline for AI-assisted review — do not add it as a required check.

## Pull request policy

- Require a pull request before merging to `main` (**1 approving review**, stale reviews dismissed).
- Block force pushes and branch deletion on `main`; require linear history and conversation resolution.
- [`CODEOWNERS`](../../.github/CODEOWNERS) teams (`@SafetyMP/fidusgate-core`, `security-core`, etc.) must exist and be populated **before** enabling required owner review (currently off until teams are confirmed).

## Dependabot

[`.github/dependabot.yml`](../../.github/dependabot.yml) opens weekly npm and GitHub Actions updates. Require the same green checks you use for contributor PRs before merging dependency bumps.
