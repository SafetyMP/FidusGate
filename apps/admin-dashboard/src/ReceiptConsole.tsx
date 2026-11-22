import { useEffect, useRef, useState } from 'react';
import {
  DEMO_DECISIONS,
  receiptJson,
  tamperReceipt,
  verifyDemoReceipt,
  type VerificationResult,
} from './demo';
import { PilotWorksheet } from './demo/ReviewCase';
import './ReceiptConsole.css';

const repository = 'https://github.com/SafetyMP/FidusGate/blob/main/';
const archive = DEMO_DECISIONS.find((item) => item.id === 'FG-1048')!;
const neighbor = DEMO_DECISIONS.find((item) => item.id === 'FG-1047')!;
const archiveJson = receiptJson(archive);

const records = [
  {
    id: 'ticket',
    title: 'Ticket attachment',
    source: 'Change desk',
    receipt: tamperReceipt(archiveJson),
  },
  { id: 'archive', title: 'Gateway original', source: 'Decision archive', receipt: archiveJson },
  {
    id: 'neighbor',
    title: 'Adjacent request',
    source: 'Decision archive',
    receipt: receiptJson(neighbor),
  },
  { id: 'history', title: 'Policy file history', source: 'Repository export' },
] as const;

type RecordId = (typeof records)[number]['id'];
type Checks = Partial<Record<RecordId, VerificationResult>>;
type View = 'case' | 'technical' | 'pilot';
const snapshots = [
  { at: '2026-11-14T14:30:00Z', revision: 807, blob: '9fb23c1' },
  { at: '2026-11-14T14:38:00Z', revision: 808, blob: 'd9019fa' },
];
function currentView(): View {
  const slug = window.location.hash.replace(/^#\/?/, '');
  if (slug === 'pilot') return 'pilot';
  if (['technical', 'decisions', 'verify', 'playground', 'about'].includes(slug))
    return 'technical';
  return 'case';
}
function formatTime(value: string) {
  return value.slice(11, 19) + ' UTC';
}
function Reference() {
  return (
    <section className="reference">
      <p className="kicker">Technical reference</p>
      <h1>Follow the evidence to its source.</h1>
      <p>
        Four components explain what the browser can reproduce and where a live deployment would
        need independent evidence.
      </p>
      <dl>
        <dt>Gateway decision</dt>
        <dd>
          The connected gateway records tool, principal, resource and reason. Cedar authorization
          evaluates a request. The desk reads pre-recorded examples.{' '}
          <a href={repository + 'apps/secure-gateway'}>Gateway source</a> ·{' '}
          <a href="https://docs.cedarpolicy.com/auth/authorization.html">Cedar authorization</a>
        </dd>
        <dt>Signed receipt</dt>
        <dd>
          The browser checks the serialized payload with Ed25519 and the public fixture key. Custody
          of an operational issuer’s key needs independent verification.{' '}
          <a href={repository + 'apps/admin-dashboard/src/demo/index.ts'}>
            Verifier implementation
          </a>{' '}
          · <a href="https://www.rfc-editor.org/rfc/rfc8032">RFC 8032</a>
        </dd>
        <dt>Evidence records</dt>
        <dd>
          FG-1048 and FG-1047 come from signed synthetic fixtures. The ticket copy and repository
          snapshots are authored for this dispute. The repository export is unsigned and has no
          request correlation ID.{' '}
          <a href={repository + 'apps/admin-dashboard/src/demo/fixtures.ts'}>Signed fixtures</a>
        </dd>
        <dt>Connected console</dt>
        <dd>
          Operators can inspect their gateway’s ledger, policies and receipts in the separately
          configured console. <a href={repository + 'docs/getting-started.md'}>Run locally</a>
        </dd>
      </dl>
    </section>
  );
}
function findingList(attached: RecordId[], checks: Checks) {
  const findings: string[] = [];
  if (attached.includes('archive') && checks.archive?.status === 'valid') {
    findings.push('Gateway original · The signed sample records a denied write to policy.cedar.');
  }
  if (attached.includes('ticket') && checks.ticket?.status === 'invalid') {
    findings.push('Ticket attachment · Its claimed decision fails the demo-key signature check.');
  }
  if (
    attached.includes('archive') &&
    attached.includes('ticket') &&
    checks.archive?.status === 'valid' &&
    checks.ticket?.status === 'invalid'
  ) {
    findings.push(
      'Copy discrepancy · The ticket says allow and the archive says deny. They carry the same signature.',
    );
  }
  if (attached.includes('history')) {
    findings.push(
      'Repository export · The two revisions show different file contents across the request window. The export contains no link to a writer or request.',
    );
  }
  if (attached.includes('neighbor')) {
    findings.push(
      'Adjacent request · FG-1047 concerns a documentation read. Its permission decision cannot explain the policy write.',
    );
  }
  return findings;
}

function EvidenceDesk() {
  const [active, setActive] = useState<RecordId>('ticket');
  const [attached, setAttached] = useState<RecordId[]>(['ticket']);
  const [checks, setChecks] = useState<Checks>({});
  const [busy, setBusy] = useState<RecordId[]>([]);
  const [note, setNote] = useState('');
  const session = useRef(0);
  const selected = records.find((item) => item.id === active)!;
  const raw = 'receipt' in selected ? selected.receipt : undefined;
  const packet = raw ? (JSON.parse(raw) as typeof archive.receipt) : undefined;
  const findings = findingList(attached, checks);
  const missing = [
    ...(!attached.includes('archive') || checks.archive?.status !== 'valid'
      ? ['Obtain and verify the original gateway decision.']
      : []),
    ...(!attached.includes('history')
      ? ['Request the repository revisions bracketing the decision.']
      : []),
    'Obtain independent issuer-key custody evidence and a request-to-revision correlation record before attributing the write.',
  ];
  const handoff = {
    case: 'FG-1048',
    scope: 'Synthetic browser exercise. No live investigation.',
    evidence: records
      .filter((item) => attached.includes(item.id))
      .map((item) => ({
        source: item.source,
        name: item.title,
        ...('receipt' in item
          ? {
              receipt: JSON.parse(item.receipt),
              verification: checks[item.id]
                ? { status: checks[item.id]!.status, message: checks[item.id]!.message }
                : { status: 'unchecked' },
            }
          : { path: 'policy.cedar', snapshots, requestCorrelation: null }),
      })),
    findings,
    openRequests: missing,
    analystNote: note,
  };
  async function verify() {
    if (!raw) return;
    const id = active;
    const version = session.current;
    setBusy((items) => [...items, id]);
    const outcome = await verifyDemoReceipt(raw);
    if (session.current !== version) return;
    setChecks((old) => ({ ...old, [id]: outcome }));
    setBusy((items) => items.filter((item) => item !== id));
  }
  function restart() {
    session.current += 1;
    setBusy([]);
    setChecks({});
    setAttached(['ticket']);
    setActive('ticket');
    setNote('');
  }
  function toggle() {
    setAttached((old) =>
      old.includes(active) ? old.filter((id) => id !== active) : [...old, active],
    );
  }
  return (
    <section className="desk" aria-label="Investigation desk">
      <header className="case-head">
        <div>
          <p className="kicker">Change review / FG-1048</p>
          <h1>Reconcile a disputed policy write.</h1>
          <p>
            An engineer’s ticket says the coding agent could edit <code>policy.cedar</code>.
            Assemble a handoff that explains the gateway decision and whether the agent can be
            linked to a file change.
          </p>
        </div>
        <dl className="case-stamp">
          <dt>Request time</dt>
          <dd>14:32 UTC</dd>
          <dt>Environment</dt>
          <dd>Synthetic records</dd>
          <dt>Case owner</dt>
          <dd>Platform security</dd>
        </dl>
      </header>
      <div className="bench">
        <section className="sources" aria-labelledby="sources-title">
          <h2 id="sources-title">Source records</h2>
          {records.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={active === item.id}
              onClick={() => setActive(item.id)}
            >
              <span>{item.source}</span>
              <strong>{item.title}</strong>
              <small>{attached.includes(item.id) ? 'Attached to handoff' : 'Available'}</small>
            </button>
          ))}
        </section>
        <section className="exhibit" aria-labelledby="exhibit-title">
          <p className="kicker">{selected.source}</p>
          <h2 id="exhibit-title">{selected.title}</h2>
          {packet ? (
            <>
              <p className="record-caption">Submitted tool-call record</p>
              <dl className="fields">
                <dt>Issued</dt>
                <dd>{formatTime(packet.payload.issued_at)}</dd>
                <dt>Principal claim</dt>
                <dd>{packet.payload.issuer_id}</dd>
                <dt>Tool</dt>
                <dd>{packet.payload.tool_name}</dd>
                <dt>Resource</dt>
                <dd>{String(packet.payload.args?.path)}</dd>
                <dt>Decision claim</dt>
                <dd>
                  <b className={'verdict ' + packet.payload.decision}>{packet.payload.decision}</b>
                </dd>
                <dt>Signature</dt>
                <dd>{packet.signature.sig.slice(0, 18)}…</dd>
              </dl>
              <button className="action" disabled={busy.includes(active)} onClick={verify}>
                {busy.includes(active) ? 'Checking…' : 'Verify signature'}
              </button>
              {checks[active] && (
                <p className="check-result" role="status">
                  <strong>{checks[active]!.status.toUpperCase()}</strong> {checks[active]!.message}
                </p>
              )}
              {active === 'ticket' && (
                <details>
                  <summary>Compare the archive copy</summary>
                  <dl className="fields">
                    <dt>Ticket / archive</dt>
                    <dd>
                      {packet.payload.decision} / {archive.receipt.payload.decision}
                    </dd>
                    <dt>Issued at</dt>
                    <dd>
                      {packet.payload.issued_at === archive.receipt.payload.issued_at
                        ? 'Same timestamp'
                        : 'Different timestamps'}
                    </dd>
                    <dt>Signature bytes</dt>
                    <dd>
                      {packet.signature.sig === archive.receipt.signature.sig
                        ? 'Identical'
                        : 'Different'}
                    </dd>
                  </dl>
                  <p>Check each signature before relying on its decision.</p>
                </details>
              )}
              <details>
                <summary>Inspect submitted JSON</summary>
                <pre>{raw}</pre>
              </details>
            </>
          ) : (
            <>
              <p className="record-caption">Two snapshots of main / policy.cedar</p>
              <ol className="revision-line">
                <li>
                  <time>{formatTime(snapshots[0].at)}</time>
                  <strong>Revision 807</strong>
                  <code>Blob {snapshots[0].blob}</code>
                </li>
                <li>
                  <time>14:32:00 UTC</time>
                  <strong>FG-1048 requested</strong>
                  <span>Gateway timestamp</span>
                </li>
                <li>
                  <time>{formatTime(snapshots[1].at)}</time>
                  <strong>Revision 808</strong>
                  <code>Blob {snapshots[1].blob}</code>
                </li>
              </ol>
              <p className="record-caption">
                The synthetic export includes abbreviated file blob IDs. Its request-correlation
                field is empty.
              </p>
            </>
          )}
          <button className="outline" onClick={toggle}>
            {attached.includes(active) ? 'Detach from handoff' : 'Attach to handoff'}
          </button>
        </section>
        <aside className="handoff" aria-labelledby="handoff-title">
          <p className="kicker">Investigator’s working paper</p>
          <h2 id="handoff-title">Evidence handoff</h2>
          <p>
            {attached.length} of {records.length} records attached
          </p>
          <h3>Supported findings</h3>
          {findings.length ? (
            <ul>
              {findings.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p>
              Verify an attached receipt or attach the repository export to establish a finding.
            </p>
          )}
          <h3>Open evidence requests</h3>
          <ul>
            {missing.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <label htmlFor="analyst-note">Analyst note</label>
          <textarea
            id="analyst-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Context for the engineer reviewing this ticket"
          />
          <div className="handoff-actions">
            <a
              className="action"
              download="FG-1048-handoff.json"
              href={
                'data:application/json;charset=utf-8,' +
                encodeURIComponent(JSON.stringify(handoff, null, 2))
              }
            >
              Download handoff
            </a>
            <button className="text-link" onClick={restart}>
              Reset case
            </button>
          </div>
        </aside>
      </div>
      <footer className="case-foot">
        The handoff stays in this browser until downloaded. The fixture key is public. A matching
        signature proves integrity against that key. <a href="#/pilot">Evaluate a pilot</a>
      </footer>
    </section>
  );
}

export default function ReceiptConsole() {
  const [view, setView] = useState<View>(currentView);
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    const onHash = () => {
      setView(currentView());
      main.current?.focus();
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return (
    <>
      <a
        className="skip"
        href="#desk-main"
        onClick={(e) => {
          e.preventDefault();
          main.current?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="mast">
        <a href="#/case" className="brand">
          <span aria-hidden="true">◇</span> FidusGate
        </a>
        <nav aria-label="Main navigation">
          {(
            [
              ['case', 'Investigation desk'],
              ['pilot', 'Pilot economics'],
              ['technical', 'Technical reference'],
            ] as const
          ).map(([route, title]) => (
            <a key={route} href={'#/' + route} aria-current={route === view ? 'page' : undefined}>
              {title}
            </a>
          ))}
        </nav>
      </header>
      <main id="desk-main" ref={main} tabIndex={-1}>
        <div hidden={view !== 'case'}>
          <EvidenceDesk />
        </div>
        <div hidden={view !== 'pilot'}>
          <PilotWorksheet />
        </div>
        {view === 'technical' && <Reference />}
      </main>
    </>
  );
}
