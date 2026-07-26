import type { Transaction } from '@fidusgate/core-types';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async-handler';
import { validateBody } from '../middleware/validate';
import type { CoreRouteDeps } from './types';

const createTransactionSchema = z.object({
  sender: z.string().min(1).max(320),
  recipient: z.string().min(1).max(320),
  amount: z.union([z.number(), z.string()]),
  currency: z.string().min(1).max(16),
});

function maskPII(text: string): string {
  if (text.includes('@')) {
    const parts = text.split('@');
    const name = parts[0];
    const domain = parts[1];
    return `${name.substring(0, 1)}***@${domain.substring(0, 1)}***`;
  }

  const words = text.split(' ');
  if (words.length > 1) {
    return words.map((w) => `${w.substring(0, 1)}***`).join(' ');
  }

  return `${text.substring(0, 2)}***`;
}

function isEmailShape(v: unknown): boolean {
  if (typeof v !== 'string' || v.length === 0 || v.length > 320) return false;
  const at = v.indexOf('@');
  if (at <= 0 || at !== v.lastIndexOf('@') || at === v.length - 1) return false;
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  if (dot <= 0 || dot === domain.length - 1) return false;
  if (/\s/.test(local) || /\s/.test(domain)) return false;
  return true;
}

export function createTransactionsRouter(deps: CoreRouteDeps): Router {
  const { db, requireAuth, log, secureNumericId } = deps;
  const router = Router();

  router.get(
    '/transactions',
    requireAuth(['developer', 'admin', 'auditor']),
    asyncHandler(async (_req, res) => {
      const list = await db.getTransactions();
      res.json(list);
    }),
  );

  router.post(
    '/transactions',
    requireAuth(['developer', 'admin']),
    validateBody(createTransactionSchema),
    asyncHandler(async (req, res) => {
      const { sender, recipient, amount, currency } = req.body as z.infer<
        typeof createTransactionSchema
      >;

      const isSenderPii =
        isEmailShape(sender) ||
        sender.toLowerCase().includes(' wallet') ||
        sender.split(' ').length > 2;
      const isRecipientPii =
        isEmailShape(recipient) ||
        recipient.toLowerCase().includes(' wallet') ||
        recipient.split(' ').length > 2;
      const requiresMasking = isSenderPii || isRecipientPii;

      const processedSender = requiresMasking ? maskPII(sender) : sender;
      const processedRecipient = requiresMasking ? maskPII(recipient) : recipient;

      const isSuspicious =
        sender.toLowerCase().includes('tor') ||
        recipient.toLowerCase().includes('tor') ||
        Number(amount) > 1000000;
      const status = isSuspicious ? 'flagged' : 'completed';

      const newTx: Transaction = {
        id: `tx_${secureNumericId(6)}`,
        timestamp: new Date().toISOString(),
        sender: processedSender,
        recipient: processedRecipient,
        amount: Number(amount),
        currency,
        status,
        maskedPii: requiresMasking,
      };

      await db.addTransaction(newTx);
      log('info', `Transaction registered successfully: ${newTx.id}`, {
        id: newTx.id,
        status,
      });
      res.status(201).json(newTx);
    }),
  );

  return router;
}
