export interface ConnectedVerificationResult {
  status: 'idle' | 'valid' | 'invalid' | 'error';
  message: string;
  payload?: unknown;
}

export interface ConnectedVerifierProps {
  input: string;
  onInputChange: (value: string) => void;
  onVerify: () => void;
  result: ConnectedVerificationResult;
  busy: boolean;
}

function resultTitle(status: ConnectedVerificationResult['status']): string {
  switch (status) {
    case 'idle':
      return 'Ready to verify';
    case 'valid':
      return 'Gateway verified the signature';
    case 'invalid':
      return 'Receipt did not verify';
    case 'error':
      return 'Verification could not complete';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function ConnectedVerifier({
  input,
  onInputChange,
  onVerify,
  result,
  busy,
}: ConnectedVerifierProps) {
  return (
    <div className="cc-split cc-verifier-split">
      <section className="cc-surface">
        <div className="cc-section-heading">
          <h2>Receipt JSON</h2>
          <span>Gateway verification</span>
        </div>
        <p className="cc-description">
          Paste a receipt or choose one from Decisions. This request is sent to your configured
          gateway, which checks its configured keys and any supplied attestation.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && input.trim()) onVerify();
          }}
        >
          <label htmlFor="gateway-receipt-json">Signed receipt</label>
          <textarea
            id="gateway-receipt-json"
            className="cc-field cc-receipt-input"
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            spellCheck={false}
            placeholder={'{\n  "payload": { … },\n  "signature": { … }\n}'}
          />
          <div className="cc-actions">
            <button type="submit" className="cc-primary-button" disabled={busy || !input.trim()}>
              {busy ? 'Checking with gateway…' : 'Verify signature'}
            </button>
            <button
              type="button"
              className="cc-secondary-button"
              disabled={!input && result.status === 'idle'}
              onClick={() => onInputChange('')}
            >
              Clear receipt
            </button>
          </div>
        </form>
        <p className="cc-description">
          Verification uses the gateway endpoint. It does not store a new receipt or execute a tool.
        </p>
      </section>
      <section className="cc-surface" aria-label="Gateway verification result">
        <div className="cc-section-heading">
          <h2>Verification result</h2>
        </div>
        <div
          role="status"
          aria-live="polite"
          aria-busy={busy}
          className={`cc-verification-result ${busy ? 'idle' : result.status}`}
        >
          <h3>{busy ? 'Waiting for the gateway' : resultTitle(result.status)}</h3>
          <p>
            {busy
              ? 'Checking this receipt against the gateway’s configured verification keys.'
              : result.status === 'idle'
                ? 'Submit a receipt to check its cryptographic signature.'
                : result.message}
          </p>
        </div>
        <h3>What a valid result establishes</h3>
        <p className="cc-description">
          The gateway accepted the signature for this payload under its configured verification
          rules. Trust in the signing identity depends on your gateway and key configuration.
        </p>
        <h3>Keep the scope clear</h3>
        <p className="cc-description">
          A valid signature does not establish that a tool ran, that its output was correct, or that
          a policy is appropriate. Local demo keys remain demonstration keys.
        </p>
        {result.status !== 'idle' && !busy && result.payload !== undefined && (
          <details>
            <summary>View checked payload</summary>
            <pre className="cc-code">{JSON.stringify(result.payload, null, 2)}</pre>
          </details>
        )}
      </section>
    </div>
  );
}
