import { useCallback, useEffect, useRef, useState } from 'react';
import { cursorStorage, followProgress, jobId, newRequestKey, readStored, writeStored } from './distributedProgress.js';
import { buildRunRequest } from './runContract.js';

const empty = { id: null, pending: false, posting: false, progress: null, reconnecting: false, partial: false, error: '' };

function savedAttempt(key) {
  const value = readStored(key);
  if (!value || !/^[A-Za-z0-9_-]{8,64}$/.test(value.key) || value.id !== null && !jobId(value.id)) return null;
  try { return { ...value, orders: buildRunRequest(value.orders).order_ids }; } catch { return null; }
}

export function useDurableRun({ storageKey, adapter, dispatch, onSessionExpired }) {
  const [state, setState] = useState(empty);
  const request = useRef(null);
  const attempt = useRef(null);
  const retryAdmissionAt = useRef(0);
  const patch = useCallback(value => setState(previous => ({ ...previous, ...value })), []);

  const report = useCallback((error, signal, id, definitive = false) => {
    if (signal.aborted || error.name === 'AbortError') return;
    if (error.status === 401) onSessionExpired?.();
    const missing = definitive && error.status === 404 && error.code === 'NOT_FOUND';
    if (missing && id && attempt.current?.id === id) {
      const saved = savedAttempt(storageKey);
      if (saved?.id === id && saved.key === attempt.current.key) writeStored(storageKey, null);
      cursorStorage(storageKey, id).set(null);
      attempt.current = null;
    }
    if (id && ([401, 403].includes(error.status) || missing)) {
      dispatch({ type: 'durable_inaccessible' });
      patch({ id: null, progress: null });
    }
    patch({ posting: false, reconnecting: false, error: error.message });
  }, [onSessionExpired, dispatch, patch, storageKey]);

  const watch = useCallback(async (id, signal) => {
    let missing;
    try {
      await followProgress({
        signal,
        cursor: cursorStorage(storageKey, id),
        read: async (after, activeSignal) => {
          try { return await adapter.progress(id, after, activeSignal); }
          catch (error) {
            if (error.status === 404) missing = error;
            throw error;
          }
        },
        apply: async page => {
          if (page.state === 'TERMINAL' && !page.has_more) {
            const result = await adapter.loadResult(id, { signal });
            if (result.id_optimizacion !== id || result.estado !== page.result_state || result.estado === 'EN_EJECUCION') {
              throw new Error('El resultado no corresponde al cierre de este trabajo.');
            }
            if (!signal.aborted) dispatch({ type: 'result', result });
          }
          if (!signal.aborted) patch({ progress: page, reconnecting: false, error: '' });
        },
        onReconnect: () => patch({ reconnecting: true }),
        onReset: () => patch({ partial: true, reconnecting: true }),
        onError: error => report(error, signal, id, error === missing),
      });
    } finally {
      if (request.current?.signal === signal) request.current = null;
    }
  }, [adapter, dispatch, patch, report, storageKey]);

  useEffect(() => {
    if (!storageKey) return undefined;
    const saved = savedAttempt(storageKey);
    attempt.current = saved;
    const frame = requestAnimationFrame(() => {
      if (!saved) return;
      if (saved.id) {
        const controller = new AbortController();
        request.current = controller;
        patch({ id: saved.id, reconnecting: true });
        watch(saved.id, controller.signal);
      } else patch({ pending: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      request.current?.abort();
      request.current = null;
      attempt.current = null;
    };
  }, [patch, storageKey, watch]);

  async function start(orderIds) {
    if (!storageKey || request.current || attempt.current?.id || Date.now() < retryAdmissionAt.current) return;
    const saved = attempt.current ?? savedAttempt(storageKey);
    if (saved?.id || !saved && !Array.isArray(orderIds)) return;
    const next = saved ?? { id: null, key: newRequestKey(), orders: buildRunRequest(orderIds).order_ids };
    if (!writeStored(storageKey, next)) {
      patch({ error: 'Habilita el almacenamiento local para guardar la solicitud antes de enviarla.' });
      return;
    }
    attempt.current = next;
    patch({ posting: true, pending: true, error: '' });
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    try {
      const accepted = await adapter.startDurable(next.orders, next.key, signal);
      if (signal.aborted) return;
      const id = accepted.id_optimizacion;
      attempt.current = { ...next, id };
      writeStored(storageKey, attempt.current);
      patch({ id, pending: false, posting: false, progress: { state: accepted.state }, reconnecting: false });
      dispatch({ type: 'durable_accepted', id });
      await watch(id, signal);
    } catch (error) {
      if (signal.aborted) return;
      if ([429, 503].includes(error.status)) retryAdmissionAt.current = Date.now() + (error.retryAfterMs ?? 1000);
      if (!saved && [400, 403, 422].includes(error.status)) {
        writeStored(storageKey, null);
        attempt.current = null;
        patch({ pending: false });
      }
      report(error, signal, next.id);
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  function recover() {
    const id = attempt.current?.id;
    if (!id || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    patch({ reconnecting: true, error: '' });
    (async () => {
      try {
        const status = await adapter.loadDurable(id, controller.signal);
        if (controller.signal.aborted) return;
        patch({ id, progress: { state: status.state } });
        await watch(id, controller.signal);
      } catch (error) { report(error, controller.signal, id, true); }
      finally { if (request.current === controller) request.current = null; }
    })();
  }

  function discard() {
    if (request.current || state.pending || state.id && state.progress?.state !== 'TERMINAL') return false;
    attempt.current = null;
    writeStored(storageKey, null);
    setState(empty);
    return true;
  }

  return { ...state, start, recover, discard };
}
