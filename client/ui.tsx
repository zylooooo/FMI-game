import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ASSETS } from '../shared/types.ts';
import type { Holdings } from '../shared/types.ts';
import { QUESTION_MS, won } from '../shared/logic.ts';
import type { Ranked } from '../shared/logic.ts';
import { useTick } from './socket.ts';

const Chevrons = () => (
  <span aria-hidden className="flex gap-1">
    {[0, 1, 2].map((i) => (
      <span key={i} className="clip-chevron h-7 w-4 bg-pink" style={{ opacity: 1 - i * 0.3 }} />
    ))}
  </span>
);

export function Shell({ title, right, children }: { title: ReactNode; right?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-black">
      <header>
        <div aria-hidden className="stripes h-3" />
        <div className="flex items-center justify-between gap-6 border-b-2 border-white/10 px-8 py-4">
          <div className="flex items-center gap-4">
            <Chevrons />
            <h1 className="font-display text-4xl uppercase tracking-wide">{title}</h1>
          </div>
          {right && <div className="flex items-center gap-4">{right}</div>}
        </div>
      </header>
      <main className="flex-1 px-8 py-6">{children}</main>
    </div>
  );
}

const VARIANTS = {
  pink: 'bg-pink text-white group-hover:bg-pink-light',
  teal: 'bg-teal text-black group-hover:bg-white',
  ghost: 'bg-white/10 text-white group-hover:bg-white/20',
};

export function Button({
  variant = 'pink', disabled, onClick, children, type = 'button', className = '',
}: {
  variant?: keyof typeof VARIANTS; disabled?: boolean; onClick?: () => void; children: ReactNode;
  type?: 'button' | 'submit'; className?: string;
}) {
  // Clip-path lives on the inner span so the focus outline on the button isn't clipped away.
  return (
    <button
      type={type} disabled={disabled} onClick={onClick}
      className={`group cursor-pointer focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white disabled:pointer-events-none disabled:opacity-40 ${className}`}
    >
      <span className={`clip-angle block px-8 py-4 font-display text-2xl uppercase tracking-wider transition-colors ${VARIANTS[variant]}`}>
        {children}
      </span>
    </button>
  );
}

/** Pass `now` straight from useGame(); the component ticks itself. */
export function Countdown({ deadline, now, totalMs = QUESTION_MS }: { deadline: number; now: () => number; totalMs?: number }) {
  useTick(200);
  const left = Math.max(0, deadline - now());
  const secs = Math.ceil(left / 1000);
  const urgent = secs > 0 && secs <= 5;
  const color = secs > 5 ? 'stroke-teal' : 'stroke-pink';
  return (
    <div role="timer" aria-label={secs ? `${secs} seconds left` : "Time's up"} className={`relative size-64 ${urgent ? 'animate-shake' : ''}`}>
      <svg viewBox="0 0 100 100" className={`size-full ${urgent ? 'animate-pulse-pink' : ''}`} aria-hidden>
        <polygon points="50,4 90,27 90,73 50,96 10,73 10,27" fill="none" strokeWidth="7" strokeLinejoin="round" className="stroke-white/10" />
        <polygon
          points="50,4 90,27 90,73 50,96 10,73 10,27" fill="none" strokeWidth="7" strokeLinejoin="round" pathLength={100}
          strokeDasharray="100" strokeDashoffset={100 * (1 - left / totalMs)}
          className={`${color} transition-[stroke-dashoffset] duration-200 ease-linear`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        {secs ? (
          <span className={`font-display text-8xl tabular-nums ${urgent ? 'text-pink' : 'text-white'}`}>{secs}</span>
        ) : (
          <span className="animate-pop-in text-center font-display text-4xl leading-none text-pink">TIME'S<br />UP</span>
        )}
      </div>
    </div>
  );
}

const LABEL = { cash: 'Cash', stocks: 'Stocks', bonds: 'Bonds' };
const SCALE = 40; // % that fills half the chart; keeps rounds comparable
const pct = (n: number) => `${n > 0 ? '+' : ''}${n}%`;

export function EffectChart({ effects }: { effects: Holdings }) {
  const max = Math.max(SCALE, ...ASSETS.map((a) => Math.abs(effects[a])));
  return (
    <div className="grid grid-cols-3 gap-10" role="list" aria-label="Market effects">
      {ASSETS.map((a, i) => {
        const v = effects[a];
        const h = `max(6px, ${(Math.abs(v) / max) * 85}%)`;
        const delay = { animationDelay: `${i * 300}ms` };
        const label = <span className="animate-pop-in font-display text-3xl" style={{ animationDelay: `${i * 300 + 600}ms` }}>{pct(v)}</span>;
        return (
          <div key={a} role="listitem" aria-label={`${LABEL[a]} ${pct(v)}`} className="flex flex-col items-center">
            <div className="relative flex h-80 w-full flex-col">
              <div className={`flex flex-1 flex-col items-center justify-end gap-2 ${v === 0 ? 'pb-4' : ''}`}>
                {v >= 0 && label}
                {v > 0 && <div className="clip-angle w-24 origin-bottom animate-grow-up bg-teal" style={{ height: h, ...delay }} />}
              </div>
              <div className="relative h-1 w-full bg-white">
                {v === 0 && <div className="absolute top-1/2 left-1/2 h-4 w-24 -translate-1/2 animate-pop-in bg-white" style={delay} />}
              </div>
              <div className="flex flex-1 flex-col items-center justify-start gap-2">
                {v < 0 && <div className="clip-angle w-24 origin-top animate-grow-up bg-pink" style={{ height: h, ...delay }} />}
                {v < 0 && label}
              </div>
            </div>
            <span className="mt-3 font-display text-2xl uppercase tracking-wider">{LABEL[a]}</span>
          </div>
        );
      })}
    </div>
  );
}

export function RankingTable({ rows }: { rows: Ranked[] }) {
  return (
    <table className="w-full border-separate border-spacing-y-2">
      <thead className="sr-only">
        <tr><th>Rank</th><th>Group</th><th>Total</th></tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.number} className="animate-pop-in bg-white/5" style={{ animationDelay: `${i * 80}ms` }}>
            <td className="w-20 py-2 pl-3">
              <span className={`clip-hex grid h-12 w-14 place-items-center font-display text-2xl ${r.rank === 1 ? 'bg-pink text-white' : 'bg-teal-dark text-white'}`}>
                {r.label}
              </span>
            </td>
            <td className="font-display text-3xl uppercase">Group {r.number}</td>
            <td className="pr-6 text-right font-display text-3xl tabular-nums">{won(r.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const STEPS = [
  { rank: 1, col: 'col-start-2', h: 'h-64', bg: 'bg-pink text-white', delay: 900 },
  { rank: 2, col: 'col-start-1', h: 'h-44', bg: 'bg-teal text-black', delay: 300 },
  { rank: 3, col: 'col-start-3', h: 'h-32', bg: 'bg-teal-dark text-white', delay: 0 },
];

export function Podium({ rows }: { rows: Ranked[] }) {
  return (
    <ol className="mx-auto grid max-w-4xl grid-cols-3 items-end gap-4" aria-label="Podium">
      {STEPS.map((s) => {
        const on = rows.filter((r) => r.rank === s.rank);
        if (!on.length) return null;
        return (
          <li key={s.rank} className={`${s.col} row-start-1 flex flex-col items-center gap-3`}>
            <div className="flex flex-col items-center animate-pop-in" style={{ animationDelay: `${s.delay + 700}ms` }}>
              {on.map((r) => (
                <span key={r.number} className="font-display text-3xl uppercase">Group {r.number}</span>
              ))}
            </div>
            <div className={`clip-angle grid w-full origin-bottom animate-grow-up place-items-center ${s.h} ${s.bg}`} style={{ animationDelay: `${s.delay}ms` }}>
              <span className="font-display text-7xl">{s.rank}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** `const { message, show } = useToast(); ... if (!ack.ok) show(ack.error); ... <Toast message={message} />` */
export function useToast(ms = 4000) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((m: string) => {
    setMessage(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), ms);
  }, [ms]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { message, show };
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2">
      <div className="animate-pop-in clip-angle flex items-center gap-4 bg-pink py-3 pr-8 pl-3 text-white">
        <span aria-hidden className="stripes block h-8 w-10 border-2 border-white" />
        <span className="text-lg font-bold">{message}</span>
      </div>
    </div>
  );
}

export function Banner({ connected }: { connected: boolean }) {
  if (connected) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-4 bg-black/90 py-2">
      <span aria-hidden className="stripes h-4 w-16" />
      <span className="animate-flicker font-display text-xl uppercase tracking-widest text-pink">Reconnecting…</span>
      <span aria-hidden className="stripes h-4 w-16" />
    </div>
  );
}
