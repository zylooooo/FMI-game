import pg from 'pg';
import type { GameState } from '../shared/types.ts';

let pool: pg.Pool | null = null;
let warned = false;

function getPool(): pg.Pool | null {
  if (!process.env.DATABASE_URL) {
    if (!warned) console.log('No DATABASE_URL, state in memory only');
    warned = true;
    return null;
  }
  if (!pool) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    pool.on('error', (e) => console.error('pg pool error', e));
  }
  return pool;
}

export async function load(): Promise<GameState | null> {
  const p = getPool();
  if (!p) return null;
  await p.query('CREATE TABLE IF NOT EXISTS game_state (id int PRIMARY KEY, state jsonb NOT NULL)');
  const r = await p.query('SELECT state FROM game_state WHERE id=1');
  return (r.rows[0]?.state as GameState | undefined) ?? null;
}

let pending: GameState | null = null;
let writing = false;

/** Fire-and-forget; latest snapshot wins, writes never overlap. */
export function save(s: GameState): void {
  const p = getPool();
  if (!p) return;
  pending = structuredClone(s);
  if (!writing) void flush(p);
}

async function flush(p: pg.Pool): Promise<void> {
  writing = true;
  while (pending) {
    const snap = pending;
    pending = null;
    try {
      await p.query(
        'INSERT INTO game_state (id, state) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state',
        [JSON.stringify(snap)],
      );
    } catch (e) {
      console.error('Failed to save game state', e);
    }
  }
  writing = false;
}
