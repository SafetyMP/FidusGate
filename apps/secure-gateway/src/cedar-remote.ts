import { MAX_COMMAND_LINE_LENGTH } from './command-auditor';
import { shouldFailClosedOnDaemonError } from './production-profile';
import { assertSafeCedarDaemonUrl, untaintText } from './security-sanitize';

export type CedarDecision = 'allow' | 'deny';

export interface CedarDaemonQuery {
  principal: string;
  action: string;
  resource?: string;
  path?: string;
  commandLine?: string;
  context: Record<string, unknown>;
}

/**
 * POST /authorize to the Cedar daemon. Returns ok:false on transport/HTTP
 * failure so callers can fail closed or fall back to the TS engine.
 */
export async function queryCedarDaemon(
  input: CedarDaemonQuery,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ ok: true; decision: CedarDecision } | { ok: false; reason: string }> {
  const rawDaemonUrl = env.CEDAR_DAEMON_URL || 'http://localhost:50051/authorize';
  let daemonUrl: string;
  try {
    daemonUrl = assertSafeCedarDaemonUrl(rawDaemonUrl);
  } catch {
    daemonUrl = 'http://localhost:50051/authorize';
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = env.CEDAR_DAEMON_TOKEN?.trim();
  if (token) {
    headers['X-Cedar-Daemon-Token'] = token;
  }

  try {
    const response = await fetch(daemonUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        principal: String(input.principal ?? ''),
        action: String(input.action ?? ''),
        resource: String(input.resource ?? input.action ?? ''),
        context: input.context,
      }),
      signal: AbortSignal.timeout(500),
    });
    if (!response.ok) {
      return { ok: false, reason: `daemon HTTP ${response.status}` };
    }
    const result = (await response.json()) as {
      decision?: unknown;
      diagnostics?: { errors?: unknown };
    };
    const evalErrors = Array.isArray(result?.diagnostics?.errors)
      ? result.diagnostics.errors
      : [];
    if (evalErrors.length > 0) {
      return { ok: true, decision: 'deny' };
    }
    return {
      ok: true,
      decision: result.decision === 'allow' ? 'allow' : 'deny',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'daemon unreachable';
    return { ok: false, reason: message };
  }
}

export function daemonFailureMustDeny(env: NodeJS.ProcessEnv = process.env): boolean {
  return shouldFailClosedOnDaemonError(env);
}

export function boundedCommandLine(value: unknown): string {
  return untaintText(value ?? '', MAX_COMMAND_LINE_LENGTH);
}

export function boundedPath(value: unknown): string {
  return untaintText(value ?? '', 512);
}
