import { ASSETS } from './types.ts';
import type { Asset, Holdings } from './types.ts';

export const START = 1000, STEP = 10, BONUS = 200, QUESTION_MS = 20_000, GRACE_MS = 500, MAX_GROUPS = 6;

/** null = ok; otherwise an error message. */
export function validateAllocation(h: Holdings): string | null {
  const keys = Object.keys(h ?? {});
  if (keys.length !== ASSETS.length || !ASSETS.every((a) => keys.includes(a))) return 'Allocation must be cash, stocks and bonds';
  for (const a of ASSETS) {
    const v = h[a];
    if (!Number.isInteger(v) || v < 0 || v % STEP !== 0) return `${a} must be a whole amount in steps of ${STEP}`;
  }
  return total(h) === START ? null : `Total must be exactly ${START}`;
}

export function total(h: Holdings): number {
  return h.cash + h.stocks + h.bonds;
}

/** Pure: bonus applied first, then each asset moves by its effect % (rounded). */
export function applyRound(h: Holdings, bonus: Asset | null, effects: Holdings): Holdings {
  const out = { ...h };
  if (bonus) out[bonus] += BONUS;
  for (const a of ASSETS) out[a] = Math.round(out[a] * (1 + effects[a] / 100));
  return out;
}

export interface Ranked { number: number; total: number; rank: number; label: string }

/** Competition ranking (1,2,2,4), desc by total, ties by group number. */
export function rank(entries: { number: number; total: number }[]): Ranked[] {
  const sorted = [...entries].sort((a, b) => b.total - a.total || a.number - b.number);
  const rankOf = (t: number) => sorted.findIndex((e) => e.total === t) + 1;
  return sorted.map((e) => {
    const r = rankOf(e.total);
    const tied = sorted.filter((x) => x.total === e.total).length > 1;
    return { ...e, rank: r, label: tied ? `${r}=` : `${r}` };
  });
}

export function podium(r: Ranked[]): Ranked[] {
  return r.filter((x) => x.rank <= 3);
}

export const won = (n: number) => '₩' + Math.round(n).toLocaleString('en-US');
