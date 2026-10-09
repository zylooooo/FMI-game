import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAllocation, applyRound, total, rank, podium, won } from './logic.ts';
import { EVENTS } from './events.ts';

const h = (cash: number, stocks: number, bonds: number) => ({ cash, stocks, bonds });

test('validateAllocation', () => {
  assert.equal(validateAllocation(h(300, 500, 200)), null);
  assert.equal(validateAllocation(h(0, 0, 1000)), null);
  assert.ok(validateAllocation(h(300, 500, 190)));
  assert.ok(validateAllocation(h(305, 495, 200)));
  assert.ok(validateAllocation(h(-100, 600, 500)));
  assert.ok(validateAllocation(h(1.5, 998.5, 0)));
  assert.ok(validateAllocation({ cash: 500, stocks: 500 } as never));
  assert.ok(validateAllocation({ ...h(300, 500, 200), extra: 0 } as never));
});

test('applyRound PRD example', () => {
  assert.deepEqual(applyRound(h(300, 500, 200), 'stocks', EVENTS[0].effects), h(300, 980, 194));
});

test('applyRound rounding', () => {
  assert.equal(applyRound(h(0, 333, 0), null, { cash: 0, stocks: -3, bonds: 0 }).stocks, 323);
  assert.equal(applyRound(h(0, 0, 194), null, { cash: 0, stocks: 0, bonds: 3 }).bonds, 200);
});

test('applyRound compounds events 1-4', () => {
  let x = h(0, 1000, 0);
  const seen: number[] = [];
  for (const e of EVENTS) { x = applyRound(x, null, e.effects); seen.push(x.stocks); }
  assert.deepEqual(seen, [1400, 1120, 1098, 1098]);
  assert.equal(total(x), 1098);
});

test('rank', () => {
  const r = (ts: number[]) => rank(ts.map((t, i) => ({ number: i + 1, total: t })));
  assert.deepEqual(r([1200, 1100, 1100, 900]).map((x) => x.label), ['1', '2=', '2=', '4']);
  assert.deepEqual(r([5, 5, 5]).map((x) => x.label), ['1=', '1=', '1=']);
  assert.deepEqual(r([7]).map((x) => x.label), ['1']);
  assert.deepEqual(rank([{ number: 2, total: 10 }, { number: 1, total: 10 }]).map((x) => x.number), [1, 2]);
});

test('podium', () => {
  const p = (ts: number[]) => podium(rank(ts.map((t, i) => ({ number: i + 1, total: t }))));
  assert.equal(p([1000, 1000, 900, 800]).length, 3);
  assert.equal(p([1000, 900, 900, 900, 800]).length, 4);
});

test('won', () => {
  assert.equal(won(1234.6), '₩1,235');
});
