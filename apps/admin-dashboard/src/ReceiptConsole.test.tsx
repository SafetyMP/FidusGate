import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReceiptConsole from './ReceiptConsole';
import { verifyDemoReceipt } from './demo';

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

describe('ReceiptConsole operator journeys', () => {
  it('requires evidence for a ticket finding and clears stale packet dispositions on replay', async () => {
    window.history.replaceState(null, '', '/');
    vi.mocked(verifyDemoReceipt)
      .mockResolvedValueOnce({ status: 'valid', message: 'Matches the demo key.' })
      .mockResolvedValueOnce({ status: 'invalid', message: 'Signature mismatch.' });
    render(<ReceiptConsole />);
    const check = () => screen.getByRole('button', { name: 'Check packet signature' });
    fireEvent.click(check());
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
    fireEvent.click(check());
    fireEvent.click(await screen.findByRole('radio', { name: /Record the stated decision/ }));
    expect(screen.getByText(/Withdraw the proposed finding/)).toBeVisible();
    expect(screen.getByText(/This training example changed/)).toBeVisible();
    fireEvent.click(screen.getByRole('radio', { name: /Hold the finding/ }));
    expect(screen.getByText(/Keep the decision unresolved/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Request repository history' }));
    expect(screen.getByText('9fb23c1')).toBeVisible();
    expect(screen.getByText('d9019fa')).toBeVisible();
    fireEvent.click(screen.getByRole('radio', { name: /coding agent made the change/ }));
    expect(screen.getByText(/Leave attribution open/)).toBeVisible();
    fireEvent.click(screen.getByRole('radio', { name: /content stayed the same/ }));
    expect(screen.getByText(/Revise the finding/)).toBeVisible();
    fireEvent.click(screen.getByRole('radio', { name: /content changed between snapshots/ }));
    expect(screen.getByText(/Attach both snapshots/)).toBeVisible();
    const inputs = vi.mocked(verifyDemoReceipt).mock.calls.map(([value]) => JSON.parse(value));
    expect(inputs.map((receipt) => receipt.payload.decision)).toEqual(['deny', 'allow']);
    expect(inputs[0].signature).toEqual(inputs[1].signature);
    fireEvent.click(screen.getByRole('button', { name: 'Restart investigation' }));
    expect(screen.getByRole('radio', { name: 'Gateway archive copy' })).toBeChecked();
    expect(screen.queryByRole('radio', { name: /Close the ticket/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'File history evidence' })).not.toBeInTheDocument();
    expect(check()).toBeEnabled();
  });

  it('transfers the actual case copy to the trace, compares recorded receipts and returns to the same review', async () => {
    vi.mocked(verifyDemoReceipt)
      .mockResolvedValueOnce({ status: 'invalid', message: 'Case mismatch' })
      .mockResolvedValueOnce({ status: 'invalid', message: 'Case mismatch' })
      .mockResolvedValueOnce({ status: 'valid', message: 'Fixture matches' });
    render(<ReceiptConsole />);
    fireEvent.click(screen.getByRole('radio', { name: 'Copy received with ticket' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check packet signature' }));
    fireEvent.click(await screen.findByRole('radio', { name: /Hold the finding/ }));
    fireEvent.change(screen.getByRole('slider', { name: /Reviews per month/ }), {
      target: { value: '0' },
    });
    fireEvent.click(
      screen.getByRole('link', { name: 'Trace this packet in the technical evidence' }),
    );
    const evidence = await screen.findByRole('heading', { name: 'Trace the disputed write.' });
    expect(evidence).toBeVisible();
    expect(window.location.hash).toContain('packet=received');
    const table = screen.getByRole('table');
    expect(
      within(table).getByRole('columnheader', { name: /Copy received with ticket/ }),
    ).toBeVisible();
    expect(within(table).getByRole('cell', { name: 'read_file' })).toBeVisible();
    fireEvent.click(screen.getByRole('radio', { name: /FG-1048 · Policy write/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Check both signatures' }));
    expect(await screen.findByRole('cell', { name: 'invalid' })).toBeVisible();
    expect(screen.getByRole('cell', { name: 'valid' })).toBeVisible();
    fireEvent.click(screen.getByRole('checkbox', { name: /Attach repository snapshots/ }));
    const url = screen
      .getByRole('link', { name: /Download selected evidence/ })
      .getAttribute('href')!;
    const bundle = JSON.parse(decodeURIComponent(url.split(',')[1]));
    expect(bundle.caseRecord.receipt.payload.decision).toBe('allow');
    expect(bundle.comparison.receipt.payload.decision).toBe('deny');
    expect(bundle.repositoryEvidence.snapshots).toHaveLength(2);
    fireEvent.click(screen.getByRole('link', { name: 'Return to this ticket investigation' }));
    expect(await screen.findByRole('radio', { name: /Hold the finding/ })).toBeChecked();
    expect(screen.getByRole('slider', { name: /Reviews per month/ })).toHaveValue('0');
  });

  it('opens a shared record and stage, and clears checks when comparison inputs change', async () => {
    window.history.replaceState(
      null,
      '',
      '#/technical?packet=received&fixture=FG-1048&stage=effect',
    );
    vi.mocked(verifyDemoReceipt).mockResolvedValue({
      status: 'unsupported',
      message: 'Verifier unavailable',
    });
    render(<ReceiptConsole />);
    expect(screen.getByRole('heading', { name: 'Compare downstream records' })).toBeVisible();
    expect(screen.getByRole('radio', { name: /FG-1048 · Policy write/ })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Check both signatures' }));
    expect(await screen.findAllByRole('cell', { name: 'unsupported' })).toHaveLength(2);
    fireEvent.click(screen.getByRole('radio', { name: /FG-1047 · Documentation read/ }));
    expect(screen.getAllByRole('cell', { name: 'unchecked' })).toHaveLength(2);
  });

  it.each(['decisions', 'playground', 'verify', 'about'])(
    'maps the former %s route to case evidence without overwriting skip history',
    (route) => {
      window.history.replaceState(null, '', '#/' + route);
      render(<ReceiptConsole />);
      expect(screen.getByRole('heading', { name: 'Trace the disputed write.' })).toBeVisible();
      const length = window.history.length;
      fireEvent.click(screen.getByRole('link', { name: 'Skip to content' }));
      expect(screen.getByRole('main')).toHaveFocus();
      expect(window.history.length).toBe(length);
      expect(window.location.hash).toBe('#/' + route);
    },
  );

  it('keeps the pilot bookmark, alternatives and break-even calculation in the case', () => {
    window.history.replaceState(null, '', '#/pilot');
    render(<ReceiptConsole />);
    expect(document.activeElement?.id).toBe('case-economics');
    expect(screen.getByText('$1,200 first-year net time value')).toBeVisible();
    fireEvent.click(screen.getByRole('radio', { name: 'Run a signed-receipt shadow pilot' }));
    fireEvent.change(screen.getByRole('slider', { name: /Reviews per month/ }), {
      target: { value: '0' },
    });
    expect(screen.getByText(/At these assumptions the pilot produces/)).toHaveTextContent(
      '-$6,000',
    );
  });
});
