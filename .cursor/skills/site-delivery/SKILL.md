---
name: site-delivery
description: Runs a corporate handoff through ADR decomposition, isolated site implementation, and operations verification.
---

# Site delivery

1. Verify `corporate-handoff.json` digests before acting.
2. Resolve `program.site_path` from
   `corp-harness status --root <corporate-folder>`. Call `move_agent_to_root`
   with that path, then confirm the active workspace root equals `site_path`.
   If the move fails, is unavailable, is declined, or the root is still not
   `site_path`: **stop immediately**. Do not implement or continue site roles
   from the corporate/factory root. Tell the user the required `site_path` and
   wait for them to open/switch that workspace (or approve the root move)
   before resuming. If a site manifest exists, handoff `site_id` must match
   `.corp-harness/site.json` `site_id`.
3. For `program_kind: product`, edit only the product site root. Never modify
   factory sources (`src/corp_harness/**`) or factory plugin sources from a site
   workspace. Portfolio platform work is not site delivery.
4. For `program_kind: factory`, confirm user `factory_authorization` is current
   before implementing authorized surfaces under the factory checkout.
5. Use the site manager to create consequential ADRs and bounded work packets.
   Enforce packet limits from execution_policy (one ADR; path/acceptance caps).
   Persist a root receipt before any specialist launch.
6. Capture → archive → dispatch → implement. Recapture/dispatch use `fast`
   models via the model-routing skill; never start premium coding under an
   expiring freshness window.
7. The root orchestrator runs `corp-harness route-model` before each Task and
   launches site specialists in isolated worktrees with the routed `model=`.
   Premium only for escalated `hard_implement` / complexity
   `packet_implement` / post-failure `remediate`.
8. Integrate from the site root and run `scripts/harness/verify.sh`.
9. Record `verification_scripts` as site-relative `scripts/harness` containing only
   `verify.sh` and `adversarial.sh`. Never bind the whole `scripts/` tree.
10. Ask operations excellence to inspect fresh evidence and model attestations
    (`corp-harness check --attest-packet …`); producers cannot approve it.
11. On abort, write a resume checkpoint and resume on standard/fast unless a
    valid premium escalation exists. Return failures to the owning ADR with a
    new revision. Never bypass the attempt budget.
