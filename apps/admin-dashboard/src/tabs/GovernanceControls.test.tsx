import '@testing-library/jest-dom/vitest';
import { createRef, type ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComplianceTab } from './ComplianceTab';
import { SandboxTab } from './SandboxTab';

afterEach(cleanup);

function governanceProps(): ComponentProps<typeof ComplianceTab> {
  return {
    authRole: 'auditor', authEmail: 'auditor@example.test', attestedClaims: null,
    ibpState: null, driftState: [], driftSyncLoading: false,
    systemConfig: { circuitBreakerActive: false }, systemConfigLoading: false,
    prometheusMetrics: { available: false, latencyHistory: [], requestRateHistory: [] },
    findings: [], plmState: null, pendingPatch: { exists: true, patch: '+change' }, patchApplyLoading: false,
    consensusRequests: [], consensusLoading: false, budgetExtensions: [],
    budgetExtensionAmount: 100, setBudgetExtensionAmount: vi.fn(), budgetExtensionReason: '',
    setBudgetExtensionReason: vi.fn(), budgetExtensionLoading: false, feedbackRole: 'Auditor',
    setFeedbackRole: vi.fn(), feedbackComment: '', setFeedbackComment: vi.fn(),
    feedbackSeverity: 'warn', setFeedbackSeverity: vi.fn(), feedbackLoading: false,
    alignJustification: '', setAlignJustification: vi.fn(), alignLoading: false,
    handleExportAuditReport: vi.fn(), handleToggleCircuitBreaker: vi.fn(), handleDriftSync: vi.fn(),
    handleApplyPatch: vi.fn(), handleApproveConsensus: vi.fn(), handleOverrideConsensus: vi.fn(),
    handleApproveBudgetExtension: vi.fn(), handleRejectBudgetExtension: vi.fn(),
    handleCreateBudgetExtensionRequest: vi.fn(), handleLogFeedback: vi.fn(), handleAlignFeedback: vi.fn(),
  };
}

function sandboxProps(): ComponentProps<typeof SandboxTab> {
  return {
    authRole: 'auditor', activePlaybook: null, handlePlaybookClick: vi.fn(), consoleLines: [],
    consoleInput: '', setConsoleInput: vi.fn(), consoleEndRef: createRef<HTMLDivElement>(),
    handleConsoleSubmit: vi.fn(), showArchPanel: false, setShowArchPanel: vi.fn(),
    selectedArchComp: null, setSelectedArchComp: vi.fn(), syscalls: [],
    latestAutofix: { target: 'command', replacement: 'npm run test' },
    setLatestAutofix: vi.fn(), executeSandboxCommand: vi.fn(),
  };
}

describe('gateway governance controls', () => {
  it('preserves administrator controls and developer operations without enabling them for auditors', () => {
    const props = governanceProps();
    const { rerender } = render(<ComplianceTab {...props} />);
    for (const name of ['Activate Emergency Stop', 'Sync Memory', 'Attest & Merge Workspace Changes', 'Submit Feedback to Secure Gateway', 'Release Gate / Confirm Alignment']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'Export local governance report' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Activate Emergency Stop' }));
    expect(props.handleToggleCircuitBreaker).not.toHaveBeenCalled();

    rerender(<ComplianceTab {...props} authRole="developer" />);
    expect(screen.getByRole('button', { name: 'Activate Emergency Stop' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Attest & Merge Workspace Changes' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Sync Memory' }));
    expect(props.handleDriftSync).toHaveBeenCalledOnce();

    rerender(<ComplianceTab {...props} authRole="admin" />);
    fireEvent.click(screen.getByRole('button', { name: 'Activate Emergency Stop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Attest & Merge Workspace Changes' }));
    expect(props.handleToggleCircuitBreaker).toHaveBeenCalledOnce();
    expect(props.handleApplyPatch).toHaveBeenCalledOnce();
  });

  it('does not present stale metrics or unloaded security state as verified', () => {
    const props = governanceProps();
    const { container } = render(<ComplianceTab {...props} prometheusMetrics={{ available: false, latencyHistory: [99], requestRateHistory: [87] }} />);
    expect(screen.getAllByText('Unavailable')).toHaveLength(2);
    expect(screen.getByText(/Metrics unavailable/)).toBeVisible();
    expect(container).not.toHaveTextContent('99.0 ms');
    expect(container).not.toHaveTextContent('87 evaluations');
    expect(container).not.toHaveTextContent('NaN');
    expect(container).not.toHaveTextContent('Pipeline Fully Secure');
    expect(container).not.toHaveTextContent('HSM) verified');
  });

  it('retains self-approval and duplicate-signature restrictions', () => {
    const props = governanceProps();
    const request = { id: 'request-1', role: 'developer', initiator: props.authEmail, status: 'pending', approvals: [], requiredVotes: 2, command: 'npm run build' };
    const { rerender } = render(<ComplianceTab {...props} consensusRequests={[request]} />);
    expect(screen.getByRole('button', { name: 'Initiator Blocked' })).toBeDisabled();
    rerender(<ComplianceTab {...props} consensusRequests={[{ ...request, initiator: 'another@example.test', approvals: [{ approver: props.authEmail }] }]} />);
    expect(screen.getByRole('button', { name: 'Signed' })).toBeDisabled();
    rerender(<ComplianceTab {...props} consensusRequests={[{ ...request, initiator: 'another@example.test' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Attest & Sign' }));
    expect(props.handleApproveConsensus).toHaveBeenCalledWith('request-1');
  });
});

describe('gateway sandbox actions', () => {
  it('keeps execution role restrictions and busy guards on accessible buttons', () => {
    const props = sandboxProps();
    const { rerender } = render(<SandboxTab {...props} />);
    expect(screen.getByRole('button', { name: 'Run test-pii' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Run test-alerts' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Apply Fix' })).toBeDisabled();
    expect(screen.queryByText('LIVE VM ACTIVE')).not.toBeInTheDocument();
    expect(screen.getByText(/No simulated syscall events loaded/)).toBeVisible();
    rerender(<SandboxTab {...props} authRole="developer" />);
    fireEvent.click(screen.getByRole('button', { name: 'Run test-pii' }));
    expect(props.handlePlaybookClick).toHaveBeenCalledWith('test-pii');
    expect(screen.getByRole('button', { name: 'Run test-alerts' })).toBeDisabled();
    rerender(<SandboxTab {...props} authRole="admin" activePlaybook="test-pii" />);
    expect(screen.getByRole('button', { name: 'Run test-alerts' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Apply Fix' })).toBeDisabled();
  });
});
