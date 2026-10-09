# Classroom Investment Game — Design Spec

Date: 2026-10-10
Status: Approved design (pending spec review)

## 1. Purpose

A multiplayer classroom game that teaches how economic events affect cash, stocks and bonds. A facilitator runs it from a host laptop; up to 6 student groups play on one laptop each. MVP for a single class presentation (≤60 students, i.e. ≤7 connected devices).

## 2. Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Sessions | One global game. Host view at `/host` protected by a PIN (`HOST_PIN` env var). Host has a "Reset game" button. |
| Answer reveal | Host clicks "Reveal answer". Button unlocks when the 20 s timer ends or all groups have answered. |
| Slow bonus choice | Host may reveal the chart anyway; any unchosen bonus goes 100% into cash. |
| Slow allocation | Host may reveal Event 1 anyway; a group with no allocation gets ₩1,000 cash. |
| Late join | Joining is closed once the host clicks "Start game". |
| Lost device | Host can "Release Group X"; a new device can then claim X and inherits its holdings. |
| Answer lock | Group selects an option, then presses "Lock in". No changes after lock-in. |
| Rounding | Every holding is rounded to the nearest ₩ (`Math.round`) after each round's % effect. Stored values are always integers. |
| Group's own view | Group sees its own per-asset breakdown and total. Host ranking shows totals only. |
| Podium | Shown on host and all group screens. |
| Sound | None. |
| Hosting | One Render free web service (Express serves API + Socket.IO + built React app). |
| Database | Neon free Postgres; one row holding the game state as JSON. |

## 3. Tech stack

- Backend: Node + Express + Socket.IO, TypeScript, run with `tsx` in dev, compiled for prod.
- Frontend: React + TypeScript (Vite), Tailwind CSS v4.
- DB: Postgres via `pg`. If `DATABASE_URL` is unset, the server runs in-memory (dev convenience).
- Tests: `node:test` for pure game logic.
- One `package.json` at repo root.

## 4. Architecture

Server-authoritative state. The server holds one `GameState` object. Clients send intents over Socket.IO; the server validates them with pure functions, mutates state, persists it, and broadcasts the full (sanitised) state to every socket. Clients only render.

```
shared/        types.ts (GameState etc.), events.ts (the 4 events' data)
server/        index.ts (Express + Socket.IO + static), game.ts (pure logic), db.ts (load/save), game.test.ts
client/        Vite app: main.tsx, App.tsx (routes), Host.tsx, Group.tsx, components/*
```

### 4.1 Game state

```ts
type Asset = 'cash' | 'stocks' | 'bonds';
type Holdings = Record<Asset, number>;               // integer ₩
type Phase = 'lobby' | 'allocating' | 'event' | 'question' | 'answer' | 'results' | 'podium';

interface Group {
  number: number;          // 1..7
  token: string | null;    // secret, never broadcast; null after host "Release"
  holdings: Holdings | null; // null until allocated
  answer: number | null;   // option index for current round
  bonusAsset: Asset | null;  // for current round, if correct
  connected: boolean;
}

interface GameState {
  phase: Phase;
  round: number;            // 0..3 (index into EVENTS)
  deadline: number | null;  // epoch ms when question timer ends
  groups: Group[];
}
```

Broadcast payload = `GameState` with tokens stripped, plus `serverNow` (epoch ms) for clock offset. The current event's correct-answer index is only included from phase `answer` onward, so the answer can't be read early from the network.

### 4.2 Events data (`shared/events.ts`)

| # | Title | Correct | Stocks | Bonds | Cash |
|---|---|---|---|---|---|
| 1 | AI Boom | A | +40% | −3% | 0% |
| 2 | KOSPI Crash | B | −20% | +3% | 0% |
| 3 | Domestic interest-rate hike | A | −2% | −3% | 0% |
| 4 | Bond market crisis | B | 0% | 0% | 0% |

Question and option text copied verbatim from the PRD. No explanations.

### 4.3 Phase flow and host actions

| Phase | Host button | Effect / guard |
|---|---|---|
| lobby | Start game | ≥1 group joined → `allocating`; joining closes |
| allocating | Reveal Event 1 | unallocated groups get `{cash:1000, stocks:0, bonds:0}` → `event` |
| event | Start timer | `deadline = now + 20000`, clear answers → `question` |
| question | Reveal answer | enabled when `now ≥ deadline` or all groups answered → `answer` |
| answer | Reveal chart | correct groups without `bonusAsset` → cash; add ₩200 to chosen asset; apply % effects with rounding → `results` |
| results | Next event / Show podium | `round < 3` → `round+1`, `event`; else `podium` |
| any | Reset game | back to empty `lobby` (confirm in UI) |
| any | Release Group X | in lobby: deletes group X. After lobby: clears group X's token (sets it to `null`) so a new device can claim X and inherit its state |

### 4.4 Group actions

- `join(number)`: integer 1–7. In lobby: rejected if X already exists or 6 groups exist. After lobby: allowed only if group X exists with `token === null` (released); otherwise rejected ("joining closed" / "taken"). Returns token; client stores it in localStorage.
- `resume(token)`: reattaches socket to its group.
- `allocate({cash, stocks, bonds})`: phase `allocating`, each a non-negative multiple of 10, sum exactly 1000. Can be resubmitted until Event 1 is revealed.
- `answer(index)`: phase `question`, `now ≤ deadline + 500ms` grace, only once.
- `chooseBonus(asset)`: phase `answer`, group answered correctly; can change until chart is revealed.

### 4.5 Money logic (pure, in `server/game.ts`)

- `validateAllocation(h)`: integers, ≥0, multiples of 10, sum = 1000.
- `applyRound(holdings, bonusAsset|null, effects)`: if bonus, `holdings[bonusAsset] += 200`; then each asset `Math.round(value * (1 + pct/100))`.
- `total(h)`: sum.
- `rank(groups)`: sort by total desc; standard competition ranking; tied labels get `=` suffix (e.g. `1`, `2=`, `2=`, `4`).
- `podium(groups)`: groups with rank ≤ 3 (ties share a step; e.g. two tied 1st → both on step 1, next is 3rd).

Example: stocks ₩500 + bonus to stocks → ₩700 → +40% → ₩980.

### 4.6 Timer sync

Clients compute `offset = serverNow − Date.now()` on each broadcast and render `deadline − (Date.now() + offset)`. Server is the authority on late answers.

### 4.7 Persistence

`db.ts`: `CREATE TABLE IF NOT EXISTS game_state (id int primary key, state jsonb)`. `load()` on boot; `save(state)` after every mutation (serialised: latest write wins, no overlapping writes). Tokens are persisted (needed for resume) but never broadcast.

### 4.8 Host auth

Host socket sends `hostAuth(pin)`; server marks the socket as host on match. All host actions check that flag. PIN cached in the host browser's localStorage. Not high security — classroom-grade.

## 5. UI

### 5.1 Host view (`/host`)

- PIN gate.
- Top control bar: phase label, round, primary action button (one per phase as in 4.3), Reset.
- Stage: content for current phase — lobby join list; event title card; question with giant countdown and "X/Y answered"; answer reveal; bar chart; ranking table.
- Side panel: group status chips (connected, allocated, answered, bonus chosen) with Release button.
- Ranking table: rank label + "Group X" + total ₩. No deltas, no breakdown.
- Podium at end: top-3 steps, ties share a step.

### 5.2 Group view (`/`)

- Join: "What is your group number?" numeric input 1–7, errors for invalid/taken/closed.
- Then header "Group X" throughout.
- Allocate: three inputs (step 10) with live total; submit disabled unless total = ₩1,000.
- Waiting screens between steps.
- Question: options A–D, select + "Lock in", countdown.
- Answer: correct/incorrect reveal; if correct, choose one asset for ₩200 (three big buttons).
- Results: chart + own holdings breakdown + total.
- Podium.

### 5.3 Visual design

- Palette ONLY: `#ed1b76`, `#f44786`, `#ffffff`, `#249f9c`, `#037a76`, `#000000` (Tailwind v4 `@theme` tokens; no other colours, including greys — use opacity of white/black if needed).
- Original "survival game show" look: black stage, bold diagonal hazard stripes, chevrons, hexagon frames, sharp angles. Avoid circle/triangle/square trio and any existing show imagery.
- Fonts: Anton (display), Space Grotesk (body), via Google Fonts.
- Countdown: huge numerals + depleting ring; last 5 s pink pulse + shake.
- Answer reveal: ~1.5 s suspense (options flicker), then wrong options fade, correct flashes teal.
- Chart: CSS bars around a zero line, animated grow-in, labels like `+40%`.
- Money format: `₩` + `toLocaleString('en-US')` of integer.
- Laptop screens, English only.

## 6. Error handling

- Invalid intents → server replies with an error message shown as a toast on the sender; state unchanged.
- Socket disconnect → client shows "Reconnecting…" banner; Socket.IO auto-reconnects and resumes via token/PIN.
- DB save failure → logged; game continues from memory.

## 7. Testing

- `server/game.test.ts` (`node:test`): allocation validation, bonus-then-effect compounding (PRD example), rounding, competition ranking with ties, podium with ties, answer timing guard.
- Manual: host tab + 3 group tabs; play all 4 rounds; refresh host and a group mid-question; release and reclaim a group.

## 8. Deployment

- Render web service: build `npm ci && npm run build`, start `npm start`. Env: `HOST_PIN`, `DATABASE_URL` (Neon), `NODE_ENV=production`.
- Free tier sleeps after 15 min idle (~1 min cold start): open the site before class.

## 9. Out of scope

Multiple simultaneous games, accounts, sound, answer explanations, projector layout, mobile layout, i18n.
