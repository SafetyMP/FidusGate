import type { Express } from 'express';
import type {
  DevOpsComplianceTracker,
  IBPComplianceTracker,
  PLMComplianceTracker,
} from '../compliance-trackers';
import { errorHandler } from '../middleware/error-handler';
import { createFindingsRouter } from './findings';
import { createHealthRouter } from './health';
import { createPlmRouter } from './plm';
import { createSystemRouter } from './system';
import { createTransactionsRouter } from './transactions';
import type { CoreRouteDeps } from './types';

export function registerModularRoutes(
  app: Express,
  deps: CoreRouteDeps & {
    checkCircuitBreaker: () => boolean;
    devopsTracker: DevOpsComplianceTracker;
    ibpTracker: IBPComplianceTracker;
    plmTracker: PLMComplianceTracker;
    broadcastWS: (event: string, data: unknown) => void;
    dispatchWebhookAlert: (type: 'blocked_action' | 'finding', data: unknown) => Promise<void>;
  },
): void {
  const core: CoreRouteDeps = {
    db: deps.db,
    requireAuth: deps.requireAuth,
    log: deps.log,
    secureNumericId: deps.secureNumericId,
  };

  app.use('/api', createTransactionsRouter(core));
  app.use(
    '/api',
    createFindingsRouter({
      ...core,
      devopsTracker: deps.devopsTracker,
      ibpTracker: deps.ibpTracker,
      broadcastWS: deps.broadcastWS,
      dispatchWebhookAlert: deps.dispatchWebhookAlert,
    }),
  );
  app.use('/api', createPlmRouter({ ...core, plmTracker: deps.plmTracker }));
  app.use('/api', createSystemRouter({ ...core, broadcastWS: deps.broadcastWS }));
  app.use(
    createHealthRouter({
      checkCircuitBreaker: deps.checkCircuitBreaker,
      devopsTracker: deps.devopsTracker,
      ibpTracker: deps.ibpTracker,
      plmTracker: deps.plmTracker,
    }),
  );

  app.use(errorHandler);
}
