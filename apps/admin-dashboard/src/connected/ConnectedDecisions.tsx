import type { AuditReceipt } from '@fidusgate/core-types';
import { useEffect, useRef, useState } from 'react';

export type ReceiptLoadStatus = 'loading' | 'ready' | 'unauthorized' | 'error';

export interface ConnectedDecisionsProps {
  receipts: AuditReceipt[];
  status: ReceiptLoadStatus;
  isChainValid: boolean | null;
  onVerify: (receipt: AuditReceipt) => void;
  onRetry: () => void;
}

function resourceFor(receipt: AuditReceipt): string {
  const args: Record<string, unknown> | undefined = receipt.payload.args;
  if (!args) return 'No resource recorded';
  for (const key of ['path', 'resource', 'command', 'url', 'directory']) {
    const value = args[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return Object.keys(args).length ? JSON.stringify(args) : 'No resource recorded';
}

function receiptKey(receipt: AuditReceipt): string {
  return JSON.stringify(receipt);
}

function DecisionBadge({ decision }: { decision: AuditReceipt['payload']['decision'] }) {
  return (
    <span className={`cc-badge ${decision}`}>{decision === 'allow' ? 'Allowed' : 'Denied'}</span>
  );
}

function downloadReceipt(receipt: AuditReceipt) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'fidusgate-tool-call-receipt.json';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function ConnectedDecisions({
  receipts,
  status,
  isChainValid,
  onVerify,
  onRetry,
}: ConnectedDecisionsProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'allow' | 'deny'>('all');
  const [selection, setSelection] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const detailRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusRequest > 0 && window.matchMedia?.('(max-width: 1000px)').matches) {
      detailRef.current?.focus();
    }
  }, [focusRequest]);

  if (status === 'loading') {
    return (
      <section className="cc-surface cc-empty-state" role="status" aria-busy="true">
        <h2>Loading gateway receipts</h2>
        <p>The console is requesting the receipts your session can access.</p>
      </section>
    );
  }
  if (status === 'unauthorized') {
    return (
      <section className="cc-surface cc-empty-state" role="status">
        <h2>Sign in to inspect decisions</h2>
        <p>The gateway requires an authorized session to read its receipt log.</p>
        <p>Use the session controls above, then refresh the receipt log.</p>
        <button type="button" className="cc-secondary-button" onClick={onRetry}>
          Refresh receipts
        </button>
      </section>
    );
  }
  if (status === 'error') {
    return (
      <section className="cc-surface cc-empty-state" role="alert">
        <h2>Receipts are unavailable</h2>
        <p>
          The gateway did not return a usable receipt log. Previous records are hidden until a new
          request succeeds.
        </p>
        <button type="button" className="cc-primary-button" onClick={onRetry}>
          Retry receipts
        </button>
      </section>
    );
  }
  if (!receipts.length) {
    return (
      <section className="cc-surface cc-empty-state">
        <h2>No receipts recorded</h2>
        <p>
          The gateway returned an empty receipt log. Signed tool-call decisions will appear here
          when available.
        </p>
        <button type="button" className="cc-secondary-button" onClick={onRetry}>
          Refresh receipts
        </button>
      </section>
    );
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = receipts.filter((receipt) => {
    const { payload, signature } = receipt;
    const matchesDecision = filter === 'all' || payload.decision === filter;
    const searchable = [
      payload.tool_name,
      payload.issuer_id,
      resourceFor(receipt),
      payload.policy_digest,
      payload.issued_at,
      payload.reason ?? '',
      signature.kid,
    ]
      .join(' ')
      .toLowerCase();
    return matchesDecision && searchable.includes(normalizedQuery);
  });
  const occurrences = new Map<string, number>();
  const rows = filtered.map((receipt) => {
    const identity = receiptKey(receipt);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return { receipt, key: `${identity}:${occurrence}` };
  });
  const selectedRow = rows.find((row) => row.key === selection) ?? rows[0];
  const selected = selectedRow?.receipt;
  const allowed = receipts.filter((receipt) => receipt.payload.decision === 'allow').length;

  return (
    <>
      <section className="cc-metrics" aria-label="Gateway receipt summary">
        <div>
          <span>Recorded receipts</span>
          <strong>{receipts.length}</strong>
        </div>
        <div>
          <span>Allowed decisions</span>
          <strong>{allowed}</strong>
        </div>
        <div>
          <span>Denied decisions</span>
          <strong>{receipts.length - allowed}</strong>
        </div>
        <div>
          <span>Gateway chain check</span>
          <strong className="cc-chain-status">
            {isChainValid === true ? 'Intact' : isChainValid === false ? 'Failed' : 'Unavailable'}
          </strong>
        </div>
      </section>
      <p className={`cc-notice ${isChainValid === false ? 'error' : ''}`}>
        {isChainValid === false
          ? 'The gateway reported a failed receipt-chain check. Investigate the chain before relying on this log. '
          : ''}
        The chain check is separate from signature verification. Individual receipts are not
        verified merely by appearing here.
      </p>
      <div className="cc-split cc-decision-split">
        <section className="cc-surface" aria-label="Gateway decision log">
          <div className="cc-section-heading">
            <h2>Decision log</h2>
            <span>{receipts.length} receipts</span>
          </div>
          <div className="cc-filter-row">
            <label className="cc-search">
              <span>Search receipts</span>
              <input
                ref={searchRef}
                type="search"
                value={query}
                placeholder="Tool, issuer, resource, or digest"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label>
              <span>Decision</span>
              <select
                className="cc-field"
                value={filter}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === 'all' || value === 'allow' || value === 'deny') setFilter(value);
                }}
              >
                <option value="all">All decisions</option>
                <option value="allow">Allowed</option>
                <option value="deny">Denied</option>
              </select>
            </label>
          </div>
          {filtered.length ? (
            <div className="cc-table-wrap">
              <table className="cc-decision-table">
                <thead>
                  <tr>
                    <th scope="col">Tool / resource</th>
                    <th scope="col">Issuer</th>
                    <th scope="col">Decision</th>
                    <th scope="col">Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ receipt, key }) => {
                    const isSelected = selectedRow?.key === key;
                    return (
                      <tr key={key} className={isSelected ? 'is-selected' : undefined}>
                        <td>
                          <button
                            type="button"
                            className="cc-row-button"
                            aria-label={`Inspect ${receipt.payload.tool_name} by ${receipt.payload.issuer_id} at ${receipt.payload.issued_at}`}
                            aria-pressed={Boolean(isSelected)}
                            onClick={() => {
                              setSelection(key);
                              setFocusRequest((current) => current + 1);
                            }}
                          >
                            <strong>{receipt.payload.tool_name}</strong>
                            <span className="cc-resource" title={resourceFor(receipt)}>
                              {resourceFor(receipt)}
                            </span>
                          </button>
                        </td>
                        <td>{receipt.payload.issuer_id}</td>
                        <td>
                          <DecisionBadge decision={receipt.payload.decision} />
                        </td>
                        <td>
                          <time dateTime={receipt.payload.issued_at}>
                            {receipt.payload.issued_at}
                          </time>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="cc-empty-state">
              <h3>No matching receipts</h3>
              <p>Try a different tool, issuer, resource, or decision.</p>
              <button
                type="button"
                className="cc-secondary-button"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                Clear filters
              </button>
            </div>
          )}
          <p className="cc-description">
            Showing {filtered.length} of {receipts.length} receipts · Recorded gateway order
          </p>
        </section>
        {selected && (
          <aside
            ref={detailRef}
            tabIndex={-1}
            className="cc-surface cc-detail"
            aria-label="Selected gateway decision"
          >
            <div className="cc-section-heading">
              <h2>Decision detail</h2>
              <DecisionBadge decision={selected.payload.decision} />
            </div>
            <h3>{selected.payload.tool_name}</h3>
            <div className={`cc-notice ${selected.payload.decision === 'deny' ? 'warning' : ''}`}>
              <strong>
                {selected.payload.decision === 'deny'
                  ? 'Why was this denied?'
                  : 'Why was this allowed?'}
              </strong>
              <p>
                {selected.payload.reason ||
                  'The gateway did not record a reason for this decision.'}
              </p>
            </div>
            <dl className="cc-fields">
              <div>
                <dt>Issuer</dt>
                <dd>{selected.payload.issuer_id}</dd>
              </div>
              <div>
                <dt>Resource</dt>
                <dd>
                  <code>{resourceFor(selected)}</code>
                </dd>
              </div>
              <div>
                <dt>Policy digest</dt>
                <dd>
                  <code>{selected.payload.policy_digest}</code>
                </dd>
              </div>
              <div>
                <dt>Recorded</dt>
                <dd>
                  <time dateTime={selected.payload.issued_at}>{selected.payload.issued_at}</time>
                </dd>
              </div>
              <div>
                <dt>Signing key</dt>
                <dd>
                  <code>{selected.signature.kid}</code>
                </dd>
              </div>
              <div>
                <dt>Individual signature</dt>
                <dd>
                  <span className="cc-badge unknown">Not verified in this view</span>
                </dd>
              </div>
            </dl>
            <p className="cc-description">
              Verify this exact receipt with the configured gateway. An allow decision or valid
              signature alone does not prove tool execution.
            </p>
            <div className="cc-actions">
              <button
                type="button"
                className="cc-primary-button"
                onClick={() => onVerify(selected)}
              >
                Verify this receipt
              </button>
              <button
                type="button"
                className="cc-secondary-button"
                onClick={() => downloadReceipt(selected)}
              >
                Download receipt
              </button>
            </div>
            <details>
              <summary>View request arguments</summary>
              <pre className="cc-code">{JSON.stringify(selected.payload.args ?? {}, null, 2)}</pre>
            </details>
            <details>
              <summary>View complete receipt</summary>
              <pre className="cc-code">{JSON.stringify(selected, null, 2)}</pre>
            </details>
            <button
              type="button"
              className="cc-text-button"
              onClick={() => searchRef.current?.focus()}
            >
              Back to decision search
            </button>
          </aside>
        )}
      </div>
    </>
  );
}
