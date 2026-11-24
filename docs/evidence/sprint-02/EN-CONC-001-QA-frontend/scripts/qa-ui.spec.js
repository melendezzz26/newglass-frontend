// QA EN-CONC-001: capturas por modo, flujo completo y UI por rol.
// QA_MODE=historico  -> backend tests.e2e_server (Linux/WSL2) en 127.0.0.1:8017.
// QA_MODE=distribuido -> arnés qa_lab.py (piloto mixto API + worker) y ready.json en NEWGLASS_QA_LAB.
// El navegador usa VITE_API_URL=/ y cada contexto reenvía /api al backend de loopback.
import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const mode = process.env.QA_MODE ?? 'historico';
const lab = process.env.NEWGLASS_QA_LAB;
const distributed = mode === 'distribuido';
const cmp = '/api/optimization/comparisons-v2';
const labState = () => JSON.parse(readFileSync(join(lab, 'ready.json'), 'utf8'));
const mark = name => writeFileSync(join(lab, name), '');
// Usuarios sintéticos fijos de tests/e2e_server.py (base desechable local).
const historical = {
  A: { username: 'A70000003', password: 'Admin-test-2026!' },
  O: { username: 'O70000001', password: 'Orders-test-2026!' },
  L: { username: 'A70000002', password: 'Inventory-test-2026!' },
};
const apiBase = () => distributed ? labState().api : 'http://127.0.0.1:8017';
const actors = () => distributed ? labState().actors : historical;
const observations = [];
const note = (what, value) => observations.push({ mode, what, value });

async function connect(browser, project) {
  const { baseURL, viewport, isMobile, hasTouch } = project.use;
  const context = await browser.newContext({ baseURL, viewport, isMobile, hasTouch, serviceWorkers: 'block' });
  await context.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const target = new URL(url.pathname + url.search, apiBase());
    if (target.hostname !== '127.0.0.1') throw new Error('Solo backend de loopback');
    try { await route.fulfill({ response: await route.fetch({ url: target.href, maxRedirects: 0, timeout: 15_000 }) }); }
    catch { await route.abort('failed').catch(() => {}); }
  });
  return { context, page: await context.newPage() };
}

async function login(page, who) {
  await page.goto('/');
  await page.getByLabel('Usuario', { exact: true }).fill(who.username);
  await page.getByLabel('Contraseña', { exact: true }).fill(who.password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeVisible();
}

async function apiCall(page, path, options = {}) {
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('optimizador.auth')).access_token);
  return page.request.fetch(new URL(path, apiBase()).href, { ...options,
    headers: { Authorization: 'Bearer ' + token, ...options.headers } });
}

async function openOptimization(page) {
  await page.getByRole('button', { name: 'Optimización', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Optimización de corte', exact: true })).toBeVisible();
}

const shot = async (page, info, name, target) => {
  if (target) await target.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath(`${mode}-${info.project.name}-${name}.png`), animations: 'disabled' });
};

async function ensureOrders(page) {
  if (distributed) return labState().orders;
  const piece = { id_tipo_vidrio: 7, espesor_mm: 5.5, tipo_forma: 'RECTANGULO' };
  const ids = [];
  for (const piezas of [[{ ...piece, cantidad: 3, width_mm: 120, height_mm: 80 }, { ...piece, cantidad: 2, width_mm: 60, height_mm: 60 }],
    [{ ...piece, cantidad: 2, width_mm: 90, height_mm: 70 }]]) {
    const created = await apiCall(page, '/api/orders', { method: 'POST', data: { id_cliente: 41, piezas } });
    expect(created.status()).toBe(201);
    ids.push((await created.json()).id_pedido);
  }
  return [ids[0], ids[1], ids[0]];
}

const orderBox = (page, id) => page.getByRole('checkbox', { name: new RegExp('Pedido #' + id + '([^0-9]|$)') });

async function admitSix(page, order) {
  await page.getByLabel('Métodos').selectOption('comparison-v2');
  await orderBox(page, order).check();
  const post = page.waitForResponse(r => new URL(r.url()).pathname === cmp && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Comparar con los seis motores', exact: true }).click();
  const response = await post;
  expect(response.status()).toBe(201);
  return (await response.json()).comparison_id;
}

const finished = page => page.getByText(/6 de 6 métodos completaron todas las piezas/);

const flush = (info, name) => writeFileSync(info.outputPath(`observaciones-${mode}-${info.project.name}-${name}.json`),
  JSON.stringify(observations.splice(0), null, 2));

test('flujo completo: login, pedidos, seis motores, resultados, inspectores 2D/3D, recarga y liberación', async ({ browser }, info) => {
  test.setTimeout(240_000);
  const { context, page } = await connect(browser, info.project);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Ingresar', exact: true })).toBeVisible();
    await shot(page, info, '01-login');
    await login(page, actors().A);
    const orders = await ensureOrders(page);
    await page.getByRole('button', { name: 'Registro de pedidos', exact: true }).click();
    await page.waitForLoadState('networkidle');
    await shot(page, info, '02-pedidos');
    await openOptimization(page);
    await expect(orderBox(page, orders[0])).toBeVisible({ timeout: 15_000 });
    await shot(page, info, '03-optimizacion');
    note('selector inicial de métodos', await page.getByLabel('Métodos').inputValue());
    const id = await admitSix(page, orders[0]);
    await shot(page, info, '04-comparacion-en-curso');
    await expect(finished(page)).toBeVisible({ timeout: 120_000 });
    await shot(page, info, '05-comparacion-finalizada');
    const dto = await (await apiCall(page, `${cmp}/${id}`)).json();
    note('motores', dto.executions.map(e => `${e.method}:${e.complete ? 'completo' : e.status}`));
    await page.getByRole('tab', { name: /^Comparación/ }).click();
    const table = page.getByRole('table', { name: 'Métricas de 6 motores', exact: true });
    await expect(table).toBeVisible();
    await shot(page, info, '06-tabla-seis-motores', table);
    const tab = page.getByRole('tab', { name: /^FF/ });
    await tab.click();
    const panel = page.locator(`[id="${await tab.getAttribute('aria-controls')}"]`);
    const resultButton = panel.getByRole('button', { name: /Resultado/ });
    if (await resultButton.count()) await resultButton.first().click();
    const canvas = panel.getByRole('region', { name: 'Distribución de piezas', exact: true });
    await expect(canvas).toBeVisible();
    await shot(page, info, '07-resultado-ff-2d', canvas);
    await canvas.getByRole('list', { name: 'Colocaciones consultables' }).getByRole('button').first().click();
    const inspector = canvas.getByRole('complementary', { name: 'Inspector de pieza' });
    await expect(inspector).toBeVisible();
    await shot(page, info, '08-inspector-2d', inspector);
    await canvas.getByRole('button', { name: 'Ver en 3D', exact: true }).click();
    const scene = canvas.getByRole('region', { name: 'Vista 3D del resultado', exact: true });
    await expect(scene).toBeVisible();
    await shot(page, info, '09-inspector-3d', scene);
    const visual = await apiCall(page, `${cmp}/${id}/executions/${dto.executions[0].execution_id}/visual`);
    note('GET visual (máscaras en vivo)', visual.status());
    // Recarga: el trabajo se recupera sin crear otra admisión.
    let posts = 0;
    page.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname === cmp) posts++; });
    await page.reload();
    await openOptimization(page);
    await expect(page.getByText(new RegExp(`Trabajo #${id}`)).first()).toBeVisible({ timeout: 20_000 });
    await expect(finished(page)).toBeVisible({ timeout: 20_000 });
    await shot(page, info, '10-recuperado-tras-recarga');
    note('POST de admisión tras recarga', posts);
    await page.getByRole('button', { name: 'Liberar pedidos sin confirmar', exact: true }).click();
    await expect(page.getByText(new RegExp(`Trabajo #${id} liberado sin confirmar`))).toBeVisible();
    await shot(page, info, '11-pedidos-liberados');
    const order = await (await apiCall(page, `/api/orders/${orders[0]}`)).json();
    note('estado del pedido tras liberar', order.estado);
    expect(order.estado).toBe('PENDIENTE');
    note('errores de página', errors);
    expect(errors).toEqual([]);
  } finally { flush(info, 'flujo'); await context.close(); }
});

test('roles en optimización: Operario, Almacenero y Administrador', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'La matriz de roles se captura en escritorio');
  test.setTimeout(240_000);
  const sessions = {};
  for (const letter of ['A', 'O', 'L']) sessions[letter] = await connect(browser, info.project);
  const { A: admin, O: operator, L: warehouse } = sessions;
  try {
    for (const [letter, s] of Object.entries(sessions)) { await login(s.page, actors()[letter]); }
    const orders = await ensureOrders(admin.page);
    const buttons = async page => ({
      comparar6: await page.getByRole('button', { name: 'Comparar con los seis motores' }).count(),
      comparar3: await page.getByRole('button', { name: 'Comparar con los tres motores' }).count(),
      selectorMetodos: await page.getByLabel('Métodos').count(),
      verAnteriores: await page.getByRole('button', { name: 'Ver comparaciones anteriores' }).count(),
    });
    for (const [letter, s] of [['Almacenero', warehouse], ['Operario', operator], ['Administrador', admin]]) {
      await openOptimization(s.page);
      await s.page.waitForLoadState('networkidle');
      note(`UI ${letter}: controles visibles`, await buttons(s.page));
      await shot(s.page, info, `rol-${letter.toLowerCase()}-optimizacion`);
    }
    const denied = await apiCall(warehouse.page, cmp, { method: 'POST', headers: { 'Idempotency-Key': 'qa-warehouse-denied' },
      data: { order_ids: [orders[1]] } });
    note('API Almacenero POST comparisons-v2', denied.status());
    expect(denied.status()).toBe(403);
    if (!distributed) return;

    // Operario: iniciar (FF retenido por el worker), cancelar, reintentar y confirmar.
    const id = await admitSix(operator.page, orders[1]);
    await expect(operator.page.getByRole('tab', { name: /FF.*Motor actual/ })).toBeVisible({ timeout: 30_000 });
    await shot(operator.page, info, 'rol-operario-ejecucion');
    note('API Administrador GET comparación del Operario', (await apiCall(admin.page, `${cmp}/${id}`)).status());
    note('API Administrador GET progreso del Operario', (await apiCall(admin.page, `${cmp}/${id}/progress`)).status());
    note('API Almacenero GET comparación del Operario', (await apiCall(warehouse.page, `${cmp}/${id}`)).status());
    const foreignCancel = await apiCall(admin.page, `${cmp}/${id}/cancel`, { method: 'POST',
      headers: { 'Idempotency-Key': 'qa-foreign-cancel' }, data: { expected_version: 1 } });
    note('API Administrador POST cancelar comparación del Operario', foreignCancel.status());
    // Administrador: su trabajo queda en espera detrás del Operario y lo cancela sin afectar el cálculo ajeno.
    const waitingId = await admitSix(admin.page, orders[0]);
    await expect(admin.page.getByText('El trabajo está guardado. Comenzará cuando haya una plaza de cálculo disponible.')).toBeVisible();
    note('cola al admitir el segundo trabajo', (await (await apiCall(admin.page, `${cmp}/${waitingId}/queue`)).json()).state);
    await shot(admin.page, info, 'cola-admin-en-espera');
    await admin.page.getByRole('button', { name: 'Cancelar optimización', exact: true }).click();
    await admin.page.getByRole('alertdialog').getByRole('button', { name: 'Solicitar cancelación' }).click();
    await expect(admin.page.getByText(/Cancelación confirmada/).first()).toBeVisible({ timeout: 30_000 });
    await shot(admin.page, info, 'cola-admin-cancelado-en-espera');
    note('estado del Operario tras cancelar el trabajo en espera del Administrador',
      (await (await apiCall(operator.page, `${cmp}/${id}/queue`)).json()).state);
    note('pedido del Administrador tras cancelar en espera', (await (await apiCall(admin.page, `/api/orders/${orders[0]}`)).json()).estado);
    await operator.page.getByRole('button', { name: 'Cancelar optimización', exact: true }).click();
    await operator.page.getByRole('alertdialog').getByRole('button', { name: 'Solicitar cancelación' }).click();
    await expect(operator.page.getByText(/Cancelación confirmada. Se verificó el cierre/)).toBeVisible({ timeout: 30_000 });
    await shot(operator.page, info, 'rol-operario-cancelado');
    mark('resume');
    await operator.page.getByRole('button', { name: 'Preparar otro trabajo' }).click();
    const second = await admitSix(operator.page, orders[1]);
    await expect(finished(operator.page)).toBeVisible({ timeout: 120_000 });
    await operator.page.getByRole('tab', { name: /^Comparación/ }).click();
    await operator.page.getByRole('radio', { name: 'Elegir First Fit', exact: true }).check();
    await operator.page.getByRole('button', { name: 'Confirmar distribución elegida' }).click();
    const dialog = operator.page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await shot(operator.page, info, 'rol-operario-confirmar-dialogo');
    await dialog.getByRole('button', { name: 'Confirmar corte', exact: true }).click();
    await expect(operator.page.getByText(/Corte confirmado/).first()).toBeVisible({ timeout: 30_000 });
    await shot(operator.page, info, 'rol-operario-confirmado');
    note('comparación confirmada por Operario', second);
  } finally {
    flush(info, 'roles');
    await Promise.all(Object.values(sessions).map(s => s.context.close()));
  }
});
