import { type ReactNode, useEffect, useRef } from 'react';

export type ConnectedView =
  | 'decisions'
  | 'policy'
  | 'verify'
  | 'ledger'
  | 'compliance'
  | 'forensics'
  | 'sandbox';

interface ConnectedShellProps {
  view: ConnectedView;
  onNavigate: (view: ConnectedView) => void;
  connection: 'checking' | 'connected' | 'unavailable';
  authRole: 'developer' | 'admin' | 'auditor' | 'unauthenticated';
  authEmail: string;
  onRefresh: () => void;
  onTour: () => void;
  onReset: () => void;
  gatewayNotice?: string;
  children: ReactNode;
  session: ReactNode;
}

const sections: Record<ConnectedView, { label: string; title: string; description: string }> = {
  decisions: {
    label: 'Decisions',
    title: 'Every decision. A clear reason.',
    description: 'Inspect gateway receipts, understand policy outcomes, and follow the evidence.',
  },
  policy: {
    label: 'Policy playground',
    title: 'Understand the boundary.',
    description: 'Inspect the active policy and test how a request is evaluated by your gateway.',
  },
  verify: {
    label: 'Receipt verifier',
    title: 'Check the signature. Inspect the detail.',
    description: 'Verify a signed receipt against your gateway’s current verification keys.',
  },
  ledger: {
    label: 'Transactions',
    title: 'Follow the request through.',
    description: 'Explore gateway transactions, request activity, and recorded outcomes.',
  },
  compliance: {
    label: 'Governance',
    title: 'Keep controls in view.',
    description: 'Manage gateway controls, review findings, and inspect available evidence.',
  },
  forensics: {
    label: 'Forensics',
    title: 'Reconstruct what happened.',
    description: 'Follow correlated activity and examine the evidence behind an incident.',
  },
  sandbox: {
    label: 'Sandbox',
    title: 'Explore a controlled run.',
    description: 'Exercise gateway workflows and inspect the resulting traces and receipts.',
  },
};

const primaryViews: ConnectedView[] = ['decisions', 'policy', 'verify'];
const secondaryViews: ConnectedView[] = ['ledger', 'compliance', 'forensics', 'sandbox'];

function SectionIcon({ view }: { view: ConnectedView }) {
  const paths: Record<ConnectedView, ReactNode> = {
    decisions: (
      <>
        <path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5" />
      </>
    ),
    policy: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <path d="M8 3v6M16 9v6M10 15v6" />
      </>
    ),
    verify: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    ledger: (
      <>
        <path d="M4 5h16v15H4zM4 10h16M10 10v10M4 15h16" />
      </>
    ),
    compliance: (
      <>
        <path d="m3 8 9-5 9 5H3ZM5 10v8M10 10v8M14 10v8M19 10v8M3 21h18" />
      </>
    ),
    forensics: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6M7 10h6M10 7v6" />
      </>
    ),
    sandbox: (
      <>
        <path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9M8 5l9 5" />
      </>
    ),
  };
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[view]}
    </svg>
  );
}

export function ConnectedShell({
  view,
  onNavigate,
  connection,
  authRole,
  authEmail,
  onRefresh,
  onTour,
  onReset,
  gatewayNotice,
  children,
  session,
}: ConnectedShellProps) {
  const mainRef = useRef<HTMLElement>(null);
  const previousView = useRef(view);
  useEffect(() => {
    if (previousView.current !== view) {
      mainRef.current?.focus();
      previousView.current = view;
    }
  }, [view]);

  const section = sections[view];
  const connectionLabel =
    connection === 'connected'
      ? 'Gateway reachable'
      : connection === 'unavailable'
        ? 'Gateway unavailable'
        : 'Checking gateway';
  const renderNavigation = (views: ConnectedView[]) =>
    views.map((item) => (
      <button
        key={item}
        type="button"
        className={`cc-nav-item${view === item ? ' is-active' : ''}`}
        aria-current={view === item ? 'page' : undefined}
        onClick={() => onNavigate(item)}
      >
        <SectionIcon view={item} />
        <span>{sections[item].label}</span>
      </button>
    ));

  return (
    <div className="connected-console">
      <a className="cc-skip-link" href="#connected-main">
        Skip to workspace
      </a>
      <aside className="cc-sidebar">
        <div className="cc-brand" id="brand-header">
          <span className="cc-brand-mark" aria-hidden="true">
            f.
          </span>
          <span>
            FidusGate<small>GATEWAY CONSOLE</small>
          </span>
        </div>
        <div className="cc-workspace-label">
          <span className="cc-workspace-avatar" aria-hidden="true">
            FG
          </span>
          <div>
            Connected workspace<small>Gateway reference implementation</small>
          </div>
        </div>
        <nav aria-label="Console sections">
          <p className="cc-nav-label">WORKSPACE</p>
          {renderNavigation(primaryViews)}
          <p className="cc-nav-label cc-nav-label-secondary">OPERATIONS</p>
          {renderNavigation(secondaryViews)}
        </nav>
        <div className="cc-sidebar-footer">
          <p>Evidence for every boundary.</p>
          <button type="button" className="cc-sidebar-help" onClick={onTour}>
            Take a guided tour <span aria-hidden="true">↗</span>
          </button>
          <div className="cc-identity">
            <span className="cc-identity-avatar" aria-hidden="true">
              {authRole === 'unauthenticated' ? '—' : authRole.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>
                {authRole === 'unauthenticated' ? 'Signed out' : authEmail || 'Gateway session'}
              </strong>
              <small>
                {authRole === 'unauthenticated'
                  ? 'Sign in to access the gateway'
                  : `${authRole} session`}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <div className="cc-content">
        <header className="cc-topbar">
          <div className="cc-breadcrumb">
            Workspace <span aria-hidden="true">/</span> <strong>{section.label}</strong>
          </div>
          <div className="cc-topbar-actions">
            <span className={`cc-connection ${connection}`} role="status">
              <span aria-hidden="true" />
              {connectionLabel}
            </span>
            <button type="button" className="cc-secondary-button cc-mobile-guide" onClick={onTour}>
              Guide
            </button>
            <button type="button" className="cc-secondary-button" onClick={onRefresh}>
              Refresh
            </button>
          </div>
        </header>
        <main id="connected-main" className="cc-main" ref={mainRef} tabIndex={-1}>
          <div className="cc-scope-banner">
            <span className="cc-scope-icon" aria-hidden="true">
              ↔
            </span>
            <div>
              <strong>Gateway-connected console.</strong> This console uses gateway data and your
              current session. The public demo uses sample data.
              <small>
                Reference implementation. Gateway reachability does not establish production
                readiness.
              </small>
              {gatewayNotice && (
                <p className="cc-gateway-notice" role="status">
                  {gatewayNotice}
                </p>
              )}
            </div>
          </div>
          <div className="cc-page-heading">
            <div>
              <p className="cc-eyebrow">{section.label}</p>
              <h1>{section.title}</h1>
              <p>{section.description}</p>
            </div>
            {authRole === 'admin' && (
              <button type="button" className="cc-text-button cc-reset-button" onClick={onReset}>
                Reset DB
              </button>
            )}
          </div>
          <section className="cc-session" aria-label="Gateway session">
            {session}
          </section>
          <div className="cc-workspace">{children}</div>
        </main>
      </div>
    </div>
  );
}

export default ConnectedShell;
