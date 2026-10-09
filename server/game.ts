import { ASSETS } from '../shared/types.ts';
import type { Ack, Asset, GameState, Group, HostAction, Holdings, Phase, PublicState } from '../shared/types.ts';
import { EVENTS } from '../shared/events.ts';
import { CORRECT } from './answers.ts';
import { GRACE_MS, MAX_GROUPS, QUESTION_MS, START, applyRound, validateAllocation } from '../shared/logic.ts';

const OK: Ack = { ok: true };
const fail = (error: string): Ack => ({ ok: false, error });
const WRONG_PHASE = 'Not allowed right now';
const REVEALED: Phase[] = ['answer', 'results', 'podium'];

export function newGame(): GameState {
  return { phase: 'lobby', round: 0, deadline: null, groups: [] };
}

const byToken = (s: GameState, token: string) =>
  typeof token === 'string' && token ? s.groups.find((g) => g.token === token) : undefined;

export function join(s: GameState, number: unknown, token: string): Ack {
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 1 || number > 7) {
    return fail('Enter a whole number from 1 to 7');
  }
  const existing = s.groups.find((g) => g.number === number);
  if (s.phase === 'lobby') {
    if (existing) return fail(`Group ${number} is already taken`);
    if (s.groups.length >= MAX_GROUPS) return fail('The game is full');
    s.groups.push({ number, token, holdings: null, answer: null, bonusAsset: null });
    s.groups.sort((a, b) => a.number - b.number);
  } else {
    if (!existing || existing.token !== null) return fail('The game has already started');
    existing.token = token;
  }
  return { ok: true, token, number };
}

export function resume(s: GameState, token: string): Ack {
  const g = byToken(s, token);
  return g ? { ok: true, number: g.number } : fail('Not joined');
}

/** Look up the caller's group and require a phase; returns the group or an error Ack. */
function inPhase(s: GameState, token: string, phase: Phase): Group | Ack {
  const g = byToken(s, token);
  if (!g) return fail('Not joined');
  return s.phase === phase ? g : fail(WRONG_PHASE);
}
const isAck = (x: Group | Ack): x is Ack => 'ok' in x;

export function allocate(s: GameState, token: string, h: Holdings): Ack {
  const g = inPhase(s, token, 'allocating');
  if (isAck(g)) return g;
  const bad = validateAllocation(h);
  if (bad) return fail(bad);
  g.holdings = { cash: h.cash, stocks: h.stocks, bonds: h.bonds };
  return OK;
}

export function answer(s: GameState, token: string, index: unknown, now: number): Ack {
  const g = inPhase(s, token, 'question');
  if (isAck(g)) return g;
  if (s.deadline === null || now > s.deadline + GRACE_MS) return fail("Time's up");
  if (g.answer !== null) return fail('Already locked in');
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > 3) return fail('Invalid answer');
  g.answer = index;
  return OK;
}

export function chooseBonus(s: GameState, token: string, asset: unknown): Ack {
  const g = inPhase(s, token, 'answer');
  if (isAck(g)) return g;
  if (g.answer !== CORRECT[s.round]) return fail('Only correct groups get a bonus');
  if (!ASSETS.includes(asset as Asset)) return fail('Invalid asset');
  g.bonusAsset = asset as Asset;
  return OK;
}

export function hostAction(s: GameState, a: HostAction, now: number): Ack {
  const need = (p: Phase) => s.phase === p;
  switch (a.type) {
    case 'start':
      if (!need('lobby')) return fail(WRONG_PHASE);
      if (s.groups.length < 1) return fail('Need at least one group');
      s.phase = 'allocating';
      return OK;
    case 'revealEvent':
      if (!need('allocating')) return fail(WRONG_PHASE);
      for (const g of s.groups) g.holdings ??= { cash: START, stocks: 0, bonds: 0 };
      s.phase = 'event';
      return OK;
    case 'startTimer':
      if (!need('event')) return fail(WRONG_PHASE);
      for (const g of s.groups) { g.answer = null; g.bonusAsset = null; }
      s.deadline = now + QUESTION_MS;
      s.phase = 'question';
      return OK;
    case 'revealAnswer':
      if (!need('question')) return fail(WRONG_PHASE);
      if (!(now >= (s.deadline ?? 0) + GRACE_MS || s.groups.every((g) => g.answer !== null))) return fail('Timer still running');
      s.phase = 'answer';
      return OK;
    case 'revealChart': {
      if (!need('answer')) return fail(WRONG_PHASE);
      const correct = CORRECT[s.round];
      const { effects } = EVENTS[s.round];
      for (const g of s.groups) {
        const bonus = g.answer === correct ? (g.bonusAsset ?? 'cash') : null;
        g.holdings = applyRound(g.holdings!, bonus, effects);
      }
      s.phase = 'results';
      return OK;
    }
    case 'next':
      if (!need('results')) return fail(WRONG_PHASE);
      if (s.round < 3) {
        for (const g of s.groups) { g.answer = null; g.bonusAsset = null; }
        s.round++;
        s.phase = 'event';
      } else s.phase = 'podium'; // keep last round's answers so podium still shows correct
      s.deadline = null;
      return OK;
    case 'reset':
      Object.assign(s, newGame());
      return OK;
    case 'release': {
      const g = s.groups.find((x) => x.number === a.number);
      if (!g) return fail('Unknown group');
      if (s.phase === 'lobby') s.groups = s.groups.filter((x) => x !== g);
      else g.token = null;
      return OK;
    }
    default:
      return fail(WRONG_PHASE);
  }
}

export function toPublic(s: GameState, now: number, connected: Set<number>): PublicState {
  const revealed = REVEALED.includes(s.phase);
  const correct = revealed ? CORRECT[s.round] : null;
  return {
    phase: s.phase, round: s.round, deadline: s.deadline, serverNow: now, correct,
    groups: s.groups.map((g) => ({
      number: g.number,
      holdings: g.holdings,
      answered: g.answer !== null,
      correct: revealed ? g.answer === correct : null,
      bonusAsset: g.bonusAsset,
      connected: connected.has(g.number),
      released: g.token === null,
    })),
  };
}
