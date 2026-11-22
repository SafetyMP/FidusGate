import { receiptJson, tamperReceipt, type DemoDecision } from './index';

export type Packet = 'original' | 'received';
export function casePacket(record: DemoDecision, source: Packet) {
  const original = receiptJson(record);
  return source === 'received' ? tamperReceipt(original) : original;
}
export const snapshots = [
  { at: '14:30 UTC', revision: 807, blob: '9fb23c1' },
  { at: '14:38 UTC', revision: 808, blob: 'd9019fa' },
];
