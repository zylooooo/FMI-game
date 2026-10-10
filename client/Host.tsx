import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { HostAction, Phase, PublicGroup, PublicState } from '../shared/types.ts';
import { EVENTS } from '../shared/events.ts';
import { GRACE_MS, podium, rank, total } from '../shared/logic.ts';
import { useGame, useTick } from './socket.ts';
import { Banner, Button, Countdown, EffectChart, Podium, RankingTable, Shell, Toast, useToast } from './ui.tsx';

const PIN_KEY = 'hostPin';
const SUSPENSE_MS = 1500;
const LETTERS = ['A', 'B', 'C', 'D'];
const PHASE_LABEL: Record<Phase, string> = {
  lobby: 'Lobby', allocating: 'Allocating', event: 'Event', question: 'Question',
  answer: 'Answer', results: 'Results', podium: 'Final',
};
const ASSET_LABEL = { cash: 'Cash', stocks: 'Stocks', bonds: 'Bonds' };

const ranked = (groups: PublicGroup[]) =>
  rank(groups.map((g) => ({ number: g.number, total: g.holdings ? total(g.holdings) : 0 })));

/** True for SUSPENSE_MS after `key` becomes non-null / changes. */
function useSuspense(key: string | null) {
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (key === null) return;
    const id = setTimeout(() => setDone(key), SUSPENSE_MS);
    return () => clearTimeout(id);
  }, [key]);
  return key !== null && done !== key;
}

export function Host() {
  const { state, connected, now, emit, onConnect } = useGame();
  const { message, show } = useToast();
  const [authed, setAuthed] = useState<boolean | null>(() => (localStorage.getItem(PIN_KEY) ? null : false));
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  useTick(250); // keeps "Reveal answer" enablement in step with the deadline
  const suspense = useSuspense(state?.phase === 'answer' ? `answer-${state.round}` : null);
  // Lock the primary button briefly after every phase change so a double-click can't skip a phase.
  const settling = useSuspense(state ? `${state.phase}-${state.round}` : null);

  // Auto-auth on mount and on every reconnect (the server forgets host sockets on disconnect).
  useEffect(() => onConnect(() => {
    const stored = localStorage.getItem(PIN_KEY);
    if (!stored) return;
    emit('host:auth', stored).then((ack) => {
      if (ack.ok) return setAuthed(true);
      // A dropped connection says nothing about the PIN; keep it for the next reconnect, but show the gate.
      if (ack.error === 'Connection problem') return setAuthed((a) => a ?? false);
      localStorage.removeItem(PIN_KEY);
      setAuthed(false);
      show(ack.error);
    });
  }), [onConnect, emit, show]);

  async function login(e: FormEvent) {
    e.preventDefault();
    const ack = await emit('host:auth', pin);
    if (!ack.ok) return show(ack.error);
    localStorage.setItem(PIN_KEY, pin);
    setAuthed(true);
  }

  async function act(a: HostAction) {
    setBusy(true);
    const ack = await emit('host:action', a);
    setBusy(false);
    if (!ack.ok) show(ack.error);
  }

  if (!authed) {
    return (
      <Shell title="Host">
        <Banner connected={connected} />
        {authed === null ? (
          <p className="animate-flicker mt-24 text-center font-display text-3xl uppercase tracking-widest text-white/60">Checking PIN…</p>
        ) : (
          <form onSubmit={login} className="mx-auto mt-24 flex max-w-md flex-col gap-6">
            <label htmlFor="pin" className="font-display text-4xl uppercase">Host PIN</label>
            <input
              id="pin" type="password" inputMode="numeric" autoComplete="off" autoFocus value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="clip-angle bg-white/10 px-6 py-4 font-display text-4xl tracking-[0.4em] outline-none focus-visible:bg-white/20 focus-visible:ring-4 focus-visible:ring-pink"
            />
            <Button type="submit" disabled={!pin}>Enter</Button>
          </form>
        )}
        <Toast message={message} />
      </Shell>
    );
  }

  if (!state) {
    return (
      <Shell title="Host">
        <Banner connected={connected} />
        <p className="mt-24 text-center font-display text-3xl uppercase text-white/60">Connecting…</p>
      </Shell>
    );
  }

  const { phase, round, groups } = state;
  const n = groups.length;
  const count = (f: (g: PublicGroup) => boolean) => groups.filter(f).length;
  const allAnswered = n > 0 && groups.every((g) => g.answered);

  let primary: { label: string; action: HostAction; disabled?: boolean; sub?: string } | null = null;
  switch (phase) {
    case 'lobby':
      primary = { label: 'Start game', action: { type: 'start' }, disabled: n === 0, sub: n ? `${n} joined` : 'Waiting for groups' };
      break;
    case 'allocating':
      primary = { label: 'Reveal Event 1', action: { type: 'revealEvent' }, sub: `${count((g) => !!g.holdings)}/${n} allocated` };
      break;
    case 'event':
      primary = { label: 'Start timer', action: { type: 'startTimer' } };
      break;
    case 'question':
      primary = {
        label: 'Reveal answer', action: { type: 'revealAnswer' },
        disabled: !(now() >= (state.deadline ?? 0) + GRACE_MS || allAnswered),
        sub: `${count((g) => g.answered)}/${n} locked in`,
      };
      break;
    case 'answer':
      primary = {
        label: 'Reveal chart', action: { type: 'revealChart' },
        sub: suspense ? undefined : `${count((g) => !!g.correct && !g.bonusAsset)} correct groups still choosing`,
      };
      break;
    case 'results':
      primary = { label: round < 3 ? 'Next event' : 'Final results', action: { type: 'next' } };
      break;
  }

  const reset = () => window.confirm('Reset the game? All groups and money will be wiped.') && act({ type: 'reset' });
  const release = (g: number) =>
    window.confirm(`Release Group ${g}? ${phase === 'lobby' ? 'It will be removed.' : 'A new device can then join as this group.'}`)
    && act({ type: 'release', number: g });

  const bar = (
    <>
      <div className="flex flex-col items-end leading-tight">
        <span className="font-display text-2xl uppercase text-pink">{PHASE_LABEL[phase]}</span>
        <span className="text-sm font-bold uppercase tracking-widest text-white/60">
          {phase === 'lobby' || phase === 'allocating' ? 'Event –/4' : `Event ${round + 1}/4`}
        </span>
      </div>
      {primary && (
        <div className="flex flex-col items-center gap-1">
          <Button disabled={busy || settling || primary.disabled} onClick={() => act(primary.action)}>{primary.label}</Button>
          <span className="h-5 text-sm font-bold text-white/70" aria-live="polite">{primary.sub}</span>
        </div>
      )}
      <Button variant="ghost" disabled={busy} onClick={reset} className="[&>span]:px-4 [&>span]:py-2 [&>span]:text-base">Reset game</Button>
    </>
  );

  return (
    <Shell title="Market Survival" right={bar}>
      <Banner connected={connected} />
      <div className="flex flex-col gap-8 lg:flex-row">
        <section className="min-w-0 flex-1" key={`${phase}-${round}`} aria-label="Stage">
          <Stage state={state} now={now} suspense={suspense} />
        </section>
        <aside className="shrink-0 lg:w-64" aria-label="Groups">
          <h2 className="mb-3 font-display text-xl uppercase tracking-widest text-white/60">Groups {n}/6</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-col">
            {groups.map((g) => (
              <Chip key={g.number} g={g} phase={phase} suspense={suspense} onRelease={() => release(g.number)} />
            ))}
          </ul>
        </aside>
      </div>
      <Toast message={message} />
    </Shell>
  );
}

function Chip({ g, phase, suspense, onRelease }: { g: PublicGroup; phase: Phase; suspense: boolean; onRelease: () => void }) {
  let status = '';
  if (g.released) status = 'Released';
  else if (phase === 'allocating') status = g.holdings ? '✓ Allocated' : 'Building…';
  else if (phase === 'question') status = g.answered ? '✓ Locked in' : 'Thinking…';
  else if (phase === 'answer' && !suspense && g.correct) status = g.bonusAsset ? `✓ Bonus: ${ASSET_LABEL[g.bonusAsset]}` : 'Choosing bonus…';
  const done = status.startsWith('✓');
  return (
    <li className="animate-pop-in clip-angle flex items-center gap-3 bg-white/5 py-2 pr-2 pl-4">
      {/* Hex status light: filled teal when connected, pink outline when offline. */}
      <span className={`clip-hex grid size-4 shrink-0 place-items-center ${g.connected ? 'bg-teal' : 'bg-pink'}`}>
        {!g.connected && <span className="clip-hex size-2.5 bg-black" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-display text-xl uppercase">
          Group {g.number}<span className="sr-only">, {g.connected ? 'connected' : 'offline'}</span>
        </div>
        {status && <div className={`truncate text-sm font-bold ${done ? 'text-teal' : 'text-white/60'}`}>{status}</div>}
      </div>
      {!g.released && (
        <button
          type="button" onClick={onRelease} aria-label={`Release Group ${g.number}`}
          className="cursor-pointer px-2 py-1 text-xs font-bold uppercase tracking-wider text-white/60 hover:text-pink focus-visible:outline-2 focus-visible:outline-white"
        >
          Release
        </button>
      )}
    </li>
  );
}

function Stage({ state, now, suspense }: { state: PublicState; now: () => number; suspense: boolean }) {
  const { phase, round, groups } = state;
  const ev = EVENTS[round];
  switch (phase) {
    case 'lobby':
      return (
        <div className="flex flex-col gap-10">
          <div className="animate-pop-in">
            <p className="font-display text-6xl uppercase leading-none text-pink sm:text-8xl">Join now</p>
            <p className="mt-4 text-xl sm:text-2xl">
              Open <span className="wrap-anywhere bg-white px-2 font-bold text-black">{location.origin}/play</span> and enter your group number.
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3" aria-label="Joined groups">
            {groups.map((g) => (
              <li key={g.number} className="animate-pop-in clip-hex grid h-24 place-items-center bg-teal-dark font-display text-2xl uppercase sm:h-32 sm:text-4xl">
                Group {g.number}
              </li>
            ))}
          </ul>
          {!groups.length && <p className="animate-flicker font-display text-2xl uppercase tracking-widest text-white/40">Waiting for groups…</p>}
        </div>
      );
    case 'allocating':
      return (
        <div className="flex flex-col gap-10">
          <p className="animate-pop-in font-display text-4xl uppercase leading-tight sm:text-6xl">
            Groups are building<br /><span className="text-pink">their portfolios</span>
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <li key={g.number} className={`clip-angle flex items-center justify-between px-6 py-5 font-display text-2xl sm:text-3xl uppercase ${g.holdings ? 'animate-pop-in bg-teal text-black' : 'bg-white/5 text-white/60'}`}>
                Group {g.number}
                <span aria-label={g.holdings ? 'allocated' : 'not yet allocated'}>{g.holdings ? '✓' : '…'}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'event':
      return (
        <div className="flex min-h-[60vh] flex-col justify-center gap-6 overflow-hidden">
          <div aria-hidden className="stripes animate-sweep h-6" />
          <p className="animate-pop-in font-display text-7xl uppercase leading-none text-pink sm:text-9xl lg:text-[10rem]" style={{ animationDelay: '300ms' }}>
            Event {round + 1}
          </p>
          <p className="animate-pop-in font-display text-4xl uppercase leading-tight sm:text-6xl" style={{ animationDelay: '700ms' }}>{ev.title}</p>
          <div aria-hidden className="-scale-x-100"><div className="stripes animate-sweep h-6" /></div>
        </div>
      );
    case 'question':
      return (
        <div className="flex flex-col gap-6">
          <p className="animate-pop-in text-xl font-bold leading-snug sm:text-3xl">{ev.question}</p>
          <div className="flex flex-col-reverse items-center gap-6 lg:flex-row lg:items-start lg:gap-8">
            <Options options={ev.options} />
            <div className="flex shrink-0 flex-col items-center gap-3">
              <Countdown deadline={state.deadline ?? 0} now={now} />
              <span className="font-display text-2xl uppercase sm:text-3xl" aria-live="polite">
                {groups.filter((g) => g.answered).length}/{groups.length} locked in
              </span>
            </div>
          </div>
        </div>
      );
    case 'answer': {
      const winners = groups.filter((g) => g.correct);
      return (
        <div className="flex flex-col gap-6">
          <p className="text-xl font-bold leading-snug sm:text-3xl">{ev.question}</p>
          <Options options={ev.options} correct={state.correct} suspense={suspense} />
          <div aria-live="polite">
            {suspense ? (
              <p className="animate-flicker font-display text-4xl uppercase tracking-widest text-pink">The answer is…</p>
            ) : (
              <div className="animate-pop-in flex flex-wrap items-center gap-3">
                <span className="font-display text-3xl uppercase">Correct:</span>
                {winners.length ? winners.map((g) => (
                  <span key={g.number} className="clip-angle bg-teal px-4 py-1 font-display text-2xl uppercase text-black">Group {g.number}</span>
                )) : <span className="font-display text-3xl uppercase text-pink">Nobody</span>}
              </div>
            )}
          </div>
        </div>
      );
    }
    case 'results':
      return (
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="mb-4 font-display text-3xl uppercase">Event {round + 1}: <span className="text-pink">{ev.title}</span></h2>
            <EffectChart effects={ev.effects} />
          </div>
          <div>
            <h2 className="mb-4 font-display text-3xl uppercase">Ranking</h2>
            <RankingTable rows={ranked(groups)} />
          </div>
        </div>
      );
    case 'podium':
      return (
        <div className="flex flex-col items-center gap-10">
          <p className="animate-pop-in font-display text-5xl uppercase text-pink sm:text-7xl">Survivors</p>
          <div className="w-full"><Podium rows={podium(ranked(groups))} /></div>
        </div>
      );
  }
}

/** Question options; with `correct` set they run the suspense → reveal sequence. */
function Options({ options, correct = null, suspense = false }: { options: string[]; correct?: number | null; suspense?: boolean }) {
  const revealed = correct !== null && !suspense;
  return (
    <ol className="grid w-full flex-1 gap-3 sm:grid-cols-2 sm:gap-4">
      {options.map((o, i) => {
        const right = revealed && i === correct;
        const wrong = revealed && i !== correct;
        // Before the reveal: pop in; suspense: flicker; reveal: correct flashes, wrong just fade.
        const anim = suspense ? 'animate-flicker' : right ? 'animate-reveal-teal' : wrong ? '' : 'animate-pop-in';
        return (
          <li
            key={i}
            className={`clip-angle flex items-center gap-4 p-5 transition-opacity duration-500 ${anim} ${right ? 'bg-teal text-black' : 'bg-white/10'} ${wrong ? 'opacity-30' : ''}`}
            style={!suspense && !revealed ? { animationDelay: `${i * 100}ms` } : undefined}
          >
            <span className={`clip-hex grid h-12 w-14 shrink-0 place-items-center font-display text-2xl ${right ? 'bg-black text-teal' : 'bg-pink text-white'}`}>
              {LETTERS[i]}
            </span>
            <span className="font-bold leading-snug sm:text-xl">{o}</span>
            {right && <span className="sr-only">(correct answer)</span>}
          </li>
        );
      })}
    </ol>
  );
}
