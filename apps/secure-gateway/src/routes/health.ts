import { Router } from 'express';
import type {
  DevOpsComplianceTracker,
  IBPComplianceTracker,
  PLMComplianceTracker,
} from '../compliance-trackers';

export function createHealthRouter(deps: {
  checkCircuitBreaker: () => boolean;
  devopsTracker: DevOpsComplianceTracker;
  ibpTracker: IBPComplianceTracker;
  plmTracker: PLMComplianceTracker;
}): Router {
  const { checkCircuitBreaker, devopsTracker, ibpTracker, plmTracker } = deps;
  const router = Router();

  router.get('/health', (_req, res) => {
    const circuitBreakerActive = checkCircuitBreaker();
    const plmState = plmTracker.getState();
    const ibpState = ibpTracker.getState();
    const devopsState = devopsTracker.getState();
    const allGatesPassing =
      !!plmState.activeRequirementId &&
      plmState.associatedTestsWritten &&
      devopsState.pipelineVerified &&
      ibpState.crossFunctionalSynthesized &&
      ibpTracker.isBudgetAligned();

    res.status(circuitBreakerActive ? 503 : 200).json({
      status: circuitBreakerActive ? 'degraded' : 'ok',
      version: '1.2.0-Enterprise',
      uptime_seconds: Math.floor(process.uptime()),
      circuit_breaker_active: circuitBreakerActive,
      gates_passing: allGatesPassing,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
