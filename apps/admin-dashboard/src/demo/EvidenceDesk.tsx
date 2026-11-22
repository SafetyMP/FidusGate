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
type Recommendation = 'send' | 'close' | 'request';

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
  const [attached, setAttached] = useState<CaseDocument[]>(['received']);
  const [checks, setChecks] = useState<Checks>({});
  const [busy, setBusy] = useState<CaseDocument[]>([]);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const epoch = useRef(0);
  const { findings, requests } = assess(attached, checks);
  const raw = active === 'history' ? null : envelopes[active];
  const receipt = raw ? (JSON.parse(raw) as typeof archive.receipt) : null;
  const selected = documents.find((item) => item.id === active);
  const check = checks[active];
  const confirmed = attached.includes('original') && checks.original?.status === 'valid';
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
  async function verify() {
    if (!raw) return;
    const id = active;
    const generation = epoch.current;
    setBusy((old) => [...old, id]);
    const result = await verifyDemoReceipt(raw);
    if (generation !== epoch.current) return;
    setChecks((old) => ({ ...old, [id]: result }));
    setBusy((old) => old.filter((item) => item !== id));
    setRecommendation(null);
  }
  function toggle() {
    setAttached((old) =>
      old.includes(active) ? old.filter((id) => id !== active) : [...old, active],
    );
    setRecommendation(null);
  }
  function restart() {
    epoch.current++;
    setChecks({});
    setBusy([]);
    setAttached(['received']);
    setRecommendation(null);
    onSelect('received');
  }
  return (
    <section
      id="case-investigation"
      className="investigation case-desk"
      tabIndex={-1}
      aria-labelledby="desk-title"
    >
      <p className="study-kicker">Platform security · FG-1048</p>
      <h1 id="desk-title">What can you tell the release lead?</h1>
      <p>
        Start with the engineer’s ticket copy. Check its signature, then choose which records to
        attach to your handoff.
      </p>
      <div className="record-picker" role="group" aria-label="Source records">
        {documents.map((doc) => (
          <button key={doc.id} aria-pressed={active === doc.id} onClick={() => onSelect(doc.id)}>
            <small>{doc.owner}</small>
            {doc.title}
          </button>
        ))}
      </div>
      <div className="desk-columns">
        <article className="exhibit-card" aria-label="Selected document">
          <h2>{selected?.title}</h2>
          {receipt ? (
            <>
              <p>
                {active === 'received'
                  ? 'Forwarded with the change ticket.'
                  : active === 'original'
                    ? 'Retrieved from the gateway archive by request ID.'
                    : 'Retrieved from the same archive just before the disputed request.'}
              </p>
              <dl className="receipt-fields">
                <dt>Request</dt>
                <dd>
                  {active === 'neighbor' ? neighbor.id : archive.id} ·{' '}
                  {receipt.payload.issued_at.slice(11, 19)} UTC
                </dd>
                <dt>Tool / file</dt>
                <dd>
                  <code>
                    {receipt.payload.tool_name} · {String(receipt.payload.args?.path)}
                  </code>
                </dd>
                <dt>Claimed decision</dt>
                <dd>{receipt.payload.decision}</dd>
                <dt>Signature</dt>
                <dd>
                  <code>{receipt.signature.sig.slice(0, 16)}…</code>
                </dd>
              </dl>
              <button className="primary-button" onClick={verify} disabled={busy.includes(active)}>
                {busy.includes(active) ? 'Checking…' : 'Check signature'}
              </button>
              {check && (
                <p className="packet-result" role="status">
                  {check.message}
                </p>
              )}
            </>
          ) : (
            <>
              <p>
                The repository owner supplied two snapshots of <code>policy.cedar</code> around the
                14:32 request.
              </p>
              <ol className="snapshot-list">
                {snapshots.map((s) => (
                  <li key={s.revision}>
                    <time>{s.at}</time>
                    <strong>Revision {s.revision}</strong>
                    <code>Blob {s.blob}</code>
                  </li>
                ))}
              </ol>
              <p>Writer and request ID are blank in this export.</p>
            </>
          )}
          <label className="attach-record">
            <input type="checkbox" checked={attached.includes(active)} onChange={toggle} />
            Attach to the release handoff
          </label>
          <a href={technicalHref}>Trace this evidence in the technical guide</a>
        </article>
        <aside className="handoff-card" aria-label="Release handoff">
          <p className="study-kicker">Release lead’s copy</p>
          <h2>Evidence handoff</h2>
          <p>{attached.length} of 4 records attached</p>
          <div aria-live="polite">
            <h3>Supported findings</h3>
            {findings.length ? (
              <ul>
                {findings.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p>Check an attached receipt or attach repository history to support a finding.</p>
            )}
          </div>
          <details>
            <summary>Open evidence requests ({requests.length})</summary>
            <ul>
              {requests.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
          <a
            download="FG-1048-handoff.json"
            href={
              'data:application/json;charset=utf-8,' +
              encodeURIComponent(JSON.stringify(handoff, null, 2))
            }
          >
            Download this handoff
          </a>
        </aside>
      </div>
      {(Object.keys(checks).length > 0 || attached.includes('history')) && (
        <fieldset className="ticket-choice">
          <legend>What should the release lead do next?</legend>
          {(
            [
              ['send', 'Record the supported findings'],
              ['request', 'Request more evidence'],
              ['close', 'Close the ticket and attribute the write to the agent'],
            ] as const
          ).map(([id, label]) => (
            <label key={id}>
              <input
                type="radio"
                name="recommendation"
                checked={recommendation === id}
                onChange={() => setRecommendation(id)}
              />
              {label}
            </label>
          ))}
        </fieldset>
      )}
      {recommendation && (
        <div className="ticket-consequence" role="status">
          {recommendation === 'close'
            ? attached.includes('history')
              ? 'Reopen the attribution question. The file changed between snapshots, but the attached export does not identify who wrote revision 808.'
              : 'Reopen the attribution question. A decision receipt identifies a request. Ask release engineering for file history before attributing a change.'
            : recommendation === 'request'
              ? requests[0]
              : confirmed
                ? 'Send the verified decision to the release lead. They can settle the gateway question and assign the remaining file investigation to the repository owner.'
                : findings.length
                  ? 'Send this limited finding. To settle what the gateway decided, attach its original and verify the signature.'
                  : 'The handoff has no supported finding yet. Check an attached record before asking the lead to rely on it.'}
        </div>
      )}
      {recommendation && (
        <section className="case-debrief">
          <h2>Where FidusGate saves a handoff</h2>
          <p>
            The gateway checks a tool request against policy and can sign the decision it records. A
            second reviewer can check the exact copy attached to a ticket. That lets platform
            security resolve disagreements about the decision and send questions about the file
            itself to its owner.
          </p>
          <a className="primary-button" href={pilotHref}>
            Compare the cost with ordinary logs
          </a>
        </section>
      )}
      <button className="secondary-button" onClick={restart}>
        Restart investigation
      </button>
    </section>
  );
}
