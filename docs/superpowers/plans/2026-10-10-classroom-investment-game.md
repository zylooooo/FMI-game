# Classroom Investment Game — Implementation Plan

> **For agentic workers:** execute with subagent-driven development. Each task is self-contained; tasks marked **[parallel]** may run concurrently once their dependencies are done. Commit after each task. Follow the spec: `docs/superpowers/specs/2026-10-10-classroom-investment-game-design.md`.

**Goal:** Real-time multiplayer classroom investment game (host view + group view) per the spec.

**Architecture:** Server-authoritative. Express + Socket.IO holds one `GameState`, validates intents via pure functions, persists to Postgres (or memory), broadcasts a sanitised `PublicState` to all sockets. React clients only render and send intents.

**Tech stack:** Node 25, TypeScript, Express 5, Socket.IO 4, `pg`, React 19, Vite 8, Tailwind CSS 4 (`@tailwindcss/vite`), Node's built-in TypeScript type stripping (`node server/index.ts`, no tsx, no server compile step), `node:test`. No Docker: Render native Node runtime.

**Deviation from spec §4:** pure money/ranking helpers live in `shared/logic.ts` (not `server/game.ts`) because the host UI also needs ranking/podium. `server/game.ts` holds state transitions only. No react-router: two routes, chosen by `location.pathname`.

**Type-stripping rules (apply to ALL `.ts`/`.tsx` files):** relative imports include the extension (`import { EVENTS } from '../shared/events.ts'`); type-only imports use `import type`; no `enum`, `namespace`, or constructor parameter properties (enforced by `erasableSyntaxOnly`).

---

## File map

```
package.json, tsconfig.json, vite.config.ts, index.html, .gitignore, README.md
shared/types.ts        all shared types + Ack/HostAction protocol types
shared/events.ts       the 4 events (verbatim PRD text)
shared/logic.ts        constants, validateAllocation, applyRound, total, rank, podium, won()
shared/logic.test.ts
server/game.ts         state transitions (mutating, returns Ack)
server/game.test.ts
server/db.ts           load()/save() via pg, or no-op if no DATABASE_URL
server/index.ts        Express + Socket.IO wiring + static serving
client/main.tsx        mount; route by pathname
client/index.css       Tailwind import + @theme palette/fonts + keyframes
client/socket.ts       useGame() hook: socket, state, clock offset, emit helper with ack
client/ui.tsx          shared components: Shell, Button, Countdown, EffectChart, RankingTable, Podium, Toast, Money
client/Host.tsx
client/Group.tsx
```

## Socket protocol (contract shared by Tasks 3, 4, 5, 6)

Client → server, every event takes an ack callback `(res: Ack) => void`:

| Event | Payload | Notes |
|---|---|---|
| `host:auth` | `pin: string` | marks socket as host |
| `host:action` | `HostAction` | requires host socket |
| `group:join` | `number: number` | ack `{ok:true, token, number}` |
| `group:resume` | `token: string` | ack `{ok:true, number}` |
| `group:allocate` | `Holdings` | requires resumed/joined socket |
| `group:answer` | `index: number` | |
| `group:bonus` | `Asset` | |

Server → client: `state` with `PublicState`, emitted to every socket after any successful mutation, on connect, and on any (dis)connect of a group socket.

---

## Task 1: Scaffold + shared code (sequential, blocks everything)

**Files:** `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `client/main.tsx` (placeholder), `client/index.css`, `shared/types.ts`, `shared/events.ts`, `shared/logic.ts`, `shared/logic.test.ts`

- [ ] **1.1** `package.json` (`"type": "module"`, `"private": true`, `"engines": {"node": ">=22.18"}`). Scripts:
  ```json
  {
    "dev": "concurrently -k \"node --watch server/index.ts\" \"vite\"",
    "build": "vite build",
    "start": "node server/index.ts",
    "test": "node --test shared/*.test.ts server/*.test.ts",
    "typecheck": "tsc --noEmit"
  }
  ```
  Dependencies: `express socket.io pg`. Dev: `typescript @types/express @types/node @types/pg @types/react @types/react-dom react react-dom socket.io-client vite @vitejs/plugin-react tailwindcss @tailwindcss/vite concurrently`. (Render build command is `npm ci --include=dev && npm run build` so Vite/Tailwind devDeps are present.) If TypeScript 7 rejects the config, pin `typescript@^5`.
- [ ] **1.2** `tsconfig.json`: `strict`, `target ES2022`, `module ESNext`, `moduleResolution Bundler`, `jsx react-jsx`, `noEmit`, `allowImportingTsExtensions true`, `verbatimModuleSyntax true`, `erasableSyntaxOnly true`, `skipLibCheck`, include `shared server client`.
- [ ] **1.3** `vite.config.ts`: plugins `react()`, `tailwindcss()`; `build.outDir: 'dist'`; dev `server.proxy` `'/socket.io': { target: 'http://localhost:3000', ws: true }`. `index.html` at root loads `/client/main.tsx`, title "Market Survival", Google Fonts link for Anton + Space Grotesk (400/700).
- [ ] **1.4** `client/index.css`:
  ```css
  @import "tailwindcss";
  @theme {
    --color-*: initial;           /* palette ONLY */
    --color-pink: #ed1b76;
    --color-pink-light: #f44786;
    --color-white: #ffffff;
    --color-teal: #249f9c;
    --color-teal-dark: #037a76;
    --color-black: #000000;
    --color-transparent: transparent;
    --font-display: "Anton", sans-serif;
    --font-body: "Space Grotesk", sans-serif;
  }
  html, body, #root { height: 100%; }
  body { @apply bg-black text-white font-body; }
  ```
  Keyframes (`shake`, `pulse-pink`, `flicker`, `grow-up`, `pop-in`) are added in Task 4.
- [ ] **1.5** `shared/types.ts`:
  ```ts
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
  ```
- [ ] **1.6** `shared/events.ts`: `export interface GameEvent { title: string; question: string; options: string[]; correct: number; effects: Holdings /* % */ }` and `export const EVENTS: GameEvent[]` with the 4 events, question/option text copied verbatim from the PRD (without "A."/"B." prefixes and without the `[CORRECT]` markers). Correct: 0, 1, 0, 1. Effects: `{stocks:40,bonds:-3,cash:0}`, `{stocks:-20,bonds:3,cash:0}`, `{stocks:-2,bonds:-3,cash:0}`, `{stocks:0,bonds:0,cash:0}`.
- [ ] **1.7** Write `shared/logic.test.ts` first (fails), then `shared/logic.ts`:
  ```ts
  export const START = 1000, STEP = 10, BONUS = 200, QUESTION_MS = 20_000, GRACE_MS = 500, MAX_GROUPS = 6;
  export function validateAllocation(h: Holdings): string | null      // null = ok; error message otherwise
  export function applyRound(h: Holdings, bonus: Asset | null, effects: Holdings): Holdings // pure; bonus first, then Math.round(v*(1+pct/100))
  export function total(h: Holdings): number
  export interface Ranked { number: number; total: number; rank: number; label: string }
  export function rank(entries: { number: number; total: number }[]): Ranked[]   // desc by total, tie-break by group number; competition ranking; label `${rank}` or `${rank}=` when tied
  export function podium(r: Ranked[]): Ranked[]                         // r.filter(x => x.rank <= 3)
  export const won = (n: number) => '₩' + Math.round(n).toLocaleString('en-US');
  ```
  `validateAllocation` checks: each value is an integer, ≥ 0, multiple of 10; sum === 1000; keys exactly the 3 assets.
  Tests (each an `assert` in `node:test`):
  - valid `{cash:300,stocks:500,bonds:200}` → null; `{0,0,1000}` → null; sum 990 → error; `{cash:305,...}` → error; negative → error; `1.5` → error.
  - PRD example: `applyRound({cash:300,stocks:500,bonds:200}, 'stocks', {stocks:40,bonds:-3,cash:0})` → `{cash:300, stocks:980, bonds:194}`.
  - rounding: `applyRound({cash:0,stocks:333,bonds:0}, null, {stocks:-3,...})` → stocks 323 (323.01 → 323); `{bonds:194}` with +3% → 200 (199.82 → 200).
  - compounding: apply events 1→4 to `{cash:0,stocks:1000,bonds:0}` with no bonus → 1400 → 1120 → 1098 (1097.6) → 1098.
  - rank: totals `[1200,1100,1100,900]` → labels `['1','2=','2=','4']`; all equal → all `'1='`; single → `'1'`.
  - podium: `[1000,1000,900,800]` → 3 entries (two at rank 1, one at rank 3); `[1000,900,900,900,800]` → 4 entries.
  - `won(1234.6)` → `'₩1,235'`.
- [ ] **1.8** `npm install`, `npm test` (green), `npm run typecheck`. Commit `feat: scaffold project and shared game logic`.

---

## Task 2: Server state transitions — `server/game.ts` (TDD) [parallel with Task 4]

**Depends on:** Task 1. **Files:** `server/game.ts`, `server/game.test.ts`

Functions mutate `s` in place and return `Ack`. `now` is injected for testability.

```ts
export function newGame(): GameState                       // {phase:'lobby', round:0, deadline:null, groups:[]}
export function join(s, number: unknown, token: string): Ack
export function resume(s, token: string): Ack              // {ok:true, number}
export function allocate(s, token: string, h: Holdings): Ack
export function answer(s, token: string, index: unknown, now: number): Ack
export function chooseBonus(s, token: string, asset: unknown): Ack
export function hostAction(s, a: HostAction, now: number): Ack
export function toPublic(s, now: number, connected: Set<number>): PublicState
```

Rules (spec §4.3–4.4):
- `join`: `number` must be integer 1–7 ("Enter a whole number from 1 to 7"). Lobby: reject if exists ("Group X is already taken") or `groups.length >= MAX_GROUPS` ("The game is full"); else push new group, keep `groups` sorted. Not lobby: allowed only if group exists with `token === null` → set token; else "The game has already started".
- Group-scoped actions look up the group by token; unknown → "Not joined".
- `allocate`: phase `allocating` only; `validateAllocation`; sets holdings (resubmittable).
- `answer`: phase `question`; `now <= deadline + GRACE_MS` ("Time's up"); `answer === null` ("Already locked in"); index integer 0–3.
- `chooseBonus`: phase `answer`; group's answer === `EVENTS[round].correct` else "Only correct groups get a bonus"; asset ∈ ASSETS. Changeable.
- `hostAction`:
  - `start`: lobby, ≥1 group → `allocating`.
  - `revealEvent`: allocating → set unallocated holdings to `{cash:1000,stocks:0,bonds:0}`; → `event`.
  - `startTimer`: event → clear every group's `answer`/`bonusAsset`; `deadline = now + QUESTION_MS`; → `question`.
  - `revealAnswer`: question; require `now >= deadline || every group answered` ("Timer still running"); → `answer`.
  - `revealChart`: answer → for each group: `bonus = answer === correct ? (bonusAsset ?? 'cash') : null`; `holdings = applyRound(holdings, bonus, effects)`; → `results`.
  - `next`: results → `round < 3` ? `round++`, `event` : `podium`; `deadline = null`.
  - `reset`: replace contents with `newGame()` (mutate: `Object.assign(s, newGame())`).
  - `release`: lobby → remove group; else set its token null. Unknown group → error.
  - Any action in the wrong phase → `{ok:false, error:'Not allowed right now'}`.
- `toPublic`: strip tokens; `answered = answer !== null`; `correct` (group and top-level) only when phase ∈ `answer|results|podium` (for `results/podium`, still based on the round's answer); `connected = connected.has(number)`; `released = token === null`.

Tests (`server/game.test.ts`), at minimum:
- join validation: 0, 8, 2.5, "3" rejected; duplicate rejected; 7th group rejected; join after start rejected; join released number after start succeeds and inherits holdings.
- full happy path for 2 groups across 4 events: group 1 allocates `{300,500,200}`, answers correctly every round, bonus to stocks; group 2 never allocates (gets cash 1000), never answers. Assert group 1 after event 1 is `{cash:300,stocks:980,bonds:194}`, group 2 stays `{1000,0,0}` throughout; final phase `podium`.
- correct group with no bonus choice gets +200 cash.
- late answer (`now = deadline + 501`) rejected; answer within grace accepted; second answer rejected.
- `revealAnswer` before deadline with not-all-answered rejected; allowed when all answered.
- `toPublic` hides tokens and hides `correct` during `question`.
- wrong-phase host action rejected; reset returns to lobby with no groups.

Commit `feat: server game state transitions`.

---

## Task 3: Server wiring — `server/db.ts`, `server/index.ts`

**Depends on:** Task 2. **Files:** `server/db.ts`, `server/index.ts`

- [ ] **3.1** `db.ts`:
  ```ts
  export async function load(): Promise<GameState | null>
  export function save(s: GameState): void   // fire-and-forget, serialised
  ```
  If `process.env.DATABASE_URL` unset: `load` → null, `save` no-op (log once "No DATABASE_URL, state in memory only"). Else `pg.Pool({ connectionString, max: 2 })` (Neon strings include `sslmode=require`; keep TLS verification on); on first load run `CREATE TABLE IF NOT EXISTS game_state (id int PRIMARY KEY, state jsonb NOT NULL)`; `SELECT state FROM game_state WHERE id=1`. `save`: keep a `pending` snapshot (`structuredClone`) and a `writing` flag; when a write finishes, if a newer snapshot is pending write it (latest wins, never overlapping). Query: `INSERT ... VALUES (1,$1) ON CONFLICT (id) DO UPDATE SET state=EXCLUDED.state`. Errors → `console.error`, game continues.
- [ ] **3.2** `index.ts`:
  - `const state = (await load()) ?? newGame()`.
  - Express app, `http.createServer`, `new Server(httpServer)` (same origin, no CORS).
  - In production serve `dist/` with `express.static`, and fallback `app.get(/.*/, (_, res) => res.sendFile(dist/index.html))` (Express 5 regex route) so `/host` works.
  - `HOST_PIN = process.env.HOST_PIN ?? '1234'` (log a warning when defaulted). `PORT = process.env.PORT ?? 3000`.
  - Per socket: `socket.data.isHost`, `socket.data.token`. Track `connected: Map<number, number>` (group number → open socket count) derived on demand: compute set from `io.sockets.sockets` whose `data.token` resolves to a group.
  - `broadcast()`: for each socket `socket.emit('state', toPublic(state, Date.now(), connectedSet()))`; i.e. `io.emit` once with the same payload (payload is identical for everyone).
  - `commit(ack)`: if `ack.ok` → `save(state)`, `broadcast()`.
  - Handlers per the protocol table; wrap each in a guard that ensures `typeof ack === 'function'` and catches exceptions → `ack({ok:false,error:'Server error'})`.
  - `group:join`: token = `crypto.randomUUID()`; on success set `socket.data.token`.
  - `group:resume`: on success set `socket.data.token`, broadcast (connection status changed).
  - `host:action` reset: after success, also tell all sockets the tokens are void — clients detect this when `resume` fails / their number is gone (see Task 6).
  - On `connect` emit current state to that socket; on `disconnect` broadcast.
- [ ] **3.3** Smoke test: `npm run start` with no env; a throwaway node script (scratchpad, not committed) using `socket.io-client` that joins group 1, auths host, starts, allocates, prints the state. Commit `feat: express + socket.io server with persistence`.

---

## Task 4: Client foundation — socket hook, theme, shared UI [parallel with Tasks 2–3]

**Depends on:** Task 1. **Files:** `client/main.tsx`, `client/socket.ts`, `client/ui.tsx`, `client/index.css`

Use the frontend-design / ui-ux-pro-max guidance for visual quality. Palette ONLY the 6 theme colours (opacity modifiers like `bg-white/10` allowed). No circle/triangle/square trio; use diagonal hazard stripes, chevrons, hexagon clip-paths, sharp angled clip-paths.

- [ ] **4.1** `main.tsx`: `createRoot(...).render(location.pathname.startsWith('/host') ? <Host/> : <Group/>)`. Import `./index.css`.
- [ ] **4.2** `socket.ts`:
  ```ts
  export function useGame(): {
    state: PublicState | null;
    connected: boolean;
    now: () => number;                                  // Date.now() + server offset
    emit: (event: string, payload?: unknown) => Promise<Ack>;  // socket.emitWithAck-style with 5 s timeout → {ok:false,error:'Connection problem'}
    onConnect: (fn: () => void) => void;                // used to re-auth / resume after reconnect
  }
  export function useTick(ms = 200): number             // re-render ticker for countdowns
  ```
  Single module-level `io()` socket (same origin). Offset updated from each `state.serverNow`.
- [ ] **4.3** `index.css` keyframes + utilities: `.stripes` (repeating-linear-gradient 45° pink/black hazard band), `.clip-angle` (polygon with cut corners), `.clip-hex`, animations `shake`, `pulse-pink`, `flicker`, `grow-up` (scaleY from 0, origin bottom/top), `pop-in`. Respect `prefers-reduced-motion` (disable shake/flicker).
- [ ] **4.4** `ui.tsx` components (all typed props, no external libs):
  - `Shell({title, right, children})`: full-height black stage, top bar with stripe band, bold display title.
  - `Button({variant:'pink'|'teal'|'ghost', disabled, onClick, children})`: chunky angled clip-path, display font, big hit area, visible focus ring (white).
  - `Countdown({deadline, now, totalMs})`: huge numerals (seconds, ceil) inside an SVG ring whose stroke-dashoffset drains; teal → pink at ≤5 s with `pulse-pink` + `shake`; shows "TIME'S UP" at 0.
  - `EffectChart({effects})`: 3 vertical bars (Cash, Stocks, Bonds) around a central zero line; positive bars teal growing up, negative pink growing down, 0% shows a flat marker; label `+40%` / `-3%` / `0%`; staggered `grow-up` animation.
  - `RankingTable({rows: Ranked[]})`: rank label (e.g. `3=`) in a hex badge, "Group X", total via `won()`. Nothing else.
  - `Podium({rows: Ranked[]})`: three steps (1st centre/tallest, 2nd left, 3rd right); tied groups share a step (list multiple "Group X" on one step); empty step hidden.
  - `Toast` + `useToast()`: transient error message (pink band) for failed acks.
  - `Banner` for "Reconnecting…" when `!connected`.
- [ ] **4.5** Temporary `client/Host.tsx`/`client/Group.tsx` stubs rendering `Shell` so the app builds. `npm run build` + `npm run typecheck` pass. Commit `feat: client foundation and UI kit`.

---

## Task 5: Host view — `client/Host.tsx` [parallel with Task 6]

**Depends on:** Tasks 3, 4.

- [ ] **5.1** PIN gate: input + "Enter". On submit `emit('host:auth', pin)`; on ok store PIN in localStorage `hostPin`. On mount and on every reconnect (`onConnect`), auto-auth with stored PIN; on failure clear it and show gate.
- [ ] **5.2** Layout: `Shell` with control bar (phase label, "Event N/4", primary action button, "Reset game" with `window.confirm`), main stage, right side panel of group chips.
- [ ] **5.3** Primary button per phase (spec §4.3): lobby "Start game" (disabled if 0 groups) → allocating "Reveal Event 1" (subtext "N/M allocated") → event "Start timer" → question "Reveal answer" (disabled until `now() >= deadline` or all answered) → answer "Reveal chart" (subtext "N correct groups still choosing") → results "Next event" or "Final results" on round 3 → podium (none).
- [ ] **5.4** Stage per phase:
  - lobby: big "Join now" instructions with site URL (`location.origin`), joined groups appearing with `pop-in`.
  - allocating: "Groups are building their portfolios" + per-group allocated tick.
  - event: dramatic title card "EVENT N" / title, stripes sweeping in.
  - question: question text, 4 options (A–D) in angled cards, `Countdown`, "X/Y locked in".
  - answer: same options; 1.5 s `flicker` suspense, then wrong options fade to 30% and correct flashes teal with `pop-in`; list of correct groups.
  - results: `EffectChart` for the round + `RankingTable` (computed with `rank(groups.map(g => ({number, total: total(holdings)})))`).
  - podium: `Podium` full stage.
- [ ] **5.5** Side panel chips: "Group X", connected dot (teal / pink-outline), status icon per phase (allocated / locked in / bonus chosen), "Release" button with confirm.
- [ ] **5.6** Manual check against `npm run dev`. Commit `feat: host view`.

---

## Task 6: Group view — `client/Group.tsx` [parallel with Task 5]

**Depends on:** Tasks 3, 4.

- [ ] **6.1** Identity: on mount and every reconnect, if localStorage `groupToken` exists → `emit('group:resume', token)`; ok → store `number`; fail → clear token, show join. Also: if `state.groups` no longer contains our number (reset) or it shows `released` while we hold a token → clear token, show join.
- [ ] **6.2** Join screen: "What is your group number?" `<input type="number" min=1 max=7 step=1>` + "Join". Client-side check integer 1–7; server errors shown inline. On ok store token.
- [ ] **6.3** After join, header "Group X" everywhere. Screens by phase:
  - lobby: "You're in, Group X. Waiting for the host to start…"
  - allocating: three inputs (Cash/Stocks/Bonds, `step=10`, min 0) + quick ±₩10/±₩100 buttons; live total "₩X / ₩1,000"; "Lock portfolio" disabled unless `validateAllocation` is null; after submit show summary + "Edit" (resubmit allowed until Event 1).
  - event: title card "EVENT N: Title".
  - question: question, 4 option buttons A–D (select) + "Lock in" button; `Countdown`; after lock-in "Locked in: B — waiting…"; after timeout without answer "Time's up — no answer".
  - answer: same 1.5 s suspense reveal as host; then "CORRECT +₩200" (teal) or "WRONG" (pink). If correct: three big asset buttons "Put ₩200 into Cash/Stocks/Bonds", selected one highlighted, changeable until chart; note "All ₩200 goes into one asset".
  - results: `EffectChart` + own holdings breakdown (3 rows with `won()`) + big total.
  - podium: `Podium` + "Your final value: ₩X".
- [ ] **6.4** Manual check with 2 group tabs (use different browser profiles or a private window, since localStorage is shared per origin within a profile; for local testing support `?slot=N` query param that namespaces the localStorage key, e.g. `groupToken:N`). Commit `feat: group view`.

---

## Task 7: Integration verification + deploy docs (sequential, last)

- [ ] **7.1** `npm test`, `npm run typecheck`, `npm run build` all pass.
- [ ] **7.2** Production-mode run: `npm run build && npm start`; open `/host` + 3 group tabs (`?slot=1..3`) at `http://localhost:3000`. Play all 4 events. Verify: allocation blocks ≠ ₩1,000; countdown in sync; reveal gating; bonus applied before %; ranking ties show `=`; podium. Refresh host and a group mid-question — state restored. Release and reclaim a group. Reset game.
- [ ] **7.3** If a Neon `DATABASE_URL` is available, restart the server mid-game and confirm state survives (otherwise note it as untested).
- [ ] **7.4** `README.md`: what it is, `npm install` / `npm run dev` (host at `http://localhost:5173/host`), env vars (`HOST_PIN`, `DATABASE_URL`, `PORT`), Render deploy steps (New Web Service from GitHub repo; build `npm ci --include=dev && npm run build`; start `npm start`; env vars; Neon: create project, copy pooled connection string), "open the site ~2 min before class to wake the free instance".
- [ ] **7.5** Commit `docs: README with run and deploy instructions`.

---

## Execution order

```
Task 1 ──┬── Task 2 ── Task 3 ──┬── Task 5 ──┬── Task 7
         └── Task 4 ────────────┴── Task 6 ──┘
```
Subagents: one for Task 1; then two in parallel (server: 2→3, client: 4); then two in parallel (5, 6); controller runs Task 7. Review each task's diff against the spec before starting dependents.
