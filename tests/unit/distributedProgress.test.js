import assert from 'node:assert/strict';
import { test } from 'node:test';
import { followProgress, parseDurableRun, parseProgress, progressQuery, retryAfterMs } from '../../src/features/optimization/distributedProgress.js';

const v2 = '/api/optimization/comparisons-v2/42';
const event = (sequence, kind = 'WAITING', changes = {}) => ({
  sequence, kind, occurred_at: '2026-01-01T09:00:00Z', execution_id: null, method: null, reason: null, ...changes,
});
const page = (changes = {}) => ({
  job_id: 42, profile: 'V2', state: 'WAITING', version: 1, cancellation: 'NONE', result_state: 'EN_EJECUCION',
  result_url: v2, current_engine: null, events: [event(1)], next_sequence: 1, has_more: false, poll_after_ms: 1000,
  ...changes,
});
const status = (status, code, retryAfterMs) => Object.assign(new Error(code ?? String(status)), { status, code, retryAfterMs });

test('progress validates request identity, cursor, engine identity fields and local result URL', () => {
  const valid = page({ current_engine: { method: 'BF', execution_id: 91 }, events: [
    event(8, 'ENGINE_FINISHED', { execution_id: 90, method: 'FF', reason: 'COMPLETED' }),
    event(9, 'ENGINE_STARTED', { execution_id: 91, method: 'BF' }),
  ], next_sequence: 9, state: 'RUNNING' });
  assert.equal(parseProgress(valid, { profile: 'V2', id: 42, after: 7 }), valid);
  const invalid = [
    { job_id: 43 }, { profile: 'FF' }, { result_url: 'https://outside.invalid/job/42' },
    { state: 'COMPLETE' }, { result_state: 'DONE' }, { poll_after_ms: 0 }, { secret: 'data' }, { next_sequence: 8 },
    { events: [event(9)] }, { events: [event(8), event(8)] },
    { events: [event(8), event(9, 'ENGINE_FINISHED', { method: 'FF', execution_id: 90, reason: 'ERROR' })] },
    { current_engine: { method: 'OTHER', execution_id: 91 } }, { has_more: true },
  ];
  for (const change of invalid) assert.throws(() => parseProgress({ ...valid, ...change }, { profile: 'V2', id: 42, after: 7 }));
  assert.equal(String(progressQuery(null)), 'limit=16');
  assert.equal(String(progressQuery(0, 2)), 'limit=2&after_sequence=0');
  assert.throws(() => progressQuery(-1));
  assert.throws(() => progressQuery(0, 33));
});

test('durable FF admits only exact status and result identity', () => {
  const data = { id_optimizacion: 42, state: 'TERMINAL', result_url: '/api/optimization/runs/42' };
  assert.equal(parseDurableRun(data, 42), data);
  assert.throws(() => parseDurableRun(data, 43));
  assert.throws(() => parseDurableRun({ ...data, state: 'WAITING' }, 42));
  assert.equal(retryAfterMs(new Response('{}', { status: 429, headers: { 'Retry-After': '3' } })), 3000);
  assert.equal(retryAfterMs(new Response('{}', { status: 503, headers: { 'Retry-After': 'bad' } })), null);
});

test('reader preserves cursor on failures, resets once on expiry, drains each page, and stops at terminal', async () => {
  const controller = new AbortController();
  const sequence = [], delays = [], stored = [], applied = [], errors = [];
  let resets = 0, reconnects = 0;
  const replies = [
    status(409, 'EVENT_CURSOR_EXPIRED'), status(429, 'PROGRESS_BUSY', 3000), status(503, 'RESOURCE_UNAVAILABLE', 2000),
    page({ state: 'TERMINAL', has_more: true, next_sequence: 10 }),
    page({ state: 'TERMINAL', has_more: false, next_sequence: 15 }),
  ];
  await followProgress({
    read: async (after, signal) => {
      assert.equal(signal, controller.signal);
      sequence.push(after);
      const next = replies.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    apply: async value => { applied.push(value.next_sequence); },
    cursor: { get: () => 2, set: next => stored.push(next) },
    signal: controller.signal, wait: async ms => { delays.push(ms); },
    onReset: () => resets++, onReconnect: () => reconnects++, onError: error => errors.push(error),
  });
  assert.deepEqual(sequence, [2, null, null, null, 10]);
  assert.deepEqual(delays, [3000, 2000]);
  assert.deepEqual(stored, [null, 10, 15]);
  assert.deepEqual(applied, [10, 15]);
  assert.equal(resets, 1);
  assert.equal(reconnects, 2);
  assert.deepEqual(errors, []);
});

test('abort skips late updates and 401, 403, and 404 stop the reader', async () => {
  for (const failure of [401, 403, 404, null]) {
    const controller = new AbortController(), errors = [];
    let calls = 0;
    await followProgress({
      read: async () => {
        calls++;
        if (failure) throw status(failure);
        controller.abort();
        return page();
      },
      apply: () => assert.fail('Unexpected progress'),
      cursor: { get: () => null, set: () => assert.fail('Unexpected write') },
      signal: controller.signal, onError: error => errors.push(error.status),
    });
    assert.equal(calls, 1);
    assert.deepEqual(errors, failure ? [failure] : []);
  }
});
