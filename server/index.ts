import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import type { Ack, GameState, HostAction } from '../shared/types.ts';
import { allocate, answer, chooseBonus, hostAction, join, newGame, resume, toPublic } from './game.ts';
import { load, save } from './db.ts';

const state: GameState = (await load()) ?? newGame();

const HOST_PIN = process.env.HOST_PIN ?? '1234';
if (!process.env.HOST_PIN) console.warn('HOST_PIN not set, using default "1234"');
const PORT = Number(process.env.PORT ?? 3000);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const dist = fileURLToPath(new URL('../dist', import.meta.url));
if (existsSync(`${dist}/index.html`)) {
  app.use(express.static(dist));
  app.get(/.*/, (_, res) => res.sendFile(`${dist}/index.html`));
}

function connectedSet(): Set<number> {
  const set = new Set<number>();
  for (const s of io.sockets.sockets.values()) {
    const g = s.data.token && state.groups.find((x) => x.token === s.data.token);
    if (g) set.add(g.number);
  }
  return set;
}

const broadcast = () => io.emit('state', toPublic(state, Date.now(), connectedSet()));

function commit(ack: Ack): Ack {
  if (ack.ok) {
    save(state);
    broadcast();
  }
  return ack;
}

/** Wrap a handler: require an ack callback, turn exceptions into a 'Server error' ack. */
function on<A>(socket: Socket, event: string, fn: (arg: A) => Ack) {
  socket.on(event, (arg: A, ack: unknown) => {
    if (typeof ack !== 'function') return;
    try {
      ack(fn(arg));
    } catch (e) {
      console.error(event, e);
      ack({ ok: false, error: 'Server error' });
    }
  });
}

io.on('connection', (socket) => {
  socket.emit('state', toPublic(state, Date.now(), connectedSet()));

  const asHost = (fn: () => Ack): Ack => (socket.data.isHost ? fn() : { ok: false, error: 'Not allowed' });
  const rememberToken = (ack: Ack, token: string): Ack => {
    if (ack.ok) socket.data.token = token;
    return ack;
  };

  on<string>(socket, 'host:auth', (pin) => {
    if (pin !== HOST_PIN) return { ok: false, error: 'Wrong PIN' };
    socket.data.isHost = true;
    return { ok: true };
  });
  on<HostAction>(socket, 'host:action', (a) => asHost(() => commit(hostAction(state, a, Date.now()))));
  on<number>(socket, 'group:join', (n) => {
    const token = crypto.randomUUID();
    return commit(rememberToken(join(state, n, token, connectedSet()), token));
  });
  on<string>(socket, 'group:resume', (token) => commit(rememberToken(resume(state, token), token)));
  on(socket, 'group:allocate', (h: Parameters<typeof allocate>[2]) => commit(allocate(state, socket.data.token, h)));
  on<number>(socket, 'group:answer', (i) => commit(answer(state, socket.data.token, i, Date.now())));
  on<string>(socket, 'group:bonus', (a) => commit(chooseBonus(state, socket.data.token, a)));

  socket.on('disconnect', broadcast);
});

httpServer.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
