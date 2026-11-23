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

export function PilotWorksheet({ caseHref }: { caseHref: string }) {
  const [reviews, setReviews] = useState(120);
  const [minutes, setMinutes] = useState(4);
  const [rate, setRate] = useState(75);
  const [cost, setCost] = useState(6000);
  const [option, setOption] = useState('');
  const annualHours = (reviews * 12 * minutes) / 60;
  const annualCapacity = annualHours * rate;
  const scale = Math.max(annualCapacity, cost, 1);
  const netValue = annualCapacity - cost;
  const minutesNeeded = reviews > 0 && rate > 0 ? (cost * 60) / (reviews * 12 * rate) : null;
  return (
    <section id="case-economics" tabIndex={-1} className="review-worksheet">
      <p className="study-kicker">Platform lead · Pilot worksheet</p>
      <h1>Would receipts save a second investigation?</h1>
      <p>
        <a href={caseHref}>Reopen the evidence desk</a>
      </p>
      <p>
        Compare the existing log search with a standard decision-log export and a shadow pilot that
        adds signed receipts. An export may already answer who requested what. A receipt also lets
        another reviewer check the signed payload against a known key.
      </p>
      <fieldset className="fixture-options">
        <legend>Try a monthly review volume</legend>
        {(
          [
            ['Occasional disputes', 30],
            ['Busy release desk', 120],
          ] as const
        ).map(([label, volume]) => (
          <button
            type="button"
            className="secondary-button"
            key={volume}
            aria-pressed={reviews === volume}
            onClick={() => setReviews(volume)}
          >
            {label} · {volume}
          </button>
        ))}
      </fieldset>
      <details className="pilot-assumptions">
        <summary>Change the pilot assumptions</summary>
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
      </details>
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
      <fieldset className="funding-options">
        <legend>What would you fund?</legend>
        <label>
          <input
            type="radio"
            name="funding"
            checked={option === 'logs'}
            onChange={() => setOption('logs')}
          />
          Keep the existing log search
        </label>
        <label>
          <input
            type="radio"
            name="funding"
            checked={option === 'export'}
            onChange={() => setOption('export')}
          />
          Standardize the decision-log export
        </label>
        <label>
          <input
            type="radio"
            name="funding"
            checked={option === 'pilot'}
            onChange={() => setOption('pilot')}
          />
          Run a signed-receipt shadow pilot
        </label>
      </fieldset>
      {option && (
        <p className="ticket-consequence" aria-live="polite">
          {option === 'logs'
            ? 'Time a change review using today’s tools. Track requests whose decision or issuer the analyst cannot reconstruct.'
            : option === 'export'
              ? 'Give reviewers the same fields and request IDs in every export. Measure how often they still need independent payload verification.'
              : `At these assumptions the pilot produces ${dollars.format(netValue)} in first-year net time value. ${netValue > 0 ? 'Test the modeled surplus against measured review time, coverage and custody cost.' : 'Identify a lower-cost design or a larger measurable benefit before expanding.'}`}
        </p>
      )}
      <details className="pilot-assumptions">
        <summary>How to measure the pilot</summary>
        <p>
          The platform security lead owns the pilot budget. Draw the sample from the gateway request
          log so that missing receipts stay visible. Have analysts review the same requests with the
          export and with receipts, alternating which they see first.
        </p>
        <ul>
          <li>
            <strong>Investigation quality.</strong> Count reviews that correctly identify the
            request, decision and reason, and flag a missing file history when execution is in
            question.
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
          The public key in this demo is shared for illustration. An operational pilot would need
          its own trusted key inventory.
        </p>
      </details>
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
