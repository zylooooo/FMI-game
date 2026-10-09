import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Banner, Button, Countdown, EffectChart, Podium, Shell, Toast, useToast } from './ui.tsx';
import { useGame, useTick } from './socket.ts';
import { ASSETS } from '../shared/types.ts';
import type { Asset, Holdings, PublicGroup, PublicState } from '../shared/types.ts';
import { EVENTS } from '../shared/events.ts';
import { BONUS, START, STEP, podium, rank, total, validateAllocation, won } from '../shared/logic.ts';

// `?slot=N` namespaces storage so several tabs in one browser can act as different groups (local testing).
const slot = new URLSearchParams(location.search).get('slot');
const TOKEN_KEY = slot ? `groupToken:${slot}` : 'groupToken';
const PICK_KEY = `${TOKEN_KEY}:pick`; // "round:index" of our locked-in option; not in PublicState
const LETTERS = ['A', 'B', 'C', 'D'];
const LABEL: Record<Asset, string> = { cash: 'Cash', stocks: 'Stocks', bonds: 'Bonds' };
const REVEAL_MS = 1500;

const forget = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PICK_KEY);
};
const readPick = (round: number): number | null => {
  const [r, i] = (localStorage.getItem(PICK_KEY) ?? '').split(':');
  return r === String(round) && i ? Number(i) : null;
};

type Emit = ReturnType<typeof useGame>['emit'];
type Say = (msg: string) => void;

export function Group() {
  const { state, connected, now, emit, onConnect } = useGame();
  const toast = useToast();
  const [number, setNumber] = useState<number | null>(null);
  const [resuming, setResuming] = useState(() => !!localStorage.getItem(TOKEN_KEY));

  // Re-attach on every (re)connect.
  useEffect(() => onConnect(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return setResuming(false);
    setResuming(true);
    const ack = await emit('group:resume', token);
    if (ack.ok && ack.number) setNumber(ack.number);
    else if (!ack.ok && ack.error !== 'Connection problem') { forget(); setNumber(null); }
    setResuming(false);
  }), []);

  // Reset or release by the host: our group is gone or lost its token.
  const me = state?.groups.find((g) => g.number === number);
  useEffect(() => {
    if (number !== null && state && (!me || me.released)) { forget(); setNumber(null); }
  }, [state, number, me]);

  const right = state && number !== null && state.phase !== 'lobby' && state.phase !== 'allocating' && state.phase !== 'podium'
    ? <span className="font-display text-2xl uppercase tracking-wider text-white/60">Event {state.round + 1} / {EVENTS.length}</span>
    : undefined;

  let body: ReactNode;
  if (!state || (resuming && number === null)) body = <Waiting>Connecting…</Waiting>;
  else if (number === null || !me) body = <Join emit={emit} onJoined={setNumber} />;
  else body = <Stage state={state} me={me} now={now} emit={emit} say={toast.show} />;

  return (
    <Shell title={number === null ? 'Market Survival' : `Group ${number}`} right={right}>
      <Banner connected={connected} />
      {body}
      <Toast message={toast.message} />
    </Shell>
  );
}

function Waiting({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <p className="animate-pop-in text-center font-display text-5xl uppercase leading-tight tracking-wide">{children}</p>
    </div>
  );
}

function Join({ emit, onJoined }: { emit: Emit; onJoined: (n: number) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^[1-7]$/.test(value.trim())) return setError('Enter a whole number from 1 to 7');
    setBusy(true);
    const ack = await emit('group:join', Number(value));
    setBusy(false);
    if (!ack.ok) return setError(ack.error);
    localStorage.setItem(TOKEN_KEY, ack.token!);
    localStorage.removeItem(PICK_KEY);
    onJoined(ack.number!);
  }

  return (
    <form onSubmit={submit} noValidate className="mx-auto mt-[8vh] flex max-w-xl flex-col items-center gap-8">
      <div aria-hidden className="stripes h-4 w-full" />
      <label htmlFor="group-number" className="text-center font-display text-6xl uppercase leading-tight">
        What is your group number?
      </label>
      <input
        id="group-number" type="number" min={1} max={7} step={1} inputMode="numeric" autoFocus required
        value={value} onChange={(e) => { setValue(e.target.value); setError(null); }}
        aria-invalid={!!error} aria-describedby={error ? 'join-error' : undefined}
        className="clip-hex h-36 w-56 bg-white text-center font-display text-8xl text-black outline-none focus-visible:bg-pink-light focus-visible:text-white"
      />
      <p id="join-error" role="alert" className="min-h-8 text-xl font-bold text-pink-light">{error}</p>
      <Button type="submit" disabled={busy} className="w-64">Join</Button>
    </form>
  );
}

function Stage({ state, me, now, emit, say }: { state: PublicState; me: PublicGroup; now: () => number; emit: Emit; say: Say }) {
  const ev = EVENTS[state.round];
  switch (state.phase) {
    case 'lobby':
      return <Waiting>You're in, Group {me.number}.<br /><span className="text-white/60">Waiting for the host to start…</span></Waiting>;
    case 'allocating':
      return <Allocate me={me} emit={emit} say={say} />;
    case 'event':
      return (
        <div className="grid min-h-[60vh] place-items-center">
          <div className="animate-pop-in flex w-full max-w-5xl flex-col items-center gap-6">
            <div aria-hidden className="stripes h-5 w-full" />
            <p className="font-display text-4xl uppercase tracking-[0.3em] text-pink">Event {state.round + 1}</p>
            <h2 className="text-center font-display text-8xl uppercase leading-none">{ev.title}</h2>
            <div aria-hidden className="stripes h-5 w-full" />
            <p className="text-xl text-white/60">Get ready — the question is coming…</p>
          </div>
        </div>
      );
    case 'question':
      return <Question key={state.round} state={state} me={me} now={now} emit={emit} say={say} />;
    case 'answer':
      return <Reveal key={state.round} state={state} me={me} emit={emit} say={say} />;
    case 'results':
      return (
        <div className="grid gap-10 lg:grid-cols-[3fr_2fr]">
          <section aria-label="Market move">
            <h2 className="mb-6 font-display text-4xl uppercase">{ev.title}: the market moves</h2>
            <EffectChart effects={ev.effects} />
          </section>
          <Portfolio h={me.holdings} heading="Your portfolio" />
        </div>
      );
    case 'podium': {
      const rows = rank(state.groups.filter((g) => g.holdings).map((g) => ({ number: g.number, total: total(g.holdings!) })));
      return (
        <div className="flex flex-col items-center gap-12">
          <h2 className="font-display text-6xl uppercase">Final standings</h2>
          <div className="w-full"><Podium rows={podium(rows)} /></div>
          {me.holdings && (
            <p className="animate-pop-in text-center font-display text-5xl uppercase" style={{ animationDelay: '1800ms' }}>
              Your final value: <span className="text-teal">{won(total(me.holdings))}</span>
            </p>
          )}
        </div>
      );
    }
  }
}

function Portfolio({ h, heading }: { h: Holdings | null; heading: string }) {
  if (!h) return null;
  return (
    <section aria-label={heading} className="flex flex-col gap-3">
      <h2 className="font-display text-4xl uppercase">{heading}</h2>
      {ASSETS.map((a) => (
        <div key={a} className="clip-angle flex items-center justify-between bg-white/5 px-6 py-4">
          <span className="font-display text-3xl uppercase tracking-wider">{LABEL[a]}</span>
          <span className="font-display text-3xl tabular-nums">{won(h[a])}</span>
        </div>
      ))}
      <div className="clip-angle mt-2 flex items-center justify-between bg-teal px-6 py-5 text-black">
        <span className="font-display text-3xl uppercase tracking-wider">Total</span>
        <span className="font-display text-6xl tabular-nums">{won(total(h))}</span>
      </div>
    </section>
  );
}

const ZERO: Holdings = { cash: 0, stocks: 0, bonds: 0 };

function Allocate({ me, emit, say }: { me: PublicGroup; emit: Emit; say: Say }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Holdings>(me.holdings ?? ZERO);
  const [busy, setBusy] = useState(false);

  if (me.holdings && !editing) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        <Portfolio h={me.holdings} heading="Portfolio locked" />
        <p className="text-xl text-white/60">Waiting for Event 1. You can still change it until then.</p>
        <Button variant="ghost" className="self-start" onClick={() => { setDraft(me.holdings!); setEditing(true); }}>Edit</Button>
      </div>
    );
  }

  const sum = total(draft);
  const bad = validateAllocation(draft);
  const hint = sum < START ? `${won(START - sum)} left to place` : sum > START ? `${won(sum - START)} too much` : bad;
  const set = (a: Asset, v: number) => setDraft((d) => ({ ...d, [a]: Math.max(0, Number.isFinite(v) ? v : 0) }));

  async function lock() {
    setBusy(true);
    const ack = await emit('group:allocate', draft);
    setBusy(false);
    if (!ack.ok) say(ack.error);
    else setEditing(false);
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!bad) lock(); }} className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h2 className="font-display text-5xl uppercase">Invest your {won(START)}</h2>
        <p className="mt-2 text-xl text-white/60">Split it across three assets in steps of {won(STEP)}. {won(0)} is allowed.</p>
      </div>
      {ASSETS.map((a) => (
        <div key={a} className="flex items-center gap-4 bg-white/5 px-6 py-4">
          <label htmlFor={`alloc-${a}`} className="w-36 font-display text-4xl uppercase">{LABEL[a]}</label>
          <Nudge label={`Remove ${won(100)} from ${LABEL[a]}`} onClick={() => set(a, draft[a] - 100)}>−100</Nudge>
          <Nudge label={`Remove ${won(10)} from ${LABEL[a]}`} onClick={() => set(a, draft[a] - 10)}>−10</Nudge>
          <div className="flex items-center gap-1 font-display text-4xl">
            <span aria-hidden>₩</span>
            <input
              id={`alloc-${a}`} type="number" min={0} max={START} step={STEP} inputMode="numeric"
              value={draft[a]} onFocus={(e) => e.target.select()} onChange={(e) => set(a, Math.floor(Number(e.target.value)))}
              className="w-40 border-b-4 border-white/30 bg-transparent text-right tabular-nums outline-none focus-visible:border-pink"
            />
          </div>
          <Nudge label={`Add ${won(10)} to ${LABEL[a]}`} onClick={() => set(a, draft[a] + 10)}>+10</Nudge>
          <Nudge label={`Add ${won(100)} to ${LABEL[a]}`} onClick={() => set(a, draft[a] + 100)}>+100</Nudge>
        </div>
      ))}
      <div className="flex items-center justify-between gap-6">
        <div aria-live="polite">
          <p className={`font-display text-5xl tabular-nums ${bad ? 'text-pink' : 'text-teal'}`}>{won(sum)} / {won(START)}</p>
          <p className="min-h-7 text-lg text-white/60">{hint}</p>
        </div>
        <div className="flex gap-4">
          {me.holdings && <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
          <Button type="submit" variant="teal" disabled={!!bad || busy}>Lock portfolio</Button>
        </div>
      </div>
    </form>
  );
}

function Nudge({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button" aria-label={label} onClick={onClick}
      className="clip-hex h-14 w-20 cursor-pointer bg-white/10 font-display text-xl tabular-nums hover:bg-pink focus-visible:bg-pink focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

function Options({ options, pick, selected, onSelect, className }: {
  options: string[]; pick: number | null; selected?: number | null; onSelect?: (i: number) => void; className: (i: number) => string;
}) {
  return (
    <div className="grid grid-cols-2 gap-4" role="group" aria-label="Options">
      {options.map((o, i) => (
        <button
          key={i} type="button" disabled={!onSelect} onClick={() => onSelect?.(i)} aria-pressed={onSelect ? selected === i : undefined}
          className={`clip-angle relative flex min-h-28 cursor-pointer items-center gap-4 px-5 py-4 text-left text-lg transition-[opacity,background-color] duration-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white disabled:cursor-default ${className(i)}`}
        >
          <span className="clip-hex grid h-12 w-14 shrink-0 place-items-center bg-black font-display text-2xl text-white">{LETTERS[i]}</span>
          <span>{o}</span>
          {pick === i && <span className="absolute top-2 right-4 text-xs font-bold uppercase tracking-widest">Your pick</span>}
        </button>
      ))}
    </div>
  );
}

function Question({ state, me, now, emit, say }: { state: PublicState; me: PublicGroup; now: () => number; emit: Emit; say: Say }) {
  useTick(250);
  const ev = EVENTS[state.round];
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = me.answered ? readPick(state.round) : null;
  const timeUp = !me.answered && state.deadline !== null && now() >= state.deadline;
  const open = !me.answered && !timeUp;

  async function lockIn() {
    if (selected === null) return;
    setBusy(true);
    const ack = await emit('group:answer', selected);
    setBusy(false);
    if (ack.ok) localStorage.setItem(PICK_KEY, `${state.round}:${selected}`);
    else say(ack.error);
  }

  const status = me.answered
    ? <p className="font-display text-4xl uppercase text-teal">Locked in{pick !== null ? `: ${LETTERS[pick]}` : ''} — waiting…</p>
    : timeUp
      ? <p className="font-display text-4xl uppercase text-pink">Time's up — no answer</p>
      : <Button variant="teal" disabled={selected === null || busy} onClick={lockIn}>Lock in{selected !== null ? ` ${LETTERS[selected]}` : ''}</Button>;

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[1fr_auto]">
      <div className="flex flex-col gap-6">
        <p className="font-display text-2xl uppercase tracking-[0.3em] text-pink">Event {state.round + 1}: {ev.title}</p>
        <h2 className="text-3xl font-bold leading-snug">{ev.question}</h2>
        <Options
          options={ev.options} pick={pick} selected={selected} onSelect={open ? setSelected : undefined}
          className={(i) => (pick === i || (open && selected === i) ? 'bg-pink text-white' : `bg-white/10 ${open ? 'hover:bg-white/20' : 'opacity-40'}`)}
        />
        <div aria-live="polite" className="min-h-20">{status}</div>
      </div>
      {state.deadline !== null && <Countdown deadline={state.deadline} now={now} />}
    </div>
  );
}

function Reveal({ state, me, emit, say }: { state: PublicState; me: PublicGroup; emit: Emit; say: Say }) {
  const ev = EVENTS[state.round];
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), REVEAL_MS);
    return () => clearTimeout(t);
  }, []);
  const pick = me.answered ? readPick(state.round) : null;

  async function choose(a: Asset) {
    const ack = await emit('group:bonus', a);
    if (!ack.ok) say(ack.error);
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-display text-2xl uppercase tracking-[0.3em] text-pink">Event {state.round + 1}: {ev.title}</p>
        <h2 className="mt-2 text-2xl font-bold leading-snug text-white/80">{ev.question}</h2>
      </div>
      <Options
        options={ev.options} pick={pick}
        className={(i) => !shown ? `bg-white/10 animate-flicker ${pick === i ? 'ring-4 ring-pink ring-inset' : ''}`
          : i === state.correct ? 'bg-teal text-black animate-flash-teal' : 'bg-white/10 opacity-20'}
      />
      <div aria-live="polite" className="min-h-40">
        {!shown ? (
          <p className="animate-flicker font-display text-5xl uppercase tracking-widest">
            {me.answered ? 'The answer is…' : "Time's up — no answer"}
          </p>
        ) : me.correct ? (
          <div className="animate-pop-in flex flex-col gap-6">
            <p className="font-display text-8xl uppercase text-teal">Correct +{won(BONUS)}</p>
            <div className="flex flex-col gap-4">
              <p className="text-xl font-bold">All {won(BONUS)} goes into one asset. You can change it until the chart is revealed (no choice = Cash).</p>
              <div className="grid grid-cols-3 gap-4" role="group" aria-label={`Where should your ${won(BONUS)} go?`}>
                {ASSETS.map((a) => {
                  const on = me.bonusAsset === a;
                  return (
                    <button
                      key={a} type="button" aria-pressed={on} onClick={() => choose(a)}
                      className={`clip-angle cursor-pointer px-6 py-8 font-display text-4xl uppercase transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white ${on ? 'bg-teal text-black' : 'bg-white/10 hover:bg-white/20'}`}
                    >
                      Put {won(BONUS)} into {LABEL[a]}
                      {on && <span className="mt-2 block font-body text-base font-bold tracking-widest">✓ Selected</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-pop-in flex items-center gap-6">
            <div aria-hidden className="stripes h-16 w-24" />
            <div>
              <p className="font-display text-9xl uppercase text-pink">Wrong</p>
              {!me.answered && <p className="text-xl font-bold text-white/60">Time's up — no answer</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
