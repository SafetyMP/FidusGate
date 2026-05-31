# ⚖️ FidusGate Documentation & Playbooks Portal

Welcome to the FidusGate engineering and governance documentation portal. This directory contains detailed architectural specifications, continuous delivery manuals, walkthrough verification guides, and our risk-centric **SME Playbooks** defining autonomous agent boundaries.

---

## 🏛️ Main Documentation Map

Use the links below to navigate our primary documentation suite:

| Document Guide | Path | Focus & Target Audience |
| :--- | :--- | :--- |
| **⚖️ FidusGate Monorepo Architecture** | [ARCHITECTURE.md](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/docs/ARCHITECTURE.md) | High-level topologies, component details, Dockerized profiles, database setups, and premium feature architectures. |
| **🚀 Local CI/CD Pipeline Emulation** | [local-ci-emulation.md](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/docs/local-ci-emulation.md) | Offline testing using `act`, secret provisioning, and pipeline prompt injection auditing with `agentic-actions-auditor`. |
| **📡 Phase 3 Feature Walkthrough** | [walkthrough.md](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/docs/walkthrough.md) | Active filesystem drift auto-reconciliation models, Gemini policy co-pilots, and trunk-based semantic versioning releases. |
| **📝 Enterprise Hardening Plan** | [implementation_plan.md](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/docs/implementation_plan.md) | Technical blueprint and database schema migrations for structured agent auto-fixes, KMS HSM signing, and WASI sandboxes. |

---

## 🛡️ The SME Playbook & Skill Directory

FidusGate models security boundaries by mapping available operations to dedicated, domain-scoped playbooks under the `skills/` tree. These files establish context variables parsed by Cedar policies:

### Governance & Security Skills
* **`protect-mcp-governance`** | [SKILL.md](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/skills/protect-mcp-governance/SKILL.md)  
  *Main Cedar authorization template rules, transaction verification standards, and public-key audits.*
* **`agentic-actions-auditor`** | [SKILL.md](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/skills/agentic-actions-auditor/SKILL.md)  
  *Static analysis definitions mapping prompt injection vulnerabilities and hardening workflows.*
* **`security-sme`** | [SKILL.md](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/skills/security-sme/SKILL.md)  
  *Core security operations covering JWT authentication, SAST pipeline runs, and threat analysis models.*
* **`devops-compliance`** | [SKILL.md](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/skills/devops-compliance/SKILL.md)  
  *CI/CD security policies, checkout integrity, and runner permission scopes.*
* **`ibp-governance`** | [SKILL.md](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/skills/ibp-governance/SKILL.md)  
  *Integrated Business Planning rules managing budget parameters and approval votes.*
* **`plm-governance`** | [SKILL.md](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/skills/plm-governance/SKILL.md)  
  *Product Lifecycle Management regulations protecting API definitions and branch check-ins.*

### Architecture & System Engineering Playbooks
* **`architecture-sme`** | [SKILL.md](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/skills/architecture-sme/SKILL.md)  
  *System-wide structures, monorepo workspaces, and module boundary checks.*
* **`backend-sme`** | [SKILL.md](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/skills/backend-sme/SKILL.md)  
  *Express secure gateway configs, microservice handlers, and Prisma persistence operations.*
* **`frontend-sme`** | [SKILL.md](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/skills/frontend-sme/SKILL.md)  
  *Admin dashboard interfaces, glassmorphic rendering, and client receipt validators.*
* **`devops-sme`** | [SKILL.md](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/skills/devops-sme/SKILL.md)  
  *Local execution sandboxes, Docker virtual volumes, and gVisor isolation controls.*

### Developer Automation & Utilities
* **`skill-creator`** | [SKILL.md](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/skills/skill-creator/SKILL.md)  
  *Generates new unprivileged playbooks validating schema shapes and structural rules.*
* **`greenfield-flex-architect`** | [SKILL.md](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/skills/greenfield-flex-architect/SKILL.md)  
  *Scaffolding rules for transitioning projects between blended monoliths andTurborepos.*
* **`antigravity-skill-orchestrator`** | [SKILL.md](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/skills/antigravity-skill-orchestrator/SKILL.md)  
  *Meta-orchestrator parsing user objectives and routing to specific scoped SME playbooks.*
* **`orchestrate-batch-refactor`** | [SKILL.md](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/skills/orchestrate-batch-refactor/SKILL.md)  
  *Coordinates complex refactor pipelines across standard monorepo boundaries.*
* **`devcontainer-setup`** | [SKILL.md](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/skills/devcontainer-setup/SKILL.md)  
  *Spawns standardized Devcontainers with Claude CLI or language environment variables.*
* **`mise-configurator`** | [SKILL.md](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/skills/mise-configurator/SKILL.md)  
  *Generates and verifies standardized mise setups for team development packages.*
* **`pm-sme`** | [SKILL.md](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/skills/pm-sme/SKILL.md)  
  *Updates release plans, tasks lists, and schedules within non-code files.*
* **`qa-sme`** | [SKILL.md](file:///Users/sagehart/Documents/Antigravity%20Test%20Project/antigravity-custom-dev/skills/qa-sme/SKILL.md)  
  *Validates testing standards and runs integration and unit tests across workspaces.*

---

*Manual maintained and verified by the Antigravity Security Engineering Team.*
