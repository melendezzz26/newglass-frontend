import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { login, open } from '../e2e/optimizationRealSupport.js';

const lab = process.env.NEWGLASS_BROWSER_LAB;
const state = () => JSON.parse(readFileSync(join(lab, 'ready.json'), 'utf8'));
const mark = name => writeFileSync(join(lab, name), '');
const cmp = '/api/optimization/comparisons-v2', ff = '/api/optimization/runs/durable';
const stock = '/api/inventory/planchas';
const waiting = page => page.getByText('El trabajo está guardado. Comenzará cuando haya una plaza de cálculo disponible.');
const running = page => page.getByRole('tab', { name: /FF.*Motor actual/ });

async function connect(browser, actor, api) {
  const context = await browser.newContext();
  const page = await context.newPage(), posts = [], reads = [];
  let loseFF = false;
  const address = path => {
    const target = new URL(path, state()[api]);
    if (target.hostname !== '127.0.0.1' || target.protocol !== 'http:') throw new Error('Laboratorio local obligatorio');
    return target;
  };
  await context.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const target = address(url.pathname + url.search);
    if (request.method() === 'POST' && [cmp, ff].includes(url.pathname)) {
      posts.push({ path: url.pathname, key: request.headers()['idempotency-key'] });
    }
    if (url.pathname.endsWith('/progress')) reads.push({ port: target.port, cursor: url.searchParams.get('after_sequence') });
    try {
      const response = await route.fetch({ url: target.href, maxRedirects: 0, timeout: 8000 });
      if (loseFF && url.pathname === ff && request.method() === 'POST' && response.status() === 202) {
        loseFF = false;
        await route.abort('failed');
      } else await route.fulfill({ response });
    } catch { await route.abort('failed').catch(() => {}); }
  });
  await login(page, state().actors[actor], { comparative: true });
  return { context, page, posts, reads, switchApi: value => { api = value; }, loseFF: () => { loseFF = true; },
    async request(path, options) {
      const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('optimizador.auth')).access_token);
      return context.request.fetch(address(path).href, { ...options, headers: { Authorization: 'Bearer ' + token, ...options?.headers } });
    } };
}

async function admit(session, order) {
  const { page } = session;
  await page.getByRole('checkbox', { name: new RegExp('Pedido #' + order + '([^0-9]|$)') }).check();
  const next = page.waitForResponse(r => new URL(r.url()).pathname === cmp && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Comparar con los seis motores' }).click();
  const response = await next;
  expect(response.status()).toBe(201);
  return (await response.json()).comparison_id;
}

async function progress(session, id) {
  const response = await session.request(cmp + '/' + id + '/progress');
  expect(response.status()).toBe(200);
  return (await response.json()).state;
}

async function warehouse(session, capture) {
  const { page } = session;
  await page.getByRole('button', { name: 'Gestión de inventario', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar plancha', exact: true }).click();
  await page.getByLabel(/Tipo de vidrio/).selectOption('7');
  await page.getByLabel(/Espesor/).selectOption('6');
  await page.getByLabel(/Ancho/).fill('700');
  await page.getByLabel(/Alto/).fill('500');
  await page.getByLabel(/Cantidad/).fill('2');
  const create = page.waitForResponse(r => new URL(r.url()).pathname === stock && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Registrar plancha', exact: true }).click();
  const created = await create;
  expect(created.status()).toBe(201);
  const id = (await created.json()).id_plancha;
  const history = page.getByRole('button', { name: 'Ver historial de plancha #' + id, exact: true });
  await page.getByRole('row').filter({ has: history }).getByRole('button', { name: 'Editar', exact: true }).click();
  await page.getByLabel(/Cantidad/).fill('3');
  const update = page.waitForResponse(r => new URL(r.url()).pathname === stock + '/' + id && r.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  expect((await update).status()).toBe(200);
  await history.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await capture(page, 'almacen-movimientos');
  await page.getByRole('button', { name: 'Cerrar diálogo' }).click();
  return id;
}

test('tres roles, cola V2, cancelación EN-UX-004, reconexión y FF durable reales', async ({ browser }, info) => {
  test.skip(!lab, 'Requiere PostgreSQL desechable y workers WSL2');
  const { capacity, orders, original_stock: original, legacy_order: legacyOrder } = state();
  const sessions = await Promise.all([connect(browser, 'A', 'api_a'), connect(browser, 'O', 'api_b'),
    connect(browser, 'L', 'api_b'), connect(browser, 'A', 'api_b')]);
  const [a, b, l, c] = sessions;
  const capture = (page, name) => page.screenshot({ path: info.outputPath(name + '.png'), animations: 'disabled' });
  try {
    await Promise.all([open(a.page), open(b.page), open(c.page)]);
    const idA = await admit(a, orders[0]);
    // Capacity two instruments real FF calls with both inputs present.
    if (capacity === 1) await expect(running(a.page)).toBeVisible();
    const idB = await admit(b, orders[1]);
    await expect(running(a.page)).toBeVisible();
    await expect(capacity === 1 ? waiting(b.page) : running(b.page)).toBeVisible();
    const idC = await admit(c, orders[2]);
    await expect(waiting(c.page)).toBeVisible();
    await capture(c.page, 'v2-en-espera');
    await capture(a.page, 'v2-motor-activo');

    const [spare] = await Promise.all([warehouse(l, capture), progress(a, idA), progress(b, idB)]);
    expect((await l.request(stock + '/' + original, { method: 'PATCH', data: { cantidad: 0 } })).status()).toBe(409);
    expect((await l.request(cmp, { method: 'POST', headers: { 'Idempotency-Key': 'lab-warehouse-denied' },
      data: { order_ids: [orders[2]] } })).status()).toBe(403);
    expect((await l.request(cmp + '/' + idA + '/confirm', { method: 'POST', headers: { 'Idempotency-Key': 'lab-confirm-denied' },
      data: { execution_id: 1, expected_version: 1 } })).status()).toBe(403);
    expect((await b.request(cmp + '/' + idA + '/progress')).status()).toBe(404);
    await open(l.page);
    await expect(l.page.getByRole('button', { name: 'Comparar con los seis motores' })).toHaveCount(0);
    expect((await a.request('/api/optimization/comparisons', { method: 'POST', headers: { 'Idempotency-Key': 'lab-v1-busy' },
      data: { order_ids: [legacyOrder] } })).status()).toBe(503);

    const oldApi = state().api_a;
    mark('restart_a');
    await expect.poll(() => state().api_a).not.toBe(oldApi);
    a.switchApi('api_b');
    b.switchApi('api_a');
    await a.page.reload();
    await open(a.page);
    await expect(running(a.page)).toBeVisible();
    await expect.poll(() => b.reads.some(r => r.port === new URL(state().api_a).port && r.cursor !== null)).toBe(true);
    await a.page.getByRole('button', { name: 'Cancelar optimización', exact: true }).click();
    await a.page.getByRole('alertdialog').getByRole('button', { name: 'Solicitar cancelación' }).click();
    await expect(a.page.getByText(/Cancelación confirmada. Se verificó el cierre/)).toBeVisible();
    await capture(a.page, 'v2-cancelado');
    await expect.poll(() => progress(b, idB)).toBe('RUNNING');
    if (capacity === 2) await expect.poll(() => progress(c, idC)).not.toBe('WAITING');
    else expect(await progress(c, idC)).toBe('WAITING');
    mark('resume_b');

    const complete = async (session, id) => {
      await expect(session.page.getByText(/6 de 6 métodos completaron todas las piezas/)).toBeVisible({ timeout: 45_000 });
      const response = await session.request(cmp + '/' + id);
      expect(response.status()).toBe(200);
      const dto = await response.json();
      expect(dto.executions.map(item => item.method)).toEqual(['FF', 'BF', 'WF', 'HF', 'M5', 'M6-BS']);
      expect(dto.executions.every(item => item.complete)).toBe(true);
      return dto;
    };
    const [dto] = await Promise.all([complete(b, idB), complete(c, idC)]);
    expect((await b.request(cmp + '/' + idB + '/executions/' + dto.executions[0].execution_id + '/visual')).status()).toBe(410);
    await b.page.getByRole('tab', { name: /^FF/ }).click();
    await expect(b.page.getByRole('region', { name: 'Distribución de piezas', exact: true })).toBeVisible();
    await capture(b.page, 'v2-resultado-ff');
    expect(sessions.map(s => s.posts.filter(p => p.path === cmp).length)).toEqual([1, 1, 0, 1]);

    mark('resume_a');
    await a.page.getByRole('button', { name: 'FF individual', exact: true }).click();
    await a.page.getByRole('checkbox', { name: new RegExp('^#' + orders[0] + ' ·') }).check();
    await a.page.getByRole('button', { name: 'Revisar vidrios y piezas' }).click();
    a.loseFF();
    await a.page.getByRole('button', { name: 'Calcular distribución' }).click();
    await expect(a.page.getByText(/No se pudo conectar/)).toBeVisible();
    await a.page.reload();
    await open(a.page);
    await a.page.getByRole('button', { name: 'FF individual', exact: true }).click();
    await a.page.getByRole('button', { name: 'Recuperar solicitud FF' }).click();
    await expect(a.page.getByText('Optimización terminada', { exact: true })).toBeVisible({ timeout: 45_000 });
    await capture(a.page, 'ff-durable-recuperado');
    const keys = a.posts.filter(p => p.path === ff).map(p => p.key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(keys[1]).toBe(keys[0]);
    await a.page.getByRole('button', { name: 'Comparación de motores', exact: true }).click();
    await a.page.getByRole('button', { name: 'Preparar otro trabajo' }).click();
    await a.page.getByLabel('Métodos').selectOption('comparison-v1');
    await a.page.getByRole('checkbox', { name: new RegExp('Pedido #' + legacyOrder + '([^0-9]|$)') }).check();
    const legacyPost = a.page.waitForResponse(r => new URL(r.url()).pathname === '/api/optimization/comparisons'
      && r.request().method() === 'POST');
    await a.page.getByRole('button', { name: 'Comparar con los tres motores' }).click();
    expect((await legacyPost).status()).toBe(201);
    await expect(a.page.getByText('Comparación finalizada', { exact: true })).toBeVisible({ timeout: 45_000 });
    const sheets = await (await l.request(stock)).json();
    expect(sheets.find(sheet => sheet.id_plancha === original).cantidad).toBe(4);
    expect(sheets.find(sheet => sheet.id_plancha === spare).cantidad).toBe(3);
    expect(await (await l.request(stock + '/' + original + '/movimientos')).json()).toEqual([]);
    mark('finish');
  } finally {
    await Promise.all(sessions.map(s => s.context.close()));
  }
});
