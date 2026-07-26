import type { Transaction } from '@fidusgate/core-types';

interface LedgerTabProps {
  transactions: Transaction[];
  txNotification: { message: string; type: 'success' | 'warn' } | null;
  txError?: string | null;
  txSender: string;
  setTxSender: (v: string) => void;
  txRecipient: string;
  setTxRecipient: (v: string) => void;
  txAmount: string;
  setTxAmount: (v: string) => void;
  txCurrency: string;
  setTxCurrency: (v: string) => void;
  txLoading: boolean;
  formAction: (payload: FormData) => void;
}

export function LedgerTab({
  transactions,
  txNotification,
  txError,
  txSender,
  setTxSender,
  txRecipient,
  setTxRecipient,
  txAmount,
  setTxAmount,
  txCurrency,
  setTxCurrency,
  txLoading,
  formAction,
}: LedgerTabProps) {
  return (
    <div
      className="dashboard-grid animate-fade-in"
      id="panel-ledger"
      role="tabpanel"
      aria-labelledby="tab-ledger"
    >
      <section className="glass-panel" aria-labelledby="ledger-form-title">
        <div className="card-header">
          <h2 className="card-title" id="ledger-form-title">
            Secure Transaction Gateway
          </h2>
          <span className="status-badge status-completed">PII Auto-Filtering Active</span>
        </div>

        <div className="card-body">
          {txNotification && (
            <div
              className="verification-result animate-fade-in"
              role="status"
              style={{
                marginBottom: '1.25rem',
                background:
                  txNotification.type === 'warn'
                    ? 'hsla(var(--warning), 0.06)'
                    : 'hsla(var(--success), 0.06)',
                border:
                  txNotification.type === 'warn'
                    ? '1px solid hsla(var(--warning), 0.2)'
                    : '1px solid hsla(var(--success), 0.2)',
                color:
                  txNotification.type === 'warn' ? 'hsl(var(--warning))' : 'hsl(var(--success))',
              }}
            >
              {txNotification.message}
            </div>
          )}
          {txError && (
            <div className="verification-result" role="alert" style={{ marginBottom: '1rem' }}>
              {txError}
            </div>
          )}

          <form action={formAction}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="sender">Sender (Corporate Account or Email Address)</label>
                <input
                  type="text"
                  id="sender"
                  name="sender"
                  className="form-control"
                  placeholder="e.g. developer@fidusgate.internal"
                  value={txSender}
                  onChange={(e) => setTxSender(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="recipient">Recipient (Vendor Name or Wallet Address)</label>
                <input
                  type="text"
                  id="recipient"
                  name="recipient"
                  className="form-control"
                  placeholder="e.g. ModelAPI Inference"
                  value={txRecipient}
                  onChange={(e) => setTxRecipient(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="amount">Amount</label>
                <input
                  type="number"
                  id="amount"
                  name="amount"
                  className="form-control"
                  placeholder="e.g. 500.00"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="currency">Currency</label>
                <select
                  id="currency"
                  name="currency"
                  className="form-control"
                  value={txCurrency}
                  onChange={(e) => setTxCurrency(e.target.value)}
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '0.6rem' }}
              disabled={txLoading}
            >
              {txLoading ? 'Registering…' : 'Submit Transaction to Secure Gateway'}
            </button>
          </form>
        </div>
      </section>

      <section className="glass-panel" aria-labelledby="ledger-table-title">
        <div className="card-header">
          <h2 className="card-title" id="ledger-table-title">
            Transactional Stream Ledger
          </h2>
          <span className="status-badge status-pending">{transactions.length} Records</span>
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Sender</th>
                  <th scope="col">Recipient</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{tx.id}</td>
                    <td>
                      {tx.sender}
                      {tx.maskedPii && (
                        <span
                          style={{
                            marginLeft: '0.5rem',
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            background: 'hsla(var(--warning), 0.1)',
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                            color: 'hsl(var(--warning))',
                            border: '1px solid hsla(var(--warning), 0.15)',
                          }}
                        >
                          masked
                        </span>
                      )}
                    </td>
                    <td>{tx.recipient}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                      {tx.amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      {tx.currency}
                    </td>
                    <td>
                      <span className={`status-badge status-${tx.status}`}>{tx.status}</span>
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        textAlign: 'center',
                        color: 'hsl(var(--text-secondary))',
                        padding: '3rem',
                      }}
                    >
                      No transaction records registered or access unauthorized. Please log in.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
