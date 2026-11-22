import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
  it('opens on the release problem and gates the evidence and funding decision', async () => {
    render(<ReceiptConsole />);
    expect(screen.getByRole('heading', { name: 'Can the customer fix ship today?' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Check signature' })).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Open the change ticket' }));
    expect(
      await screen.findByRole('heading', { name: 'Can Maya rely on the ticket?' }),
    ).toBeVisible();
    expect(document.activeElement?.id).toBe('case-investigation');
  });

  it('lets Maya try the unchecked copy, then resolves the permission question with two real inputs', async () => {
    window.location.hash = '#/case?section=investigation';
    vi.mocked(verifyDemoReceipt)
      .mockResolvedValueOnce({ status: 'invalid', message: 'Ticket mismatch' })
      .mockResolvedValueOnce({ status: 'valid', message: 'Archive matches' })
      .mockResolvedValueOnce({ status: 'valid', message: 'Documentation receipt matches' });
    render(<ReceiptConsole />);
    const act = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    act('Use the forwarded copy');
    expect(screen.getByText('Maya still needs confirmation')).toBeVisible();
    expect(verifyDemoReceipt).not.toHaveBeenCalled();
    act('Compare with the original');
    await screen.findByRole('button', { name: 'Send the decision record' });
    expect(
      vi.mocked(verifyDemoReceipt).mock.calls.map(([raw]) => JSON.parse(raw).payload.decision),
    ).toEqual(['allow', 'deny']);
    act('Send the decision record');
    const handoff = () =>
      JSON.parse(
        decodeURIComponent(
          screen
            .getByRole('link', { name: 'Download the release handoff' })
            .getAttribute('href')!
            .split(',')[1],
        ),
      );
    expect(handoff().evidence).toHaveLength(2);
    expect(handoff().openRequests.join(' ')).toContain('file history');
    act('Also check the file history');
    expect(screen.getByText('The repository owner’s reply')).toBeVisible();
    expect(handoff().evidence).toHaveLength(3);
    expect(handoff().openRequests.join(' ')).toContain('writer');
    fireEvent.click(screen.getByText('Inspect the source records'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'neighbor' } });
    act('Check and include adjacent request');
    await screen.findByRole('button', { name: 'Remove adjacent request from handoff' });
    expect(handoff().evidence).toHaveLength(4);
    expect(handoff().findings.join(' ')).toContain('separate documentation read');
    act('Remove adjacent request from handoff');
    expect(handoff().evidence).toHaveLength(3);
    act('Try another path');
    expect(screen.queryByRole('link', { name: 'Download the release handoff' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Use the forwarded copy' })).toBeEnabled();
  });

  it('retains the business handoff across the compact technical guide', async () => {
    window.location.hash = '#/case?section=investigation&packet=received';
    vi.mocked(verifyDemoReceipt)
      .mockResolvedValueOnce({ status: 'invalid', message: 'Ticket mismatch' })
      .mockResolvedValueOnce({ status: 'valid', message: 'Archive matches' })
      .mockResolvedValueOnce({ status: 'invalid', message: 'Case mismatch' })
      .mockResolvedValueOnce({ status: 'valid', message: 'Fixture matches' });
    render(<ReceiptConsole />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare with the original' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Send the decision record' }));
    fireEvent.click(screen.getByText('Inspect the source records'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'received' } });
    fireEvent.click(screen.getByRole('link', { name: /Trace this evidence/ }));
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Check both signatures' }));
    expect(await screen.findByRole('cell', { name: 'invalid' })).toBeVisible();
    fireEvent.click(screen.getByRole('link', { name: 'File history' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Attach repository snapshots/ }));
    const url = screen
      .getByRole('link', { name: /Download selected evidence/ })
      .getAttribute('href')!;
    const bundle = JSON.parse(decodeURIComponent(url.split(',')[1]));
    expect(bundle.caseRecord.check.status).toBe('invalid');
    expect(bundle.comparison.check.status).toBe('valid');
    expect(bundle.repositoryEvidence.snapshots).toHaveLength(2);
    fireEvent.click(screen.getByRole('link', { name: /Return to this ticket/ }));
    expect(await screen.findByRole('link', { name: 'Download the release handoff' })).toBeVisible();
  });

  it('keeps the decision open when signature checking is unavailable', async () => {
    window.location.hash = '#/case?section=investigation';
    vi.mocked(verifyDemoReceipt).mockResolvedValue({
      status: 'unsupported',
      message: 'Unavailable',
    });
    render(<ReceiptConsole />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare with the original' }));
    expect(await screen.findByRole('button', { name: 'Retry signature checks' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Check the file history' }));
    expect(screen.getByText(/Platform security still needs a verified decision/)).toBeVisible();
  });

  it('preserves file history when a signature check succeeds on retry', async () => {
    window.location.hash = '#/case?section=investigation';
    const verify = vi.mocked(verifyDemoReceipt);
    verify.mockResolvedValue({ status: 'unsupported', message: 'Unavailable' });
    render(<ReceiptConsole />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare with the original' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Check the file history' }));
    verify
      .mockResolvedValueOnce({ status: 'invalid', message: 'Mismatch' })
      .mockResolvedValueOnce({ status: 'valid', message: 'Matches' });
    fireEvent.click(screen.getByRole('button', { name: 'Retry signature checks' }));
    await screen.findByText(/Platform security has already answered/);
    expect(window.location.hash).toContain('doc=history');
    const encoded = screen
      .getByRole('link', { name: 'Download the release handoff' })
      .getAttribute('href')!;
    expect(JSON.parse(decodeURIComponent(encoded.split(',')[1])).evidence).toHaveLength(3);
  });

  it('leaves the reader in the guide when an earlier comparison finishes', async () => {
    window.location.hash = '#/case?section=investigation';
    let finish!: (result: Awaited<ReturnType<typeof verifyDemoReceipt>>) => void;
    vi.mocked(verifyDemoReceipt)
      .mockResolvedValueOnce({ status: 'invalid', message: 'Mismatch' })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
    render(<ReceiptConsole />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare with the original' }));
    fireEvent.click(screen.getByRole('link', { name: 'Technical guide' }));
    await screen.findByRole('heading', { name: 'Trace the disputed write.' });
    await act(async () => finish({ status: 'valid', message: 'Matches' }));
    expect(screen.getByRole('heading', { name: 'Trace the disputed write.' })).toBeVisible();
    fireEvent.click(screen.getByRole('link', { name: /Return to this ticket/ }));
    expect(await screen.findByRole('button', { name: 'Send the decision record' })).toBeVisible();
  });
  it('restores a shared stage and clears unavailable checks on fixture changes', async () => {
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
    fireEvent.click(screen.getByRole('link', { name: 'Signature' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Check both signatures' }));
    expect(await screen.findAllByRole('cell', { name: 'unsupported' })).toHaveLength(2);
    fireEvent.click(screen.getByRole('radio', { name: /FG-1047 · Documentation read/ }));
    expect(screen.getAllByRole('cell', { name: 'unchecked' })).toHaveLength(2);
  });

  it.each([
    ['neighbor', 'FG-1047', 'signature', 'Adjacent request'],
    ['history', 'FG-1048', 'effect', 'File history'],
  ])(
    'traces the selected %s source and returns to the same desk record',
    async (doc, fixture, stage, label) => {
      window.history.replaceState(
        null,
        '',
        '#/case?section=investigation&doc=' + doc + '&packet=received',
      );
      render(<ReceiptConsole />);
      fireEvent.click(screen.getByText('Inspect the source records'));
      fireEvent.click(screen.getByRole('link', { name: /Trace this evidence/ }));
      await screen.findByRole('heading', { name: 'Trace the disputed write.' });
      expect(window.location.hash).toContain('stage=' + stage);
      expect(window.location.hash).toContain('fixture=' + fixture);
      if (doc === 'history') {
        expect(
          screen.getByRole('checkbox', { name: /Attach repository snapshots/ }),
        ).not.toBeChecked();
        expect(
          within(screen.getByRole('region', { name: 'Selected trace stage' })).getByText('9fb23c1'),
        ).toBeVisible();
      }
      fireEvent.click(screen.getByRole('link', { name: /Return to this ticket/ }));
      expect(await screen.findByRole('combobox')).toHaveDisplayValue(label);
    },
  );

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
    fireEvent.click(screen.getByText('Change the pilot assumptions'));
    fireEvent.change(screen.getByRole('slider', { name: /Reviews per month/ }), {
      target: { value: '0' },
    });
    expect(screen.getByText(/At these assumptions the pilot produces/)).toHaveTextContent(
      '-$6,000',
    );
  });
});
