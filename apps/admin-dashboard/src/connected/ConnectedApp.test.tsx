import '@testing-library/jest-dom/vitest';
import type { AuditReceipt } from '@fidusgate/core-types';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

const receipt: AuditReceipt = {
  payload: {
    type: 'tool_call',
    tool_name: 'read_file',
    issuer_id: 'synthetic-operator',
    decision: 'allow',
    policy_digest: 'synthetic-policy',
    issued_at: '2026-11-14T12:00:00Z',
    args: { path: '/workspace/synthetic-report.txt' },
  },
  signature: { alg: 'EdDSA', kid: 'synthetic-key', sig: 'synthetic-signature' },
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function deferredResponse() {
  let complete: (response: Response) => void = () => {
    throw new Error('Deferred response not initialized');
  };
  const promise = new Promise<Response>((resolve) => {
    complete = resolve;
  });
  return { promise, complete };
}

type RouteOverride = (path: string, init?: RequestInit) => Promise<Response> | undefined;

function gatewayMock(override: RouteOverride = () => undefined) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const path = String(input);
    const overridden = override(path, init);
    if (overridden) return overridden;
    if (path === '/health') return json({ status: 'ok', circuit_breaker_active: false });
    if (path === '/metrics')
      return new Response('fidusgate_gateway_policy_evaluations_total{decision="allow"} 1\n');
    if (path === '/api/auth/token') {
      const requested: { role: string; email: string } = JSON.parse(String(init?.body));
      return json({ ...requested, token: `synthetic-${requested.role}-token` });
    }
    if (path === '/api/receipts') return json([receipt]);
    if (path === '/api/receipts/verify-chain') return json({ valid: true });
    if (path === '/api/receipts/verify') return json({ verified: true });
    if (path === '/api/policy/active')
      return json({ code: 'permit(principal, action, resource);' });
    if (path === '/api/system/config')
      return json({ circuitBreakerActive: false, agentTokenBudget: 1000 });
    if (
      [
        '/api/plm/state',
        '/api/ibp/state',
        '/api/auth/attested-claims',
        '/api/sandbox/patch',
      ].includes(path)
    )
      return json(null);
    if (
      [
        '/api/transactions',
        '/api/findings',
        '/api/sandbox/drift',
        '/api/logs/commands',
        '/api/consensus/requests',
        '/api/ibp/budget/extensions',
        '/api/policy/chat-history',
      ].includes(path)
    )
      return json([]);
    throw new Error(`Unexpected request: ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function signIn(role: 'admin' | 'developer' | 'auditor' = 'admin') {
  fireEvent.change(screen.getByLabelText('Bootstrap key'), {
    target: { value: 'synthetic-bootstrap-key' },
  });
  fireEvent.click(screen.getByRole('button', { name: `Sign in as ${role}` }));
  await screen.findByRole('button', { name: /Inspect read_file/ });
}

function openVerifier() {
  fireEvent.click(screen.getByRole('button', { name: /Inspect read_file/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Verify this receipt' }));
  return screen.getByRole('textbox', { name: 'Signed receipt' });
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('connected gateway session', () => {
  it('requires the bootstrap key, sends it only to sign-in, and holds credentials in memory', async () => {
    const fetchMock = gatewayMock();
    const persisted = vi.spyOn(Storage.prototype, 'setItem');
    render(<App />);
    expect(screen.getByRole('button', { name: 'Sign in as admin' })).toBeDisabled();
    expect(screen.getByLabelText('Bootstrap key')).toHaveAttribute('type', 'password');
    await signIn();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/token',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-fidusgate-bootstrap-key': 'synthetic-bootstrap-key',
        },
        body: JSON.stringify({ role: 'admin', email: 'admin@fidusgate.internal' }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/receipts',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer synthetic-admin-token',
        },
      }),
    );
    for (const [path, init] of fetchMock.mock.calls) {
      if (path !== '/api/auth/token')
        expect(new Headers(init?.headers).has('x-fidusgate-bootstrap-key')).toBe(false);
    }
    expect(persisted).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Reset DB' })).toBeInTheDocument();
  });

  it('retains all seven workspaces and enforces auditor presentation for transactions and reset', async () => {
    gatewayMock();
    render(<App />);
    await signIn('auditor');
    const navigation = screen.getByRole('navigation', { name: 'Console sections' });
    for (const name of [
      'Decisions',
      'Policy playground',
      'Receipt verifier',
      'Transactions',
      'Governance',
      'Forensics',
      'Sandbox',
    ]) {
      const button = within(navigation).getByRole('button', { name });
      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-current', 'page');
      expect(
        within(screen.getByRole('main')).getByRole('heading', { level: 1 }),
      ).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Reset DB' })).not.toBeInTheDocument();
    fireEvent.click(within(navigation).getByRole('button', { name: 'Transactions' }));
    const transactionFields = screen.getByRole('group');
    expect(transactionFields).toBeDisabled();
    expect(within(transactionFields).getByRole('button')).toBeDisabled();
  });

  it('clears session data on disconnect and ignores an old protected read arriving afterward', async () => {
    const pending = deferredResponse();
    let deferReceipts = false;
    let protectedReadPending = false;
    gatewayMock((path) => {
      if (path !== '/api/receipts' || !deferReceipts) return undefined;
      protectedReadPending = true;
      return pending.promise;
    });
    render(<App />);
    await signIn();
    openVerifier();
    expect(screen.getByRole('textbox', { name: 'Signed receipt' })).toHaveValue(
      JSON.stringify(receipt, null, 2),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Decisions' }));
    deferReceipts = true;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(protectedReadPending).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect session' }));
    expect(
      screen.getByRole('heading', { name: 'Sign in to inspect decisions' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Bootstrap key')).toHaveValue('');
    await act(async () => {
      pending.complete(json([receipt]));
    });
    expect(screen.queryByRole('button', { name: /Inspect read_file/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Receipt verifier' }));
    expect(screen.getByRole('textbox', { name: 'Signed receipt' })).toHaveValue('');
    expect(screen.getByRole('heading', { name: 'Ready to verify' })).toBeInTheDocument();
  });

  it.each(['test-sandbox', 'test-bypass'])(
    'cancels delayed %s requests when the session disconnects',
    async (playbook) => {
      const fetchMock = gatewayMock();
      render(<App />);
      await signIn();
      vi.useFakeTimers();
      fireEvent.click(screen.getByRole('button', { name: 'Sandbox' }));
      fireEvent.click(screen.getByRole('button', { name: `Run ${playbook}` }));
      fireEvent.click(screen.getByRole('button', { name: 'Disconnect session' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
      expect(
        fetchMock.mock.calls.filter(
          ([path]) => path === '/api/sandbox/execute' || path === '/api/authorize',
        ),
      ).toHaveLength(0);
      expect(
        screen.getByRole('heading', { name: 'Sign in to inspect decisions' }),
      ).toBeInTheDocument();
    },
  );

  it('stops a sequential Cedar playbook after disconnecting during its first authorization request', async () => {
    const pending = deferredResponse();
    const fetchMock = gatewayMock((path) =>
      path === '/api/authorize' ? pending.promise : undefined,
    );
    render(<App />);
    await signIn();
    fireEvent.click(screen.getByRole('button', { name: 'Sandbox' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run test-cedar' }));
    const authorizationCalls = () =>
      fetchMock.mock.calls.filter(([path]) => path === '/api/authorize');
    await waitFor(() => expect(authorizationCalls()).toHaveLength(1));
    expect(authorizationCalls()[0]?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer synthetic-admin-token',
        },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect session' }));
    await act(async () => {
      pending.complete(json({ decision: 'deny' }));
    });
    expect(authorizationCalls()).toHaveLength(1);
    expect(
      screen.getByRole('heading', { name: 'Sign in to inspect decisions' }),
    ).toBeInTheDocument();
  });

  it('reports an active circuit-breaker health response as reachable with a control notice', async () => {
    gatewayMock((path) =>
      path === '/health'
        ? Promise.resolve(json({ error: 'AGENTIC_CIRCUIT_BREAKER_ACTIVE' }, 503))
        : undefined,
    );
    render(<App />);
    expect(await screen.findByText('Gateway reachable')).toBeInTheDocument();
    expect(screen.getByText('Gateway reports its circuit breaker is active.')).toBeInTheDocument();
    expect(screen.queryByText('Gateway unavailable')).not.toBeInTheDocument();
  });

  it('ends the session when an authenticated read reports expired credentials', async () => {
    let expired = false;
    gatewayMock((path) =>
      path === '/api/receipts' && expired
        ? Promise.resolve(json({ error: 'Expired' }, 401))
        : undefined,
    );
    render(<App />);
    await signIn();
    expired = true;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByRole('heading', { name: 'Sign in to inspect decisions' });
    expect(screen.queryByRole('button', { name: /Inspect read_file/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disconnect session' })).not.toBeInTheDocument();
  });
});

describe('connected gateway verification', () => {
  it('submits the selected receipt unchanged and invalidates a verified result after editing', async () => {
    const fetchMock = gatewayMock();
    render(<App />);
    await signIn();
    const input = openVerifier();
    fireEvent.click(screen.getByRole('button', { name: 'Verify signature' }));
    await screen.findByRole('heading', { name: 'Gateway verified the signature' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/receipts/verify',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer synthetic-admin-token',
        },
        body: JSON.stringify(receipt),
      }),
    );
    fireEvent.change(input, { target: { value: '{}' } });
    expect(
      screen.queryByRole('heading', { name: 'Gateway verified the signature' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ready to verify' })).toBeInTheDocument();
  });

  it('discards verification responses for an input that changed while the request was pending', async () => {
    const pending = deferredResponse();
    gatewayMock((path) => (path === '/api/receipts/verify' ? pending.promise : undefined));
    render(<App />);
    await signIn();
    const input = openVerifier();
    fireEvent.click(screen.getByRole('button', { name: 'Verify signature' }));
    expect(screen.getByRole('button', { name: 'Checking with gateway…' })).toBeDisabled();
    fireEvent.change(input, { target: { value: '{"changed":true}' } });
    await act(async () => {
      pending.complete(json({ verified: true }));
    });
    expect(screen.getByRole('textbox', { name: 'Signed receipt' })).toHaveValue('{"changed":true}');
    expect(
      screen.queryByRole('heading', { name: 'Gateway verified the signature' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ready to verify' })).toBeInTheDocument();
  });

  it('distinguishes malformed JSON from a gateway connection failure', async () => {
    const fetchMock = gatewayMock((path) =>
      path === '/api/receipts/verify'
        ? Promise.reject(new Error('Synthetic network failure'))
        : undefined,
    );
    render(<App />);
    await signIn();
    const input = openVerifier();
    fireEvent.change(input, { target: { value: '{' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify signature' }));
    expect(screen.getByText('Invalid JSON. Paste a complete signed receipt.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/receipts/verify')).toBe(false);
    fireEvent.change(input, { target: { value: JSON.stringify(receipt) } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify signature' }));
    await waitFor(() =>
      expect(
        screen.getByText(
          'The gateway could not complete verification. Check its connection and try again.',
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Invalid JSON/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Gateway verified the signature' }),
    ).not.toBeInTheDocument();
  });
});
