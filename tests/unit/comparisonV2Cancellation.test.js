import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCancellationV2, parseComparisonV2 } from '../../src/features/optimization/comparisonV2Contract.js';

const fixture = JSON.parse(readFileSync(new URL('../../docs/contracts/optimization/comparison-v2.json', import.meta.url), 'utf8'));
const id = fixture.accepted.comparison_id;
const response = { profile: 'comparison-v2', schema_version: 2, comparison_id: id, version: 3,
  cancel_state: 'REQUESTED', terminal: false, supervisor_stopped: false };

test('EN-UX-004 cancellation status is strict, versioned and never claims early closure', () => {
  assert.deepEqual(parseCancellationV2(response, id), response);
  assert.throws(() => parseCancellationV2({ ...response, cancel_state: 'CANCELLED' }, id));
  assert.throws(() => parseCancellationV2({ ...response, terminal: true }, id));
  assert.throws(() => parseCancellationV2({ ...response, supervisor_stopped: true, terminal: true }, id));
  assert.throws(() => parseCancellationV2({ ...response, schema_version: 1 }, id));
  assert.throws(() => parseCancellationV2({ ...response, comparison_id: id + 1 }, id));
  assert.throws(() => parseCancellationV2({ ...response, new_field: 'unexpected' }, id));
});

test('EN-UX-004 durable cancellation prevents eligibility even for completed FF', () => {
  const cancelled = structuredClone(fixture.completed);
  cancelled.cancellation_status = 'CANCELLED';
  cancelled.executions.forEach(execution => { execution.eligible = false; });
  cancelled.selection_allowed = false; cancelled.confirmable = false;
  assert.equal(parseComparisonV2(cancelled).cancellation_status, 'CANCELLED');
  cancelled.executions[0].eligible = true;
  assert.throws(() => parseComparisonV2(cancelled));
});
