import { Router } from 'express';
import type { PLMComplianceTracker } from '../compliance-trackers';
import type { CoreRouteDeps } from './types';

export function createPlmRouter(
  deps: CoreRouteDeps & { plmTracker: PLMComplianceTracker },
): Router {
  const { requireAuth, log, plmTracker } = deps;
  const router = Router();

  router.post('/plm/requirement', requireAuth(['developer', 'admin']), (req, res) => {
    try {
      const { id, description } = req.body ?? {};
      if (!id || String(id).trim().length === 0) {
        res.status(400).json({ error: 'Missing or empty requirement ID.' });
        return;
      }

      plmTracker.setRequirement(id);
      log(
        'info',
        `PLM Governance: Registered active requirement/issue ID: ${id}. Description: ${description || ''}`,
      );
      res.json({
        message: `Active requirement ${id} registered and verified.`,
        activeRequirementId: id,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      log('error', 'Failed to register requirement ID', message);
      res.status(500).json({ error: 'Failed to register requirement' });
    }
  });

  router.post('/plm/drift-verify', requireAuth(['developer', 'admin']), (_req, res) => {
    try {
      plmTracker.verifyDrift();
      log(
        'info',
        'PLM Governance: API and schema contract drift successfully verified and cleared.',
      );
      res.json({ message: 'API schema contract drift verified and cleared.', verified: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      log('error', 'Failed to verify API drift', message);
      res.status(500).json({ error: 'Failed to verify drift' });
    }
  });

  router.post('/plm/feedback', requireAuth(['developer', 'admin']), (req, res) => {
    try {
      const { role, comment, severity } = req.body ?? {};
      if (!role || !comment || !severity) {
        res.status(400).json({ error: 'Missing required parameters: role, comment, severity' });
        return;
      }
      if (!['info', 'warn', 'critical'].includes(severity)) {
        res.status(400).json({ error: 'Invalid severity. Must be info, warn, or critical' });
        return;
      }

      plmTracker.addFeedback(role, comment, severity);
      log(
        'info',
        `PLM Governance: Received feedback from ${role}. Severity: ${String(severity).toUpperCase()}. Comment: ${comment}`,
      );
      res.json({
        message: 'Feedback logged successfully',
        aligned: plmTracker.getState().feedbackAligned,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      log('error', 'Failed to log PLM feedback', message);
      res.status(500).json({ error: 'Failed to log feedback' });
    }
  });

  router.post('/plm/feedback-align', requireAuth(['developer', 'admin']), (req, res) => {
    try {
      const { requirementId, justification } = req.body ?? {};
      if (!requirementId || !justification || String(justification).trim().length === 0) {
        res
          .status(400)
          .json({ error: 'Missing required parameters: requirementId, justification' });
        return;
      }

      plmTracker.alignFeedback(requirementId, justification);
      log(
        'info',
        `PLM Governance: Feedback aligned for Requirement ${requirementId}. Justification: ${justification}`,
      );
      res.json({ message: 'Feedback aligned successfully', aligned: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      log('error', 'Failed to align PLM feedback', message);
      res.status(500).json({ error: 'Failed to align feedback' });
    }
  });

  router.get('/plm/state', requireAuth(['developer', 'admin', 'auditor']), (_req, res) => {
    try {
      res.json(plmTracker.getState());
    } catch {
      res.status(500).json({ error: 'Failed to retrieve PLM state' });
    }
  });

  return router;
}
