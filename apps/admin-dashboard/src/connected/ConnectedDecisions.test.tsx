import '@testing-library/jest-dom/vitest';
import type { AuditReceipt } from '@fidusgate/core-types';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectedDecisions, type ConnectedDecisionsProps } from './ConnectedDecisions';

const allowed: AuditReceipt = {
  payload: {
    type: 'tool_call',
    tool_name: 'read_file',
    issuer_id: 'analyst',
    decision: 'allow',
    policy_digest: 'policy-alpha',
    issued_at: '2026-11-14T09:00:00Z',
    args: { path: '/reports/summary.txt' },
  },
  signature: { alg: 'EdDSA', kid: 'test-key', sig: 'synthetic-signature-one' },
};
const denied: AuditReceipt = {
  payload: {
    type: 'tool_call',
    tool_name: 'write_file',
    issuer_id: 'reviewer',
    decision: 'deny',
    policy_digest: 'policy-beta',
    issued_at: '2026-11-14T09:01:00Z',
    reason: 'Path is outside the allowed scope.',
    args: { path: '/private/secret.txt', content: 'test content' },
  },
  signature: { alg: 'EdDSA', kid: 'test-key', sig: 'synthetic-signature-two' },
};

function props(overrides: Partial<ConnectedDecisionsProps> = {}): ConnectedDecisionsProps {
  return {
    receipts: [allowed, denied],
    status: 'ready',
    isChainValid: true,
    onVerify: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ConnectedDecisions', () => {
  it('inspects the selected real receipt and hands the exact object to verification', () => {
    const input = props();
    render(<ConnectedDecisions {...input} />);
    fireEvent.click(screen.getByRole('button', { name: /Inspect write_file/ }));
    const detail = screen.getByRole('complementary', { name: 'Selected gateway decision' });
    expect(within(detail).getByText('Path is outside the allowed scope.')).toBeInTheDocument();
    expect(within(detail).getByText('policy-beta')).toBeInTheDocument();
    expect(
      within(detail).getByText(JSON.stringify(denied.payload.args, null, 2), {
        normalizer: (text) => text,
      }),
    ).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole('button', { name: 'Verify this receipt' }));
    expect(input.onVerify).toHaveBeenCalledExactlyOnceWith(denied);
    expect(vi.mocked(input.onVerify).mock.calls[0]?.[0]).toBe(denied);
  });

  it('downloads the complete selected receipt without substituting demo data', async () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>().mockReturnValue('blob:test-receipt');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = createObjectURL;
        static revokeObjectURL = revokeObjectURL;
      },
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<ConnectedDecisions {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: /Inspect write_file/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Download receipt' }));
    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    if (!blob) throw new Error('Expected a receipt download');
    const contents = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(JSON.parse(contents)).toEqual(denied);
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-receipt');
  });

  it.each(['write_file', 'reviewer', '/private/secret.txt', 'policy-beta'])(
    'searches real receipt fields using %s',
    (query) => {
      render(<ConnectedDecisions {...props()} />);
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search receipts' }), {
        target: { value: query },
      });
      expect(screen.getByRole('button', { name: /Inspect write_file/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Inspect read_file/ })).not.toBeInTheDocument();
    },
  );

  it('combines decision filters with search and clears an empty filtered view', () => {
    render(<ConnectedDecisions {...props()} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Decision' }), {
      target: { value: 'deny' },
    });
    expect(screen.queryByRole('button', { name: /Inspect read_file/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'analyst' } });
    expect(screen.getByRole('heading', { name: 'No matching receipts' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getAllByRole('button', { name: /^Inspect / })).toHaveLength(2);
  });

  it('keeps the selected receipt when a poll inserts another record', () => {
    const input = props();
    const { rerender } = render(<ConnectedDecisions {...input} />);
    fireEvent.click(screen.getByRole('button', { name: /Inspect write_file/ }));
    const selectedButton = screen.getByRole('button', { name: /Inspect write_file/ });
    const fresh = {
      ...allowed,
      payload: { ...allowed.payload, issued_at: '2026-11-14T10:00:00Z' },
    };
    rerender(
      <ConnectedDecisions
        {...input}
        receipts={[fresh, structuredClone(allowed), structuredClone(denied)]}
      />,
    );
    expect(screen.getByRole('button', { name: /Inspect write_file/ })).toBe(selectedButton);
    expect(
      within(screen.getByRole('complementary')).getByRole('heading', { name: 'write_file' }),
    ).toBeInTheDocument();
  });

  it('keeps identical receipt occurrences distinct for selection and handoff', () => {
    const duplicate = structuredClone(denied);
    const input = props({ receipts: [denied, duplicate] });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(<ConnectedDecisions {...input} />);
    const buttons = screen.getAllByRole('button', { name: /Inspect write_file/ });
    const secondButton = buttons[1];
    if (!secondButton) throw new Error('Expected both receipt occurrences');
    fireEvent.click(secondButton);
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
    expect(secondButton).toHaveAttribute('aria-pressed', 'true');
    rerender(<ConnectedDecisions {...input} receipts={[allowed, denied, duplicate]} />);
    expect(screen.getAllByRole('button', { name: /Inspect write_file/ })[1]).toBe(secondButton);
    fireEvent.click(screen.getByRole('button', { name: 'Verify this receipt' }));
    expect(vi.mocked(input.onVerify).mock.calls[0]?.[0]).toBe(duplicate);
    expect(errors).not.toHaveBeenCalled();
  });

  it.each(['unauthorized', 'error', 'loading'] as const)(
    'hides retained receipt data when status is %s',
    (status) => {
      const input = props();
      const { rerender } = render(<ConnectedDecisions {...input} />);
      rerender(<ConnectedDecisions {...input} status={status} />);
      expect(screen.queryByText('/private/secret.txt')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Inspect / })).not.toBeInTheDocument();
      if (status !== 'loading') {
        fireEvent.click(
          screen.getByRole('button', {
            name: status === 'error' ? 'Retry receipts' : 'Refresh receipts',
          }),
        );
        expect(input.onRetry).toHaveBeenCalledOnce();
      }
    },
  );

  it('distinguishes a returned empty log from a failed request', () => {
    render(<ConnectedDecisions {...props({ receipts: [] })} />);
    expect(screen.getByRole('heading', { name: 'No receipts recorded' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('never represents the chain check as independent signature verification', () => {
    const { rerender } = render(<ConnectedDecisions {...props()} />);
    expect(screen.getByText('Intact')).toBeInTheDocument();
    expect(screen.getByText('Not verified in this view')).toBeInTheDocument();
    rerender(<ConnectedDecisions {...props({ isChainValid: false })} />);
    expect(
      screen.getByText(/Investigate the chain before relying on this log/),
    ).toBeInTheDocument();
    expect(screen.getByText('Not verified in this view')).toBeInTheDocument();
  });

  it('moves focus to the inspected detail on mobile and back to search', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    render(<ConnectedDecisions {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: /Inspect write_file/ }));
    expect(screen.getByRole('complementary')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Back to decision search' }));
    expect(screen.getByRole('searchbox')).toHaveFocus();
  });
});
