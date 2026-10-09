import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, join, resume, allocate, answer, chooseBonus, hostAction, toPublic } from './game.ts';
import type { GameState, HostAction } from '../shared/types.ts';
import { EVENTS } from '../shared/events.ts';
import { QUESTION_MS, GRACE_MS } from '../shared/logic.ts';

const host = (s: GameState, type: Exclude<HostAction['type'], 'release'>, now = 0) => hostAction(s, { type }, now);
const ok = (a: { ok: boolean }) => assert.equal(a.ok, true, JSON.stringify(a));
const err = (a: { ok: boolean }, msg: string) => assert.deepEqual(a, { ok: false, error: msg });

function toQuestion(s: GameState, now = 0) {
  ok(host(s, 'revealEvent'));
  ok(host(s, 'startTimer', now));
}

test('join validation', () => {
  const s = newGame();
  for (const bad of [0, 8, 2.5, '3']) err(join(s, bad, 't'), 'Enter a whole number from 1 to 7');
  ok(join(s, 1, 'a'));
  err(join(s, 1, 'b'), 'Group 1 is already taken');
  for (const n of [2, 3, 4, 5, 6]) ok(join(s, n, 't' + n));
  err(join(s, 7, 'x'), 'The game is full');
  assert.deepEqual(s.groups.map((g) => g.number), [1, 2, 3, 4, 5, 6]);
});

test('join keeps groups sorted', () => {
  const s = newGame();
  join(s, 5, 'a');
  join(s, 2, 'b');
  assert.deepEqual(s.groups.map((g) => g.number), [2, 5]);
});

test('join after start only for released group, inheriting holdings', () => {
  const s = newGame();
  join(s, 1, 'a');
  join(s, 2, 'b');
  ok(host(s, 'start'));
  err(join(s, 3, 'c'), 'The game has already started');
  err(join(s, 1, 'c'), 'The game has already started');
  ok(allocate(s, 'a', { cash: 100, stocks: 400, bonds: 500 }));
  ok(hostAction(s, { type: 'release', number: 1 }, 0));
  err(resume(s, 'a'), 'Not joined');
  ok(join(s, 1, 'new'));
  assert.deepEqual(s.groups[0].holdings, { cash: 100, stocks: 400, bonds: 500 });
  assert.deepEqual(resume(s, 'new'), { ok: true, number: 1 });
});

test('release in lobby removes group; unknown group errors', () => {
  const s = newGame();
  join(s, 1, 'a');
  ok(hostAction(s, { type: 'release', number: 1 }, 0));
  assert.equal(s.groups.length, 0);
  assert.equal(hostAction(s, { type: 'release', number: 1 }, 0).ok, false);
});

test('allocate rules', () => {
  const s = newGame();
  join(s, 1, 'a');
  err(allocate(s, 'a', { cash: 1000, stocks: 0, bonds: 0 }), 'Not allowed right now');
  host(s, 'start');
  err(allocate(s, 'zz', { cash: 1000, stocks: 0, bonds: 0 }), 'Not joined');
  assert.equal(allocate(s, 'a', { cash: 500, stocks: 0, bonds: 0 }).ok, false);
  ok(allocate(s, 'a', { cash: 0, stocks: 1000, bonds: 0 }));
  ok(allocate(s, 'a', { cash: 1000, stocks: 0, bonds: 0 }));
});

test('start needs a group; wrong-phase host action rejected', () => {
  const s = newGame();
  assert.equal(host(s, 'start').ok, false);
  err(host(s, 'revealEvent'), 'Not allowed right now');
  err(host(s, 'next'), 'Not allowed right now');
  join(s, 1, 'a');
  ok(host(s, 'start'));
  err(host(s, 'start'), 'Not allowed right now');
  err(host(s, 'revealChart'), 'Not allowed right now');
});

test('happy path, 2 groups, 4 events', () => {
  const s = newGame();
  join(s, 1, 'a');
  join(s, 2, 'b');
  ok(host(s, 'start'));
  ok(allocate(s, 'a', { cash: 300, stocks: 500, bonds: 200 }));
  for (let r = 0; r < 4; r++) {
    assert.equal(s.round, r);
    if (r === 0) ok(host(s, 'revealEvent')); // later rounds: 'next' already lands in 'event'
    ok(host(s, 'startTimer', 1000));
    assert.equal(s.deadline, 1000 + QUESTION_MS);
    ok(answer(s, 'a', EVENTS[r].correct, 2000));
    ok(host(s, 'revealAnswer', 1000 + QUESTION_MS));
    ok(chooseBonus(s, 'a', 'stocks'));
    ok(host(s, 'revealChart'));
    if (r === 0) assert.deepEqual(s.groups[0].holdings, { cash: 300, stocks: 980, bonds: 194 });
    assert.deepEqual(s.groups[1].holdings, { cash: 1000, stocks: 0, bonds: 0 });
    ok(host(s, 'next'));
    assert.equal(s.deadline, null);
  }
  assert.equal(s.phase, 'podium');
  assert.equal(s.round, 3);
});

test('correct group without bonus choice gets +200 cash', () => {
  const s = newGame();
  join(s, 1, 'a');
  host(s, 'start');
  allocate(s, 'a', { cash: 0, stocks: 1000, bonds: 0 });
  toQuestion(s);
  answer(s, 'a', 0, 1);
  ok(host(s, 'revealAnswer', QUESTION_MS));
  ok(host(s, 'revealChart'));
  assert.deepEqual(s.groups[0].holdings, { cash: 200, stocks: 1400, bonds: 0 });
});

test('wrong answer gets no bonus; bonus only for correct groups', () => {
  const s = newGame();
  join(s, 1, 'a');
  host(s, 'start');
  allocate(s, 'a', { cash: 1000, stocks: 0, bonds: 0 });
  toQuestion(s);
  answer(s, 'a', 3, 1);
  host(s, 'revealAnswer', QUESTION_MS);
  err(chooseBonus(s, 'a', 'stocks'), 'Only correct groups get a bonus');
  host(s, 'revealChart');
  assert.deepEqual(s.groups[0].holdings, { cash: 1000, stocks: 0, bonds: 0 });
});

test('bonus asset validated and changeable', () => {
  const s = newGame();
  join(s, 1, 'a');
  host(s, 'start');
  toQuestion(s);
  answer(s, 'a', 0, 1);
  host(s, 'revealAnswer', QUESTION_MS);
  assert.equal(chooseBonus(s, 'a', 'gold').ok, false);
  ok(chooseBonus(s, 'a', 'bonds'));
  ok(chooseBonus(s, 'a', 'stocks'));
  assert.equal(s.groups[0].bonusAsset, 'stocks');
});

test('answer timing and locking', () => {
  const s = newGame();
  join(s, 1, 'a');
  join(s, 2, 'b');
  join(s, 3, 'c');
  host(s, 'start');
  toQuestion(s, 0);
  err(answer(s, 'c', 0, QUESTION_MS + GRACE_MS + 1), "Time's up");
  ok(answer(s, 'a', 0, QUESTION_MS + GRACE_MS));
  err(answer(s, 'a', 1, 100), 'Already locked in');
  assert.equal(answer(s, 'b', 4, 100).ok, false);
  assert.equal(answer(s, 'b', '1', 100).ok, false);
  err(answer(s, 'zz', 1, 100), 'Not joined');
});

test('revealAnswer waits for timer unless all answered', () => {
  const s = newGame();
  join(s, 1, 'a');
  join(s, 2, 'b');
  host(s, 'start');
  toQuestion(s, 0);
  answer(s, 'a', 0, 1);
  err(host(s, 'revealAnswer', 5), 'Timer still running');
  answer(s, 'b', 1, 2);
  ok(host(s, 'revealAnswer', 5));
});

test('toPublic hides tokens and hides correct during question', () => {
  const s = newGame();
  join(s, 1, 'secret');
  host(s, 'start');
  toQuestion(s, 0);
  answer(s, 'secret', 0, 1);
  let p = toPublic(s, 7, new Set([1]));
  assert.equal(p.serverNow, 7);
  assert.equal(p.correct, null);
  assert.equal(p.groups[0].correct, null);
  assert.equal(p.groups[0].answered, true);
  assert.equal(p.groups[0].connected, true);
  assert.equal(p.groups[0].released, false);
  assert.ok(!JSON.stringify(p).includes('secret'));
  host(s, 'revealAnswer', QUESTION_MS);
  p = toPublic(s, 7, new Set());
  assert.equal(p.correct, EVENTS[0].correct);
  assert.equal(p.groups[0].correct, true);
  assert.equal(p.groups[0].connected, false);
});

test('next clears previous round answers and bonus from public state', () => {
  const s = newGame();
  join(s, 1, 'a');
  host(s, 'start');
  toQuestion(s);
  answer(s, 'a', 0, 1);
  host(s, 'revealAnswer', QUESTION_MS);
  chooseBonus(s, 'a', 'stocks');
  host(s, 'revealChart');
  ok(host(s, 'next'));
  const g = toPublic(s, 0, new Set()).groups[0];
  assert.equal(g.answered, false);
  assert.equal(g.bonusAsset, null);
});

test('reset returns to lobby', () => {
  const s = newGame();
  join(s, 1, 'a');
  host(s, 'start');
  ok(host(s, 'reset'));
  assert.deepEqual(s, newGame());
});
