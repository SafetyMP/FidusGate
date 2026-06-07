import { AuditReceipt } from '@fidusgate/core-types';

interface VerificationResult {
  status: 'idle' | 'valid' | 'invalid' | 'error';
  message: string;
  payload?: any;
}

interface ForensicsTabProps {
  forensicLogs: any[];
  receipts: AuditReceipt[];
  isChainValid: boolean | null;
  forensicSearch: string;
  setForensicSearch: (v: string) => void;
  forensicStatusFilter: 'all' | 'success' | 'failed' | 'denied';
  setForensicStatusFilter: (v: 'all' | 'success' | 'failed' | 'denied') => void;
  authRole: 'developer' | 'admin' | 'auditor' | 'unauthenticated';
  receiptInput: string;
  setReceiptInput: (v: string) => void;
  verificationResult: VerificationResult;
  handleVerifyReceipt: () => void;
  handleDownloadComplianceReceipt: (logId: string) => void;
}

export function ForensicsTab({
  forensicLogs,
  receipts,
  isChainValid,
  forensicSearch,
  setForensicSearch,
  forensicStatusFilter,
  setForensicStatusFilter,
  authRole,
  receiptInput,
  setReceiptInput,
  verificationResult,
  handleVerifyReceipt,
  handleDownloadComplianceReceipt,
}: ForensicsTabProps) {
  const filteredLogs = forensicLogs.filter((logItem: any) => {
    const query = forensicSearch.toLowerCase();
    const matchesSearch = 
      logItem.command.toLowerCase().includes(query) ||
      logItem.user.toLowerCase().includes(query) ||
      logItem.role.toLowerCase().includes(query) ||
      logItem.id.toLowerCase().includes(query);

    if (forensicStatusFilter === 'all') return matchesSearch;
    if (forensicStatusFilter === 'success') return matchesSearch && logItem.status === 'success' && logItem.cedarDecision === 'allow';
    if (forensicStatusFilter === 'failed') return matchesSearch && logItem.status === 'failed' && logItem.cedarDecision === 'allow';
    if (forensicStatusFilter === 'denied') return matchesSearch && logItem.cedarDecision === 'deny';
    return matchesSearch;
  });

  return (
    <div className="dashboard-grid animate-fade-in">
      {/* Left Column: Receipts List & Offline Verifier */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Verifiable Cedar Policy Receipts */}
        <section className="glass-panel">
          <div className="card-header">
            <h2 className="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'hsl(var(--info))' }}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Verifiable Cedar Policy Receipts
            </h2>
            {isChainValid === true ? (
              <span className="status-badge status-completed" style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', borderColor: 'hsla(var(--success), 0.3)', background: 'hsla(var(--success), 0.1)', color: 'hsl(var(--success))' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Hash Chain Intact
              </span>
            ) : isChainValid === false ? (
              <span className="status-badge status-failed" style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', borderColor: 'hsla(var(--danger), 0.3)', background: 'hsla(var(--danger), 0.1)', color: 'hsl(var(--danger))' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                Hash Chain Corrupted!
              </span>
            ) : (
              <span className="status-badge status-pending">Checking Chain...</span>
            )}
          </div>

          <div className="card-body">
            <div className="receipt-list">
              {receipts.map((rc, idx) => (
                <div className="receipt-card" key={idx}>
                  <div className="receipt-meta">
                    <span className="receipt-tool">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'hsl(var(--info))' }}>
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                      </svg>
                      Tool: {rc.payload.tool_name}
                    </span>
                    <span className={`status-badge ${rc.payload.decision === 'allow' ? 'status-completed' : 'status-failed'}`}>
                      {rc.payload.decision}
                    </span>
                  </div>
                  <div className="receipt-reason">{rc.payload.reason}</div>
                  <div className="receipt-signature-block">
                    <span className="receipt-digest">policy: {rc.payload.policy_digest.substring(0, 15)}</span>
                    <span className="signature-verified">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      ✓ ED25519 VERIFIED
                    </span>
                  </div>
                </div>
              ))}
              {receipts.length === 0 && (
                <p style={{ color: 'hsl(var(--text-secondary))', textAlign: 'center', padding: '3rem' }}>
                  No policy receipts logged or access unauthorized.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Offline Cryptographic Receipt Verifier */}
        <section className="glass-panel">
          <div className="card-body" style={{ padding: '1.4rem' }}>
            <div className="verifier-box" style={{ background: 'transparent', border: 'none', padding: 0 }}>
              <h3 className="card-title" style={{ fontSize: '0.92rem', marginBottom: '0.8rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'hsl(var(--primary))' }}>
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                </svg>
                Offline Cryptographic Receipt Verifier
              </h3>
              <textarea 
                className="form-control" 
                placeholder='Paste signed JSON receipt here e.g. {"payload": {...}, "signature": {...}}'
                value={receiptInput}
                onChange={e => setReceiptInput(e.target.value)}
                style={{ marginBottom: '0.8rem' }}
              />
              <button className="btn btn-secondary" onClick={handleVerifyReceipt} style={{ width: '100%', marginBottom: '0.8rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 11.08V12a8 8 0 1 1-4.8-7.32M22 4 12 14.01l-3-3"/>
                </svg>
                Verify Receipt Authenticity
              </button>

              {verificationResult.status !== 'idle' && (
                <div className={`verification-result result-${verificationResult.status === 'valid' ? 'valid' : 'invalid'}`} style={{ animation: 'none' }}>
                  <strong style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {verificationResult.status === 'valid' ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    )}
                    {verificationResult.message}
                  </strong>
                  {verificationResult.payload && (
                    <span style={{ fontSize: '0.75rem', marginTop: '0.3rem', fontFamily: 'monospace', color: 'hsl(var(--text-secondary))' }}>
                      Issuer: {verificationResult.payload.issuer_id} <span style={{ color: 'hsl(var(--text-muted))' }}>|</span> Issued: {new Date(verificationResult.payload.issued_at).toLocaleString()}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Right Column: Forensic Command Timeline */}
      <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="card-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <h2 className="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'hsl(var(--info))', filter: 'drop-shadow(0 0 8px hsla(var(--info), 0.4))' }}>
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              Forensic Command Timeline
            </h2>
            <span className="status-badge status-pending">{filteredLogs.length} / {forensicLogs.length} Events</span>
          </div>

          {/* SecOps Search & Filtering Bar */}
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', width: '100%' }}>
            <div style={{ position: 'relative', flexGrow: 1 }}>
              <input 
                type="text" 
                className="form-control" 
                placeholder="Search audited commands, actors, roles, or log IDs..." 
                value={forensicSearch}
                onChange={e => setForensicSearch(e.target.value)}
                style={{ width: '100%', paddingLeft: '2.2rem', fontSize: '0.82rem', height: '36px' }}
              />
              <div style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--text-secondary))', pointerEvents: 'none' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.35rem', background: 'rgba(0, 0, 0, 0.2)', padding: '0.2rem', borderRadius: '8px', border: '1px solid hsl(var(--border-color))' }}>
              <button 
                className={`btn ${forensicStatusFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`} 
                onClick={() => setForensicStatusFilter('all')} 
                style={{ padding: '0.25rem 0.65rem', fontSize: '0.72rem', height: '28px', minHeight: 'auto' }}
              >
                All
              </button>
              <button 
                className={`btn ${forensicStatusFilter === 'success' ? 'btn-primary' : 'btn-secondary'}`} 
                onClick={() => setForensicStatusFilter('success')} 
                style={{ padding: '0.25rem 0.65rem', fontSize: '0.72rem', height: '28px', minHeight: 'auto' }}
              >
                Success
              </button>
              <button 
                className={`btn ${forensicStatusFilter === 'failed' ? 'btn-primary' : 'btn-secondary'}`} 
                onClick={() => setForensicStatusFilter('failed')} 
                style={{ padding: '0.25rem 0.65rem', fontSize: '0.72rem', height: '28px', minHeight: 'auto' }}
              >
                Failed
              </button>
              <button 
                className={`btn ${forensicStatusFilter === 'denied' ? 'btn-primary' : 'btn-secondary'}`} 
                onClick={() => setForensicStatusFilter('denied')} 
                style={{ padding: '0.25rem 0.65rem', fontSize: '0.72rem', height: '28px', minHeight: 'auto' }}
              >
                Blocked
              </button>
            </div>
          </div>
        </div>

        <div className="card-body" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '1.1rem', maxHeight: '580px', overflowY: 'auto', paddingRight: '0.35rem' }}>
          {filteredLogs.map((logItem: any) => {
            const isAllow = logItem.cedarDecision === 'allow';
            const isSuccess = logItem.status === 'success';
            return (
              <div 
                key={logItem.id} 
                style={{ 
                  background: 'rgba(0, 0, 0, 0.25)', 
                  border: '1px solid hsl(var(--border-color))', 
                  borderRadius: '12px', 
                  padding: '1rem',
                  transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.65rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.62rem', fontWeight: '700', textTransform: 'uppercase', background: 'rgba(255, 255, 255, 0.08)', padding: '0.15rem 0.4rem', borderRadius: '4px', color: '#fff' }}>
                      ID: {logItem.id}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'hsl(var(--text-secondary))' }}>
                      {new Date(logItem.timestamp).toLocaleString()}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <span className={`status-badge ${isAllow ? 'status-completed' : 'status-failed'}`} style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem' }}>
                      cedar: {logItem.cedarDecision}
                    </span>
                    <span className={`status-badge ${isSuccess ? 'status-completed' : 'status-failed'}`} style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem' }}>
                      run: {logItem.status} (exit: {logItem.exitCode})
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))' }}>
                      Invoked by: <strong style={{ color: '#fff' }}>{logItem.user}</strong> ({logItem.role})
                    </span>
                  </div>
                  <pre style={{ margin: '0.4rem 0 0 0', padding: '0.65rem 0.85rem', background: '#05070f', border: '1px solid hsl(var(--border-color))', borderRadius: '6px', fontSize: '0.76rem', color: '#ffaa00', fontFamily: 'monospace', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                    {logItem.command}
                  </pre>
                </div>

                {(authRole === 'admin' || authRole === 'auditor') && (
                  <button 
                    onClick={() => handleDownloadComplianceReceipt(logItem.id)}
                    className="btn btn-secondary" 
                    style={{ 
                      width: '100%', 
                      padding: '0.35rem 0.85rem', 
                      fontSize: '0.75rem', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: '0.4rem',
                      marginTop: '0.2rem',
                      borderColor: 'hsla(var(--info), 0.3)',
                      background: 'hsla(var(--info), 0.05)',
                      color: 'hsl(var(--info))'
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Download Forensic Compliance Receipt
                  </button>
                )}
              </div>
            );
          })}

          {filteredLogs.length === 0 && (
            <p style={{ color: 'hsl(var(--text-secondary))', textAlign: 'center', padding: '3rem' }}>
              {forensicLogs.length === 0 
                ? 'No sandboxed commands audited yet. standing by for VM shell activity...' 
                : 'No audited command logs match your active search filters.'}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
