import { test, expect } from '@playwright/test';
import { api, setup, login, open, stock, orderStates, capture, save } from './optimizationRealSupport.js';
import { parseComparisonV2, parseCancellationV2 } from '../../src/features/optimization/comparisonV2Contract.js';

// Real FastAPI + PostgreSQL on 127.0.0.1, with a real supervised child
// waiting at a test-only checkpoint. No intercepted HTTP cancellation response.
test('EN-UX-004: confirmación operario, parada real, pedidos e histórico durables', async ({ page }, info) => {
  test.setTimeout(90_000);
  const data = await setup(page, 'single');
  const before = await stock(page, data);
  const controlled = await page.request.post(`${api}/__e2e__/comparison-worker/blocked`);
  expect(controlled.status()).toBe(200);
  expect((await controlled.json()).worker_mode).toBe('blocked');
  let comparisonId;
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
    await expect(page.getByRole('button', { name: 'Cancelar optimización' })).toBeEnabled();
    await page.getByRole('button', { name: 'Cancelar optimización' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText(`trabajo #${comparisonId}`);
    await expect(dialog).toContainText('ningún proceso sigue ejecutándose');
    await capture(page, info, 'confirmacion-cancelacion', dialog);
    let posts=0;
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname ===
        `/api/optimization/comparisons-v2/${comparisonId}/cancel`) posts++;
    });
    const cancelResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname === `/api/optimization/comparisons-v2/${comparisonId}/cancel`
      && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Solicitar cancelación' }).click();
    const acknowledged = await cancelResponse;
    expect([200, 202]).toContain(acknowledged.status());
    const requestStatus = parseCancellationV2(await acknowledged.json(), comparisonId);
    expect(['REQUESTED', 'CANCELLED']).toContain(requestStatus.cancel_state);
    if (requestStatus.cancel_state === 'REQUESTED') {
      expect(requestStatus.terminal).toBe(false);
    }
    expect(posts).toBe(1);
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
  } finally {
    // Restore ordinary real engines for every subsequent browser test.
    const reset = await page.request.post(`${api}/__e2e__/comparison-worker/normal`);
    expect(reset.status()).toBe(200);
  }
});
