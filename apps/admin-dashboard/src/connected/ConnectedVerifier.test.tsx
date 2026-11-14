import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectedVerifier, type ConnectedVerifierProps } from './ConnectedVerifier';

function props(overrides: Partial<ConnectedVerifierProps> = {}): ConnectedVerifierProps {
  return {
    input: '',
    onInputChange: vi.fn(),
    onVerify: vi.fn(),
    result: { status: 'idle', message: '' },
    busy: false,
    ...overrides,
  };
}

afterEach(cleanup);

describe('ConnectedVerifier', () => {
  it('submits supplied JSON to the parent and describes the configured gateway boundary', () => {
    const input = props({ input: '{"payload":{"tool_name":"read_file"}}' });
    render(<ConnectedVerifier {...input} />);
    expect(screen.getByLabelText('Signed receipt')).toHaveValue(input.input);
    expect(screen.getByText(/sent to your configured gateway/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Verify signature' }));
    expect(input.onVerify).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText('Signed receipt'), {
      target: { value: '{"new":"receipt"}' },
    });
    expect(input.onInputChange).toHaveBeenCalledWith('{"new":"receipt"}');
    fireEvent.click(screen.getByRole('button', { name: 'Clear receipt' }));
    expect(input.onInputChange).toHaveBeenLastCalledWith('');
  });

  it('prevents empty and pending submissions, and hides an earlier payload during checking', () => {
    const input = props({ input: '   ' });
    const { rerender } = render(<ConnectedVerifier {...input} />);
    expect(screen.getByRole('button', { name: 'Verify signature' })).toBeDisabled();
    rerender(
      <ConnectedVerifier
        {...input}
        input="{}"
        busy
        result={{
          status: 'valid',
          message: 'Previous verification',
          payload: { previous: 'sensitive result' },
        }}
      />,
    );
    const checking = screen.getByRole('button', { name: 'Checking with gateway…' });
    expect(checking).toBeDisabled();
    fireEvent.click(checking);
    expect(input.onVerify).not.toHaveBeenCalled();
    expect(screen.queryByText('Previous verification')).not.toBeInTheDocument();
    expect(screen.queryByText('View checked payload')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('renders the gateway result and payload without implying tool execution', () => {
    render(
      <ConnectedVerifier
        {...props({
          input: '{}',
          result: {
            status: 'valid',
            message: 'Signature accepted by gateway',
            payload: { tool_name: 'read_file' },
          },
        })}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Gateway verified the signature' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Signature accepted by gateway')).toBeInTheDocument();
    expect(screen.getByText(/does not establish that a tool ran/)).toBeInTheDocument();
    expect(screen.getByText(/"tool_name": "read_file"/)).toBeInTheDocument();
  });

  it.each([
    ['invalid', 'Receipt did not verify'],
    ['error', 'Verification could not complete'],
  ] as const)('distinguishes %s results from success', (status, title) => {
    render(
      <ConnectedVerifier {...props({ result: { status, message: 'Gateway response details' } })} />,
    );
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByText('Gateway response details')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Gateway verified the signature' }),
    ).not.toBeInTheDocument();
  });

  it('hides stale result data when the parent resets to idle after an edit', () => {
    const input = props({
      input: '{}',
      result: { status: 'valid', message: 'Old result', payload: { old: true } },
    });
    const { rerender } = render(<ConnectedVerifier {...input} />);
    rerender(
      <ConnectedVerifier {...input} input="edited" result={{ status: 'idle', message: '' }} />,
    );
    expect(screen.getByRole('heading', { name: 'Ready to verify' })).toBeInTheDocument();
    expect(screen.queryByText('Old result')).not.toBeInTheDocument();
    expect(screen.queryByText('View checked payload')).not.toBeInTheDocument();
  });
});
