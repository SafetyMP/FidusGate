import { FidusGateDatabase } from '@fidusgate/database';

export function startConsensusExpiryWorker(
  db: FidusGateDatabase,
  intervalMs: number = 10000,
  broadcastCallback?: (event: string, payload: any) => void
) {
  console.log('⏰ Consensus Expiry background worker successfully booted.');
  
  const interval = setInterval(async () => {
    try {
      const pending = await db.getPendingActions();
      const now = Date.now();
      
      for (const action of pending) {
        if (action.status === 'pending' && new Date(action.expiresAt).getTime() < now) {
          console.log(`⏰ CONSENSUS EXPIRED: Action ID: ${action.id} has passed its expiration time (${action.expiresAt}).`);
          await db.expirePendingAction(action.id);
          
          if (broadcastCallback) {
            broadcastCallback('consensus_expired', { actionId: action.id, status: 'expired' });
          }
        }
      }
    } catch (err: any) {
      console.error('❌ Failed to run consensus expiry check:', err.message);
    }
  }, intervalMs);

  return () => clearInterval(interval);
}
