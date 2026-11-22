import { useEffect, useRef, useState } from 'react';
import {
  DEMO_DECISIONS,
  DEMO_SCENARIOS,
  receiptJson,
  simulateScenario,
  tamperReceipt,
  verifyDemoReceipt,
  type DemoDecision,
} from './demo';
import { ReviewCase } from './demo/ReviewCase';
import './ReceiptConsole.css';

type View = 'case' | 'technical' | 'decisions' | 'playground' | 'verify' | 'about';
type IconName =
  | 'grid'
  | 'flask'
  | 'shield'
  | 'arrow'
  | 'search'
  | 'download'
  | 'code'
  | 'book'
  | 'reset';
function Icon({ name, size = 19 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, string> = {
    grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    flask: 'M9 3h6 M10 3v7L4 19q-1 2 2 2h12q3 0 2-2l-6-9V3 M7 15h10',
    shield: 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z M8 12l3 3 5-6',
    arrow: 'M5 12h14 M14 7l5 5-5 5',
    search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    download: 'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',
    code: 'm8 6-6 6 6 6 M16 6l6 6-6 6 M14 3l-4 18',
    book: 'M4 3h13a3 3 0 0 1 3 3v15H6a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2 M3 17h17 M8 7h7 M8 11h5',
    reset: 'M3 10a9 9 0 1 1 2 9 M3 3v7h7',
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
function Badge({ decision }: { decision: 'allow' | 'deny' }) {
  return (
    <span className={`decision-badge ${decision}`}>
      <span aria-hidden="true">{decision === 'allow' ? '✓' : '⊘'}</span>{' '}
      {decision === 'allow' ? 'Allowed' : 'Denied'}
    </span>
  );
}
function download(value: string, filename: string) {
  const url = URL.createObjectURL(new Blob([value], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
const nav: { id: View; title: string; icon: IconName }[] = [
  { id: 'decisions', title: 'Decisions', icon: 'grid' },
  { id: 'playground', title: 'Policy playground', icon: 'flask' },
  { id: 'verify', title: 'Receipt verifier', icon: 'shield' },
];
function readView(): View | undefined {
  const slug = window.location.hash.replace(/^#\/?/, '');
  if (slug === '' || slug === 'case') return 'case';
  if (slug === 'technical' || slug === 'decisions' || slug === 'verify' ||
      slug === 'playground' || slug === 'about') return slug;
  return undefined;
}

export default function ReceiptConsole() {
  const [resetCount, setResetCount] = useState(0);
  const [view, setView] = useState<View>(() => readView() ?? 'case');
  const caseRef = useRef<HTMLElement>(null);
  const guideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const sync = () => {
      const next = readView();
      if (next) setView(next);
    };
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);
  const mainRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const previousView = useRef(view);
  const [selectionRequest, setSelectionRequest] = useState(0);
  useEffect(() => {
    if (previousView.current !== view) {
      const target = view === 'case' ? caseRef : view === 'technical' ? guideRef : mainRef;
      target.current?.focus();
    }
    previousView.current = view;
  }, [view]);
  useEffect(() => {
    if (selectionRequest > 0 && window.matchMedia?.('(max-width: 1000px)').matches) {
      detailRef.current?.focus();
    }
  }, [selectionRequest]);
  const [decisions, setDecisions] = useState(DEMO_DECISIONS);
  const [selected, setSelected] = useState<DemoDecision>(DEMO_DECISIONS[0]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [scenario, setScenario] = useState(DEMO_SCENARIOS[0].id);
  const [result, setResult] = useState<DemoDecision | null>(null);
  const [input, setInput] = useState('');
  const [verification, setVerification] = useState<Awaited<
    ReturnType<typeof verifyDemoReceipt>
  > | null>(null);
  const [verifying, setVerifying] = useState(false);
  const verificationVersion = useRef(0);
  const [notice, setNotice] = useState('');
  const title = view === 'about' ? 'About this demo' : nav.find((item) => item.id === view)?.title;
  const filtered = decisions.filter(
    (item) =>
      (filter === 'all' || item.decision === filter) &&
      `${item.id} ${item.tool} ${item.agentName} ${item.principal} ${item.resource}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const denied = decisions.filter((item) => item.decision === 'deny').length;
  function navigate(next: View) {
    if (readView() !== next) window.history.pushState(null, '', '#/' + next);
    setView(next);
    setNotice('');
    window.scrollTo({ top: 0 });
  }
  function editReceipt(value: string) {
    verificationVersion.current += 1;
    setInput(value);
    setVerification(null);
    setVerifying(false);
  }
  function inspectReceipt(item: DemoDecision) {
    setSelected(item);
    editReceipt(receiptJson(item));
    navigate('verify');
  }
  async function verify() {
    const version = ++verificationVersion.current;
    setVerifying(true);
    setVerification(null);
    const outcome = await verifyDemoReceipt(input);
    if (version === verificationVersion.current) {
      setVerification(outcome);
      setVerifying(false);
    }
  }
  function reset() {
    setResetCount((count) => count + 1);
    setDecisions(DEMO_DECISIONS);
    setSelected(DEMO_DECISIONS[0]);
    setQuery('');
    setFilter('all');
    setResult(null);
    editReceipt('');
    setNotice('Demo reset. All sample decisions restored.');
  }
  return (
    <>
      {(view === 'case' || view === 'technical') && (
        <header className="study-header">
          <a className="study-brand" href="#/case"><Icon name="shield" size={26} />FidusGate</a>
          <nav aria-label="Case navigation">
            <a href="#/case" aria-current={view === 'case' ? 'page' : undefined}>Business case</a>
            <a href="#/technical" aria-current={view === 'technical' ? 'page' : undefined}>Technical guide</a>
          </nav>
        </header>
      )}
      <main className="study-main" ref={caseRef} tabIndex={-1} hidden={view !== 'case'}>
        <header className="study-intro">
          <div className="study-kicker">Platform security · Investment decision</div>
          <h1>Should every tool decision carry a signed receipt?</h1>
          <p>A coding agent asked to edit the file that governs its permissions. The gateway denied the request. Decide whether the security team should fund a receipt pilot or keep using decision logs for change reviews.</p>
        </header>
        <ReviewCase key={resetCount} record={DEMO_DECISIONS[0]} onVerify={inspectReceipt} />
        <a className="study-guide-link" href="#/technical">Explore the technical guide</a>
      </main>
      {view === 'technical' && (
        <main className="study-main study-guide" ref={guideRef} tabIndex={-1}>
          <div className="study-kicker">FidusGate · Technical guide</div>
          <h1>Inspect the evidence</h1>
          <p>Use the browser tools to examine the case behind FG-1048. Each example uses synthetic records and a public demo key. No tool calls execute here.</p>
          <ol>
            <li><a href="#/decisions">Decision log</a><p>Inspect actors, resources and recorded reasons across the sample workspace.</p></li>
            <li><button onClick={() => inspectReceipt(DEMO_DECISIONS[0])}>Check the FG-1048 receipt</button><p>Verify its Ed25519 signature, then compare it with an edited payload.</p></li>
            <li><a href="#/playground">Policy playground</a><p>Replay a recorded scenario and inspect the resulting entry in the log.</p></li>
          </ol>
          <a href="https://github.com/SafetyMP/FidusGate/blob/main/docs/getting-started.md">Run the gateway-connected console locally</a>
        </main>
      )}
      {view !== 'case' && view !== 'technical' && (
    <div className="fg-app">
      <a
        className="skip-link"
        href="#workspace"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to workspace
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            navigate('case');
          }}
        >
          <span className="brand-mark">
            <Icon name="shield" size={24} />
          </span>
          FidusGate<span className="brand-dot">.</span>
        </a>
        <div className="technical-return"><a href="#/case">Business case</a><a href="#/technical">Technical guide</a></div>
        <div className="workspace-switch">
          <span className="workspace-avatar">F</span>
          <div>
            <strong>Demo workspace</strong>
            <span>Explore with sample data</span>
          </div>
          <span className="workspace-chevron">⌄</span>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {nav.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
              aria-current={view === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon} />
              {item.title}
              {item.id === 'decisions' && <span className="nav-count">{decisions.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="tiny-label">A RECEIPT FOR EVERY DECISION</span>
            <p>Understand what your agent requested. See why it was allowed or denied.</p>
            <button onClick={() => navigate('about')}>
              How FidusGate works <Icon name="arrow" size={15} />
            </button>
          </div>
          <a className="nav-item source-link" href="https://github.com/SafetyMP/FidusGate">
            <Icon name="code" /> View source <span>↗</span>
          </a>
          <div className="sidebar-footer">
            <span className="avatar">D</span>
            <div>
              <strong>Demo visitor</strong>
              <span>No account needed</span>
            </div>
            <span className="visitor-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-pill">
              <span /> Interactive demo
            </span>
            <button
              className="icon-button"
              aria-label="Reset demo"
              title="Reset demo"
              onClick={reset}
            >
              <Icon name="reset" size={17} />
            </button>
          </div>
        </header>
        <main ref={mainRef} id="workspace" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">MCP TOOL-CALL RECEIPTS</div>
              <h1>
                {view === 'decisions'
                  ? 'Decision log'
                  : view === 'playground'
                    ? 'Explore the boundary.'
                    : view === 'verify'
                      ? 'Check the signature. Inspect the detail.'
                      : 'A clearer view of agent activity.'}
              </h1>
              <p>
                {view === 'decisions'
                  ? 'Search recorded requests, inspect the reason for a decision and verify its receipt.'
                  : view === 'playground'
                    ? 'Try a sample request and understand why it would be allowed or denied.'
                    : view === 'verify'
                      ? 'Check that a receipt’s payload matches its Ed25519 signature.'
                      : 'FidusGate helps people inspect, simulate, and verify MCP tool-call decisions.'}
              </p>
            </div>

          </div>
          <div className="demo-banner">
            <span className="banner-icon">i</span>
            <p>
              <strong>Browser demo.</strong> Synthetic decisions, public demo keys. No
              agent is connected and no tools run.
            </p>
            <button onClick={() => navigate('about')}>
              Demo details <span aria-hidden="true">↗</span>
            </button>
          </div>
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          {view === 'decisions' && (
            <>
              <button className="secondary-button scenario-shortcut" onClick={() => navigate('playground')}>
                <Icon name="flask" size={17} /> Try a scenario
              </button>
              <section className="metrics" aria-label="Sample decision summary">
                <div>
                  <span>Total decisions</span>
                  <strong>
                    {decisions.length}
                    <small>sample records</small>
                  </strong>
                </div>
                <div>
                  <span>
                    <i className="metric-dot green" /> Allowed
                  </span>
                  <strong>
                    {decisions.length - denied}
                    <small>within sample policy</small>
                  </strong>
                </div>
                <div>
                  <span>
                    <i className="metric-dot orange" /> Denied
                  </span>
                  <strong>
                    {denied}
                    <small>boundary held in scenario</small>
                  </strong>
                </div>
                <div className="receipt-metric">
                  <span>
                    <Icon name="shield" size={17} /> Signed receipts
                  </span>
                  <strong>
                    {decisions.length}
                    <small>ready to inspect</small>
                  </strong>
                </div>
              </section>
              <section className="decision-workspace">
                <div className="decision-list">
                  <div className="section-heading">
                    <h2>
                      Decision log <span>{decisions.length}</span>
                    </h2>
                    <span className="subtle">Sample session</span>
                  </div>
                  <div className="list-controls">
                    <label className="search-field">
                      <Icon name="search" size={16} />
                      <input
                        aria-label="Search decisions"
                        placeholder="Search tools, agents, or resources…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Filter decisions"
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                    >
                      <option value="all">All decisions</option>
                      <option value="allow">Allowed</option>
                      <option value="deny">Denied</option>
                    </select>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Tool / resource</th>
                          <th>Agent</th>
                          <th>Decision</th>
                          <th>Recorded UTC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((item) => (
                          <tr
                            key={item.id}
                            className={selected.id === item.id ? 'selected-row' : ''}
                          >
                            <td>
                              <button
                                className="row-select"
                                aria-label={`Inspect ${item.tool} ${item.id}`}
                                aria-pressed={selected.id === item.id}
                                onClick={() => {
                                  setSelected(item);
                                  setSelectionRequest((current) => current + 1);
                                }}
                              >
                                <span className={`tool-icon ${item.decision}`}>
                                  <Icon
                                    name={item.tool === 'execute_command' ? 'code' : 'book'}
                                    size={16}
                                  />
                                </span>
                                <span>
                                  <strong>{item.tool}</strong>
                                  {item.replay && (
                                    <span className="replay-tag">Recorded replay</span>
                                  )}
                                  <code title={item.resource}>{item.resource}</code>
                                </span>
                              </button>
                            </td>
                            <td>
                              <span className="agent-name">{item.agentName}</span>
                            </td>
                            <td>
                              <Badge decision={item.decision} />
                            </td>
                            <td className="time-cell">{item.timestamp.slice(11, 19)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {filtered.length === 0 && (
                    <div className="empty-state">
                      <Icon name="search" size={28} />
                      <h3>No matching decisions</h3>
                      <p>Try a tool name, agent, or resource.</p>
                      <button
                        className="secondary-button"
                        onClick={() => {
                          setQuery('');
                          setFilter('all');
                        }}
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
                  <div className="list-footer">
                    <span>
                      Showing {filtered.length} of {decisions.length} decisions
                    </span>
                    <span>Times in UTC · synthetic session</span>
                  </div>
                </div>
                <aside
                  ref={detailRef}
                  tabIndex={-1}
                  className="decision-detail"
                  aria-label="Selected decision"
                >
                  <div className="detail-heading">
                    <span className="eyebrow">DECISION DETAIL</span>
                    <Badge decision={selected.decision} />
                  </div>
                  <h2>{selected.tool}</h2>
                  <code className="detail-id">{selected.id}</code>
                  {selected.replay && (
                    <span className="replay-tag">
                      Recorded scenario replay · original timestamp
                    </span>
                  )}
                  <div className={`reason-box ${selected.decision}`}>
                    <strong>
                      {selected.decision === 'deny'
                        ? 'Why was this denied?'
                        : 'Why was this allowed?'}
                    </strong>
                    <p>{selected.reason}</p>
                  </div>
                  <dl className="detail-fields">
                    <div>
                      <dt>Agent</dt>
                      <dd>
                        {selected.agentName}
                        <code>{selected.principal}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Resource</dt>
                      <dd>
                        <code>{selected.resource}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Policy rule</dt>
                      <dd>
                        {selected.ruleLabel}
                        <code>{selected.ruleId}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Recorded</dt>
                      <dd>{selected.timestamp.replace('T', ' ').replace('Z', ' UTC')}</dd>
                    </div>
                  </dl>
                  <div className="next-step">
                    <span className="eyebrow">WHAT TO DO NEXT</span>
                    <p>{selected.nextStep}</p>
                  </div>
                  <button
                    className="primary-button full-width"
                    onClick={() => inspectReceipt(selected)}
                  >
                    <Icon name="shield" size={17} /> Verify this receipt{' '}
                    <Icon name="arrow" size={16} />
                  </button>
                  <button
                    className="text-button full-width"
                    onClick={() => download(receiptJson(selected), `${selected.id}.json`)}
                  >
                    <Icon name="download" size={16} /> Download receipt
                  </button>
                  <details className="raw-receipt">
                    <summary>View signed payload</summary>
                    <pre>{receiptJson(selected)}</pre>
                  </details>
                </aside>
              </section>
              <div className="bottom-hint">
                <Icon name="shield" size={16} />
                <span>
                  A decision explains the boundary. A signature lets you check that the receipt has
                  not changed.
                </span>
              </div>
            </>
          )}
          {view === 'playground' && (
            <section className="playground-grid">
              <div className="surface scenario-panel">
                <div className="section-heading">
                  <h2>Choose a request</h2>
                  <span className="step-label">01 / EXPLORE</span>
                </div>
                <p className="panel-description">
                  Start with a common agent action. Each example has a fixed, inspectable outcome.
                </p>
                <div className="scenario-options">
                  {DEMO_SCENARIOS.map((item) => (
                    <label
                      key={item.id}
                      className={`scenario-option ${scenario === item.id ? 'chosen' : ''}`}
                    >
                      <input
                        type="radio"
                        name="scenario"
                        value={item.id}
                        checked={scenario === item.id}
                        onChange={() => {
                          setScenario(item.id);
                          setResult(null);
                        }}
                      />
                      <span>
                        <strong>{item.title}</strong>
                        <span>{item.description}</span>
                        <code>
                          {item.tool} · {item.resource}
                        </code>
                      </span>
                    </label>
                  ))}
                </div>
                <button
                  className="primary-button"
                  onClick={() => {
                    const next = simulateScenario(scenario);
                    setResult(next);
                    setDecisions((current) => [next, ...current]);
                    setSelected(next);
                  }}
                >
                  <Icon name="flask" size={17} /> Run sample scenario{' '}
                  <Icon name="arrow" size={16} />
                </button>
                <p className="fine-print">
                  Replays a pre-signed fixture. It does not evaluate Cedar or execute the request.
                </p>
              </div>
              <div className="surface scenario-result">
                <div className="section-heading">
                  <h2>Understand the outcome</h2>
                  <span className="step-label">02 / INSPECT</span>
                </div>
                {result ? (
                  <>
                    <div className={`outcome-mark ${result.decision}`}>
                      <Icon name="shield" size={34} />
                    </div>
                    <span className="eyebrow">Recorded scenario replay</span>
                    <br />
                    <Badge decision={result.decision} />
                    <h3>{result.ruleLabel}</h3>
                    <p>{result.reason}</p>
                    <div className="next-step">
                      <span className="eyebrow">NEXT STEP</span>
                      <p>{result.nextStep}</p>
                    </div>
                    <button className="primary-button" onClick={() => inspectReceipt(result)}>
                      Verify sample receipt <Icon name="arrow" size={16} />
                    </button>
                    <button className="text-button" onClick={() => navigate('decisions')}>
                      Find it in the decision log
                    </button>
                    <p className="fine-print">
                      The original signed timestamp is preserved when the fixture is replayed.
                    </p>
                  </>
                ) : (
                  <div className="outcome-empty">
                    <div className="outcome-mark">
                      <Icon name="flask" size={34} />
                    </div>
                    <h3>What happens at the gate?</h3>
                    <p>
                      Run a scenario to see its decision, the reason behind it, and a signed sample
                      receipt.
                    </p>
                    <div className="flow-labels">
                      <span>Request</span>
                      <Icon name="arrow" size={16} />
                      <span>Decision</span>
                      <Icon name="arrow" size={16} />
                      <span>Receipt</span>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
          {view === 'verify' && (
            <section className="verify-grid">
              <div className="surface verifier-input">
                <div className="section-heading">
                  <h2>Receipt JSON</h2>
                  <button
                    className="text-button"
                    onClick={() => editReceipt(receiptJson(selected))}
                  >
                    Load selected sample
                  </button>
                </div>
                <label className="input-label" htmlFor="receipt-json">
                  Paste a signed FidusGate receipt
                </label>
                <textarea
                  id="receipt-json"
                  value={input}
                  onChange={(event) => editReceipt(event.target.value)}
                  spellCheck={false}
                  placeholder={'{\n  "payload": { … },\n  "signature": { … }\n}'}
                />
                <div className="verify-actions">
                  <button
                    className="primary-button"
                    onClick={verify}
                    disabled={!input.trim() || verifying}
                  >
                    <Icon name="shield" size={17} />
                    {verifying ? 'Checking signature…' : 'Verify signature'}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => editReceipt(tamperReceipt(receiptJson(selected)))}
                  >
                    Try a tampered sample
                  </button>
                </div>
                <p className="fine-print">
                  Verification runs in your browser. Receipt contents are not uploaded.
                </p>
              </div>
              <div className="surface verification-explainer">
                <div className="section-heading">
                  <h2>Verification result</h2>
                </div>
                <div role="status" aria-live="polite">
                  {verification ? (
                    <div className={`verification-result ${verification.status}`}>
                      <Icon name="shield" size={30} />
                      <h3>
                        {verification.status === 'valid'
                          ? 'Signature matches'
                          : verification.status === 'invalid'
                            ? 'Signature does not match'
                            : verification.status === 'unsupported'
                              ? 'Verification unavailable'
                              : 'Unable to read receipt'}
                      </h3>
                      <p>{verification.message}</p>
                    </div>
                  ) : (
                    <div className="verification-waiting">
                      <Icon name="shield" size={32} />
                      <h3>Ready when you are</h3>
                      <p>Load a sample or paste a receipt, then check its signature.</p>
                    </div>
                  )}
                </div>
                <div className="verification-scope">
                  <h3>What this check tells you</h3>
                  <p>
                    A valid signature shows that the payload matches a signature from the demo key.
                  </p>
                  <h3>What it doesn’t establish</h3>
                  <p>
                    It does not prove the issuer is trustworthy, the policy is correct, or a tool
                    actually ran. These public keys are for demonstration only.
                  </p>
                </div>
              </div>
            </section>
          )}
          {view === 'about' && (
            <section className="surface about-panel">
              <span className="eyebrow">THE OPERATOR LOOP</span>
              <h2>From “what happened?” to a receipt you can inspect.</h2>
              <div className="about-steps">
                <div>
                  <span>01</span>
                  <h3>Inspect the decision</h3>
                  <p>
                    See the requested tool, agent, resource, and reason together. Find a denied
                    request without piecing together unrelated dashboards.
                  </p>
                </div>
                <div>
                  <span>02</span>
                  <h3>Explore the policy</h3>
                  <p>
                    Replay named allow and deny scenarios. This static demo uses fixed examples; the
                    gateway-connected application uses Cedar.
                  </p>
                </div>
                <div>
                  <span>03</span>
                  <h3>Verify the receipt</h3>
                  <p>
                    Check a real Ed25519 signature locally, then alter a sample to see why a changed
                    payload no longer verifies.
                  </p>
                </div>
              </div>
              <div className="about-boundary">
                <h3>Built for exploration</h3>
                <p>
                  This GitHub Pages demo uses synthetic records and a public demo key. It has no
                  gateway, identity provider, live agent, persistent datastore, or policy
                  enforcement. Reloading or resetting restores the samples. FidusGate is a reference
                  implementation, not a production-hardened security product.
                </p>
              </div>
              <a className="primary-button" href="https://github.com/SafetyMP/FidusGate#readme">
                Explore the project <Icon name="arrow" size={16} />
              </a>
            </section>
          )}
          <footer className="page-footer">
            <span>
              FidusGate <span className="footer-separator">/</span> Clarity at the boundary.
            </span>
            <span>Reference implementation · Demo data</span>
          </footer>
        </main>
      </div>
    </div>
      )}
    </>
  );
}
