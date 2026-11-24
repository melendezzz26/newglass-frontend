import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { useDurableRun } from '../useDurableRun';

const key = 'newglass:ff-durable:42';
const saved = { id: 31, key: 'original-ff-key', orders: [1] };
const error = (status, code) => Object.assign(new Error('Consulta FF ' + status), { status, code });
const pending = () => new Promise(() => {});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(key, JSON.stringify(saved));
  localStorage.setItem(key + ':progress:31', '5');
  localStorage.setItem('newglass:ff-durable:99', JSON.stringify(saved));
});

test('a definitive progress 404 forgets only the obsolete owner record and allows a fresh FF', async () => {
  const adapter = {
    progress: vi.fn().mockRejectedValueOnce(error(404, 'NOT_FOUND')).mockImplementation(pending),
    startDurable: vi.fn(async () => ({ id_optimizacion: 32, state: 'WAITING' })),
  };
  const dispatch = vi.fn();
  const { result } = renderHook(() => useDurableRun({ storageKey: key, adapter, dispatch }));
  await waitFor(() => expect(result.current.error).toBe('Consulta FF 404'));
  expect(result.current.id).toBeNull();
  expect(dispatch).toHaveBeenCalledWith({ type: 'durable_inaccessible' });
  expect(localStorage.getItem(key)).toBeNull();
  expect(localStorage.getItem(key + ':progress:31')).toBeNull();
  expect(JSON.parse(localStorage.getItem('newglass:ff-durable:99'))).toEqual(saved);
  act(() => { void result.current.start([2]); });
  await waitFor(() => expect(result.current.id).toBe(32));
  expect(adapter.startDurable).toHaveBeenCalledWith([2], expect.not.stringMatching(/^original-ff-key$/), expect.any(AbortSignal));
});

test('a bare HTTP 404 does not erase a run when the endpoint cannot identify the missing job', async () => {
  const adapter = { progress: vi.fn().mockRejectedValueOnce(error(404)), startDurable: vi.fn() };
  const dispatch = vi.fn();
  const { result } = renderHook(() => useDurableRun({ storageKey: key, adapter, dispatch }));
  await waitFor(() => expect(result.current.error).toBe('Consulta FF 404'));
  expect(result.current.id).toBe(31);
  expect(JSON.parse(localStorage.getItem(key))).toEqual(saved);
  expect(dispatch).not.toHaveBeenCalled();
});

test('a temporary progress failure preserves the FF and cursor without another admission', async () => {
  const adapter = { progress: vi.fn().mockRejectedValueOnce(error(503)).mockImplementation(pending),
    startDurable: vi.fn() };
  const dispatch = vi.fn();
  const { result } = renderHook(() => useDurableRun({ storageKey: key, adapter, dispatch }));
  await waitFor(() => expect(adapter.progress).toHaveBeenCalledWith(31, 5, expect.any(AbortSignal)));
  expect(result.current).toMatchObject({ id: 31, reconnecting: true });
  expect(JSON.parse(localStorage.getItem(key))).toEqual(saved);
  expect(localStorage.getItem(key + ':progress:31')).toBe('5');
  act(() => { void result.current.start([2]); });
  expect(adapter.startDurable).not.toHaveBeenCalled();
});
