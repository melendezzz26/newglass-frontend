import { expect, test } from '@playwright/test';
import fixture from '../../docs/contracts/optimization/comparison-v2.json' with { type: 'json' };
import original from '../../docs/contracts/optimization/comparison-v1.json' with { type: 'json' };

const root = '/api/optimization/comparisons-v2';
const started = structuredClone(fixture.completed);
started.requested_pieces = structuredClone(original.completed.requested_pieces).map(piece => ({ ...piece, cantidad: 2 }));
Object.assign(started, { status: 'EN_EJECUCION', terminal: false, supervisor_stopped: false, selection_allowed: false });
for (const engine of started.executions) Object.assign(engine, {
  status: 'EN_EJECUCION', dispatch_state: 'QUEUED', outcome: null, result_available: false,
  complete: false, eligible: false, placed_units: 0, metrics: null, computation_time_ms: null, diagnostic: null,
});

test('progreso simulado: límite de lectura, cursor vencido, recuperación bloqueada y sesión vencida', async ({ page }, info) => {
  const user = { id_usuario: 200, username: 'O00000200', nombre: 'QA', rol: 'Operario',
    permisos: ['optimization.view', 'optimization.execute'] };
  await page.addInitScript(acting => {
    if (!sessionStorage.getItem('optimizador.auth')) sessionStorage.setItem('optimizador.auth',
      JSON.stringify({ access_token: 'e2e-pure-mock', token_type: 'bearer', usuario: acting }));
  }, user);
  const requests = [], posts = [];
  let give401 = false;
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const { pathname } = url;
    if (pathname === '/api/auth/me') return route.fulfill({ json: user });
    if (pathname === '/api/orders') return route.fulfill({ json: { items: [{ id_pedido: 1, cliente: 'QA simulado' }], total_pages: 1 } });
    if (pathname === root && request.method() === 'POST') {
      posts.push(request.headers()['idempotency-key']);
      return route.fulfill({ status: 201, json: started });
    }
    if (pathname === root + '/43') return route.fulfill({ json: started });
    if (pathname === root + '/43/progress') {
      requests.push({ at: Date.now(), after: url.searchParams.get('after_sequence') });
      const error = (status, code, retry) => route.fulfill({ status, headers: retry ? { 'Retry-After': retry } : {},
        json: { detail: { code, message: code } } });
      if (give401) return error(401, 'SESSION_EXPIRED');
      if (requests.length === 2) return error(429, 'PROGRESS_BUSY', '2');
      if (requests.length === 3) return error(503, 'RESOURCE_UNAVAILABLE', '1');
      if (requests.length === 4) return error(409, 'EVENT_CURSOR_EXPIRED');
      const blocked = requests.length >= 5;
      const sequence = blocked ? 8 : 1;
      const events = url.searchParams.has('after_sequence') ? [] : [
        { sequence, kind: blocked ? 'RECOVERY_BLOCKED' : 'WAITING', occurred_at: '2026-11-21T09:00:00Z',
          execution_id: null, method: null, reason: null },
      ];
      return route.fulfill({ json: { job_id: 43, profile: 'V2', state: blocked ? 'RECOVERY_BLOCKED' : 'WAITING',
        version: started.version, cancellation: 'NONE', result_state: 'EN_EJECUCION', result_url: pathname.replace('/progress', ''),
        current_engine: null, next_sequence: sequence, has_more: false, events, poll_after_ms: 1000 } });
    }
    return route.fulfill({ status: 404, json: { detail: { code: 'NOT_FOUND' } } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Optimización', exact: true }).click();
  await page.getByRole('checkbox', { name: /Pedido #1/ }).check({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Comparar con los seis motores' }).click();
  await expect(page.getByText('El trabajo está guardado. Comenzará cuando haya una plaza de cálculo disponible.')).toBeVisible();
  await expect(page.getByText('Reconectando al progreso guardado…')).toBeVisible();
  await expect(page.getByText('Recuperación bloqueada', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Parte del avance anterior ya no estaba retenido/)).toBeVisible();
  expect(requests.slice(0, 5).map(call => call.after)).toEqual([null, '1', '1', '1', null]);
  expect(requests[2].at - requests[1].at).toBeGreaterThanOrEqual(1900);
  expect(requests[3].at - requests[2].at).toBeGreaterThanOrEqual(900);
  expect(posts).toHaveLength(1);
  await page.screenshot({ path: info.outputPath('mock-recuperacion-bloqueada.png'), animations: 'disabled' });
  give401 = true;
  await expect(page.getByRole('button', { name: 'Ingresar', exact: true })).toBeVisible();
  expect(posts).toHaveLength(1);
});
