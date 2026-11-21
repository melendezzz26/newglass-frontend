import { METHODS_V2 } from './comparisonV2Contract.js';
import { RunContractError } from './runContract.js';

const states = ['WAITING', 'RUNNING', 'RECOVERY_BLOCKED', 'TERMINAL'];
const results = ['EN_EJECUCION', 'COMPLETADA', 'SIN_SOLUCION', 'FALLIDA'];
const cancellations = ['NONE', 'REQUESTED', 'CANCELLED', 'COMPLETED_BEFORE_CANCEL'];
const eventKinds = [...states, 'CANCELLATION_REQUESTED', 'ENGINE_STARTED', 'ENGINE_FINISHED'];
const reasons = ['COMPLETED', 'NO_FIT', 'EXPANSION_LIMIT', 'GEOMETRY_PROBE_LIMIT', 'STATE_MEMORY_LIMIT',
  'TIME_LIMIT', 'GLOBAL_TIME_LIMIT', 'TIME_BUDGET_EXCEEDED', 'MEMORY_BUDGET_EXCEEDED', 'EXECUTION_FAILED',
  'RESULT_SAVE_FAILED', 'WORKER_STOPPED', 'PROCESS_START_FAILED', 'CANCELLED'];
const fields = ['job_id', 'profile', 'state', 'version', 'cancellation', 'result_state', 'result_url',
  'current_engine', 'events', 'next_sequence', 'has_more', 'poll_after_ms'];

const check = value => { if (!value) throw new RunContractError(); };
const count = value => Number.isSafeInteger(value) && value >= 0;
export const jobId = value => count(value) && value > 0 && value <= 2147483647;
const exact = (data, keys) => data && typeof data === 'object' && !Array.isArray(data)
  && Object.keys(data).length === keys.length && keys.every(key => Object.hasOwn(data, key));
const method = (value, profile) => profile === 'FF' ? value === 'FF' : METHODS_V2.includes(value);
const resultPath = (profile, id) => '/api/optimization/' + (profile === 'FF' ? 'runs/' : 'comparisons-v2/') + id;

export function progressQuery(after, limit = 16) {
  check(after === null || count(after));
  check(Number.isInteger(limit) && limit >= 1 && limit <= 32);
  const query = new URLSearchParams({ limit });
  if (after !== null) query.set('after_sequence', after);
  return query;
}

export function parseProgress(data, { profile, id, after = null, limit = 16 }) {
  check(exact(data, fields) && jobId(id) && ['FF', 'V2'].includes(profile) && data.profile === profile && data.job_id === id
    && states.includes(data.state) && results.includes(data.result_state) && cancellations.includes(data.cancellation)
    && data.result_url === resultPath(profile, id) && count(data.version) && count(data.next_sequence)
    && typeof data.has_more === 'boolean' && data.poll_after_ms === 1000
    && Array.isArray(data.events) && data.events.length <= limit
    && (!data.has_more || data.events.length === limit));
  const engine = data.current_engine;
  check(engine === null || (exact(engine, ['execution_id', 'method'])
    && jobId(engine.execution_id) && method(engine.method, profile)));
  let previous = after ?? ((data.events[0]?.sequence ?? 1) - 1);
  for (const event of data.events) {
    check(exact(event, ['sequence', 'kind', 'occurred_at', 'execution_id', 'method', 'reason'])
      && count(event.sequence) && event.sequence > 0 && event.sequence === previous + 1
      && eventKinds.includes(event.kind) && typeof event.occurred_at === 'string'
      && /^\d{4}-\d\d-\d\dT/.test(event.occurred_at) && Number.isFinite(Date.parse(event.occurred_at)));
    if (event.kind === 'ENGINE_STARTED' || event.kind === 'ENGINE_FINISHED') {
      check(jobId(event.execution_id) && method(event.method, profile)
        && (event.kind === 'ENGINE_FINISHED' ? reasons.includes(event.reason) : event.reason === null));
    } else check(event.execution_id === null && event.method === null && event.reason === null);
    previous = event.sequence;
  }
  if (after !== null || data.events.length) check(data.next_sequence === previous);
  return data;
}

export function parseDurableRun(data, id = data?.id_optimizacion) {
  check(exact(data, ['id_optimizacion', 'state', 'result_url']) && jobId(id) && data.id_optimizacion === id
    && states.includes(data.state) && data.result_url === (data.state === 'TERMINAL' ? resultPath('FF', id) : null));
  return data;
}

export function retryAfterMs(response) {
  const header = response.headers?.get?.('retry-after')?.trim();
  if (!header) return null;
  if (/^\d+$/.test(header)) {
    const delay = Number(header) * 1000;
    return Number.isSafeInteger(delay) ? delay : null;
  }
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

export function readStored(key) {
  try { return key ? JSON.parse(localStorage.getItem(key)) : null; } catch { return null; }
}

export function writeStored(key, value) {
  if (!key) return false;
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch { return false; }
}

export function ownerStorageKey(user, type) {
  const value = user?.id_usuario ?? user?.user_id ?? user?.usuario;
  return value ? 'newglass:' + type + ':' + encodeURIComponent(value) : null;
}

export function cursorStorage(key, id) {
  const cursorKey = key ? key + ':progress:' + id : null;
  return {
    get() { const value = readStored(cursorKey); return count(value) ? value : null; },
    set(value) { writeStored(cursorKey, value); },
  };
}

export const newRequestKey = () => globalThis.crypto?.randomUUID?.() ?? 'opt-' + Date.now() + '-' + Math.random().toString(36).slice(2);

export function transientProgressError(error) {
  return [0, 429, 502, 503, 504].includes(error.status);
}

function pause(ms, signal) {
  if (signal.aborted || ms === 0) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, Math.min(ms, 2147483647));
    signal.addEventListener('abort', done, { once: true });
  });
}

export async function followProgress({ read, apply, cursor, signal, onReconnect, onReset, onError, wait = pause }) {
  let after = cursor.get(), delay = 1000;
  while (!signal.aborted) {
    try {
      const page = await read(after, signal);
      if (signal.aborted) return;
      await apply(page);
      if (signal.aborted) return;
      after = page.next_sequence;
      cursor.set(after);
      if (page.state === 'TERMINAL' && !page.has_more) return;
      delay = page.poll_after_ms;
      if (!page.has_more) await wait(delay, signal);
    } catch (error) {
      if (signal.aborted || error.name === 'AbortError') return;
      if (after !== null && error.status === 409 && error.code === 'EVENT_CURSOR_EXPIRED') {
        after = null;
        cursor.set(null);
        onReset?.();
        continue;
      }
      if (!transientProgressError(error)) { onError?.(error); return; }
      onReconnect?.();
      await wait(Math.max(delay, error.retryAfterMs ?? 0), signal);
    }
  }
}

export function progressLabel(progress) {
  if (!progress) return null;
  if (progress.state === 'RECOVERY_BLOCKED') return 'Recuperación bloqueada';
  if (progress.cancellation === 'CANCELLED') return 'Optimización cancelada';
  if (progress.cancellation === 'REQUESTED') return 'Cancelación solicitada';
  if (progress.state === 'WAITING') return 'En espera';
  if (progress.state === 'RUNNING') return 'Ejecutando';
  if (progress.result_state === 'SIN_SOLUCION') return 'Sin solución';
  if (progress.result_state === 'FALLIDA') return 'Error de optimización';
  return 'Comparación terminada';
}
