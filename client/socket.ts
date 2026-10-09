import { useEffect, useState, useSyncExternalStore } from 'react';
import { io } from 'socket.io-client';
import type { Ack, PublicState } from '../shared/types.ts';

const socket = io(); // same origin; Vite proxies /socket.io in dev
const FAIL: Ack = { ok: false, error: 'Connection problem' };

let snap: { state: PublicState | null; connected: boolean } = { state: null, connected: socket.connected };
let offset = 0; // serverNow - Date.now()
const listeners = new Set<() => void>();
const update = (patch: Partial<typeof snap>) => {
  snap = { ...snap, ...patch };
  listeners.forEach((l) => l());
};

socket.on('state', (s: PublicState) => {
  offset = s.serverNow - Date.now();
  update({ state: s });
});
socket.on('connect', () => update({ connected: true }));
socket.on('disconnect', () => update({ connected: false }));

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const now = () => Date.now() + offset;

async function emit(event: string, payload?: unknown): Promise<Ack> {
  if (!socket.connected) return FAIL;
  try {
    return await socket.timeout(5000).emitWithAck(event, payload);
  } catch {
    return FAIL;
  }
}

/** Runs fn now if connected, and on every future (re)connect. Returns an unsubscribe (use as a useEffect cleanup). */
function onConnect(fn: () => void): () => void {
  if (socket.connected) fn();
  socket.on('connect', fn);
  return () => void socket.off('connect', fn);
}

export function useGame() {
  const { state, connected } = useSyncExternalStore(subscribe, () => snap);
  return { state, connected, now, emit, onConnect };
}

/** Re-renders the caller every `ms`; returns Date.now(). */
export function useTick(ms = 200): number {
  const [t, setT] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return t;
}
