# ⚖️ FidusGate Documentation & Playbooks Portal

Welcome to the FidusGate documentation and playbooks portal. This open-source repository serves as an **evergreen reference implementation** for AI DevSecOps governance. The portal provides detailed architectural specifications, continuous delivery manuals, walkthrough verification guides, and domain-scoped **SME Playbooks** defining explicitly policy-enforced and auditable authorization boundaries for autonomous agents.

---

## 🏛️ Main Documentation Map

Use the links below to navigate our primary documentation suite:

| Document Guide | Path | Focus & Target Audience |
| :--- | :--- | :--- |
| **GitHub storefront (maintainers)** | [community/github-presentation.md](./community/github-presentation.md) | About panel, demo GIF regen, badges, social preview, community-health target |
| **Branch protection (maintainers)** | [community/github-branch-protection.md](./community/github-branch-protection.md) | Optional required checks on `main` |
| **Marketing assets index** | [assets/README.md](./assets/README.md) | `demo.gif`, screenshots, social preview source |
| **FidusGate Monorepo Architecture** | [ARCHITECTURE.md](./ARCHITECTURE.md) | High-level topologies, component details, Dockerized profiles, database setups, and core feature architectures. |
| **Local CI/CD Pipeline Emulation** | [local-ci-emulation.md](./local-ci-emulation.md) | Offline testing using `act`, secret provisioning, and pipeline prompt injection auditing with `agentic-actions-auditor`. |
| **Phase 3 Feature Walkthrough** | [walkthrough.md](./walkthrough.md) | Active filesystem drift auto-reconciliation models, Gemini policy co-pilots, and trunk-based semantic versioning releases. |
| **Phase 4 & 5 Walkthrough** | [walkthrough_v2.md](./walkthrough_v2.md) | Extended verification flows and enterprise simulator features. |
| **Enterprise Hardening Plan** | [implementation_plan.md](./implementation_plan.md) | Technical blueprint and database schema migrations for structured agent auto-fixes, KMS HSM signing, and WASI sandboxes. |
| **MCP 2026-07-28 migration** | [mcp-2026-07-28-migration.md](./mcp-2026-07-28-migration.md) | Dual-era stdio/HTTP, Streamable headers, RFC 9728 PRM for operators. |
| **OWASP MCP Top 10 ADR** | [adr/0001-owasp-mcp-top-10.md](./adr/0001-owasp-mcp-top-10.md) | Control mapping MCP01–MCP10 to Cedar, quarantine, and gateway surfaces. |

---

## 🛡️ The SME Playbook & Skill Directory

FidusGate models security boundaries by mapping available operations to dedicated, domain-scoped playbooks under the `skills/` tree. These files establish context variables parsed by Cedar policies:

### Governance & Security Skills
* **`protect-mcp-governance`** | [SKILL.md](../skills/protect-mcp-governance/SKILL.md)  
  *Main Cedar authorization template rules, transaction verification standards, and public-key audits.*
* **`agentic-actions-auditor`** | [SKILL.md](../skills/agentic-actions-auditor/SKILL.md)  
  *Static analysis definitions mapping prompt injection vulnerabilities and hardening workflows.*
* **`security-sme`** | [SKILL.md](../skills/security-sme/SKILL.md)  
  *Core security operations covering JWT authentication, SAST pipeline runs, and threat analysis models.*
* **`devops-compliance`** | [SKILL.md](../skills/devops-compliance/SKILL.md)  
  *CI/CD security policies, checkout integrity, and runner permission scopes.*
* **`ibp-governance`** | [SKILL.md](../skills/ibp-governance/SKILL.md)  
  *Integrated Business Planning rules managing budget parameters and approval votes.*
* **`plm-governance`** | [SKILL.md](../skills/plm-governance/SKILL.md)  
  *Product Lifecycle Management regulations protecting API definitions and branch check-ins.*

### Architecture & System Engineering Playbooks
* **`architecture-sme`** | [SKILL.md](../skills/architecture-sme/SKILL.md)  
  *System-wide structures, monorepo workspaces, and module boundary checks.*
* **`backend-sme`** | [SKILL.md](../skills/backend-sme/SKILL.md)  
  *Express secure gateway configs, microservice handlers, and Prisma persistence operations.*
* **`frontend-sme`** | [SKILL.md](../skills/frontend-sme/SKILL.md)  
  *Admin dashboard interfaces, UI rendering, and client receipt validators.*
* **`devops-sme`** | [SKILL.md](../skills/devops-sme/SKILL.md)  
  *Local execution sandboxes, Docker volumes, and gVisor isolation controls.*

### Developer Automation & Utilities
* **`skill-creator`** | [SKILL.md](../skills/skill-creator/SKILL.md)  
  *Generates new unprivileged playbooks validating schema shapes and structural rules.*
* **`greenfield-flex-architect`** | [SKILL.md](../skills/greenfield-flex-architect/SKILL.md)  
  *Scaffolding rules for transitioning projects between blended monoliths andTurborepos.*
* **`antigravity-skill-orchestrator`** | [SKILL.md](../skills/antigravity-skill-orchestrator/SKILL.md)  
  *Meta-orchestrator parsing user objectives and routing to specific scoped SME playbooks.*
* **`orchestrate-batch-refactor`** | [SKILL.md](../skills/orchestrate-batch-refactor/SKILL.md)  
  *Coordinates complex refactor pipelines across standard monorepo boundaries.*
* **`devcontainer-setup`** | [SKILL.md](../skills/devcontainer-setup/SKILL.md)  
  *Spawns standardized Devcontainers with Claude CLI or language environment variables.*
* **`mise-configurator`** | [SKILL.md](../skills/mise-configurator/SKILL.md)  
  *Generates and verifies standardized mise setups for team development packages.*
* **`pm-sme`** | [SKILL.md](../skills/pm-sme/SKILL.md)  
  *Updates release plans, tasks lists, and schedules within non-code files.*
* **`qa-sme`** | [SKILL.md](../skills/qa-sme/SKILL.md)  
  *Validates testing standards and runs integration and unit tests across workspaces.*

---

*Manual maintained and verified by the Antigravity Security Engineering Team.*

Community: [CONTRIBUTING.md](../CONTRIBUTING.md) · [SECURITY.md](../SECURITY.md) · [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) · [SUPPORT.md](../SUPPORT.md)
