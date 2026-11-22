import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReceiptConsole from './ReceiptConsole';
import { verifyDemoReceipt, type VerificationResult } from './demo';

vi.mock('./demo', async (importOriginal) => {
  const engine = await importOriginal<typeof import('./demo')>();
  return { ...engine, verifyDemoReceipt: vi.fn() };
});

beforeEach(() => {
  window.history.replaceState(null, '', '#/decisions');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  vi.mocked(verifyDemoReceipt).mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function openVerifier() {
  fireEvent.click(screen.getByRole('button', { name: 'Verify this receipt' }));
  return screen.getByRole('textbox', { name: 'Paste a signed FidusGate receipt' });
}

function receiptValue(element: HTMLElement): string {
  if (!(element instanceof HTMLTextAreaElement)) throw new Error('Expected a receipt textarea');
  return element.value;
}

describe('ReceiptConsole operator journeys', () => {
  it('requires evidence for a ticket finding and clears stale packet dispositions on replay', async () => {
    window.history.replaceState(null, '', '/');
    vi.mocked(verifyDemoReceipt)
      .mockResolvedValueOnce({ status: 'valid', message: 'Matches the demo key.' })
      .mockResolvedValueOnce({ status: 'invalid', message: 'Signature mismatch.' });
    render(<ReceiptConsole />);
    const check = screen.getByRole('button', { name: 'Check packet signature' });
    fireEvent.click(check);
    const close = await screen.findByRole('radio', { name: /Close the ticket/ });
    fireEvent.click(close);
    expect(screen.getByText(/Reopen the ticket/)).toBeVisible();
    fireEvent.click(screen.getByRole('radio', { name: /Record the stated decision/ }));
    expect(screen.getByText(/Record the sample denial/)).toBeVisible();
    fireEvent.click(screen.getByRole('radio', { name: 'Copy received with ticket' }));
    expect(screen.queryByText(/Record the sample denial/)).not.toBeInTheDocument();
    expect(screen.queryByText(/This training example changed/)).not.toBeInTheDocument();
    const exercise = screen.getByRole('region', { name: 'What goes in the change ticket?' });
    expect(within(exercise).getByText('allow')).toBeVisible();
    expect(within(exercise).getByText('2026-11-14 14:32:00 UTC')).toBeVisible();
    fireEvent.click(check);
    fireEvent.click(await screen.findByRole('radio', { name: /Record the stated decision/ }));
    expect(screen.getByText(/Withdraw the proposed finding/)).toBeVisible();
    expect(screen.getByText(/This training example changed/)).toBeVisible();
    fireEvent.click(screen.getByRole('radio', { name: /Hold the finding/ }));
    expect(screen.getByText(/Keep the decision unresolved/)).toBeVisible();
    const inputs = vi.mocked(verifyDemoReceipt).mock.calls.map(([value]) => JSON.parse(value));
    expect(inputs.map((receipt) => receipt.payload.decision)).toEqual(['deny', 'allow']);
    expect(inputs[0].signature).toEqual(inputs[1].signature);
    fireEvent.click(screen.getByRole('button', { name: 'Restart investigation' }));
    expect(screen.getByRole('radio', { name: 'Gateway archive copy' })).toBeChecked();
    expect(screen.queryByRole('radio', { name: /Close the ticket/ })).not.toBeInTheDocument();
    expect(check).toBeEnabled();
  });

  it.each(['playground', 'verify'])('keeps the %s route when skipping to the workspace', (route) => {
    window.history.replaceState(null, '', '#/' + route);
    render(<ReceiptConsole />);
    const historyLength = window.history.length;
    const skip = screen.getByRole('link', { name: 'Skip to workspace' });
    expect(fireEvent.click(skip)).toBe(false);
    expect(screen.getByRole('main')).toHaveFocus();
    expect(window.location.hash).toBe('#/' + route);
    expect(window.history.length).toBe(historyLength);
  });

  it('opens the business case by default and carries its record into the verifier', async () => {
    window.history.replaceState(null, '', '/');
    render(<ReceiptConsole />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Inspect the fields in FG-1048'));
    expect(screen.getByText('$1,200 first-year net time value')).toBeVisible();
    fireEvent.change(screen.getByRole('slider', { name: /Reviews per month/ }), {target: {value: '0'}});
    expect(screen.getByText('-$6,000 first-year net time value')).toBeVisible();
    expect(screen.getByText(/No labor value can cover/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', {name: 'Inspect FG-1048 receipt'}));
    expect(receiptValue(screen.getByRole('textbox', {name: 'Paste a signed FidusGate receipt'}))).toContain('policy.cedar');
    fireEvent.click(screen.getByRole('link', {name: 'Business case'}));
    expect(await screen.findByRole('slider', {name: /Reviews per month/})).toHaveValue('0');
    expect(screen.getByText('-$6,000 first-year net time value')).toBeVisible();
    fireEvent.click(screen.getByRole('link', {name: 'Technical guide'}));
    expect(await screen.findByRole('heading', {name: 'Inspect the evidence'})).toBeVisible();
    fireEvent.click(screen.getByRole('link', {name: 'Decision log'}));
    expect(await screen.findByRole('table')).toBeVisible();
  });

  it('combines search and decision filters and recovers from an empty result', () => {
    render(<ReceiptConsole />);
    const search = screen.getByRole('textbox', { name: 'Search decisions' });
    const filter = screen.getByRole('combobox', { name: 'Filter decisions' });
    fireEvent.change(filter, { target: { value: 'deny' } });
    fireEvent.change(search, { target: { value: 'FG-1048' } });

    expect(screen.getByRole('button', { name: 'Inspect write_file FG-1048' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Inspect read_file FG-1047' }),
    ).not.toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);

    fireEvent.change(filter, { target: { value: 'allow' } });
    expect(screen.getByRole('heading', { name: 'No matching decisions' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(search).toHaveValue('');
    expect(filter).toHaveValue('all');
    expect(screen.getByRole('button', { name: 'Inspect write_file FG-1048' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Inspect read_file FG-1047' })).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'No matching decisions' }),
    ).not.toBeInTheDocument();
  });

  it('carries the selected decision into the verifier instead of loading a default receipt', () => {
    render(<ReceiptConsole />);
    fireEvent.click(screen.getByRole('button', { name: 'Inspect read_file FG-1047' }));
    const detail = screen.getByRole('complementary', { name: 'Selected decision' });
    expect(within(detail).getByRole('heading', { name: 'read_file' })).toBeVisible();
    expect(within(detail).getByText('FG-1047')).toBeVisible();

    const receipt = openVerifier();
    expect(receiptValue(receipt)).toContain('"tool_name": "read_file"');
    expect(receiptValue(receipt)).toContain('"path": "README.md"');
    expect(receiptValue(receipt)).toContain('"decision": "allow"');
  });

  it('adds a denied sample to the decision log and resets the sample session', () => {
    render(<ReceiptConsole />);
    const originalRows = within(screen.getByRole('table')).getAllByRole('row').length;
    fireEvent.click(screen.getByRole('button', { name: 'Try a scenario' }));
    fireEvent.click(screen.getByRole('radio', { name: /Change a protected policy/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Run sample scenario' }));

    expect(screen.getByRole('heading', { name: 'Protect authorization policy' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Find it in the decision log' }));
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(originalRows + 1);
    const replay = screen.getByRole('button', {
      name: /Inspect write_file replay-protected-write-/,
    });
    expect(replay).toHaveAttribute('aria-pressed', 'true');

    fireEvent.change(screen.getByRole('textbox', { name: 'Search decisions' }), {
      target: { value: 'replay-' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter decisions' }), {
      target: { value: 'deny' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Demo reset. All sample decisions restored.',
    );
    expect(screen.getByRole('textbox', { name: 'Search decisions' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Filter decisions' })).toHaveValue('all');
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(originalRows);
    expect(
      screen.queryByRole('button', { name: /Inspect write_file replay-protected-write-/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inspect write_file FG-1048' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('clears a successful verification when the receipt is edited or replaced', async () => {
    vi.mocked(verifyDemoReceipt).mockResolvedValue({
      status: 'valid',
      message: 'Test signature matches.',
    });
    render(<ReceiptConsole />);
    const receipt = openVerifier();
    fireEvent.click(screen.getByRole('button', { name: 'Verify signature' }));
    expect(await screen.findByRole('heading', { name: 'Signature matches' })).toBeVisible();

    fireEvent.change(receipt, { target: { value: '{"edited": true}' } });
    expect(screen.queryByRole('heading', { name: 'Signature matches' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ready when you are' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Load selected sample' }));
    fireEvent.click(screen.getByRole('button', { name: 'Verify signature' }));
    expect(await screen.findByRole('heading', { name: 'Signature matches' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try a tampered sample' }));
    expect(screen.queryByRole('heading', { name: 'Signature matches' })).not.toBeInTheDocument();
    expect(receiptValue(receipt)).toContain('"decision": "allow"');
  });

  it('discards a late verification result after input changes', async () => {
    let resolveVerification: ((result: VerificationResult) => void) | undefined;
    vi.mocked(verifyDemoReceipt).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveVerification = resolve;
        }),
    );
    render(<ReceiptConsole />);
    const receipt = openVerifier();
    fireEvent.click(screen.getByRole('button', { name: 'Verify signature' }));
    expect(screen.getByRole('button', { name: 'Checking signature…' })).toBeDisabled();
    fireEvent.change(receipt, { target: { value: 'changed while checking' } });

    await act(async () => {
      if (!resolveVerification) throw new Error('Verification was not started');
      resolveVerification({ status: 'valid', message: 'Result for previous contents.' });
    });
    expect(screen.queryByRole('heading', { name: 'Signature matches' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ready when you are' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Verify signature' })).toBeEnabled();
    expect(receipt).toHaveValue('changed while checking');
  });

  it('clears the receipt and verification result on reset', async () => {
    vi.mocked(verifyDemoReceipt).mockResolvedValue({
      status: 'invalid',
      message: 'Test signature mismatch.',
    });
    render(<ReceiptConsole />);
    const receipt = openVerifier();
    fireEvent.click(screen.getByRole('button', { name: 'Verify signature' }));
    expect(await screen.findByRole('heading', { name: 'Signature does not match' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }));
    expect(receipt).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Verify signature' })).toBeDisabled();
    expect(
      screen.queryByRole('heading', { name: 'Signature does not match' }),
    ).not.toBeInTheDocument();
  });
});
