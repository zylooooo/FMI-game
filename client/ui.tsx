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
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b-2 border-white/10 px-4 py-3 sm:px-8 sm:py-4">
          <div className="flex items-center gap-4">
            <Chevrons />
            <h1 className="font-display text-3xl uppercase tracking-wide sm:text-4xl">{title}</h1>
          </div>
          {right && <div className="flex flex-wrap items-center gap-4">{right}</div>}
        </div>
      </header>
      <main className="flex-1 px-4 py-4 sm:px-8 sm:py-6">{children}</main>
    </div>
  );
}

const VARIANTS = {
  pink: 'bg-pink text-white group-hover:bg-pink-light',
  teal: 'bg-teal text-black group-hover:bg-white',
  ghost: 'bg-white/10 text-white group-hover:bg-white/20',
};

export function Button({
  variant = 'pink', disabled, onClick, children, type = 'button', className = '', href,
}: {
  variant?: keyof typeof VARIANTS; disabled?: boolean; onClick?: () => void; children: ReactNode;
  type?: 'button' | 'submit'; className?: string; href?: string;
}) {
  // Clip-path lives on the inner span so the focus outline on the button isn't clipped away.
  const cls = `group cursor-pointer focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white disabled:pointer-events-none disabled:opacity-40 ${className}`;
  const inner = (
    <span className={`clip-angle block px-6 py-3 font-display text-xl uppercase sm:px-8 sm:py-4 sm:text-2xl tracking-wider transition-colors ${VARIANTS[variant]}`}>
      {children}
    </span>
  );
  if (href) return <a href={href} className={`block text-center ${cls}`}>{inner}</a>;
  return <button type={type} disabled={disabled} onClick={onClick} className={cls}>{inner}</button>;
}

/** Pass `now` straight from useGame(); the component ticks itself. */
export function Countdown({ deadline, now, totalMs = QUESTION_MS }: { deadline: number; now: () => number; totalMs?: number }) {
  useTick(200);
  const left = Math.max(0, deadline - now());
  const secs = Math.ceil(left / 1000);
  const urgent = secs > 0 && secs <= 5;
  const color = secs > 5 ? 'stroke-teal' : 'stroke-pink';
  return (
    <div role="timer" aria-label={secs ? `${secs} seconds left` : "Time's up"} className={`relative size-36 sm:size-48 lg:size-64 ${urgent ? 'animate-shake' : ''}`}>
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
          <span className={`font-display text-6xl tabular-nums sm:text-7xl lg:text-8xl ${urgent ? 'text-pink' : 'text-white'}`}>{secs}</span>
        ) : (
          <span className="animate-pop-in text-center font-display text-2xl leading-none text-pink sm:text-4xl">TIME'S<br />UP</span>
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
    <div className="grid grid-cols-3 gap-3 sm:gap-10" role="list" aria-label="Market effects">
      {ASSETS.map((a, i) => {
        const v = effects[a];
        const h = `max(6px, ${(Math.abs(v) / max) * 85}%)`;
        const delay = { animationDelay: `${i * 300}ms` };
        const label = <span className="animate-pop-in font-display text-2xl sm:text-3xl" style={{ animationDelay: `${i * 300 + 600}ms` }}>{pct(v)}</span>;
        return (
          <div key={a} role="listitem" aria-label={`${LABEL[a]} ${pct(v)}`} className="flex flex-col items-center">
            <div className="relative flex h-56 w-full flex-col sm:h-80">
              <div className={`flex flex-1 flex-col items-center justify-end gap-2 ${v === 0 ? 'pb-4' : ''}`}>
                {v >= 0 && label}
                {v > 0 && <div className="clip-angle w-14 origin-bottom sm:w-24 animate-grow-up bg-teal" style={{ height: h, ...delay }} />}
              </div>
              <div className="relative h-1 w-full bg-white">
                {v === 0 && <div className="absolute top-1/2 left-1/2 h-4 w-14 -translate-1/2 sm:w-24 animate-pop-in bg-white" style={delay} />}
              </div>
              <div className="flex flex-1 flex-col items-center justify-start gap-2">
                {v < 0 && <div className="clip-angle w-14 origin-top sm:w-24 animate-grow-up bg-pink" style={{ height: h, ...delay }} />}
                {v < 0 && label}
              </div>
            </div>
            <span className="mt-3 font-display text-lg uppercase tracking-wider sm:text-2xl">{LABEL[a]}</span>
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
            <td className="w-16 py-2 pl-2 sm:w-20 sm:pl-3">
              <span className={`clip-hex grid h-10 w-12 place-items-center font-display text-xl sm:h-12 sm:w-14 sm:text-2xl ${r.rank === 1 ? 'bg-pink text-white' : 'bg-teal-dark text-white'}`}>
                {r.label}
              </span>
            </td>
            <td className="font-display text-xl uppercase sm:text-3xl">Group {r.number}</td>
            <td className="pr-3 text-right font-display text-xl tabular-nums sm:pr-6 sm:text-3xl">{won(r.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const STEPS = [
  { rank: 1, col: 'col-start-2', h: 'h-40 sm:h-64', bg: 'bg-pink text-white', delay: 900 },
  { rank: 2, col: 'col-start-1', h: 'h-28 sm:h-44', bg: 'bg-teal text-black', delay: 300 },
  { rank: 3, col: 'col-start-3', h: 'h-20 sm:h-32', bg: 'bg-teal-dark text-white', delay: 0 },
];

export function Podium({ rows }: { rows: Ranked[] }) {
  return (
    <ol className="mx-auto grid max-w-4xl grid-cols-3 items-end gap-2 sm:gap-4" aria-label="Podium">
      {STEPS.map((s) => {
        const on = rows.filter((r) => r.rank === s.rank);
        if (!on.length) return null;
        return (
          <li key={s.rank} className={`${s.col} row-start-1 flex flex-col items-center gap-3`}>
            <div className="flex flex-col items-center animate-pop-in" style={{ animationDelay: `${s.delay + 700}ms` }}>
              {on.map((r) => (
                <span key={r.number} className="text-center font-display text-lg uppercase sm:text-3xl">Group {r.number}</span>
              ))}
            </div>
            <div className={`clip-angle grid w-full origin-bottom animate-grow-up place-items-center ${s.h} ${s.bg}`} style={{ animationDelay: `${s.delay}ms` }}>
              <span className="font-display text-5xl sm:text-7xl">{s.rank}</span>
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
    <div role="alert" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center sm:bottom-8">
      <div className="animate-pop-in clip-angle flex items-center gap-4 bg-pink py-3 pr-8 pl-3 text-white">
        <span aria-hidden className="stripes block h-8 w-10 border-2 border-white" />
        <span className="font-bold sm:text-lg">{message}</span>
      </div>
    </div>
  );
}

export function Banner({ connected }: { connected: boolean }) {
  if (connected) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-4 bg-black/90 py-2">
      <span aria-hidden className="stripes h-4 w-8 sm:w-16" />
      <span className="animate-flicker font-display text-lg sm:text-xl uppercase tracking-widest text-pink">Reconnecting…</span>
      <span aria-hidden className="stripes h-4 w-8 sm:w-16" />
    </div>
  );
}
