import type { SecurityFinding } from '@fidusgate/core-types';
import { Router } from 'express';
import type { DevOpsComplianceTracker, IBPComplianceTracker } from '../compliance-trackers';
import { asyncHandler } from '../middleware/async-handler';
import type { CoreRouteDeps } from './types';

export function createFindingsRouter(
  deps: CoreRouteDeps & {
    devopsTracker: DevOpsComplianceTracker;
    ibpTracker: IBPComplianceTracker;
    broadcastWS: (event: string, data: unknown) => void;
    dispatchWebhookAlert: (type: 'blocked_action' | 'finding', data: unknown) => Promise<void>;
  },
): Router {
  const { db, requireAuth, log, devopsTracker, ibpTracker, broadcastWS, dispatchWebhookAlert } =
    deps;
  const router = Router();

  router.get(
    '/findings',
    requireAuth(['developer', 'admin', 'auditor']),
    asyncHandler(async (_req, res) => {
      const list = await db.getFindings();
      res.json(list);
    }),
  );

  router.post(
    '/findings',
    requireAuth(['admin']),
    asyncHandler(async (req, res) => {
      const findings: SecurityFinding[] = req.body;
      if (!Array.isArray(findings)) {
        res.status(400).json({ error: 'Invalid findings format. Expected a JSON array.' });
        return;
      }

      await db.setFindings(findings);
      log('security', `CI Security Auditor reported ${findings.length} findings.`, {
        count: findings.length,
      });

      const highFindings = findings.filter((f) => f.severity === 'High');
      if (highFindings.length === 0) {
        devopsTracker.onSecurityAuditSuccess();
        ibpTracker.logTask('generic', 'security_scanner');
        log(
          'info',
          'DevOps compliance gate verified: static security audit passed with zero High findings.',
        );
      }

      for (const f of findings) {
        if (f.severity === 'High') {
          await dispatchWebhookAlert('finding', { finding: f });
        }
      }

      broadcastWS('findings_updated', findings);
      res.json({ message: 'Findings updated successfully', count: findings.length });
    }),
  );

  return router;
}
