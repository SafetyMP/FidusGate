import { useRef, useState } from 'react';
import { casePacket, snapshots, type Packet } from './caseRecords';
import { DEMO_DECISIONS, receiptJson, verifyDemoReceipt, type VerificationResult } from './index';

export type CaseDocument = Packet | 'neighbor' | 'history';
const documents: { id: CaseDocument; title: string; owner: string }[] = [
  { id: 'received', title: 'Ticket copy', owner: 'Engineer' },
  { id: 'original', title: 'Gateway original', owner: 'Platform security' },
  { id: 'neighbor', title: 'Adjacent request', owner: 'Platform security' },
  { id: 'history', title: 'File history', owner: 'Release engineer' },
];
function fixture(id: string) {
  const record = DEMO_DECISIONS.find((item) => item.id === id);
  if (!record) throw new Error('Missing case fixture ' + id);
  return record;
}
const archive = fixture('FG-1048');
const neighbor = fixture('FG-1047');
const envelopes = {
  received: casePacket(archive, 'received'),
  original: casePacket(archive, 'original'),
  neighbor: receiptJson(neighbor),
};
type Checks = Partial<Record<CaseDocument, VerificationResult>>;
type Step = 'ticket' | 'forwarded' | 'compared' | 'decision-note' | 'file-note';

function assess(attached: CaseDocument[], checks: Checks) {
  const has = (id: CaseDocument) => attached.includes(id);
  const checked = (id: CaseDocument, status: VerificationResult['status']) =>
    has(id) && checks[id]?.status === status;
  const findings: string[] = [];
  const requests: string[] = [];
  if (checked('received', 'invalid'))
    findings.push('The ticket copy fails the signature check against the public demo key.');
  if (checked('original', 'valid'))
    findings.push('The verified archive records a denial for the FG-1048 policy write.');
  if (checked('received', 'invalid') && checked('original', 'valid'))
    findings.push(
      'The ticket says allow and the archive says deny. Both carry the same signature.',
    );
  if (checked('neighbor', 'valid'))
    findings.push('FG-1047 verifies, but covers a separate documentation read.');
  if (has('history'))
    findings.push(
      'The file contents changed between revisions 807 and 808. The export leaves the writer unidentified.',
    );
  for (const doc of documents) {
    if (doc.id === 'history') continue;
    if (has(doc.id)) {
      const check = checks[doc.id];
      if (!check) requests.push('Verify the ' + doc.title.toLowerCase() + '.');
      else if (check.status === 'unsupported' || check.status === 'error')
        requests.push('Recheck the ' + doc.title.toLowerCase() + ' with a compatible verifier.');
      else if (check.status === 'invalid' && doc.id !== 'received')
        requests.push('Request an intact ' + doc.title.toLowerCase() + ' from platform security.');
    } else if (doc.id !== 'neighbor') requests.push('Attach the ' + doc.title.toLowerCase() + '.');
  }
  requests.push(
    has('history')
      ? 'Ask the repository owner for a record linking a writer and request to revision 808.'
      : 'Request the file history from release engineering.',
  );
  if (checked('original', 'valid'))
    requests.push(
      'Confirm issuer key ownership against a trusted inventory for an operational finding.',
    );
  return { findings, requests };
}

export function EvidenceDesk({
  active,
  onSelect,
  technicalHref,
  pilotHref,
}: {
  active: CaseDocument;
  onSelect: (id: CaseDocument) => void;
  technicalHref: string;
  pilotHref: string;
}) {
  const [step, setStep] = useState<Step>('ticket');
  const [checks, setChecks] = useState<Checks>({});
  const [busy, setBusy] = useState(false);
  const [includeNeighbor, setIncludeNeighbor] = useState(false);
  const epoch = useRef(0);
  const compared = step === 'compared' || step === 'decision-note' || step === 'file-note';
  const complete = step === 'decision-note' || step === 'file-note';
  const matched = checks.original?.status === 'valid';
  const attached: CaseDocument[] = ['received'];
  if (compared) attached.push('original');
  if (step === 'file-note') attached.push('history');
  if (includeNeighbor) attached.push('neighbor');
  const { findings, requests } = assess(attached, checks);
  const raw = active === 'history' ? null : envelopes[active];
  const receipt = raw ? (JSON.parse(raw) as typeof archive.receipt) : null;
  const handoff = {
    case: archive.id,
    scope: 'Synthetic release review with a public demo key',
    evidence: documents
      .filter((doc) => attached.includes(doc.id))
      .map((doc) => ({
        ...doc,
        ...(doc.id === 'history'
          ? { snapshots, requestCorrelation: null }
          : {
              receipt: JSON.parse(envelopes[doc.id]),
              verification: checks[doc.id]?.status ?? 'unchecked',
            }),
      })),
    findings,
    openRequests: requests,
  };
  async function compare() {
    if (!compared) onSelect('original');
    const generation = ++epoch.current;
    setBusy(true);
    const [received, original] = await Promise.all([
      verifyDemoReceipt(envelopes.received),
      verifyDemoReceipt(envelopes.original),
    ]);
    if (generation !== epoch.current) return;
    setChecks((old) => ({ ...old, received, original }));
    setBusy(false);
    setStep((current) => (current === 'ticket' || current === 'forwarded' ? 'compared' : current));
  }
  async function addNeighbor() {
    const generation = ++epoch.current;
    setBusy(true);
    const result = await verifyDemoReceipt(envelopes.neighbor);
    if (generation !== epoch.current) return;
    setChecks((old) => ({ ...old, neighbor: result }));
    setBusy(false);
    setIncludeNeighbor(true);
  }
  function restart() {
    ++epoch.current;
    setStep('ticket');
    setChecks({});
    setBusy(false);
    setIncludeNeighbor(false);
    onSelect('received');
  }
  function readHistory() {
    setStep('file-note');
    onSelect('history');
  }
  function resultText(result: VerificationResult | undefined) {
    if (result?.status === 'valid') return 'Signature matches the demo key';
    if (result?.status === 'invalid') return 'Signature does not match';
    return 'Signature check unavailable';
  }
  return (
    <section
      id="case-investigation"
      className="investigation case-desk guided-review"
      tabIndex={-1}
      aria-labelledby="desk-title"
    >
      <p className="study-kicker">Maya’s release review · FG-1048</p>
      <h1 id="desk-title">Can Maya rely on the ticket?</h1>
      <div className="forwarded-note">
        <p className="study-kicker">Forwarded by engineering · 14:32 UTC</p>
        <p>“The ticket says the assistant had permission to edit the rules file.”</p>
      </div>
      <div className="guided-question" aria-live="polite" aria-busy={busy}>
        {!compared && (
          <>
            {step === 'forwarded' ? (
              <>
                <h2>Maya still needs confirmation</h2>
                <p>
                  The release note would repeat the engineer’s claim. Security would have to look up
                  the original before Maya could rely on it.
                </p>
              </>
            ) : (
              <>
                <h2>How would you check the claim?</h2>
                <p>
                  You can pass along what engineering sent or check it against the original record.
                </p>
              </>
            )}
            <div className="case-actions">
              {step === 'ticket' && (
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setStep('forwarded')}
                >
                  Use the forwarded copy
                </button>
              )}
              <button className="primary-button" disabled={busy} onClick={compare}>
                {busy ? 'Checking the copies…' : 'Compare with the original'}
              </button>
            </div>
          </>
        )}
        {compared && (
          <>
            <h2>What the two copies say</h2>
            <dl className="comparison-slip">
              {(['received', 'original'] as const).map((id) => (
                <div key={id}>
                  <dt>{id === 'received' ? 'Forwarded copy' : 'Gateway original'}</dt>
                  <dd>
                    <strong>
                      {JSON.parse(envelopes[id]).payload.decision === 'allow'
                        ? 'Allowed'
                        : 'Denied'}
                    </strong>
                    <span>{resultText(checks[id])}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <p>
              {matched
                ? 'Maya can report the decision recorded in the original. The signature lets her check exactly which wording the gateway signed.'
                : 'Maya needs a verified original before she can report the gateway decision. The two claims alone cannot settle it.'}
            </p>
            {!matched && (
              <button className="secondary-button" disabled={busy} onClick={compare}>
                Retry signature checks
              </button>
            )}
            {!complete && (
              <>
                <h2>What goes back to the release team?</h2>
                <p>
                  Send what you know now, or ask the repository owner what happened to the file.
                </p>
                <div className="case-actions">
                  <button className="secondary-button" onClick={() => setStep('decision-note')}>
                    Send the decision record
                  </button>
                  <button className="primary-button" onClick={readHistory}>
                    Check the file history
                  </button>
                </div>
              </>
            )}
          </>
        )}
        {complete && (
          <section className="release-result" aria-label="Release handoff">
            <h2>{step === 'file-note' ? 'The repository owner’s reply' : 'Maya’s release note'}</h2>
            {step === 'file-note' ? (
              <>
                <p>
                  The file has different contents in the two saved versions. The history supplied to
                  Maya leaves the writer’s name and the request ID blank.
                </p>
                <p>
                  <strong>Next owner:</strong> Release engineering can ask who submitted the second
                  version.{' '}
                  {matched
                    ? 'Platform security has already answered the permission question.'
                    : 'Platform security still needs a verified decision.'}
                </p>
              </>
            ) : (
              <>
                <p>
                  {matched
                    ? 'Maya can record that the gateway denied this request. The file question stays open until the repository owner checks its history.'
                    : 'Maya can report conflicting copies. Security still needs to verify the original, and release engineering still needs the file history.'}
                </p>
                <button className="secondary-button" onClick={readHistory}>
                  Also check the file history
                </button>
              </>
            )}
            <p>
              {step === 'file-note'
                ? 'Maya keeps the release on hold until the owner can match the edit to an approved change.'
                : 'The decision record alone leaves Maya without enough evidence to ship the fix.'}
            </p>
            <p>
              <a href={pilotHref}>Would signed receipts save enough review time?</a>
            </p>
          </section>
        )}
      </div>
      <details className="case-sources">
        <summary>Inspect the source records</summary>
        <label>
          Show a record{' '}
          <select value={active} onChange={(e) => onSelect(e.currentTarget.value as CaseDocument)}>
            {documents.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.title}
              </option>
            ))}
          </select>
        </label>
        {receipt ? (
          <p>
            <strong>{active === 'neighbor' ? neighbor.id : archive.id}</strong> ·{' '}
            {receipt.payload.tool_name} · <code>{String(receipt.payload.args?.path)}</code> ·
            Claimed decision: {receipt.payload.decision}
          </p>
        ) : (
          <ul>
            {snapshots.map((s) => (
              <li key={s.revision}>
                {s.at} · Revision {s.revision} · <code>{s.blob}</code>
              </li>
            ))}
          </ul>
        )}
        {active === 'neighbor' && (
          <>
            <p>
              This is a separate request to read the project documentation. Compare its request
              number and target with Maya’s ticket.
            </p>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={includeNeighbor ? () => setIncludeNeighbor(false) : addNeighbor}
            >
              {includeNeighbor
                ? 'Remove adjacent request from handoff'
                : 'Check and include adjacent request'}
            </button>
            {includeNeighbor && <p role="status">{resultText(checks.neighbor)}</p>}
          </>
        )}
        <p>
          <a href={technicalHref}>Trace this evidence in the technical guide</a>
        </p>
      </details>
      {complete && (
        <p className="case-actions">
          <a
            download="FG-1048-handoff.json"
            href={
              'data:application/json;charset=utf-8,' +
              encodeURIComponent(JSON.stringify(handoff, null, 2))
            }
          >
            Download the release handoff
          </a>
        </p>
      )}
      {step !== 'ticket' && (
        <button className="secondary-button replay-case" onClick={restart}>
          Try another path
        </button>
      )}
    </section>
  );
}
