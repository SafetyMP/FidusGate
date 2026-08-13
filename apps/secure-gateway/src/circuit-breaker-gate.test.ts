process.env.FIDUSGATE_TEST = 'true';
import test from 'node:test';
import assert from 'node:assert';
import { evaluateCircuitBreakerGate } from './circuit-breaker-gate';

test('circuit-breaker gate fails closed when config load throws', async () => {
  const outcome = await evaluateCircuitBreakerGate(
    async () => {
      throw new Error('datastore unavailable');
    },
    async () => true,
  );
  assert.equal(outcome, 'fault');
});

test('circuit-breaker gate blocks non-admin while active', async () => {
  const outcome = await evaluateCircuitBreakerGate(
    async () => ({ circuitBreakerActive: true }),
    async () => false,
  );
  assert.equal(outcome, 'blocked');
});

test('circuit-breaker gate allows admin while active', async () => {
  const outcome = await evaluateCircuitBreakerGate(
    async () => ({ circuitBreakerActive: true }),
    async () => true,
  );
  assert.equal(outcome, 'next');
});

test('circuit-breaker gate continues when inactive', async () => {
  const outcome = await evaluateCircuitBreakerGate(
    async () => ({ circuitBreakerActive: false }),
    async () => false,
  );
  assert.equal(outcome, 'next');
});
