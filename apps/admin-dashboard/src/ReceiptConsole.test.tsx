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
