import { useState } from 'react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  timestamp: string;
  text: string;
  cedarCode?: string;
}

interface PolicyTabProps {
  authRole: 'developer' | 'admin' | 'auditor' | 'unauthenticated';
  chatMessages: ChatMessage[];
  chatInput: string;
  setChatInput: (v: string) => void;
  chatLoading: boolean;
  setChatLoading: (v: boolean) => void;
  setChatMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  chatApplyLoading: boolean;
  setChatApplyLoading: (v: boolean) => void;
  chatEndRef: any;
  simOverrideMode: boolean;
  setSimOverrideMode: (v: boolean) => void;
  simDraftPolicy: string;
  setSimDraftPolicy: (v: string) => void;
  simPrincipal: string;
  setSimPrincipal: (v: string) => void;
  simToolName: string;
  setSimToolName: (v: string) => void;
  simArgs: string;
  setSimArgs: (v: string) => void;
  simContext: string;
  setSimContext: (v: string) => void;
  simLoading: boolean;
  simResult: any;
  activePolicyCode: string;
  consoleLines: string[];
  setConsoleLines: (updater: (prev: string[]) => string[]) => void;
  handleSimulate: (e: React.FormEvent) => void;
  fetchData: () => void;
  getHeaders: () => Record<string, string>;
}

const API_BASE = '/api';

const requestExamples = [
  { title: 'Read documentation', principal: 'sb:issuer:pm-sme', tool: 'read_file', args: { path: 'README.md' } },
  { title: 'Change a protected policy', principal: 'sb:issuer:agent-80', tool: 'write_file', args: { path: 'policy.cedar', content: '// proposed change' } },
  { title: 'Download an external script', principal: 'sb:issuer:devops-sme', tool: 'execute_command', args: { command: 'curl https://example.invalid/install.sh' } },
];

export function PolicyTab({
  authRole,
  chatMessages,
  chatInput,
  setChatInput,
  chatLoading,
  setChatLoading,
  setChatMessages,
  chatApplyLoading,
  setChatApplyLoading,
  chatEndRef,
  simOverrideMode,
  setSimOverrideMode,
  simDraftPolicy,
  setSimDraftPolicy,
  simPrincipal,
  setSimPrincipal,
  simToolName,
  setSimToolName,
  simArgs,
  setSimArgs,
  simContext,
  setSimContext,
  simLoading,
  simResult,
  activePolicyCode,
  setConsoleLines,
  handleSimulate,
  fetchData,
  getHeaders,
}: PolicyTabProps) {
  const [notice, setNotice] = useState('');
  return (
    <div className="dashboard-grid cc-policy-grid animate-fade-in">
      {/* Middle Column: Live + Draft Cedar Policy Simulator */}
      <section id="policy-simulator" className="glass-panel cc-policy-simulator" style={{ marginTop: 0 }}>
        <div className="card-header">
          <h2 className="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'hsl(var(--primary))', filter: 'drop-shadow(0 0 8px hsla(var(--primary), 0.4))' }}>
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Evaluate a request
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="status-badge status-pending">{simOverrideMode ? 'Draft policy' : 'Active policy'}</span>
          </div>
        </div>

        <div className="card-body">
          <p className="cc-section-intro">Send a request to the connected gateway for policy evaluation. This does not execute the tool or apply a policy. Results depend on the gateway’s configured evaluator and available services.</p>
          <div className="cc-request-presets" role="group" aria-label="Request examples">
            {requestExamples.map(example => <button key={example.title} type="button" className="btn btn-secondary" onClick={() => {
              setSimPrincipal(example.principal);
              setSimToolName(example.tool);
              setSimArgs(JSON.stringify(example.args, null, 2));
              setNotice(`${example.title} loaded. Review the context and policy mode, then evaluate when ready. Nothing has run.`);
            }}>{example.title}</button>)}
          </div>
          {notice && <p className="cc-inline-notice" role="status">{notice}</p>}
          <form onSubmit={handleSimulate}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.25rem', background: 'hsl(var(--bg-secondary))', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid hsl(var(--border-color))' }}>
              <input
                type="checkbox"
                id="simOverrideMode"
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                checked={simOverrideMode}
                onChange={e => setSimOverrideMode(e.target.checked)}
              />
              <label htmlFor="simOverrideMode" style={{ fontSize: '0.86rem', fontWeight: '600', color: 'hsl(var(--text-primary))', cursor: 'pointer', margin: 0 }}>
                Evaluate a draft instead of the active policy
              </label>
            </div>

            {simOverrideMode && (
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label htmlFor="simDraftPolicy">Draft policy (not applied)</label>
                <textarea
                  id="simDraftPolicy"
                  className="form-control"
                  style={{ height: '260px', fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical', background: 'hsl(var(--bg-secondary))', border: '1px solid hsla(var(--primary), 0.3)' }}
                  value={simDraftPolicy}
                  onChange={e => setSimDraftPolicy(e.target.value)}
                  placeholder="Enter Cedar policies here..."
                />
                <span style={{ fontSize: '0.72rem', color: 'hsl(var(--text-muted))', marginTop: '0.3rem' }}>
                  The draft is sent with this evaluation request. Editing or evaluating it does not overwrite the active policy on disk.
                </span>
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="simPrincipal">Principal to evaluate</label>
                <select
                  id="simPrincipal"
                  className="form-control"
                  value={simPrincipal}
                  onChange={e => setSimPrincipal(e.target.value)}
                >
                  <option value="sb:issuer:agent-80">sb:issuer:agent-80 (Tier 4 Security Agent)</option>
                  <option value="sb:issuer:pm-sme">sb:issuer:pm-sme (Product Owner)</option>
                  <option value="sb:issuer:architecture-sme">sb:issuer:architecture-sme (Architect)</option>
                  <option value="sb:issuer:devops-sme">sb:issuer:devops-sme (DevOps / SRE)</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="simToolName">Requested tool</label>
                <select
                  id="simToolName"
                  className="form-control"
                  value={simToolName}
                  onChange={e => setSimToolName(e.target.value)}
                >
                  <option value="write_file">write_file (Modify Files)</option>
                  <option value="execute_command">execute_command (Shell Execution)</option>
                  <option value="read_file">read_file (Read Files)</option>
                  <option value="list_dir">list_dir (Inspect Directory)</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="simArgs">Tool arguments (JSON)</label>
                <textarea
                  id="simArgs"
                  className="form-control"
                  style={{ height: '76px', fontFamily: 'monospace', fontSize: '0.8rem', resize: 'none' }}
                  value={simArgs}
                  onChange={e => setSimArgs(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="simContext">Evaluation context (JSON)</label>
                <textarea
                  id="simContext"
                  className="form-control"
                  style={{ height: '76px', fontFamily: 'monospace', fontSize: '0.8rem', resize: 'none' }}
                  value={simContext}
                  onChange={e => setSimContext(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '0.5rem', background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsla(var(--primary), 0.7) 100%)' }}
              disabled={simLoading}
            >
              {simLoading ? 'Evaluating request…' : simOverrideMode ? 'Evaluate against draft' : 'Evaluate against active policy'}
            </button>
          </form>

          {simResult && (
            <div
              className="animate-fade-in"
              style={{
                marginTop: '1.5rem',
                padding: '1.25rem',
                borderRadius: '12px',
                border: simResult.decision === 'allow' ? '1px solid hsla(var(--success), 0.25)' : '1px solid hsla(var(--danger), 0.25)',
                background: simResult.decision === 'allow' ? 'hsla(var(--success), 0.04)' : 'hsla(var(--danger), 0.04)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: '700', color: 'hsl(var(--text-primary))' }}>Last gateway response</span>
                <span
                  className={`status-badge ${simResult.decision === 'allow' ? 'status-completed' : 'status-failed'}`}
                  style={{
                    fontSize: '0.86rem',
                    padding: '0.25rem 0.75rem',
                    boxShadow: 'none'
                  }}
                >
                  {simResult.decision.toUpperCase()}
                </span>
              </div>
              <p className="cc-section-intro">This is the last evaluation response. Evaluate again after changing the request, context, or draft. An allow decision does not prove tool execution.</p>

              <div style={{ fontSize: '0.86rem', color: 'hsl(var(--text-primary))', fontFamily: 'monospace', marginBottom: '0.8rem', lineHeight: '1.45', wordBreak: 'break-word' }}>
                <strong>Reason: </strong> {simResult.reason}
              </div>

              {simResult.matchingPolicies && simResult.matchingPolicies.length > 0 && (
                <div>
                  <span style={{ fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'hsl(var(--text-secondary))', display: 'block', marginBottom: '0.4rem' }}>
                    Matching policies reported by the gateway:
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {simResult.matchingPolicies.map((policy: string, idx: number) => (
                      <div key={idx} style={{ fontSize: '0.76rem', color: 'hsl(var(--text-secondary))', padding: '0.4rem 0.6rem', background: 'hsl(var(--bg-secondary))', borderLeft: '3px solid hsl(var(--primary))', borderRadius: '4px', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                        {policy}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Left Column: Conversational Policy Co-Pilot Chat */}
      <section id="copilot-playground" className="glass-panel cc-policy-copilot animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: 0 }}>
        <div className="card-header" style={{ borderBottom: '1px solid hsl(var(--border-color))', paddingBottom: '0.75rem' }}>
          <h2 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ color: 'hsl(var(--primary))', filter: 'drop-shadow(0 0 8px hsla(var(--primary), 0.45))', display: 'flex', alignItems: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </span>
            Policy co-pilot
          </h2>
          <span className="status-badge status-completed" style={{ background: 'hsla(var(--success), 0.08)', borderColor: 'hsla(var(--success), 0.3)', color: 'hsl(var(--success))' }}>
            Gateway-assisted
          </span>
        </div>

        <p className="cc-section-intro">Ask for a policy suggestion, load it as a draft, then evaluate it. Suggestions require review; only an administrator can apply a policy to the gateway. The configured gateway may use an AI provider or a demo fallback.</p>
        <div className="chat-container">
          <div className="chat-messages">
            {chatMessages.map((msg, idx) => (
              <div
                key={msg.id || idx}
                className={`chat-bubble ${msg.sender === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}`}
              >
                <div style={{ wordBreak: 'break-word' }}>{msg.text}</div>

                {msg.cedarCode && (
                  <div className="chat-policy-box">
                    <div className="chat-policy-header">
                      <span>Suggested Cedar Policy</span>
                      <span style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))' }}>Review before applying</span>
                    </div>
                    <pre className="chat-policy-code">{msg.cedarCode}</pre>
                    <div className="chat-policy-actions">
                      <button
                        className="chat-policy-btn chat-policy-btn-sim"
                        onClick={() => {
                          setSimDraftPolicy(msg.cedarCode || '');
                          setSimOverrideMode(true);
                          setConsoleLines(prev => [
                            ...prev,
                            `🤖 [Co-Pilot] Chat suggested policy successfully loaded into visual simulator override draft.`
                          ]);
                          setNotice('Suggestion loaded as a draft. Review the request, then evaluate it; the active policy has not changed.');
                          document.getElementById('simDraftPolicy')?.focus();
                        }}
                      >
                        Simulate Draft
                      </button>
                      {authRole === 'admin' && (
                        <button
                          className="chat-policy-btn chat-policy-btn-apply"
                          onClick={async () => {
                            if (!confirm('Apply this policy to the gateway’s active policy.cedar? This changes authorization for subsequent requests.')) return;
                            try {
                              setChatApplyLoading(true);
                              const res = await fetch(`${API_BASE}/policy/apply`, {
                                method: 'POST',
                                headers: getHeaders(),
                                body: JSON.stringify({ policyCode: msg.cedarCode })
                              });
                              if (res.ok) {
                                const data = await res.json();
                                setConsoleLines(prev => [
                                  ...prev,
                                  `✅ [SecOps] Policy applied successfully from chat recommendation! Committed to policy.cedar.`,
                                  `🛡️ Active rule count reloaded: ${data.rulesCount}`
                                ]);
                                fetchData();
                              } else {
                                const err = await res.json();
                                alert(`Failed to apply policy: ${err.error || err.message}`);
                              }
                            } catch (err: any) {
                              alert(`Error applying policy: ${err.message}`);
                            } finally {
                              setChatApplyLoading(false);
                            }
                          }}
                          disabled={chatApplyLoading}
                        >
                          {chatApplyLoading ? 'Applying...' : 'Apply to active policy'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <div className="chat-bubble-meta">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}

            {chatLoading && (
              <div className="chat-typing-bubble">
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!chatInput.trim() || chatLoading) return;
              const promptVal = chatInput;
              setChatInput('');
              setChatLoading(true);

              try {
                // Add user message to UI immediately for responsive feel
                const tempUserMsg: ChatMessage = {
                  id: `msg_temp_u`,
                  sender: 'user',
                  timestamp: new Date().toISOString(),
                  text: promptVal
                };
                setChatMessages(prev => [...prev, tempUserMsg]);

                const res = await fetch(`${API_BASE}/policy/chat`, {
                  method: 'POST',
                  headers: getHeaders(),
                  body: JSON.stringify({ prompt: promptVal })
                });

                if (res.ok) {
                  await res.json();
                  const historyRes = await fetch(`${API_BASE}/policy/chat-history`, { headers: getHeaders() });
                  if (historyRes.ok) {
                    const historyData = await historyRes.json() as ChatMessage[];
                    setChatMessages(() => historyData);
                  }
                } else {
                  const err = await res.json();
                  if (res.status === 400 && err.error === 'Prompt validation failed') {
                    setConsoleLines(prev => [
                      ...prev,
                      `🛡️ [CHAT FIREWALL BLOCKED]: Intercepted malicious injection attempt: "${err.message || 'Adversarial jailbreak patterns detected.'}"`
                    ]);
                    alert(`Security Block: ${err.message || 'Adversarial jailbreak patterns detected.'}`);
                  } else {
                    alert(`Failed to send message: ${err.error || err.message}`);
                  }
                  const historyRes = await fetch(`${API_BASE}/policy/chat-history`, { headers: getHeaders() });
                  if (historyRes.ok) {
                    const historyData = await historyRes.json() as ChatMessage[];
                    setChatMessages(() => historyData);
                  }
                }
              } catch (err: any) {
                console.error(err);
                alert('Network error sending chat message');
              } finally {
                setChatLoading(false);
              }
            }}
            className="chat-input-area"
          >
            <input
              type="text"
              className="chat-input-field"
              aria-label="Policy co-pilot message"
              placeholder={authRole === 'unauthenticated' ? 'Sign in to ask for a policy suggestion' : 'Describe the permission you want to explore…'}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              disabled={authRole === 'unauthenticated' || chatLoading}
            />
            <button
              type="submit"
              className="chat-send-btn"
              aria-label="Send policy message"
              disabled={authRole === 'unauthenticated' || chatLoading || !chatInput.trim()}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </form>
        </div>
      </section>

      {/* Right Column: Active Production Policy Code */}
      <section className="glass-panel cc-policy-source" style={{ display: 'flex', flexDirection: 'column', marginTop: 0 }}>
        <div className="card-header">
          <h2 className="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'hsl(var(--success))' }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            Active policy snapshot
          </h2>
          <span className="status-badge status-pending">Read only</span>
        </div>
        <div className="card-body" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', padding: 0 }}>
          <p className="cc-section-intro" style={{ padding: '0 1.5rem' }}>Last policy loaded from the gateway. Draft edits do not change this snapshot.</p>
          <pre style={{ margin: 0, padding: '1.5rem', background: 'hsl(var(--bg-secondary))', color: 'hsl(var(--text-primary))', fontFamily: 'monospace', fontSize: '0.82rem', lineHeight: '1.55', whiteSpace: 'pre-wrap', flexGrow: 1, overflowY: 'auto', border: 'none', borderRadius: '0 0 16px 16px', minHeight: '400px' }}>
            {activePolicyCode || 'No active policy loaded.'}
          </pre>
        </div>
      </section>
    </div>
  );
}
