import '@testing-library/jest-dom/vitest';
import { createRef, type ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_DECISIONS } from '../demo';
import { ForensicsTab } from './ForensicsTab';
import { PolicyTab } from './PolicyTab';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function policyProps(): ComponentProps<typeof PolicyTab> {
  return {
    authRole: 'developer', chatMessages: [], chatInput: '', setChatInput: vi.fn(),
    chatLoading: false, setChatLoading: vi.fn(), setChatMessages: vi.fn(),
    chatApplyLoading: false, setChatApplyLoading: vi.fn(), chatEndRef: createRef<HTMLDivElement>(),
    simOverrideMode: false, setSimOverrideMode: vi.fn(), simDraftPolicy: '', setSimDraftPolicy: vi.fn(),
    simPrincipal: 'sb:issuer:agent-80', setSimPrincipal: vi.fn(), simToolName: 'write_file', setSimToolName: vi.fn(),
    simArgs: '{}', setSimArgs: vi.fn(), simContext: '{}', setSimContext: vi.fn(),
    simLoading: false, simResult: null, activePolicyCode: 'permit(principal, action, resource);',
    consoleLines: [], setConsoleLines: vi.fn(), handleSimulate: vi.fn(), fetchData: vi.fn(), getHeaders: () => ({}),
  };
}

function forensicProps(): ComponentProps<typeof ForensicsTab> {
  return {
    forensicLogs: [{ id: 'log-1', command: 'cat README.md', user: 'operator', role: 'developer', status: 'success', cedarDecision: 'allow', timestamp: '2026-11-14T12:00:00Z', exitCode: 0 }],
    receipts: [DEMO_DECISIONS[0].receipt], isChainValid: true,
    forensicSearch: '', setForensicSearch: vi.fn(), forensicStatusFilter: 'all', setForensicStatusFilter: vi.fn(),
    authRole: 'developer', receiptInput: '', setReceiptInput: vi.fn(),
    verificationResult: { status: 'idle', message: '' },
    handleVerifyReceipt: vi.fn(), handleDownloadComplianceReceipt: vi.fn(),
  };
}

describe('connected policy workflow', () => {
  it('loads a request example without evaluating or applying it', () => {
    const props = policyProps();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<PolicyTab {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change a protected policy' }));
    expect(props.setSimPrincipal).toHaveBeenCalledWith('sb:issuer:agent-80');
    expect(props.setSimToolName).toHaveBeenCalledWith('write_file');
    expect(props.setSimArgs).toHaveBeenCalledWith(JSON.stringify({ path: 'policy.cedar', content: '// proposed change' }, null, 2));
    expect(props.handleSimulate).not.toHaveBeenCalled();
    expect(props.setSimOverrideMode).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Nothing has run.');
  });

  it('keeps draft loading available while limiting active-policy application to administrators', () => {
    const props = policyProps();
    props.chatMessages = [{ id: 'suggestion', sender: 'assistant', timestamp: '2026-11-14T12:00:00Z', text: 'Review this policy.', cedarCode: 'permit(principal, action, resource);' }];
    const { rerender } = render(<PolicyTab {...props} />);
    expect(screen.queryByRole('button', { name: 'Apply to active policy' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Simulate Draft' }));
    expect(props.setSimDraftPolicy).toHaveBeenCalledWith('permit(principal, action, resource);');
    expect(props.setSimOverrideMode).toHaveBeenCalledWith(true);
    expect(props.handleSimulate).not.toHaveBeenCalled();

    rerender(<PolicyTab {...props} authRole="admin" simOverrideMode />);
    expect(screen.getByRole('button', { name: 'Apply to active policy' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Evaluate against draft' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Draft policy (not applied)' })).toBeVisible();
  });
});

describe('connected receipt workflow', () => {
  it('loads and focuses a receipt without claiming or running signature verification', () => {
    const props = forensicProps();
    render(<ForensicsTab {...props} />);
    expect(screen.getByText('Signature not checked here')).toBeVisible();
    expect(screen.queryByText(/ED25519 VERIFIED/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Offline Cryptographic/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load receipt 1 for write_file into verifier' }));
    expect(props.setReceiptInput).toHaveBeenCalledWith(JSON.stringify(DEMO_DECISIONS[0].receipt, null, 2));
    expect(screen.getByRole('textbox', { name: 'Signed receipt JSON' })).toHaveFocus();
    expect(props.handleVerifyReceipt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Verify with gateway' }));
    expect(props.handleVerifyReceipt).toHaveBeenCalledOnce();
  });

  it('preserves timeline search, status filters, and administrator/auditor export gates', () => {
    const props = forensicProps();
    const { rerender } = render(<ForensicsTab {...props} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search command timeline' }), { target: { value: 'README' } });
    expect(props.setForensicSearch).toHaveBeenCalledWith('README');
    fireEvent.click(screen.getByRole('button', { name: 'Blocked' }));
    expect(props.setForensicStatusFilter).toHaveBeenCalledWith('denied');
    expect(screen.queryByRole('button', { name: 'Download Forensic Compliance Receipt' })).not.toBeInTheDocument();
    rerender(<ForensicsTab {...props} authRole="auditor" />);
    fireEvent.click(screen.getByRole('button', { name: 'Download Forensic Compliance Receipt' }));
    expect(props.handleDownloadComplianceReceipt).toHaveBeenCalledWith('log-1');
    rerender(<ForensicsTab {...props} authRole="admin" />);
    expect(screen.getByRole('button', { name: 'Download Forensic Compliance Receipt' })).toBeVisible();
    rerender(<ForensicsTab {...props} forensicStatusFilter="denied" />);
    expect(screen.queryByText('cat README.md')).not.toBeInTheDocument();
    expect(screen.getByText('No audited command logs match your active search filters.')).toBeVisible();
  });
});
