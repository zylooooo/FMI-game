export type Asset = 'cash' | 'stocks' | 'bonds';
export const ASSETS: Asset[] = ['cash', 'stocks', 'bonds'];
export type Holdings = Record<Asset, number>;
export type Phase = 'lobby' | 'allocating' | 'event' | 'question' | 'answer' | 'results' | 'podium';

export interface Group {
  number: number;
  token: string | null;       // null after host "Release"
  holdings: Holdings | null;  // null until allocated
  answer: number | null;      // current round
  bonusAsset: Asset | null;   // current round
}
export interface GameState { phase: Phase; round: number; deadline: number | null; groups: Group[]; }

export interface PublicGroup {
  number: number;
  holdings: Holdings | null;
  answered: boolean;
  correct: boolean | null;    // null until phase >= 'answer'
  bonusAsset: Asset | null;
  connected: boolean;
  released: boolean;
}
export interface PublicState {
  phase: Phase; round: number; deadline: number | null; serverNow: number;
  correct: number | null;     // correct option index, null before 'answer'
  groups: PublicGroup[];      // sorted by number
}

export type HostAction =
  | { type: 'start' } | { type: 'revealEvent' } | { type: 'startTimer' }
  | { type: 'revealAnswer' } | { type: 'revealChart' } | { type: 'next' }
  | { type: 'reset' } | { type: 'release'; number: number };

export type Ack = { ok: true; token?: string; number?: number } | { ok: false; error: string };
