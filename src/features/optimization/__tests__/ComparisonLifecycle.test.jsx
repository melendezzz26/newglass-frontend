import { expect, test, vi } from 'vitest';
import fixture from '../../../../docs/contracts/optimization/comparison-v1.json';
import { createComparisonController } from '../comparisonController';

function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
function setup({ confirmed = false, withV2 = false, distributed = false, saved, loadV2, progressV2 } = {}) {
  localStorage.clear();
  if (saved) for (const [key, value] of Object.entries(saved)) localStorage.setItem(key, JSON.stringify(value));
  let listener;
  const current = { ...structuredClone(fixture.completed), selected_execution_id: 2,
    confirmable: !confirmed, confirmed, selection_allowed: !confirmed };
  const source = { subscribe(fn) { listener = fn; return () => {}; },
    load() { listener({ type: 'orders', orders: [{ id_pedido: 1 }, { id_pedido: 99 }] }); },
    refresh: vi.fn(), dispose() {}, emit(orders) { listener({ type: 'orders', orders }); } };
  const api = { load: vi.fn(async () => structuredClone(current)),
    result: vi.fn(async (_, e) => structuredClone(fixture.results[e.execution_id])),
    manifest: vi.fn(async (_, e) => structuredClone(fixture.manifests[e.execution_id])),
    confirm: vi.fn(async () => {}), choose: vi.fn(), release: vi.fn(), start: vi.fn(), observe: vi.fn(), lookup: vi.fn() };
  const apiV2 = withV2 ? { ...api, start: vi.fn(), load: loadV2 ?? api.load, progress: progressV2 } : undefined;
  const flow = createComparisonController({ api, apiV2, source, storageKey: 'lifecycle-test', distributed,
    initialProfile: distributed && !saved ? 'comparison-v2' : undefined });
  flow.mount();
  return { flow, api, apiV2, source, current };
}

test('a definitive preflight rejection keeps the previous result recoverable after reload', async () => {
  const { flow, api, source, current } = setup();
  try {
    current.released = true;
    await flow.load(1);
    flow.select([99]);
    api.start.mockRejectedValueOnce(Object.assign(new Error('No hay material compatible.'), {
      status: 422, code: 'NO_COMPATIBLE_STOCK', requestAccepted: false,
    }));
    await flow.start();
    expect(flow.getSnapshot()).toMatchObject({ busy: false, pendingRequest: false,
      error: 'No hay material compatible.', comparison: { comparison_id: 1 } });
    expect(JSON.parse(localStorage.getItem('lifecycle-test')).id).toBe(1);
    flow.dispose();
    const restored = createComparisonController({ api, source, storageKey: 'lifecycle-test' });
    restored.mount();
    try {
      await vi.waitFor(() => expect(restored.getSnapshot().comparison?.comparison_id).toBe(1));
    } finally { restored.dispose(); }
    const again = createComparisonController({ api, source, storageKey: 'lifecycle-test' });
    again.mount();
    try {
      await vi.waitFor(() => expect(again.getSnapshot().comparison?.comparison_id).toBe(1));
    } finally { again.dispose(); }
  } finally { flow.dispose(); }
});

test('an ambiguous new profile retains its own recovery endpoint after a rejected request', async () => {
  const { flow, api, apiV2, current } = setup({ withV2: true });
  try {
    current.released = true;
    await flow.load(1);
    flow.select([99]);
    api.start.mockRejectedValueOnce(Object.assign(new Error('No cabe.'), { status: 422 }));
    await flow.start();
    flow.setProfile('comparison-v2');
    apiV2.start.mockRejectedValueOnce(Object.assign(new Error('Sin conexion.'), { status: 0 }));
    await flow.start('comparison-v2');
    const saved = JSON.parse(localStorage.getItem('lifecycle-test'));
    expect(saved.id).toBeNull();
    expect(saved.profile).toBe('comparison-v2');
    expect(flow.getSnapshot().pendingRequest).toBe(true);
  } finally { flow.dispose(); }
});

test.each(['NO_COMPATIBLE_STOCK', 'PIECE_DOES_NOT_FIT'])('a %s rejection allows correcting and retrying', async code => {
  const { flow, api, current } = setup();
  try {
    flow.select([1]);
    api.start.mockRejectedValueOnce(Object.assign(new Error('Revisa el material.'), { status: 422, code }));
    await flow.start();
    expect(flow.getSnapshot()).toMatchObject({ busy: false, pendingRequest: false, error: 'Revisa el material.' });
    flow.select([99]);
    api.start.mockResolvedValueOnce(current);
    await flow.start();
    expect(api.start.mock.calls[1][0]).toEqual([99]);
  } finally { flow.dispose(); }
});

test('an ambiguous start keeps its key and order set across reload and retry', async () => {
  const { flow, api, source, current } = setup();
  flow.select([1]);
  api.start.mockRejectedValueOnce(Object.assign(new Error('Sin conexión'), { status: 0 }));
  await flow.start();
  const key = api.start.mock.calls[0][1];
  expect(flow.getSnapshot().pendingRequest).toBe(true);
  flow.select([99]);
  await flow.start();
  expect(api.start).toHaveBeenCalledTimes(1);
  expect(flow.getSnapshot().error).toContain('antes de cambiar los pedidos');
  flow.dispose();
  api.lookup.mockRejectedValue(Object.assign(new Error('No encontrada'), { status: 404 }));
  api.start.mockResolvedValue(current);
  const restored = createComparisonController({ api, source, storageKey: 'lifecycle-test' });
  restored.mount();
  try {
    await vi.waitFor(() => expect(api.lookup).toHaveBeenCalledWith(key));
    expect(restored.getSnapshot().selected).toEqual([1]);
    await restored.start();
    expect(api.start.mock.calls[1][0]).toEqual([1]);
    expect(api.start.mock.calls[1][1]).toBe(key);
  } finally { restored.dispose(); }
});

test.each(['OPTIMIZER_BUSY', 'RECOVERY_BLOCKED'])('a confirmed %s rejection allows selecting another order', async code => {
  const { flow, api, current } = setup();
  try {
    flow.select([1]);
    api.start.mockRejectedValueOnce(Object.assign(new Error('Inicio rechazado'), {
      status: 503, code, requestAccepted: false,
    }));
    await flow.start();
    expect(flow.getSnapshot()).toMatchObject({ pendingRequest: false, error: 'Inicio rechazado' });
    flow.select([99]);
    api.start.mockResolvedValue(current);
    await flow.start();
    expect(api.start.mock.calls[1][0]).toEqual([99]);
    expect(api.start.mock.calls[1][1]).not.toBe(api.start.mock.calls[0][1]);
  } finally { flow.dispose(); }
});

test.each([
  { status: 503, code: 'OPTIMIZER_BUSY', requestAccepted: false, retryAfterMs: 0 },
  { status: 409, code: 'STATE_CONFLICT' },
])('distributed V2 allows a different lot after definitive admission rejection $status', async fault => {
  const { flow, apiV2, source, current } = setup({ withV2: true, distributed: true });
  try {
    flow.select([1]);
    apiV2.start.mockRejectedValueOnce(Object.assign(new Error('Rechazo definitivo'), fault));
    await flow.start();
    expect(flow.getSnapshot().pendingRequest).toBe(false);
    expect(JSON.parse(localStorage.getItem('lifecycle-test:v2')).requestKey).toBeNull();
    source.emit([{ id_pedido: 99 }]);
    flow.select([99]);
    apiV2.start.mockResolvedValueOnce({ ...current, profile: 'comparison-v2', executions: [] });
    await flow.start();
    expect(apiV2.start.mock.calls.map(([ids]) => ids)).toEqual([[1], [99]]);
    expect(apiV2.start.mock.calls[0][1]).not.toBe(apiV2.start.mock.calls[1][1]);
  } finally { flow.dispose(); }
});

test.each([{ status: 0 }, { status: 503, retryAfterMs: 0 }])(
  'distributed V2 keeps the original key for an uncertain admission $status across a mode change',
  async fault => {
    const { flow, api, apiV2, source, current } = setup({ withV2: true, distributed: true });
    flow.select([1]);
    apiV2.start.mockRejectedValueOnce(Object.assign(new Error('Admisión incierta'), fault));
    await flow.start();
    const key = apiV2.start.mock.calls[0][1];
    flow.select([99]);
    expect(flow.getSnapshot()).toMatchObject({ selected: [1], pendingRequest: true });
    flow.dispose();
    apiV2.lookup.mockRejectedValueOnce(Object.assign(new Error('No encontrado'), { status: 404 }));
    const restored = createComparisonController({ api, apiV2, source, storageKey: 'lifecycle-test' });
    restored.mount();
    try {
      await vi.waitFor(() => expect(apiV2.lookup).toHaveBeenCalledWith(key));
      apiV2.start.mockResolvedValueOnce({ ...current, profile: 'comparison-v2', executions: [] });
      await restored.start();
      expect(apiV2.start.mock.calls[1].slice(0, 2)).toEqual([[1], key]);
    } finally { restored.dispose(); }
  },
);

test('activation migrates only the owner’s V2 record and keeps its pending cancellation through both modes', async () => {
  const prior = { id: 42, profile: 'comparison-v2', requestKey: 'original-request',
    attemptOrders: [1], cancelOperation: { comparisonId: 42, key: 'cancel-pending' } };
  let current = { comparison_id: 42, profile: 'comparison-v2', order_ids: [1], version: 1,
    terminal: false, executions: [], cancellation_status: 'NONE' };
  const { flow, api, apiV2, source } = setup({ withV2: true, distributed: true,
    saved: { 'lifecycle-test': prior, 'different-owner': { ...prior, id: 80 } },
    loadV2: vi.fn(async id => {
      if (id !== 42) throw new Error('Trabajo incorrecto');
      return current;
    }),
    progressV2: vi.fn(() => new Promise(() => {})),
  });
  apiV2.cancel = vi.fn(async (_, key) => {
    expect(key).toBe('cancel-pending');
    current = { ...current, version: 2, cancellation_status: 'REQUESTED' };
  });
  try {
    await vi.waitFor(() => expect(flow.getSnapshot().comparison?.comparison_id).toBe(42));
    expect(localStorage.getItem('lifecycle-test')).toBeNull();
    expect(JSON.parse(localStorage.getItem('lifecycle-test:v2'))).toMatchObject(prior);
    await flow.cancel();
    expect(flow.getSnapshot().comparison.cancellation_status).toBe('REQUESTED');
    expect(apiV2.start).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('different-owner')).id).toBe(80);
  } finally { flow.dispose(); }
  const restored = createComparisonController({ api, apiV2, source, storageKey: 'lifecycle-test' });
  restored.mount();
  try {
    await vi.waitFor(() => expect(restored.getSnapshot().comparison).toMatchObject({
      comparison_id: 42, cancellation_status: 'REQUESTED',
    }));
    expect(apiV2.cancel).toHaveBeenCalledTimes(1);
  } finally { restored.dispose(); }
});

test('acknowledged confirmation clears transient state and storage once, preserving only success and pending orders', async () => {
  const { flow, api, source } = setup();
  try {
    await flow.load(1);
    const pending = deferred(); api.confirm.mockReturnValue(pending.promise);
    const first = flow.confirm(); await flow.confirm();
    expect(flow.getSnapshot().busy).toBe(true);
    expect(api.confirm).toHaveBeenCalledTimes(1);
    pending.resolve(); await first;
    expect(flow.getSnapshot()).toMatchObject({ comparison: null, selected: [], results: {}, visuals: {}, live: {},
      cursor: 0, partial: false, history: false, busy: false, error: '', orders: [{ id_pedido: 99 }] });
    expect(flow.getSnapshot().success).toContain('Trabajo #1 confirmado');
    expect(localStorage.getItem('lifecycle-test')).toBeNull();
    expect(source.refresh).toHaveBeenLastCalledWith({ force: true });
    source.emit([{ id_pedido: 1 }, { id_pedido: 99 }]);
    expect(flow.getSnapshot().orders).toEqual([{ id_pedido: 99 }]);
  } finally { flow.dispose(); }
});

test.each([409, 500, 503, 0])('failed confirmation status %s retains the work and shows no success', async status => {
  const { flow, api } = setup();
  try {
    await flow.load(1);
    api.confirm.mockRejectedValue(Object.assign(new Error('No se confirmó el corte.'), { status }));
    await flow.confirm();
    expect(flow.getSnapshot().comparison.comparison_id).toBe(1);
    expect(flow.getSnapshot().results[2]).toBeDefined();
    expect(flow.getSnapshot().success).toBe('');
    expect(flow.getSnapshot().error).toBe('No se confirmó el corte.');
    expect(localStorage.getItem('lifecycle-test')).not.toBeNull();
  } finally { flow.dispose(); }
});

test('ambiguous confirmation recovers committed backend state by GET without posting another confirmation', async () => {
  const { flow, api, current } = setup();
  try {
    await flow.load(1);
    api.confirm.mockRejectedValue(Object.assign(new Error('Respuesta interrumpida'), { status: 0 }));
    await flow.confirm();
    current.confirmed = true; current.confirmable = false; current.selection_allowed = false;
    await flow.refresh();
    expect(api.confirm).toHaveBeenCalledTimes(1);
    expect(flow.getSnapshot().comparison).toBeNull();
    expect(flow.getSnapshot().success).toContain('Trabajo #1 confirmado');
  } finally { flow.dispose(); }
});

test('late visual replies cannot restore a work after confirmation', async () => {
  const { flow, api } = setup();
  try {
    const pending = deferred(); api.manifest.mockReturnValue(pending.promise);
    const loading = flow.load(1);
    await vi.waitFor(() => expect(api.manifest).toHaveBeenCalledTimes(3));
    await flow.confirm();
    pending.resolve(fixture.manifests[1]); await loading;
    expect(flow.getSnapshot().comparison).toBeNull();
    expect(flow.getSnapshot().visuals).toEqual({});
    expect(flow.getSnapshot().results).toEqual({});
  } finally { flow.dispose(); }
});

test('confirmed history is consultable explicitly and cannot be selected or confirmed again', async () => {
  const { flow, api } = setup({ confirmed: true });
  try {
    await flow.load(1);
    expect(flow.getSnapshot().history).toBe(true);
    expect(flow.getSnapshot().comparison.confirmed).toBe(true);
    expect(flow.getSnapshot().results[2]).toBeDefined();
    await flow.confirm(); await flow.choose(1); await flow.release();
    expect(api.confirm).not.toHaveBeenCalled();
    expect(api.choose).not.toHaveBeenCalled();
    expect(api.release).not.toHaveBeenCalled();
  } finally { flow.dispose(); }
});

test('release returns to pending without confirming and clearing the view does not delete history', async () => {
  const { flow, api, source, current } = setup();
  try {
    await flow.load(1);
    api.release.mockResolvedValue({ ...current, released: true, confirmable: false, selection_allowed: false });
    await flow.release();
    expect(api.confirm).not.toHaveBeenCalled();
    expect(flow.getSnapshot().comparison).toBeNull();
    expect(flow.getSnapshot().selected).toEqual([]);
    expect(flow.getSnapshot().success).toContain('liberado sin confirmar');
    expect(source.refresh).toHaveBeenLastCalledWith({ force: true });
    current.released = true; current.confirmable = false; current.selection_allowed = false;
    await flow.load(1);
    expect(flow.getSnapshot().comparison.released).toBe(true);
    expect(flow.getSnapshot().history).toBe(true);
    flow.reset();
    expect(flow.getSnapshot().comparison).toBeNull();
    expect(api.release).toHaveBeenCalledTimes(1);
  } finally { flow.dispose(); }
});

test('an automatically recovered confirmed work is cleared rather than restored as an active operation', async () => {
  const { flow, api, current } = setup({ confirmed: true });
  try {
    await flow.load(1, { automatic: true });
    expect(flow.getSnapshot().comparison).toBeNull();
    expect(flow.getSnapshot().success).toContain('Trabajo #1 confirmado');
    expect(api.confirm).not.toHaveBeenCalled();
    expect(current.confirmed).toBe(true);
  } finally { flow.dispose(); }
});
