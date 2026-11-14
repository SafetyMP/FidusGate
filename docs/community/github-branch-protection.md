# Branch protection and repository security

Maintainer reference, inspected on 2026-11-14. GitHub settings are authoritative and can change independently of this document. Updating these notes does not change access or merge policy.

## Current main branch rules

| Rule | Observed setting |
| --- | --- |
| Required status checks | `verify`, `integration`, `Build & Publish Containers`, `Analyze (javascript-typescript)` |
| Up-to-date branch | Required |
| Administrator enforcement | Enabled |
| Linear history | Required |
| Force pushes / deletion | Disabled |
| Required approving reviews | 0; independent review remains a contributor practice |
| Required code-owner review | Disabled |
| Required conversation resolution | Disabled |

CI also validates Cedar. Scorecard runs on pushes and its schedule; release and Pages publication are post-merge workflows. Do not require a check on pull requests unless that workflow actually runs there. The AI-assisted review workflow is informational.

[CODEOWNERS](../../.github/CODEOWNERS) routes review to the verified maintainer, `@SafetyMP`. The previous specialist-team entries were reported as unknown owners by GitHub. Add teams only after confirming visibility and repository write access; this file does not create teams or grant permissions.

## Security configuration

GitHub reported Dependabot security updates, secret scanning, push protection, and private vulnerability reporting enabled at inspection. [CodeQL](../../.github/workflows/codeql.yml) scans JavaScript/TypeScript. Preserve these protections, SHA-pinned workflow actions, scoped job permissions, and locked dependency installation.

Inspect current settings before changing them:

```sh
gh api repos/SafetyMP/FidusGate/branches/main/protection
gh api repos/SafetyMP/FidusGate/codeowners/errors
gh api repos/SafetyMP/FidusGate/private-vulnerability-reporting
```

Changes to branch rules or access need their own authorization. Community-health completeness and passing Actions checks do not establish production readiness or an audited security posture.

References: [protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners).
