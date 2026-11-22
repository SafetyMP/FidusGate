import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReceiptConsole from './ReceiptConsole';
import { verifyDemoReceipt, type VerificationResult } from './demo';

vi.mock('./demo', async (importOriginal) => {
  const engine = await importOriginal<typeof import('./demo')>();
  return { ...engine, verifyDemoReceipt: vi.fn() };
});

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  vi.mocked(verifyDemoReceipt).mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function exported() {
  const link = screen.getByRole('link', { name: 'Download handoff' });
  const encoded = link.getAttribute('href')!.split(',')[1];
  return JSON.parse(decodeURIComponent(encoded));
}

describe('FG-1048 evidence handoff', () => {
  it('uses only attached records and preserves the source packets, verification and analyst note in the export', async () => {
    vi.mocked(verifyDemoReceipt)
      .mockResolvedValueOnce({ status: 'invalid', message: 'Mismatch' })
      .mockResolvedValueOnce({ status: 'valid', message: 'Matches the public key' });
    render(<ReceiptConsole />);
    expect(exported().findings).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Verify signature' }));
    await screen.findByText('INVALID');
    fireEvent.click(screen.getByRole('button', { name: /Decision archive Gateway original/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Verify signature' }));
    await screen.findByText('VALID');
    expect(exported().evidence).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Attach to handoff' }));
    fireEvent.click(screen.getByRole('button', { name: /Repository export Policy file history/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Attach to handoff' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Analyst note' }), {
      target: { value: 'Request correlation before attribution.' },
    });
    const report = exported();
    expect(report.evidence.map((item: { name: string }) => item.name)).toEqual([
      'Ticket attachment',
      'Gateway original',
      'Policy file history',
    ]);
    expect(report.evidence[0].receipt.payload.decision).toBe('allow');
    expect(report.evidence[1].receipt.payload.decision).toBe('deny');
    expect(report.evidence[0].receipt.signature).toEqual(report.evidence[1].receipt.signature);
    expect(report.evidence[1].verification.status).toBe('valid');
    expect(report.findings).toContainEqual(expect.stringMatching(/Copy discrepancy/));
    expect(report.evidence[2].snapshots).toHaveLength(2);
    expect(report.analystNote).toBe('Request correlation before attribution.');
    fireEvent.click(screen.getByRole('button', { name: 'Detach from handoff' }));
    expect(exported().openRequests).toContainEqual(expect.stringMatching(/repository revisions/));
    expect(exported().findings).not.toContainEqual(expect.stringMatching(/two revisions/));
  });

  it('keeps the disputed copy outstanding while limiting follow-ups to attached evidence', async () => {
    vi.mocked(verifyDemoReceipt).mockResolvedValueOnce({status: 'valid', message: 'Matches'});
    render(<ReceiptConsole />);
    const initial = exported().openRequests;
    expect(initial).toContain('Check the signature on the ticket attachment.');
    expect(initial.join(' ')).not.toMatch(/custody|correlation|revision 808/i);
    fireEvent.click(screen.getByRole('button', {name: /Decision archive Gateway original/}));
    fireEvent.click(screen.getByRole('button', {name: 'Attach to handoff'}));
    fireEvent.click(screen.getByRole('button', {name: 'Verify signature'}));
    await screen.findByText('VALID');
    fireEvent.click(screen.getByRole('button', {name: /Repository export Policy file history/}));
    fireEvent.click(screen.getByRole('button', {name: 'Attach to handoff'}));
    const requests = exported().openRequests;
    expect(requests).toContain('Check the signature on the ticket attachment.');
    expect(requests).toContainEqual(expect.stringMatching(/correlation record for revision 808/));
    fireEvent.click(screen.getByRole('button', {name: 'Detach from handoff'}));
    expect(exported().openRequests.join(' ')).not.toMatch(/correlation|revision 808/i);
    fireEvent.click(screen.getByRole('button', {name: /Change desk Ticket attachment/}));
    fireEvent.click(screen.getByRole('button', {name: 'Detach from handoff'}));
    expect(exported().openRequests).toContain('Attach the disputed ticket copy for comparison.');
  });

  it('discards a pending signature check when the case is reset', async () => {
    let finish: ((result: VerificationResult) => void) | undefined;
    vi.mocked(verifyDemoReceipt).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<ReceiptConsole />);
    fireEvent.click(screen.getByRole('button', { name: 'Verify signature' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset case' }));
    await act(async () => {
      finish!({ status: 'invalid', message: 'Late result' });
    });
    expect(exported().evidence[0].verification.status).toBe('unchecked');
    expect(screen.queryByText(/Late result/)).not.toBeInTheDocument();
  });

  it.each(['technical', 'verify', 'decisions', 'playground', 'about'])(
    'opens the compact reference at %s, preserving keyboard skip history',
    (route) => {
      window.history.replaceState(null, '', '#/' + route);
      render(<ReceiptConsole />);
      expect(
        screen.getByRole('heading', { name: 'Follow the evidence to its source.' }),
      ).toBeVisible();
      const length = window.history.length;
      fireEvent.click(screen.getByRole('link', { name: 'Skip to content' }));
      expect(screen.getByRole('main')).toHaveFocus();
      expect(window.history.length).toBe(length);
      expect(window.location.hash).toBe('#/' + route);
    },
  );

  it('calculates first-year review capacity from the pilot assumptions', () => {
    window.history.replaceState(null, '', '#/pilot');
    render(<ReceiptConsole />);
    expect(screen.getByText('$1,200 first-year net time value')).toBeVisible();
    fireEvent.change(screen.getByRole('slider', { name: /Reviews per month/ }), {
      target: { value: '0' },
    });
    expect(screen.getByText('-$6,000 first-year net time value')).toBeVisible();
  });
});
