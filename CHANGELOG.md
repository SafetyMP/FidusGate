# [1.8.0](https://github.com/SafetyMP/FidusGate/compare/v1.7.0...v1.8.0) (2026-06-16)


### Features

* **security:** agent quarantine system, Tier 0/9 Cedar policies, async DB refactor, interview engine ([2167a84](https://github.com/SafetyMP/FidusGate/commit/2167a842e421dc60f2d7cb6010c16570bac50836))

# [1.7.0](https://github.com/SafetyMP/FidusGate/compare/v1.6.0...v1.7.0) (2026-06-07)


### Bug Fixes

* **security:** revert unauthorized agent bypasses of FidusGate controls ([8ee8a50](https://github.com/SafetyMP/FidusGate/commit/8ee8a506b92d46c1f36043d45e4cd3210084866a))


### Features

* **security:** cryptographic principal signature verification on privileged tool calls ([ee24914](https://github.com/SafetyMP/FidusGate/commit/ee2491478b26b30a14816af5a06729d48c3ad6ba))

# [1.6.0](https://github.com/SafetyMP/FidusGate/compare/v1.5.0...v1.6.0) (2026-06-07)


### Features

* **security:** Phase 2 Enterprise Hardening - WASM fallback, egress proxy, KMS signing, eBPF enforcer ([c920e02](https://github.com/SafetyMP/FidusGate/commit/c920e02bb14eebcf28ebb370f8caa11f9a6bda94))

# [1.5.0](https://github.com/SafetyMP/FidusGate/compare/v1.4.0...v1.5.0) (2026-06-06)


### Features

* complete FidusGate optimizations and integration updates ([1c6be38](https://github.com/SafetyMP/FidusGate/commit/1c6be38a989e94a8630b1e787b2b7d49044b3606))

# [1.4.0](https://github.com/SafetyMP/FidusGate/compare/v1.3.1...v1.4.0) (2026-06-06)


### Features

* decompose App.tsx and integrate FidusGate MCP secure tool routing ([ec87ad6](https://github.com/SafetyMP/FidusGate/commit/ec87ad6434ed27f86c942cf0b8c6b9e76013d5ba))

## [1.3.1](https://github.com/SafetyMP/FidusGate/compare/v1.3.0...v1.3.1) (2026-06-04)


### Bug Fixes

* **harness:** resolve patch mismatch, correct sed header pattern, optimize copying and watcher subprocess calls ([88d6693](https://github.com/SafetyMP/FidusGate/commit/88d6693d5848f51e829709823cffff2e3be62307))

# [1.3.0](https://github.com/SafetyMP/FidusGate/compare/v1.2.0...v1.3.0) (2026-05-31)


### Features

* **sandbox,gateway,dashboard:** complete live Zero-Trust execution loop, macOS timeout fallback, live eBPF system call trace logs, and OIDC widget improvements ([5427ce5](https://github.com/SafetyMP/FidusGate/commit/5427ce5cb0b51e803b413cf5f86bc42a87a0cbb3))

# [1.2.0](https://github.com/SafetyMP/FidusGate/compare/v1.1.0...v1.2.0) (2026-05-31)


### Features

* implement live API integrations for sandbox playbooks and advanced bypass tests ([e06a69c](https://github.com/SafetyMP/FidusGate/commit/e06a69c843ce17720346779c357c9ad5a1793e69))

# [1.1.0](https://github.com/SafetyMP/FidusGate/compare/v1.0.0...v1.1.0) (2026-05-31)


### Bug Fixes

* resolve YAML indentation syntax errors in release workflow ([239c41c](https://github.com/SafetyMP/FidusGate/commit/239c41c3b130f94f0c58be11c706880d6958375a))


### Features

* add interactive utility to purge legacy Veritas container packages from GHCR ([cabc875](https://github.com/SafetyMP/FidusGate/commit/cabc875cbd1a3d201df5abfc22f8401c0765eff0))
* complete FidusGate rebranding, interactive guide layout polish, and premium features integration ([b39961f](https://github.com/SafetyMP/FidusGate/commit/b39961fa0902f553c448fc069ac512c192b10b7d))
* **dashboard:** Refactor operations dashboard layout into glassmorphic tabs ([c3d2beb](https://github.com/SafetyMP/FidusGate/commit/c3d2beba229657afcf152476c5970f17a9012643))
* **database:** integrate PostgreSQL persistence using Prisma ORM and Docker ([4516162](https://github.com/SafetyMP/FidusGate/commit/451616274b3db39622e2f3a0bc0f8d7bb5b7fdbd))
* implement combined dev queue (dynamic PLM UI panel, Prometheus metrics API, and forensic command logs database) ([d50fdc7](https://github.com/SafetyMP/FidusGate/commit/d50fdc70cfee50218df3da96ff4afd347cb422c6))
* implement dynamic TS Cedar Policy Engine, tokenized Command Auditor, native tests, and enforce-mode default ([ba7d669](https://github.com/SafetyMP/FidusGate/commit/ba7d66930a94fea15a9452b5380a2322358fe6f1))
* implement native SRE telemetry exporter, policy hot-reloader, process kill-switches, and model context protocol proxy ([a0acc4d](https://github.com/SafetyMP/FidusGate/commit/a0acc4de679051f7ea830e992ed5cd42038f7ab0))
* implement stateful PLM feedback loop, scenario modeling & SME playbooks ([9a80538](https://github.com/SafetyMP/FidusGate/commit/9a80538d3715dc882b1b56ed86faafff0564db8f))
* migrate monorepo packages, dependencies, and imports to [@fidusgate](https://github.com/fidusgate) scope ([87476ec](https://github.com/SafetyMP/FidusGate/commit/87476ec8e2822cf3e44290eeb9ab25bfc63aa774))
* **secops:** Implement dynamic WebSockets, forensic search filters, cryptographic report exports, and agent circuit breakers ([b8c6f8f](https://github.com/SafetyMP/FidusGate/commit/b8c6f8f12e82b51817f8bfe44f78987a440878bb))
* **secops:** implement FidusGate Enterprise Phase 2 features ([566a18d](https://github.com/SafetyMP/FidusGate/commit/566a18df9daebeaba77292decfeb845db2951083))
* **secops:** implement Phase 3 Active Filesystem Drift Auto-Reconciliation and Gemini-Powered Cedar Co-Pilot ([9282085](https://github.com/SafetyMP/FidusGate/commit/9282085e7a237029ab3ae92c692281922cfb284f))
