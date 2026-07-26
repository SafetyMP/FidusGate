import type { Transaction } from '@fidusgate/core-types';
import { useActionState, useState } from 'react';
import { API_BASE } from '../lib/api';

export type TransactionFormState = {
  notification: { message: string; type: 'success' | 'warn' } | null;
  error: string | null;
};

const initialState: TransactionFormState = {
  notification: null,
  error: null,
};

type CreateDeps = {
  getHeaders: () => Record<string, string>;
  onCreated: (tx: Transaction) => void;
};

export function useTransactionAction(deps: CreateDeps) {
  const [sender, setSender] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');

  const [state, formAction, isPending] = useActionState(
    async (_prev: TransactionFormState, formData: FormData): Promise<TransactionFormState> => {
      const nextSender = String(formData.get('sender') ?? '');
      const nextRecipient = String(formData.get('recipient') ?? '');
      const nextAmount = String(formData.get('amount') ?? '');
      const nextCurrency = String(formData.get('currency') ?? 'USD');

      if (!nextSender || !nextRecipient || !nextAmount) {
        return { notification: null, error: 'Sender, recipient, and amount are required.' };
      }

      const res = await fetch(`${API_BASE}/transactions`, {
        method: 'POST',
        headers: deps.getHeaders(),
        body: JSON.stringify({
          sender: nextSender,
          recipient: nextRecipient,
          amount: parseFloat(nextAmount),
          currency: nextCurrency,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        return {
          notification: null,
          error: body.error ?? 'Failed to create transaction',
        };
      }

      const tx = (await res.json()) as Transaction;
      deps.onCreated(tx);
      setSender('');
      setRecipient('');
      setAmount('');

      if (tx.maskedPii) {
        return {
          notification: {
            message:
              'Transaction registered. PII was detected and automatically masked for privacy.',
            type: 'warn',
          },
          error: null,
        };
      }

      return {
        notification: {
          message: `Transaction completed. Ledger ID: ${tx.id}`,
          type: 'success',
        },
        error: null,
      };
    },
    initialState,
  );

  return {
    sender,
    setSender,
    recipient,
    setRecipient,
    amount,
    setAmount,
    currency,
    setCurrency,
    formAction,
    isPending,
    state,
  };
}
