export type CircuitBreakerOutcome = 'next' | 'blocked' | 'fault';

/**
 * Kill-switch gate (FO-008). Config-load failures fail closed (`fault`), never open.
 */
export async function evaluateCircuitBreakerGate(
  loadConfig: () => Promise<{ circuitBreakerActive: boolean }>,
  isVerifiedAdmin: () => Promise<boolean>,
): Promise<CircuitBreakerOutcome> {
  try {
    const systemConfig = await loadConfig();
    if (!systemConfig.circuitBreakerActive) {
      return 'next';
    }
    if (await isVerifiedAdmin()) {
      return 'next';
    }
    return 'blocked';
  } catch {
    return 'fault';
  }
}
