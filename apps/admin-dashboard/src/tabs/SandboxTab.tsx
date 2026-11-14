interface SandboxTabProps {
  authRole: 'developer' | 'admin' | 'auditor' | 'unauthenticated';
  activePlaybook: string | null;
  handlePlaybookClick: (playbook: string) => void;
  consoleLines: string[];
  consoleInput: string;
  setConsoleInput: (v: string) => void;
  consoleEndRef: any;
  handleConsoleSubmit: (e: React.FormEvent) => void;
  showArchPanel: boolean;
  setShowArchPanel: (v: boolean) => void;
  selectedArchComp: string | null;
  setSelectedArchComp: (v: string) => void;
  syscalls: any[];
  latestAutofix: { target: string, replacement: string } | null;
  setLatestAutofix: (v: { target: string, replacement: string } | null) => void;
  executeSandboxCommand: (fullCmd: string) => Promise<void>;
}

export function SandboxTab({
  authRole,
  activePlaybook,
  handlePlaybookClick,
  consoleLines,
  consoleInput,
  setConsoleInput,
  consoleEndRef,
  handleConsoleSubmit,
  showArchPanel,
  setShowArchPanel,
  selectedArchComp,
  setSelectedArchComp,
  syscalls,
  latestAutofix,
  setLatestAutofix,
  executeSandboxCommand,
}: SandboxTabProps) {
  const canOperate = authRole === 'admin' || authRole === 'developer';

  return (
    <div className="terminal-grid-section animate-fade-in" style={{ marginTop: 0 }}>
      {/* Left Column: Playbooks & Architecture Guide */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Visual Security Playbooks Sidebar */}
        <section className="glass-panel playbooks-panel">
          <div className="card-header">
            <h2 className="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'hsl(var(--success))' }}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <circle cx="12" cy="11" r="3"/>
              </svg>
              Sandbox playbooks
            </h2>
            <span className="status-badge status-completed">Gateway operations</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.84rem', lineHeight: '1.45', margin: 0 }}>
              Run a playbook through the connected gateway. Actions may create transactions, execute commands, or send configured alerts. Results appear in the terminal; the gateway enforces authorization.
            </p>

            <div className="playbook-list">
              {/* Playbook 1 */}
              <div
                className={`playbook-card ${activePlaybook === 'test-pii' ? 'playbook-card-active' : ''}`}
              >
                <div className="playbook-card-header">
                  <div className="playbook-title-block">
                    <div className="playbook-bullet bullet-pii"></div>
                    <span className="playbook-card-title">PII Filtering & Tor Anomaly Shield</span>
                  </div>
                  <span className="playbook-tag tag-pii">Privacy Engine</span>
                </div>
                <p className="playbook-card-desc">
                  Dispatches an anomalous transaction containing Tor credentials and values &gt;$1M. Inspect the returned transaction for PII email masking and risk flagging.
                </p>
                <div className="playbook-card-action">
                  <span className="playbook-cmd-preview">fidusgate-sandbox $ test-pii</span>
                  <button type="button" className="playbook-run-button" onClick={() => handlePlaybookClick('test-pii')} disabled={activePlaybook !== null || !canOperate} aria-label="Run test-pii">
                    <span>Trigger</span>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Playbook 2 */}
              <div
                className={`playbook-card ${activePlaybook === 'test-sandbox' ? 'playbook-card-active' : ''}`}
              >
                <div className="playbook-card-header">
                  <div className="playbook-title-block">
                    <div className="playbook-bullet bullet-sandbox"></div>
                    <span className="playbook-card-title">Sandbox Container Jail Lockout</span>
                  </div>
                  <span className="playbook-tag tag-sandbox">Sandbox checks</span>
                </div>
                <p className="playbook-card-desc">
                  Simulates critical remote curl scripts, directory overrides (rm -rf), and dynamic npm installs inside our Docker container sandbox and reports whether each request was allowed or denied.
                </p>
                <div className="playbook-card-action">
                  <span className="playbook-cmd-preview">fidusgate-sandbox $ test-sandbox</span>
                  <button type="button" className="playbook-run-button" onClick={() => handlePlaybookClick('test-sandbox')} disabled={activePlaybook !== null || !canOperate} aria-label="Run test-sandbox">
                    <span>Trigger</span>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Playbook 3 */}
              <div
                className={`playbook-card ${activePlaybook === 'test-receipt' ? 'playbook-card-active' : ''} ${authRole !== 'admin' ? 'playbook-card-locked' : ''}`}
                title={authRole !== 'admin' ? "Requires Administrator Authentication" : ""}
              >
                <div className="playbook-card-header">
                  <div className="playbook-title-block">
                    <div className="playbook-bullet bullet-receipt"></div>
                    <span className="playbook-card-title">Cryptographic Receipt Tamper Guard</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <span className="playbook-tag tag-receipt">Ed25519 Cryptography</span>
                    {authRole !== 'admin' && (
                      <span className="lock-badge">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </span>
                    )}
                  </div>
                </div>
                <p className="playbook-card-desc">
                  Runs signing and tamper checks through the gateway sandbox. The terminal reports the actual result.
                </p>
                <div className="playbook-card-action">
                  <span className="playbook-cmd-preview">fidusgate-sandbox $ test-receipt</span>
                  <button type="button" className="playbook-run-button" onClick={() => handlePlaybookClick('test-receipt')} disabled={activePlaybook !== null || authRole !== 'admin'} aria-label="Run test-receipt">
                    <span>Trigger</span>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Playbook 4 */}
              <div
                className={`playbook-card ${activePlaybook === 'test-scanner' ? 'playbook-card-active' : ''} ${authRole !== 'admin' ? 'playbook-card-locked' : ''}`}
                title={authRole !== 'admin' ? "Requires Administrator Authentication" : ""}
              >
                <div className="playbook-card-header">
                  <div className="playbook-title-block">
                    <div className="playbook-bullet bullet-scanner"></div>
                    <span className="playbook-card-title">CI/CD AST Pipeline Scan Gate</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <span className="playbook-tag tag-scanner">Static Threat Scan</span>
                    {authRole !== 'admin' && (
                      <span className="lock-badge">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </span>
                    )}
                  </div>
                </div>
                <p className="playbook-card-desc">
                  Runs the repository workflow scanner through the gateway sandbox and reports its findings.
                </p>
                <div className="playbook-card-action">
                  <span className="playbook-cmd-preview">fidusgate-sandbox $ test-scanner</span>
                  <button type="button" className="playbook-run-button" onClick={() => handlePlaybookClick('test-scanner')} disabled={activePlaybook !== null || authRole !== 'admin'} aria-label="Run test-scanner">
                    <span>Trigger</span>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Playbook 5 */}
              <div
                className={`playbook-card ${activePlaybook === 'test-cedar' ? 'playbook-card-active' : ''}`}
              >
                <div className="playbook-card-header">
                  <div className="playbook-title-block">
                    <div className="playbook-bullet bullet-pii" style={{ background: 'hsl(var(--primary))', boxShadow: '0 0 8px hsl(var(--primary))' }}></div>
                    <span className="playbook-card-title">Cedar Zero-Trust Rule Evaluator</span>
                  </div>
                  <span className="playbook-tag tag-pii" style={{ background: 'hsla(var(--primary), 0.06)', color: 'hsl(var(--primary))', borderColor: 'hsla(var(--primary), 0.15)' }}>Dynamic Cedar AST</span>
                </div>
                <p className="playbook-card-desc">
                  Queries the live access policy engine against simulated agent commands (overwriting files or host shell escapes), evaluating active rules in policy.cedar.
                </p>
                <div className="playbook-card-action">
                  <span className="playbook-cmd-preview">fidusgate-sandbox $ test-cedar</span>
                  <button type="button" className="playbook-run-button" onClick={() => handlePlaybookClick('test-cedar')} disabled={activePlaybook !== null || !canOperate} aria-label="Run test-cedar">
                    <span>Trigger</span>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Playbook 6 */}
              <div
                className={`playbook-card ${activePlaybook === 'test-alerts' ? 'playbook-card-active' : ''} ${authRole !== 'admin' ? 'playbook-card-locked' : ''}`}
                title={authRole !== 'admin' ? "Requires Administrator Authentication" : ""}
              >
                <div className="playbook-card-header">
                  <div className="playbook-title-block">
                    <div className="playbook-bullet bullet-sandbox" style={{ background: 'hsl(var(--info))', boxShadow: '0 0 8px hsl(var(--info))' }}></div>
                    <span className="playbook-card-title">Incident Alerting & Webhook Gateway</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <span className="playbook-tag tag-sandbox" style={{ background: 'hsla(var(--info), 0.06)', color: 'hsl(var(--info))', borderColor: 'hsla(var(--info), 0.15)' }}>Slack Webhooks</span>
                    {authRole !== 'admin' && (
                      <span className="lock-badge">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </span>
                    )}
                  </div>
                </div>
                <p className="playbook-card-desc">
                  Submits a policy-denied tool call that may send alerts to configured Slack or Teams webhooks. Check the destination separately to confirm delivery.
                </p>
                <div className="playbook-card-action">
                  <span className="playbook-cmd-preview">fidusgate-sandbox $ test-alerts</span>
                  <button type="button" className="playbook-run-button" onClick={() => handlePlaybookClick('test-alerts')} disabled={activePlaybook !== null || authRole !== 'admin'} aria-label="Run test-alerts">
                    <span>Trigger</span>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Playbook 7 */}
              <div
                className={`playbook-card ${activePlaybook === 'test-bypass' ? 'playbook-card-active' : ''}`}
              >
                <div className="playbook-card-header">
                  <div className="playbook-title-block">
                    <div className="playbook-bullet" style={{ background: 'hsl(var(--warning))', boxShadow: '0 0 8px hsl(var(--warning))', width: '8px', height: '8px', borderRadius: '50%' }}></div>
                    <span className="playbook-card-title">Indirect Bypasses & Composition</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <span className="playbook-tag" style={{ background: 'hsla(var(--warning), 0.06)', color: 'hsl(var(--warning))', borderColor: 'hsla(var(--warning), 0.15)', fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid' }}>Indirect Attack</span>
                  </div>
                </div>
                <p className="playbook-card-desc">
                  Simulates indirect command injection bypasses, allowed-binary network egress, and pipeline cross-tier composition attacks on package.json to test allowlist security boundaries.
                </p>
                <div className="playbook-card-action">
                  <span className="playbook-cmd-preview">fidusgate-sandbox $ test-bypass</span>
                  <button type="button" className="playbook-run-button" onClick={() => handlePlaybookClick('test-bypass')} disabled={activePlaybook !== null || !canOperate} aria-label="Run test-bypass">
                    <span>Trigger</span>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Architecture Guide — Collapsible Inline Section */}
        <section className={`glass-panel arch-inline-section ${showArchPanel ? 'expanded' : ''}`}>
          <div className="arch-inline-header" onClick={() => setShowArchPanel(!showArchPanel)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div className="arch-inline-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                </svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'hsl(var(--text-primary))' }}>
                  FidusGate Server Architecture Guide
                </h3>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: 'hsl(var(--text-secondary))' }}>
                  Explore each workspace component — its purpose, how it runs, and key capabilities.
                </p>
              </div>
            </div>
            <div className="arch-inline-toggle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points={showArchPanel ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
              </svg>
            </div>
          </div>

          {showArchPanel && (
            <div className="arch-inline-body">
              <div className="arch-components-list">
                <p style={{ fontSize: '0.78rem', color: 'hsl(var(--text-secondary))', marginBottom: '0.5rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Select a workspace component:
                </p>
                {[
                  {
                    id: 'gateway',
                    name: 'Secure Gateway Backend',
                    path: 'apps/secure-gateway',
                    package: '@fidusgate/secure-gateway',
                    icon: '🛡️',
                    value: 'The main zero-trust gatekeeper that intercepts tool calls, evaluates Cedar policies, redacts sensitive PII, and issues signed cryptographic receipts.',
                    howItRuns: 'Concurrently in development using "npm run dev" (Port 3001), or as a multi-stage Alpine Docker container in production.',
                    functions: 'Cedar policy evaluation matching, PII pattern masking, Prometheus telemetry metrics, development identity claims, and MS Teams / Slack webhook alerting.'
                  },
                  {
                    id: 'dashboard',
                    name: 'Operations Dashboard',
                    path: 'apps/admin-dashboard',
                    package: '@fidusgate/admin-dashboard',
                    icon: '🎨',
                    value: 'Provides real-time visibility, live transaction auditing, dynamic Cedar policy simulator dry-runs, and client-side Ed25519 receipt verification.',
                    howItRuns: 'Served via Vite at Port 3000 in development, compiled into optimized static HTML/CSS/JS bundles for production deployment.',
                    functions: 'OIDC token simulation, unified sandbox execution timeline, live policy simulator overrides, and SVG telemetry charts.'
                  },
                  {
                    id: 'daemon',
                    name: 'Rust Cedar Policy Daemon',
                    path: 'packages/cedar-daemon',
                    package: '@fidusgate/cedar-daemon',
                    icon: '🦀',
                    value: 'Executes microsecond-level Cedar authorization queries using a Rust-native tiny-http server and guarantees typological schema safety.',
                    howItRuns: 'Runs inside a lightweight Alpine Docker container on Port 50051. Secure Gateway forwards validation requests to it.',
                    functions: 'Schema validation (policy.cedarschema), high-speed context matching, and multi-tier permission decisions.'
                  },
                  {
                    id: 'crypto',
                    name: 'Cryptographic Utilities',
                    path: 'packages/crypto-utils',
                    package: '@fidusgate/crypto-utils',
                    icon: '🔑',
                    value: 'Provides the cryptographic engine for FidusGate, establishing zero-trust non-repudiation using Ed25519 public-key signature blocks.',
                    howItRuns: 'Imported as a monorepo library. Also includes an offline CLI utility for regulators to verify receipts.',
                    functions: 'Ed25519 key pair generation, payload signature signing, HSM/KMS provider routing (HashiCorp Vault Transit / Google Cloud KMS).'
                  },
                  {
                    id: 'database',
                    name: 'Core Database Client',
                    path: 'packages/database',
                    package: '@fidusgate/database',
                    icon: '💾',
                    value: 'Manages thread-safe persistence using either lightweight local JSON databases or a production-ready Postgres database structure.',
                    howItRuns: 'Operates in local flat file mode by default. Connects to Postgres using the DATABASE_URL variable.',
                    functions: 'JSON database operations, schema-guided Prisma clients, database seeding, and log truncation.'
                  },
                  {
                    id: 'types',
                    name: 'Unified Core Types',
                    path: 'packages/core-types',
                    package: '@fidusgate/core-types',
                    icon: '📝',
                    value: 'Enforces compile-time type boundaries across all applications and shared libraries, ensuring absolute data structure consistency.',
                    howItRuns: 'Imported globally as the foundation of the npm Workspaces dependency graph. Compiled using tsc.',
                    functions: 'Log log-entry schemas, Transaction types, AuditReceipt specifications, and SecurityFinding structures.'
                  },
                  {
                    id: 'sandbox',
                    name: 'Execution Sandbox',
                    path: 'scripts/*',
                    package: 'N/A',
                    icon: '🐳',
                    value: 'Wraps agent terminal execution within copy-on-write Docker containers (with optional gVisor microVMs), preventing host environment pollution.',
                    howItRuns: 'Triggered automatically via shell scripts (sandbox-execute.sh, ci-verify.sh) whenever scripts are spawned by the gateway.',
                    functions: 'Read-only base directory mounting, dynamic diff-patch generation, local CI/CD act emulation, and watcher synchronization.'
                  }
                ].map(comp => (
                  <div
                    key={comp.id}
                    className={`arch-component-card ${selectedArchComp === comp.id ? 'selected' : ''}`}
                    onClick={() => setSelectedArchComp(comp.id)}
                  >
                    <div className="arch-card-icon">{comp.icon}</div>
                    <div className="arch-card-meta">
                      <div className="arch-card-title">{comp.name}</div>
                      <div className="arch-card-sub">{comp.path}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="arch-detail-panel">
                {(() => {
                  const comp = [
                    {
                      id: 'gateway',
                      name: 'Secure Gateway Backend',
                      path: 'apps/secure-gateway',
                      package: '@fidusgate/secure-gateway',
                      icon: '🛡️',
                      value: 'The main zero-trust gatekeeper that intercepts tool calls, evaluates Cedar policies, redacts sensitive PII, and issues signed cryptographic receipts.',
                      howItRuns: 'Concurrently in development using "npm run dev" (Port 3001), or as a multi-stage Alpine Docker container in production.',
                      functions: 'Cedar policy evaluation matching, PII pattern masking, Prometheus telemetry metrics, development identity claims, and MS Teams / Slack webhook alerting.'
                    },
                    {
                      id: 'dashboard',
                      name: 'Operations Dashboard',
                      path: 'apps/admin-dashboard',
                      package: '@fidusgate/admin-dashboard',
                      icon: '🎨',
                      value: 'Provides real-time visibility, live transaction auditing, dynamic Cedar policy simulator dry-runs, and client-side Ed25519 receipt verification.',
                      howItRuns: 'Served via Vite at Port 3000 in development, compiled into optimized static HTML/CSS/JS bundles for production deployment.',
                      functions: 'OIDC token simulation, unified sandbox execution timeline, live policy simulator overrides, and SVG telemetry charts.'
                    },
                    {
                      id: 'daemon',
                      name: 'Rust Cedar Policy Daemon',
                      path: 'packages/cedar-daemon',
                      package: '@fidusgate/cedar-daemon',
                      icon: '🦀',
                      value: 'Executes microsecond-level Cedar authorization queries using a Rust-native tiny-http server and guarantees typological schema safety.',
                      howItRuns: 'Runs inside a lightweight Alpine Docker container on Port 50051. Secure Gateway forwards validation requests to it.',
                      functions: 'Schema validation (policy.cedarschema), high-speed context matching, and multi-tier permission decisions.'
                    },
                    {
                      id: 'crypto',
                      name: 'Cryptographic Utilities',
                      path: 'packages/crypto-utils',
                      package: '@fidusgate/crypto-utils',
                      icon: '🔑',
                      value: 'Provides the cryptographic engine for FidusGate, establishing zero-trust non-repudiation using Ed25519 public-key signature blocks.',
                      howItRuns: 'Imported as a monorepo library. Also includes an offline CLI utility for regulators to verify receipts.',
                      functions: 'Ed25519 key pair generation, payload signature signing, HSM/KMS provider routing (HashiCorp Vault Transit / Google Cloud KMS).'
                    },
                    {
                      id: 'database',
                      name: 'Core Database Client',
                      path: 'packages/database',
                      package: '@fidusgate/database',
                      icon: '💾',
                      value: 'Manages thread-safe persistence using either lightweight local JSON databases or a production-ready Postgres database structure.',
                      howItRuns: 'Operates in local flat file mode by default. Connects to Postgres using the DATABASE_URL variable.',
                      functions: 'JSON database operations, schema-guided Prisma clients, database seeding, and log truncation.'
                    },
                    {
                      id: 'types',
                      name: 'Unified Core Types',
                      path: 'packages/core-types',
                      package: '@fidusgate/core-types',
                      icon: '📝',
                      value: 'Enforces compile-time type boundaries across all applications and shared libraries, ensuring absolute data structure consistency.',
                      howItRuns: 'Imported globally as the foundation of the npm Workspaces dependency graph. Compiled using tsc.',
                      functions: 'Log log-entry schemas, Transaction types, AuditReceipt specifications, and SecurityFinding structures.'
                    },
                    {
                      id: 'sandbox',
                      name: 'Execution Sandbox',
                      path: 'scripts/*',
                      package: 'N/A',
                      icon: '🐳',
                      value: 'Wraps agent terminal execution within copy-on-write Docker containers (with optional gVisor microVMs), preventing host environment pollution.',
                      howItRuns: 'Triggered automatically via shell scripts (sandbox-execute.sh, ci-verify.sh) whenever scripts are spawned by the gateway.',
                      functions: 'Read-only base directory mounting, dynamic diff-patch generation, local CI/CD act emulation, and watcher synchronization.'
                    }
                  ].find(c => c.id === selectedArchComp);

                  if (!comp) {
                    return (
                      <div className="arch-placeholder-view">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/>
                          <line x1="12" y1="16" x2="12" y2="12"/>
                          <line x1="12" y1="8" x2="12.01" y2="8"/>
                        </svg>
                        <p>Select a component on the left to inspect its architecture.</p>
                      </div>
                    );
                  }

                  return (
                    <>
                      <div className="arch-detail-header">
                        <div className="arch-detail-icon">{comp.icon}</div>
                        <div className="arch-detail-title-block">
                          <h3>{comp.name}</h3>
                          <p>{comp.package !== 'N/A' ? `npm Workspace: ${comp.package}` : 'System Shell Integration'}</p>
                        </div>
                      </div>

                      <div className="arch-detail-section">
                        <span className="arch-section-lbl">Purpose & Security Value</span>
                        <p className="arch-section-val">{comp.value}</p>
                      </div>

                      <div className="arch-detail-section">
                        <span className="arch-section-lbl">How It Runs</span>
                        <p className="arch-section-val">{comp.howItRuns}</p>
                      </div>

                      <div className="arch-detail-section">
                        <span className="arch-section-lbl">Key Capabilities & Functions</span>
                        <p className="arch-section-code">{comp.functions}</p>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Right Column: Embedded Secure Console Shell */}
      <section className="glass-panel terminal-window" style={{ marginTop: 0 }}>
        <div className="terminal-header">
          <div className="terminal-dots">
            <span className="terminal-dot dot-red"></span>
            <span className="terminal-dot dot-yellow"></span>
            <span className="terminal-dot dot-green"></span>
          </div>
          <span className="terminal-title">Gateway sandbox terminal</span>
          <span className="terminal-badge">
            {activePlaybook ? 'REQUEST RUNNING' : 'AWAITING COMMAND'}
          </span>
        </div>

        <div className="console-box">
          {consoleLines.map((line, idx) => {
            let color = '#d1d5db';
            if (line.startsWith('❌') || line.includes('SECURITY ERROR') || line.includes('failed')) {
              color = 'hsl(var(--danger))';
            } else if (line.startsWith('fidusgate-sandbox $') || line.includes('fidusgate-sandbox $')) {
              color = '#ffaa00';
            } else if (line.startsWith('✅') || line.includes('Successfully') || line.includes('✓') || line.includes('ONLINE')) {
              color = 'hsl(var(--success))';
            } else if (line.startsWith('⚙️') || line.startsWith('🛡️') || line.startsWith('📡') || line.startsWith('🚀') || line.includes('[SANDBOX]')) {
              color = 'hsl(var(--info))';
            }
            return (
              <div className="console-line" key={idx} style={{ color }}>
                {line}
              </div>
            );
          })}
          <div ref={consoleEndRef} />
        </div>

        {latestAutofix && (
          <div className="console-autofix-banner" style={{
            background: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '6px',
            padding: '0.6rem 1rem',
            margin: '0.5rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: '#93c5fd'
          }}>
            <span>💡 Gateway-suggested command; review before applying: <code>{latestAutofix.replacement}</code></span>
            <button
              type="button"
              disabled={!canOperate || activePlaybook !== null}
              onClick={() => {
                executeSandboxCommand(latestAutofix.replacement);
                setLatestAutofix(null);
              }}
              style={{
                background: 'hsl(var(--primary))',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '0.25rem 0.75rem',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.72rem'
              }}
            >
              Apply Fix
            </button>
          </div>
        )}

        <form onSubmit={handleConsoleSubmit} className="console-input">
          <span className="console-prompt">fidusgate-sandbox $</span>
          <input
            type="text"
            className="console-field"
            aria-label="Sandbox command"
            placeholder={activePlaybook ? 'Running simulation...' : 'Type "help" to view allowed workspace playbooks...'}
            value={consoleInput}
            onChange={e => setConsoleInput(e.target.value)}
            disabled={activePlaybook !== null}
          />
        </form>

        {/* Simulated Seccomp System Call Auditing Terminal */}
        <div id="syscall-monitor" style={{ marginTop: '1rem', padding: '0.8rem', background: '#101c2d', borderRadius: '8px', border: '1px solid rgba(255, 107, 107, 0.15)', fontFamily: 'monospace' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#ff6b6b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#ff6b6b', animation: 'pulse 1.5s ease-in-out infinite' }} />
              Simulated Seccomp Syscall Monitor
            </span>
            <span style={{ fontSize: '0.62rem', color: 'hsl(var(--text-muted))' }}>simulated syscall-flow v1.0</span>
          </div>
          <div style={{ fontSize: '0.7rem', lineHeight: 1.7, color: '#aaa' }}>
            {syscalls.length === 0 ? (
              <p style={{ color: '#c9d1d9', margin: 0 }}>No simulated syscall events loaded. Run a command to inspect the gateway's simulated trace.</p>
            ) : (
              syscalls.map((sc, idx) => {
                const isBlocked = sc.status === 'blocked';
                return (
                  <div key={idx} style={{
                    color: isBlocked ? '#ff6b6b' : '#00ff66',
                    fontWeight: isBlocked ? 600 : 'normal',
                    background: isBlocked ? 'rgba(255,107,107,0.06)' : 'transparent',
                    padding: isBlocked ? '0.2rem 0.4rem' : '0',
                    borderRadius: isBlocked ? '4px' : '0',
                    marginTop: isBlocked ? '0.2rem' : '0'
                  }}>
                    [{sc.syscall}] <span style={{ color: '#666' }}>{sc.offset}</span> → {sc.args.join(' ')} <span style={{ color: isBlocked ? '#ff6b6b' : '#2ecc71', fontSize: '0.62rem', fontWeight: isBlocked ? 'bold' : 'normal', marginLeft: '0.4rem' }}>{isBlocked ? '⛔ BLOCKED' : 'ALLOWED'}</span>
                    {isBlocked && (
                      <div style={{ fontSize: '0.62rem', color: '#e74c3c', marginTop: '0.15rem', fontStyle: 'italic' }}>
                        ↳ seccomp filter: {sc.syscall === 'sys_ptrace' ? 'Jail injection and debugging trace attempt denied.' : sc.syscall === 'sys_setns' ? 'Namespace boundary crossing jailbreak attempt denied.' : sc.syscall === 'sys_unshare' ? 'Container namespace separation escape attempt denied.' : 'Outbound socket connection denied.'} 15-minute execution lockout triggered.
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
