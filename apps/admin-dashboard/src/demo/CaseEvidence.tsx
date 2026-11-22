import { useState } from 'react';
import {
  DEMO_DECISIONS,
  receiptJson,
  verifyDemoReceipt,
  type DemoDecision,
  type VerificationResult,
} from './index';
import { casePacket, snapshots, type Packet } from './caseRecords';

export const stages = [
  { id: 'request', label: 'Request' },
  { id: 'decision', label: 'Decision' },
  { id: 'signature', label: 'Signature' },
  { id: 'effect', label: 'File history' },
] as const;
export type Stage = (typeof stages)[number]['id'];
const source =
  'https://github.com/SafetyMP/FidusGate/blob/fcc67c3a229b82f4afa90148b1a0e2c102f3b139/';
type Fixture = 'FG-1048' | 'FG-1047';
type Props = {
  record: DemoDecision;
  packet: Packet;
  fixtureId: Fixture;
  stage: Stage;
  onFixture: (id: Fixture) => void;
  stageHref: (stage: Stage) => string;
  caseHref: string;
};

export function CaseEvidence({
  record,
  packet,
  fixtureId,
  stage,
  onFixture,
  stageHref,
  caseHref,
}: Props) {
  const fixture = DEMO_DECISIONS.find((item) => item.id === fixtureId)!;
  const leftJson = casePacket(record, packet);
  const rightJson = receiptJson(fixture);
  const left = JSON.parse(leftJson) as DemoDecision['receipt'];
  const right = fixture.receipt;
  const packetLabel = packet === 'received' ? 'Copy received with ticket' : 'Gateway archive copy';
  const [checks, setChecks] = useState<VerificationResult[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [history, setHistory] = useState(false);
  async function checkBoth() {
    setChecking(true);
    const results = await Promise.all([verifyDemoReceipt(leftJson), verifyDemoReceipt(rightJson)]);
    setChecks(results);
    setChecking(false);
  }
  const evidence = {
    caseId: record.id,
    selectedPacket: packetLabel,
    sourceType: 'Synthetic reference evidence',
    caseRecord: { receipt: left, check: checks?.[0] ?? { status: 'unchecked' } },
    comparison: { id: fixture.id, receipt: right, check: checks?.[1] ?? { status: 'unchecked' } },
    repositoryEvidence: history
      ? { path: record.resource, snapshots, requestCorrelation: null }
      : undefined,
    provenance: {
      fixtures: source + 'apps/admin-dashboard/src/demo/fixtures.ts',
      packetTransformation: source + 'apps/admin-dashboard/src/demo/index.ts',
      repositorySnapshots: source + 'apps/admin-dashboard/src/demo/ReviewCase.tsx',
    },
    outstanding: [
      ...(!checks ? ['Check both signatures before relying on the packet claims.'] : []),
      ...(checks?.some((item) => item.status === 'error' || item.status === 'unsupported')
        ? ['Repeat the unavailable check with a compatible verifier.']
        : []),
      ...(checks?.some((item) => item.status === 'invalid')
        ? ['Reconcile the mismatched copy against the independently retrieved gateway original.']
        : []),
      ...(!history
        ? ['Request repository history for the disputed file.']
        : ['Seek a writer-to-revision correlation record.']),
      'Establish operational issuer trust independently.',
    ],
  };
  return (
    <section className="trace-main">
      <p className="study-kicker">Technical evidence · {record.id}</p>
      <h1>Trace the disputed write.</h1>
      <p>
        You are tracing the <strong>{packetLabel.toLowerCase()}</strong> for {record.id}. Follow its
        claims through the gateway, then compare them with an independently selected fixture.
      </p>
      <nav className="trace-nav" aria-label="Trace stage">
        {stages.map((item) => (
          <a
            key={item.id}
            href={stageHref(item.id)}
            aria-current={stage === item.id ? 'step' : undefined}
          >
            {item.label}
          </a>
        ))}
      </nav>
      <section className="trace-panel" aria-label="Selected trace stage">
        {stage === 'request' && (
          <>
            <h2>Read the request envelope</h2>
            <p>
              <code>{left.payload.issuer_id}</code> requested <code>{left.payload.tool_name}</code>{' '}
              on <code>{String(left.payload.args?.path)}</code> at {left.payload.issued_at}.
            </p>
            <p>
              The principal is a claim in the submitted payload. The gateway binds identity and
              request context before authorization in a connected deployment.{' '}
              <a href={source + 'apps/secure-gateway/src/mcp-server.ts'}>Gateway implementation</a>
            </p>
          </>
        )}
        {stage === 'decision' && (
          <>
            <h2>Locate the decision</h2>
            <p>
              This packet claims <strong>{left.payload.decision}</strong>. Its reason reads “
              {left.payload.reason}”
            </p>
            <p>
              The fixture’s policy digest is <code>{left.payload.policy_digest}</code>. A matching
              digest identifies policy material. The case browser reads the recorded fields without
              evaluating Cedar. <a href={source + 'policy.cedar'}>Reference policy</a> ·{' '}
              <a href="https://docs.cedarpolicy.com/auth/authorization.html">Cedar decisions</a>
            </p>
          </>
        )}
        {stage === 'signature' && (
          <>
            <h2>Check the exact payload bytes</h2>
            <p>
              The envelope names key <code>{left.signature.kid}</code> and carries an Ed25519
              signature. The check below uses the public fixture key and serializes the submitted
              payload exactly as the demo signer does.
            </p>
            <p>
              A match establishes integrity under this key. The fixture uses public test-key
              material. Operational issuer trust and tool execution require independent evidence.{' '}
              <a href={source + 'apps/admin-dashboard/src/demo/index.ts'}>Browser verifier</a> ·{' '}
              <a href="https://www.rfc-editor.org/rfc/rfc8032">RFC 8032</a>
            </p>
          </>
        )}
        {stage === 'effect' && (
          <>
            <h2>Compare downstream records</h2>
            <p>
              The authored repository export for <code>{record.resource}</code> brackets the 14:32
              UTC request.
            </p>
            <ul>
              {snapshots.map((row) => (
                <li key={row.revision}>
                  {row.at} · revision {row.revision} · blob <code>{row.blob}</code>
                </li>
              ))}
            </ul>
            <p>
              The file contents changed. The export omits the writer and request link, so it cannot
              attribute that change to FG-1048.{' '}
              <a href={source + 'apps/admin-dashboard/src/demo/ReviewCase.tsx'}>
                Snapshot provenance
              </a>
            </p>
          </>
        )}
      </section>
      <section className="case-comparison" aria-labelledby="comparison-title">
        <h2 id="comparison-title">Compare the recorded outcomes</h2>
        <fieldset className="fixture-options">
          <legend>Comparison fixture</legend>
          {(['FG-1047', 'FG-1048'] as const).map((id) => (
            <label key={id}>
              <input
                type="radio"
                name="comparison-fixture"
                checked={fixtureId === id}
                onChange={() => onFixture(id)}
              />{' '}
              {id} · {id === 'FG-1048' ? 'Policy write' : 'Documentation read'}
            </label>
          ))}
        </fieldset>
        <table>
          <caption>Selected case packet and recorded synthetic fixture</caption>
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">
                {record.id} · {packetLabel}
              </th>
              <th scope="col">{fixtureId} · Archive</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Request', left.payload.tool_name, right.payload.tool_name],
              ['Resource', String(left.payload.args?.path), String(right.payload.args?.path)],
              ['Recorded claim', left.payload.decision, right.payload.decision],
              [
                'Signature check',
                checks?.[0].status ?? 'unchecked',
                checks?.[1].status ?? 'unchecked',
              ],
            ].map(([label, a, b]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{a}</td>
                <td>{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="primary-button" onClick={checkBoth} disabled={checking}>
          {checking ? 'Checking signatures…' : 'Check both signatures'}
        </button>
        {checks && (
          <div role="status">
            <p>
              <strong>{packetLabel}.</strong> {checks[0].message}
            </p>
            <p>
              <strong>{fixtureId} archive.</strong> {checks[1].message}
            </p>
          </div>
        )}
        <p>
          {fixtureId === 'FG-1047'
            ? 'FG-1047 is a separate recorded documentation read. Its permission decision supplies a contrast and cannot explain the policy write.'
            : 'The comparison is the archived FG-1048 decision. Compare its decision field and signature bytes with the submitted case copy.'}{' '}
          <a href={source + 'apps/admin-dashboard/src/demo/fixtures.ts'}>Signed fixture records</a>
        </p>
        <details>
          <summary>Inspect the two submitted envelopes</summary>
          <h3>Case packet</h3>
          <pre>{leftJson}</pre>
          <h3>Comparison fixture</h3>
          <pre>{rightJson}</pre>
        </details>
        <label className="export-history">
          <input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} />{' '}
          Attach repository snapshots to the handoff
        </label>
        <a
          download="FG-1048-technical-evidence.json"
          href={
            'data:application/json;charset=utf-8,' +
            encodeURIComponent(JSON.stringify(evidence, null, 2))
          }
        >
          Download selected evidence and check results
        </a>
      </section>
      <p>
        <a href={caseHref}>Return to this ticket investigation</a> ·{' '}
        <a href={source + 'docs/getting-started.md'}>Run the gateway-connected console</a>
      </p>
    </section>
  );
}
