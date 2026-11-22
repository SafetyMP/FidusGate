# GitHub Pages demo

The public route opens the original FG-1048 change-review case. The analyst checks a submitted packet and requests follow-up file history. The platform lead compares three alternatives using adjustable first-year costs, review volumes and analyst time.

The technical view carries the selected archive or received copy into four stages: request, decision, signature and file history. Compare it with the genuine signed synthetic FG-1047 documentation read or FG-1048 policy-write denial, run both signature checks and download the pair with provenance, check results and optional repository snapshots. The selected packet, comparison fixture and stage are in the URL. Returning to the case within the session preserves the investigation and economics inputs. Reloading reopens the addressed evidence selection and clears transient verification results.

[Business case](https://safetymp.github.io/FidusGate/#/case) · [FG-1048 ticket copy against the archived denial](https://safetymp.github.io/FidusGate/#/technical?packet=received&fixture=FG-1048&stage=signature) · [Pilot worksheet](https://safetymp.github.io/FidusGate/#/case?section=economics)

Former public tool bookmarks open the compact technical view. The former pilot bookmark opens the case worksheet. Local gateway-connected tools and their authentication continue to use the documented setup.

**Design basis.** NIST SP 800-61r3 §2.2 distinguishes incident handlers collecting evidence from leadership allocating resources. RS.AN-06 and RS.AN-07 explain the need to preserve evidence integrity and provenance. Those concerns drive the inspectable case file, the limited attribution finding and the pilot comparison with ordinary decision logs. [NIST incident response guidance](https://csrc.nist.gov/pubs/sp/800/61/r3/final)

## Build and preview

Use Node.js 22 and the repository's pinned npm 10.9.2. From the repository root:

```sh
npx --yes npm@10.9.2 ci
npm run build --workspace packages/core-types
npm test --workspace apps/admin-dashboard
VITE_FIDUSGATE_DEMO=true npm run build --workspace apps/admin-dashboard -- --base=/FidusGate/
npm run preview --workspace apps/admin-dashboard -- --host 127.0.0.1
```

Open the preview server's URL with `/FidusGate/` appended. Vite's base option makes bundled asset URLs work under the repository's Pages path. `VITE_FIDUSGATE_DEMO=true` selects the browser-only demo at build time. Do not publish a normal gateway-connected build to Pages.

The case uses synthetic records, a mismatched ticket copy and two authored repository snapshots. The decision archive is drawn from the committed signed fixtures. Receipt signature verification is a cryptographic check against the public demo key; it does not establish production issuer identity or prove execution. Keep these distinctions visible when presenting the demo. The evidence comparison stays in the browser until exported.

## Publication

The [Pages workflow](../.github/workflows/pages.yml) builds and deploys from `main`. Relevant source pushes to `main` trigger publication. To redeploy manually, run `workflow_dispatch` with `main` selected. The build job rejects other refs, including manual runs from feature branches. Only the static demo artifact is published by this workflow.

The repository's **Settings → Pages → Build and deployment → Source** must be **GitHub Actions**. The `github-pages` environment must allow deployments from `main`; preserve any required reviewer policy. Remove the former `codex/fidusgate-redesign` deployment-branch allowance after the first successful main deployment so the historical branch workflow cannot replace the main build. The workflow does not automatically enable Pages or alter environment protection rules.

Expected project URL: [FidusGate demo](https://safetymp.github.io/FidusGate/). This is the intended URL, not evidence of a successful deployment. Confirm the run's deployment URL and check the live site before reporting publication complete.

Only `apps/admin-dashboard/dist` is uploaded. There are no gateway credentials, backend service connections, shell execution, or live enforcement in this static demo. Deployment write permissions are limited to the deployment job, and all third-party actions are pinned to commit SHAs. The build uses the committed lockfile and does not modify dependency versions.

## Acceptance checks

- Open `/FidusGate/` directly and refresh it; JavaScript and stylesheet assets must load under that path.
- Inspect a denied call and follow the reason and receipt without logging in.
- Select the received packet in the case. Open its trace, compare it with each fixture and run the checks. Export the selected evidence with snapshots, refresh its direct link and return to the original case.
- Check narrow and wide layouts and keyboard navigation.
- Confirm the static demo makes no `/api` requests and sends no receipt input to a server.
- Check the exact published commit's Actions run and the live URL. A local build does not establish deployment success or user adoption.

The repository-wide Definition of Done remains `./scripts/harness/verify.sh`. The Pages workflow's dashboard tests and static build are narrower checks and do not replace the gateway's verification or integration gates.

## Hosting references

The workflow follows GitHub's [custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages): upload the built artifact, make deployment depend on that build, grant `pages: write` and `id-token: write`, and use a protected deployment environment. See also [configuring a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Search and agent discovery

Only the public demo build includes its canonical URL, social preview, structured project metadata, static explanatory HTML, `sitemap.xml`, and a copy of the root `llms.txt`. The connected build is marked `noindex, nofollow` and does not include these public-demo assets. These are discoverability hints, not access controls or evidence of indexing. See [presentation and discovery](community/github-presentation.md) for origin-level robots.txt limits and upkeep.
