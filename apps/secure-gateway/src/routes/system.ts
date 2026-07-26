import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import type { CoreRouteDeps } from './types';

export function createSystemRouter(
  deps: CoreRouteDeps & {
    broadcastWS: (event: string, data: unknown) => void;
  },
): Router {
  const { db, requireAuth, log, broadcastWS } = deps;
  const router = Router();

  router.get(
    '/system/config',
    requireAuth(['developer', 'admin', 'auditor']),
    asyncHandler(async (_req, res) => {
      const systemConfig = await db.getSystemConfig();
      res.json(systemConfig);
    }),
  );

  router.post(
    '/system/config',
    requireAuth(['admin']),
    asyncHandler(async (req, res) => {
      const { circuitBreakerActive, agentTokenBudget } = req.body ?? {};
      await db.updateSystemConfig({ circuitBreakerActive, agentTokenBudget });
      const updated = await db.getSystemConfig();

      log(
        'warn',
        `SYSTEM CONFIG UPDATED: circuitBreakerActive=${updated.circuitBreakerActive}, agentTokenBudget=${updated.agentTokenBudget}`,
      );
      broadcastWS('system_config_updated', updated);

      res.json({ message: 'System configuration updated successfully', config: updated });
    }),
  );

  return router;
}
