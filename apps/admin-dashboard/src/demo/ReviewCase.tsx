import { useState } from 'react';

const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function Assumption({
  label,
  value,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="review-assumption">
      <span>
        {label}
        <strong>{value.toLocaleString('en-US')}</strong>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
      />
    </label>
  );
}

export function PilotWorksheet() {
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
    <section className="review-worksheet">
      <p className="kicker">Platform security / Pilot economics</p>
      <h1>What would the evidence cost?</h1>
      <p>
        Compare the existing log search with a standard decision-log export and a shadow pilot that
        adds signed receipts. An export may already answer who requested what. A receipt also lets
        another reviewer check the signed payload against a known key.
      </p>
      <h3>Price the extra evidence</h3>
      <p>
        Use the better of the two logging options as the baseline. These illustrative inputs count
        only reviews that need an evidence check. Include key custody, integration, storage and
        operator time in the incremental first-year cost.
      </p>
      <div className="review-inputs">
        <Assumption
          label="Reviews per month"
          value={reviews}
          max={500}
          step={5}
          onChange={setReviews}
        />
        <Assumption
          label="Minutes saved per review"
          value={minutes}
          max={30}
          step={1}
          onChange={setMinutes}
        />
        <Assumption
          label="Reviewer cost ($/hour)"
          value={rate}
          max={200}
          step={5}
          onChange={setRate}
        />
        <Assumption
          label="First-year cost ($)"
          value={cost}
          max={30000}
          step={250}
          onChange={setCost}
        />
      </div>
      <figure className="funding-chart">
        <figcaption>First-year cost and analyst capacity at these assumptions</figcaption>
        <div>
          <span>
            Recovered review time <strong>{dollars.format(annualCapacity)}</strong>
          </span>
          <div className="chart-track">
            <i style={{ width: (annualCapacity / scale) * 100 + '%' }} />
          </div>
        </div>
        <div>
          <span>
            Incremental cost <strong>{dollars.format(cost)}</strong>
          </span>
          <div className="chart-track cost">
            <i style={{ width: (cost / scale) * 100 + '%' }} />
          </div>
        </div>
      </figure>
      <div className="review-estimate" aria-live="polite">
        <strong>{dollars.format(netValue)} first-year net time value</strong>
        <p>
          {annualHours.toLocaleString('en-US', { maximumFractionDigits: 1 })} hours ×{' '}
          {dollars.format(rate)} per hour, less {dollars.format(cost)}.{' '}
          {cost === 0
            ? 'There is no modeled cost to recover.'
            : minutesNeeded === null
              ? 'No labor value can cover the cost at this volume and rate.'
              : `Break-even requires ${(Math.ceil(minutesNeeded * 10) / 10).toFixed(1)} minutes saved per review.`}
        </p>
      </div>
      <h3>What would justify a wider rollout?</h3>
      <p>
        The platform security lead owns the pilot budget. Draw the sample from the gateway request
        log so that missing receipts stay visible. Have analysts review the same requests with the
        export and with receipts, alternating which they see first.
      </p>
      <ul>
        <li>
          <strong>Investigation quality.</strong> Count reviews that correctly identify the request,
          decision and reason, and flag a missing file history when execution is in question.
        </li>
        <li>
          <strong>Evidence coverage.</strong> Divide receipts verified against an independently
          trusted issuer key by all sampled in-scope requests. Investigate gaps and record why
          verification failed.
        </li>
        <li>
          <strong>Funding decision.</strong> Agree on acceptable coverage and review accuracy with
          the incident lead before sampling. Expand only if both thresholds hold and the observed
          time savings cover incremental cost. Count cash savings only when spending falls.
        </li>
      </ul>
      <p>
        The public key in this demo is shared for illustration. An operational pilot would need its
        own trusted key inventory.
      </p>
      <footer>
        <p>
          NIST’s incident response guide assigns funding to leadership and evidence collection to
          incident handlers. Its RS.AN-06 and RS.AN-07 recommendations explain why the analyst
          checks record integrity and provenance. Cedar documents what its authorization decision
          answers. RFC 8032 specifies the signature check used here.
        </p>
        <a href="https://csrc.nist.gov/pubs/sp/800/61/r3/final">
          NIST incident response roles and evidence
        </a>
        <a href="https://csrc.nist.gov/pubs/sp/800/92/final">NIST log management guide</a>
        <a href="https://docs.cedarpolicy.com/auth/authorization.html">Cedar authorization</a>
        <a href="https://www.rfc-editor.org/rfc/rfc8032">RFC 8032</a>
      </footer>
    </section>
  );
}
