import { useState } from 'react';
import type { DemoDecision } from './index';

const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function Assumption({ label, value, max, step, onChange }: {
  label: string;
  value: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="review-assumption">
      <span>{label}<strong>{value.toLocaleString('en-US')}</strong></span>
      <input type="range" min={0} max={max} step={step} value={value}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)} />
    </label>
  );
}

export function ReviewCase({ record, onVerify }: {
  record: DemoDecision;
  onVerify: (record: DemoDecision) => void;
}) {
  const { payload, signature } = record.receipt;
  const [reviews, setReviews] = useState(120);
  const [minutes, setMinutes] = useState(4);
  const [rate, setRate] = useState(75);
  const [cost, setCost] = useState(6000);
  const annualHours = (reviews * 12 * minutes) / 60;
  const annualCapacity = annualHours * rate;
  const scale = Math.max(annualCapacity, cost, 1);
  const netValue = annualCapacity - cost;
  const minutesNeeded = reviews > 0 && rate > 0 ? (cost * 60) / (reviews * 12 * rate) : null;
  return (
    <div className="study-body">
      <section className="study-story" aria-labelledby="case-flow-title">
        <h2 id="case-flow-title">Follow the disputed change</h2>
        <ol className="request-flow">
          <li><span>Request</span><code>{payload.tool_name}</code><p>Agent asks to write to <code>{String(payload.args?.path)}</code>.</p></li>
          <li><span>Policy decision</span><strong className="flow-outcome">Denied</strong><p>The recorded rule protects the file that controls authorization.</p></li>
          <li><span>Evidence for review</span><code>{record.id}</code><p>The analyst can check the signed decision before sharing it with the engineer.</p></li>
        </ol>
        <p className="study-scope">Synthetic case · The browser replays recorded decisions. No agent connects or executes a tool.</p>
      </section>
      <section className="study-evidence">
        <h2>What can the analyst establish?</h2>
        <dl className="evidence-boundary">
          <div><dt>Decision</dt><dd>The receipt records the denied action, its target and the stated reason.</dd></div>
          <div><dt>Integrity</dt><dd>Check the signature against the public demo key to see whether the payload matches.</dd></div>
          <div><dt>Still to establish</dt><dd>Confirm the issuer through a trusted key inventory and check file history for any actual change.</dd></div>
        </dl>
        <details className="study-receipt"><summary>Inspect the fields in {record.id}</summary>
      <article className="review-record">
        <header className="receipt-mast">
          <div>
            <span className="review-caption">Synthetic gateway record</span>
            <h2 id="case-record">Decision receipt <code>{record.id}</code></h2>
          </div>
          <time dateTime={payload.issued_at}>{payload.issued_at.replace('T', ' ').replace('.000Z', ' UTC')}</time>
        </header>
        <div className="receipt-inspection">
          <dl className="receipt-fields" aria-label="Signed payload excerpt">
            <dt>issuer_id</dt><dd>{payload.issuer_id}</dd>
            <dt>tool_name</dt><dd>{payload.tool_name}</dd>
            <dt>args.path</dt><dd>{String(payload.args?.path)}</dd>
            <dt>decision</dt><dd><span className={`decision-badge ${payload.decision}`}>{payload.decision}</span></dd>
          </dl>
          <div className="review-exhibit">
            <h3>Recorded reason</h3>
            <p>{payload.reason}</p>
            <p>The analyst can attach the verified denial to the change ticket. To determine whether the file changed, check its repository history.</p>
          </div>
        </div>
        <footer className="receipt-signature">
          <div><span>Signature excerpt · {signature.alg}</span>
            <code>{signature.sig.slice(0, 18)}…{signature.sig.slice(-12)}</code></div>
          <button type="button" className="primary-button" onClick={() => onVerify(record)}>Inspect {record.id} receipt</button>
        </footer>
      </article>
        </details>
      </section>
      <section className="review-worksheet">
        <h2>Would signed receipts earn their place in change review?</h2>
        <p>Compare the existing log search with a standard decision-log export and a shadow pilot that adds signed receipts. An export may already answer who requested what. A receipt also lets another reviewer check the signed payload against a known key.</p>
        <h3>Price the extra evidence</h3>
        <p>Use the better of the two logging options as the baseline. These illustrative inputs count only reviews that need an evidence check. Include key custody, integration, storage and operator time in the incremental first-year cost.</p>
        <div className="review-inputs">
          <Assumption label="Reviews per month" value={reviews} max={500} step={5} onChange={setReviews} />
          <Assumption label="Minutes saved per review" value={minutes} max={30} step={1} onChange={setMinutes} />
          <Assumption label="Reviewer cost ($/hour)" value={rate} max={200} step={5} onChange={setRate} />
          <Assumption label="First-year cost ($)" value={cost} max={30000} step={250} onChange={setCost} />
        </div>
        <figure className="funding-chart">
          <figcaption>First-year cost and analyst capacity at these assumptions</figcaption>
          <div><span>Recovered review time <strong>{dollars.format(annualCapacity)}</strong></span><div className="chart-track"><i style={{width: (annualCapacity / scale) * 100 + '%'}} /></div></div>
          <div><span>Incremental cost <strong>{dollars.format(cost)}</strong></span><div className="chart-track cost"><i style={{width: (cost / scale) * 100 + '%'}} /></div></div>
        </figure>
        <div className="review-estimate" aria-live="polite">
          <strong>{dollars.format(netValue)} first-year net time value</strong>
          <p>{annualHours.toLocaleString('en-US', {maximumFractionDigits: 1})} hours × {dollars.format(rate)} per hour, less {dollars.format(cost)}. {cost === 0 ? 'There is no modeled cost to recover.' : minutesNeeded === null ? 'No labor value can cover the cost at this volume and rate.' : `Break-even requires ${(Math.ceil(minutesNeeded * 10) / 10).toFixed(1)} minutes saved per review.`}</p>
        </div>
        <h3>What would justify a wider rollout?</h3>
        <p>The platform security lead owns the pilot budget. Draw the sample from the gateway request log so that missing receipts stay visible. Have analysts review the same requests with the export and with receipts, alternating which they see first.</p>
        <ul>
          <li><strong>Investigation quality.</strong> Count reviews that correctly identify the request, decision and reason, and flag a missing file history when execution is in question.</li>
          <li><strong>Evidence coverage.</strong> Divide receipts verified against an independently trusted issuer key by all sampled in-scope requests. Investigate gaps and record why verification failed.</li>
          <li><strong>Funding decision.</strong> Agree on acceptable coverage and review accuracy with the incident lead before sampling. Expand only if both thresholds hold and the observed time savings cover incremental cost. Count cash savings only when spending falls.</li>
        </ul>
        <p>The public key in this demo is shared for illustration. An operational pilot would need its own trusted key inventory.</p>
        <footer>
          <p>NIST’s incident response guide assigns funding to leadership and evidence collection to incident handlers. Its RS.AN-06 and RS.AN-07 recommendations explain why the analyst checks record integrity and provenance. Cedar documents what its authorization decision answers. RFC 8032 specifies the signature check used here.</p>
          <a href="https://csrc.nist.gov/pubs/sp/800/61/r3/final">NIST incident response roles and evidence</a>
          <a href="https://csrc.nist.gov/pubs/sp/800/92/final">NIST log management guide</a>
          <a href="https://docs.cedarpolicy.com/auth/authorization.html">Cedar authorization</a>
          <a href="https://www.rfc-editor.org/rfc/rfc8032">RFC 8032</a>
        </footer>
      </section>
    </div>
  );
}
