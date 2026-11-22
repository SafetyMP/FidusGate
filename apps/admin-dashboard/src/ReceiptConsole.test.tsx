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
  it('opens on the release problem and gates the evidence and funding decision', async () => {
    render(<ReceiptConsole />);
    expect(
      screen.getByRole('heading', { name: 'Who changed the rules before release?' }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Check signature' })).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Open the change ticket' }));
    expect(
      await screen.findByRole('heading', { name: 'What can you tell the release lead?' }),
    ).toBeVisible();
    expect(document.activeElement?.id).toBe('case-investigation');
  });

  it('reconciles four sources, revises the recommendation, and exports only attached evidence', async () => {
    window.location.hash = '#/case?section=investigation';
    vi.mocked(verifyDemoReceipt)
      .mockResolvedValueOnce({ status: 'invalid', message: 'Ticket mismatch' })
      .mockResolvedValue({ status: 'valid', message: 'Archive matches' });
    render(<ReceiptConsole />);
    const select = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));
    const attach = () =>
      fireEvent.click(screen.getByRole('checkbox', { name: 'Attach to the release handoff' }));
    const handoff = () => within(screen.getByRole('complementary', { name: 'Release handoff' }));
    select(/Check signature/);
    expect(await handoff().findByText(/ticket copy fails/)).toBeVisible();
    fireEvent.click(screen.getByRole('radio', { name: /Close the ticket/ }));
    expect(screen.getByText(/Reopen the attribution question/)).not.toHaveTextContent('808');
    select(/Adjacent request/);
    select(/Check signature/);
    attach();
    expect(await handoff().findByText(/separate documentation read/)).toBeVisible();
    fireEvent.click(screen.getByRole('radio', { name: 'Record the supported findings' }));
    expect(screen.getByText(/Send this limited finding/)).toBeVisible();
    select(/Gateway original/);
    attach();
    select(/Check signature/);
    expect(await handoff().findByText(/same signature/)).toBeVisible();
    fireEvent.click(screen.getByRole('radio', { name: 'Record the supported findings' }));
    expect(screen.getByText(/Send the verified decision/)).toBeVisible();
    select(/Release engineer File history/);
    attach();
    expect(handoff().getByText(/revisions 807 and 808/)).toBeVisible();
    fireEvent.click(screen.getByRole('radio', { name: /Close the ticket/ }));
    expect(screen.getByText(/Reopen the attribution question/)).toBeVisible();
    const download = () =>
      JSON.parse(
        decodeURIComponent(
          handoff()
            .getByRole('link', { name: 'Download this handoff' })
            .getAttribute('href')!
            .split(',')[1],
        ),
      );
    expect(download().evidence).toHaveLength(4);
    expect(download().openRequests.join(' ')).toContain('writer');
    attach();
    expect(download().evidence).toHaveLength(3);
    expect(handoff().queryByText(/revisions 807 and 808/)).toBeNull();
    select(/Restart investigation/);
    expect(download().evidence).toHaveLength(1);
    expect(download().findings).toEqual([]);
  });

  it('keeps the selected ticket and case handoff across the compact technical guide', async () => {
    window.location.hash = '#/case?section=investigation&packet=received';
    vi.mocked(verifyDemoReceipt)
      .mockResolvedValueOnce({ status: 'invalid', message: 'Ticket mismatch' })
      .mockResolvedValueOnce({ status: 'invalid', message: 'Case mismatch' })
      .mockResolvedValueOnce({ status: 'valid', message: 'Fixture matches' });
    render(<ReceiptConsole />);
    fireEvent.click(screen.getByRole('button', { name: 'Check signature' }));
    await screen.findByText('Ticket mismatch');
    fireEvent.click(screen.getByRole('link', { name: /Trace this evidence/ }));
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Check both signatures' }));
    expect(await screen.findByRole('cell', { name: 'invalid' })).toBeVisible();
    expect(screen.getByRole('cell', { name: 'valid' })).toBeVisible();
    fireEvent.click(screen.getByRole('link', { name: 'File history' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Attach repository snapshots/ }));
    expect(screen.queryByRole('table')).toBeNull();
    const url = screen
      .getByRole('link', { name: /Download selected evidence/ })
      .getAttribute('href')!;
    const bundle = JSON.parse(decodeURIComponent(url.split(',')[1]));
    expect(bundle.caseRecord.check.status).toBe('invalid');
    expect(bundle.comparison.check.status).toBe('valid');
    expect(bundle.repositoryEvidence.snapshots).toHaveLength(2);
    fireEvent.click(screen.getByRole('link', { name: /Return to this ticket/ }));
    await screen.findByRole('heading', { name: 'What can you tell the release lead?' });
    expect(screen.getByText('Ticket mismatch')).toBeVisible();
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
      expect(await screen.findByRole('button', { name: new RegExp(label) })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
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
