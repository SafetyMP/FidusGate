import { useState } from 'react';
import type { CaseDocument } from './EvidenceDesk';
import { casePacket, snapshots, type Packet } from './caseRecords';
import {
  DEMO_DECISIONS,
  receiptJson,
  verifyDemoReceipt,
  type DemoDecision,
  type VerificationResult,
} from './index';

export const stages = [
  { id: 'request', label: 'Request' },
  { id: 'decision', label: 'Decision' },
  { id: 'signature', label: 'Signature' },
  { id: 'effect', label: 'File history' },
] as const;
export type Stage = (typeof stages)[number]['id'];
const source =
  'https://github.com/SafetyMP/FidusGate/blob/eaacc1e1bddacb9a27a731c14fb5107f9a0a8c04/';
const fixtureSource = source + 'apps/admin-dashboard/src/demo/fixtures.ts';
const snapshotSource = source + 'apps/admin-dashboard/src/demo/caseRecords.ts';
const verifierSource = source + 'apps/admin-dashboard/src/demo/index.ts#L139';
const gatewaySource = source + 'apps/secure-gateway/src/mcp-server.ts';
type Fixture = 'FG-1048' | 'FG-1047';
type Props = {
  record: DemoDecision;
  document: CaseDocument;
  packet: Packet;
  fixtureId: Fixture;
  stage: Stage;
  onFixture: (id: Fixture) => void;
  stageHref: (stage: Stage) => string;
  caseHref: string;
};

function FixtureChoice({ fixtureId, onFixture }: Pick<Props, 'fixtureId' | 'onFixture'>) {
  return (
    <fieldset className="fixture-options">
      <legend>Comparison fixture</legend>
      {(['FG-1048', 'FG-1047'] as const).map((id) => (
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
  );
}

export function CaseEvidence({
  record,
  document,
  packet,
  fixtureId,
  stage,
  onFixture,
  stageHref,
  caseHref,
}: Props) {
  const [identity, setIdentity] = useState(false);
  const [checks, setChecks] = useState<VerificationResult[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [history, setHistory] = useState(false);
  const fixture = DEMO_DECISIONS.find((item) => item.id === fixtureId);
  if (!fixture) throw new Error('The selected comparison fixture is unavailable.');

  const request =
    document === 'neighbor' ? DEMO_DECISIONS.find((item) => item.id === 'FG-1047') : record;
  if (!request) throw new Error('The selected request is unavailable.');

  const leftJson = casePacket(record, packet);
  const rightJson = receiptJson(fixture);
  const left = JSON.parse(leftJson) as DemoDecision['receipt'];
  const right = fixture.receipt;
  const packetLabel = packet === 'received' ? 'Copy received with ticket' : 'Gateway archive copy';

  const selectedLabel =
    document === 'neighbor'
      ? 'Adjacent request · FG-1047'
      : document === 'history'
        ? 'File history · policy.cedar'
        : packetLabel;
  const requestPayload = document === 'neighbor' ? request.receipt.payload : left.payload;
  const historyVisible = history || document === 'history';

  async function checkBoth() {
    setChecking(true);
    const results = await Promise.all([verifyDemoReceipt(leftJson), verifyDemoReceipt(rightJson)]);
    setChecks(results);
    setChecking(false);
  }

  const evidence = {
    caseId: record.id,
    selectedSource: {
      id: document,
      label: selectedLabel,
      ...(document === 'neighbor' ? { receipt: request.receipt } : {}),
    },
    selectedPacket: packetLabel,
    sourceType: 'Synthetic reference evidence',
    caseRecord: { id: record.id, receipt: left, check: checks?.[0] ?? { status: 'unchecked' } },
    comparison: { id: fixture.id, receipt: right, check: checks?.[1] ?? { status: 'unchecked' } },
    repositoryEvidence: history
      ? { path: record.resource, snapshots, requestCorrelation: null }
      : undefined,
    provenance: {
      fixtures: fixtureSource,
      packetTransformation: snapshotSource,
      repositorySnapshots: snapshotSource,
      verifier: verifierSource,
    },
    outstanding: [
      ...(!checks ? ['Check both signatures before relying on the packet claims.'] : []),
      ...(checks?.some((item) => item.status === 'error' || item.status === 'unsupported')
        ? ['Repeat the unavailable check with a compatible verifier.']
        : []),
      ...(checks?.some((item) => item.status === 'invalid')
        ? ['Reconcile the mismatched copy against the independently retrieved gateway original.']
        : []),
      historyVisible
        ? 'Seek a writer-to-revision correlation record.'
        : 'Request repository history for the disputed file.',
      'Establish operational issuer trust independently.',
    ],
  };

  return (
    <section className="trace-main">
      <p className="study-kicker">Technical guide · {record.id}</p>
      <h1>Trace the disputed write.</h1>
      <p>
        FidusGate checks an agent’s tool request against the team’s rules and can sign a record of
        its decision. Release engineering checks the file’s history to see what actually changed.
      </p>
      <p>
        Selected evidence · <strong>{selectedLabel}</strong>.{' '}
        {document === 'neighbor'
          ? 'The adjacent archive receipt covers a separate documentation read. Compare it with the FG-1048 reference packet.'
          : document === 'history'
            ? 'These repository snapshots cover the file named in FG-1048. The request and signature panels trace its reference packet.'
            : 'Use the four stages to follow this copy through the review.'}
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
              Model Context Protocol (MCP) is how the agent asks to use a tool. The gateway receives
              the request and checks permission. Inspect {request.id} to see who asked and which
              file they named.
            </p>
            <fieldset className="fixture-options">
              <legend>Inspect a field group</legend>
              <label>
                <input
                  type="radio"
                  name="request-fields"
                  checked={!identity}
                  onChange={() => setIdentity(false)}
                />{' '}
                Tool and target
              </label>
              <label>
                <input
                  type="radio"
                  name="request-fields"
                  checked={identity}
                  onChange={() => setIdentity(true)}
                />{' '}
                Identity fields
              </label>
            </fieldset>
            <div className="ticket-consequence" aria-live="polite">
              {identity ? (
                <>
                  <strong>{request.agentName}</strong> · The case lists{' '}
                  <code>{request.principal}</code> as the caller. The receipt names{' '}
                  <code>{requestPayload.issuer_id}</code> as its issuer. The labels happen to match
                  here. Check the key owner separately before attributing the signature.
                </>
              ) : (
                <>
                  <strong>{requestPayload.tool_name}</strong> ·{' '}
                  <code>{String(requestPayload.args?.path)}</code> ·{' '}
                  <time dateTime={requestPayload.issued_at}>{requestPayload.issued_at}</time>. The
                  file and time help the engineer find nearby revisions. Linking a revision to this
                  request takes a separate change record.
                </>
              )}
            </div>
            <p>
              In the code, the gateway passes the caller, tool and path to the policy check. It
              records the receipt issuer separately.{' '}
              <a href={gatewaySource + '#L919-L935'}>Write request check</a> ·{' '}
              <a href={gatewaySource + '#L159-L168'}>Receipt issuance</a>
            </p>
          </>
        )}
        {stage === 'decision' && (
          <>
            <h2>Locate the decision</h2>
            <p>
              Cedar is the language the team uses to define which tools an agent may use on which
              files. The {record.id} packet says <strong>{left.payload.decision}</strong>. Compare
              that claim with a decision from the archive.
            </p>
            <FixtureChoice fixtureId={fixtureId} onFixture={onFixture} />
            <div className="ticket-consequence" aria-live="polite">
              <strong>
                {fixture.tool} → {fixture.decision}
              </strong>{' '}
              · {fixture.reason}
            </div>
            <p>
              {fixtureId === 'FG-1047'
                ? 'This documentation read has its own permission. Use FG-1048 to reconcile the disputed write.'
                : 'This is the same request. Check the two signatures before relying on either copy in the change ticket.'}
            </p>
            <p>
              This browser displays recorded examples. The connected gateway evaluates the rules
              when it receives a request. <a href={source + 'policy.cedar#L33-L85'}>Cedar rules</a>{' '}
              · <a href={fixtureSource}>Archive fixtures</a>
            </p>
          </>
        )}
        {stage === 'signature' && (
          <>
            <h2>Check the exact payload bytes</h2>
            <p>
              A signed receipt lets the release lead check the copy someone forwarded. Ed25519 is
              the signature method. It uses a public key to check whether the signed decision fields
              still match. Try it on the two records below.
            </p>
            <FixtureChoice fixtureId={fixtureId} onFixture={onFixture} />
            <div className="case-comparison">
              <table>
                <caption>Reference packet and comparison archive</caption>
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
                    ['Claim', left.payload.decision, right.payload.decision],
                    [
                      'Signature',
                      checks?.[0].status ?? 'unchecked',
                      checks?.[1].status ?? 'unchecked',
                    ],
                  ].map(([label, submitted, archived]) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      <td>{submitted}</td>
                      <td>{archived}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                className="primary-button"
                onClick={checkBoth}
                disabled={checking}
              >
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
            </div>
            <details>
              <summary>Inspect the two submitted envelopes</summary>
              <p>
                The signer and verifier read the same bytes from{' '}
                <code>JSON.stringify(payload)</code>.
              </p>
              <h3>{record.id} reference packet</h3>
              <pre>{leftJson}</pre>
              <h3>Comparison fixture</h3>
              <pre>{rightJson}</pre>
            </details>
            <p>
              Both checks use the public demo key. For a live release, the team must also confirm
              who owns the signing key.{' '}
              <a href={source + 'packages/crypto-utils/src/index.ts#L109-L125'}>Local signing</a> ·{' '}
              <a href={verifierSource}>Browser verification</a>
            </p>
          </>
        )}
        {stage === 'effect' && (
          <>
            <h2>Compare downstream records</h2>
            <p>
              File history records saved versions. Each content ID, or blob ID, identifies one
              version’s contents. Compare the IDs for <code>{record.resource}</code> to see what the
              release lead can establish about the file.
            </p>
            <label className="export-history">
              <input
                type="checkbox"
                checked={history}
                onChange={(event) => setHistory(event.target.checked)}
              />{' '}
              Attach repository snapshots to the handoff
            </label>
            {historyVisible && (
              <div className="ticket-consequence" role="status">
                <ul>
                  {snapshots.map((row) => (
                    <li key={row.revision}>
                      {row.at} · revision {row.revision} · blob <code>{row.blob}</code>
                    </li>
                  ))}
                </ul>
                <p>
                  The two revisions contain different file contents. The export has no writer or
                  request link. Ask for the change record tied to revision {snapshots[1].revision}{' '}
                  before naming an actor.
                </p>
              </div>
            )}
            <p>
              Handoff · {checks ? 'Signature check results included' : 'Signatures unchecked'} ·{' '}
              {history ? 'Two snapshots attached' : 'No file history attached'}.
            </p>
            <a
              download="FG-1048-technical-evidence.json"
              href={
                'data:application/json;charset=utf-8,' +
                encodeURIComponent(JSON.stringify(evidence, null, 2))
              }
            >
              Download selected evidence and check results
            </a>
            <p>
              The download gives the next reviewer both decision records, their check results and
              the questions still open. <a href={snapshotSource}>Synthetic snapshot source</a>
            </p>
          </>
        )}
      </section>
      <p>
        <a href={caseHref}>Return to this ticket investigation</a> ·{' '}
        <a href={source + 'docs/getting-started.md'}>Run the gateway-connected console</a>
      </p>
    </section>
  );
}
