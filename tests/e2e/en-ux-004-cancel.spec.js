import { test, expect } from '@playwright/test';
import { api, setup, login, open, stock, orderStates, capture, save } from './optimizationRealSupport.js';
import { parseComparisonV2, parseCancellationV2 } from '../../src/features/optimization/comparisonV2Contract.js';

// Real FastAPI + PostgreSQL on 127.0.0.1, with a real supervised child
// waiting at a test-only checkpoint. No intercepted HTTP cancellation response.
async function ensureScenarioClosed(page, comparisonId, headers) {
  const endpoint = `${api}/api/optimization/comparisons-v2/${comparisonId}`;
  const cleanupKey = `enux004-e2e-cleanup-${comparisonId}`;
  // Public cancellation with the same owner and optimistic version, never a
  // backdoor that fabricates a stopped worker or releases a global lease.
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await page.request.get(endpoint, { headers });
    expect(response.status()).toBe(200);
    const current = parseComparisonV2(await response.json());
    if (current.terminal) {
      expect(current.supervisor_stopped).toBe(true);
      return;
    }
    if ((current.cancellation_status ?? 'NONE') === 'NONE') {
      const cancel = await page.request.post(endpoint + '/cancel', {
        headers: { ...headers, 'Idempotency-Key': cleanupKey },
        data: { expected_version: current.version },
      });
      if (cancel.status() === 409) continue;
      expect([200, 202]).toContain(cancel.status());
    }
    await page.waitForTimeout(200);
  }
  await expect.poll(async () => {
    const response = await page.request.get(endpoint, { headers });
    if (response.status() !== 200) return false;
    const current = parseComparisonV2(await response.json());
    return current.terminal && current.supervisor_stopped;
  }, { timeout: 15_000 }).toBe(true);
}
test('EN-UX-004: confirmación operario, parada real, pedidos e histórico durables', async ({ page }, info) => {
  test.setTimeout(110_000);
  const data = await setup(page, 'single');
  const before = await stock(page, data);
  const controlled = await page.request.post(`${api}/__e2e__/comparison-worker/blocked`);
  expect(controlled.status()).toBe(200);
  expect((await controlled.json()).worker_mode).toBe('blocked');
  let comparisonId, primaryError;
  try {
    await login(page, data.actors.all, { comparative: true });
    await open(page);
    await page.getByRole('checkbox', { name: new RegExp(`Pedido #${data.orders[0]}\\b`) }).check();
    await page.getByLabel('Métodos').selectOption('comparison-v2');
    const acceptedResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/api/optimization/comparisons-v2'
      && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Comparar con los seis motores' }).click();
    const accepted = parseComparisonV2(await (await acceptedResponse).json());
    comparisonId = accepted.comparison_id;
    const endpoint = `${api}/api/optimization/comparisons-v2/${comparisonId}`;
    // Exercise cancellation with an actually spawned worker, not merely a
    // queued intent that never reached the process supervisor.
    await expect.poll(async () => {
      const response = await page.request.get(endpoint, { headers: data.headers });
      expect(response.status()).toBe(200);
      const current = parseComparisonV2(await response.json());
      return current.executions[0].dispatch_state === 'RUNNING';
    }, { timeout: 15_000 }).toBe(true);
    await expect(page.getByRole('button', { name: 'Cancelar optimización' })).toBeEnabled();
    await page.getByRole('button', { name: 'Cancelar optimización' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText(`trabajo #${comparisonId}`);
    await expect(dialog).toContainText('ningún proceso sigue ejecutándose');
    await capture(page, info, 'confirmacion-cancelacion', dialog);
    const attempts=[];
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname ===
        `/api/optimization/comparisons-v2/${comparisonId}/cancel`) {
        attempts.push(request.headers()['idempotency-key']);
      }
    });
    const cancelResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname === `/api/optimization/comparisons-v2/${comparisonId}/cancel`
      && response.request().method() === 'POST' && [200, 202].includes(response.status()));
    await dialog.getByRole('button', { name: 'Solicitar cancelación' }).click();
    const acknowledged = await cancelResponse;
    expect([200, 202]).toContain(acknowledged.status());
    const requestStatus = parseCancellationV2(await acknowledged.json(), comparisonId);
    expect(['REQUESTED', 'CANCELLED']).toContain(requestStatus.cancel_state);
    if (requestStatus.cancel_state === 'REQUESTED') {
      expect(requestStatus.terminal).toBe(false);
    }
    // A stale optimistic version may yield 409 followed by a safe retry.
    // Every attempt must reuse the same operation identity.
    expect(attempts.length).toBeGreaterThanOrEqual(1);
    expect(attempts.length).toBeLessThanOrEqual(3);
    expect(new Set(attempts).size).toBe(1);
    let current;
    await expect.poll(async () => {
      const read = await page.request.get(endpoint, { headers: data.headers });
      expect(read.status()).toBe(200);
      current = parseComparisonV2(await read.json());
      return current.cancellation_status;
    }, { timeout: 45_000 }).toBe('CANCELLED');
    expect(current.terminal && current.supervisor_stopped).toBe(true);
    expect(current.selection_allowed && current.confirmable).toBe(false);
    expect(current.executions.some(e => e.diagnostic?.termination_reason === 'CANCELLED')).toBe(true);
    await expect(page.getByText(/Cancelación confirmada. Se verificó el cierre de procesos/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar optimización' })).toHaveCount(0);
    expect(await stock(page, data)).toEqual(before);
    expect(await orderStates(page, data)).toEqual(['PENDIENTE']);
    await capture(page, info, 'cancelacion-confirmada');
    await page.reload(); await open(page);
    await expect(page.getByText(/Cancelación confirmada. Se verificó el cierre de procesos/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar optimización' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Preparar otro trabajo' })).toBeVisible();
    expect(await stock(page, data)).toEqual(before);
    save(info, 'cancelacion-verificada.json', {
      comparison_id: comparisonId, status: current.cancellation_status,
      terminal: current.terminal, supervisor_stopped: current.supervisor_stopped,
      executions: current.executions.map(e => ({
        method: e.method, dispatch_state: e.dispatch_state,
        termination_reason: e.diagnostic?.termination_reason,
      })),
    });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      if (comparisonId) await ensureScenarioClosed(page, comparisonId, data.headers);
      // Only restore the productive worker factory after all actual processes
      // have stopped. A failed test must not poison the other 148 scenarios.
      const reset = await page.request.post(`${api}/__e2e__/comparison-worker/normal`);
      expect(reset.status(), await reset.text()).toBe(200);
    } catch (cleanupError) {
      if (!primaryError) throw cleanupError;
      info.annotations.push({ type: 'cleanup-failure',
        description: `Original error preserved; safe cleanup failed: ${cleanupError.message}` });
    }
  }
});
