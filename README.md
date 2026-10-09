# Market Survival — classroom investment game

A real-time multiplayer game that teaches how economic events move cash, stocks and bonds.
A facilitator runs it from a host laptop at `/host`; up to 6 student groups (group numbers 1–7)
play on one laptop each at `/`.

Each group splits ₩1,000 between cash, stocks and bonds. Then four events play out
(AI Boom, KOSPI Crash, rate hike, bond market crisis). For each one the groups answer a
20-second question. Groups that answer correctly put a ₩200 bonus into an asset of their choice,
then the event's % effects hit every portfolio. Rankings follow each event, and a podium ends the game.

Stack: Express 5 + Socket.IO server (TypeScript run directly by Node 24's native type stripping),
React 19 + Vite + Tailwind v4 client, optional Neon Postgres for persistence.

## Local development

Requires Node 24.

```sh
npm install
npm run dev
```

- Host: http://localhost:5173/host (default dev PIN `1234`)
- Groups: http://localhost:5173/. To play several groups in one browser, give each tab its own
  `?slot=N`, e.g. `http://localhost:5173/?slot=1`, `?slot=2`, … (each slot keeps its own group token).

Without `DATABASE_URL`, game state lives in memory and is lost on restart.

Other scripts: `npm test`, `npm run typecheck`, `npm run build` (builds the client into `dist/`),
`npm start` (serves `dist/` + the game server on `PORT`, default 3000).

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `HOST_PIN` | Yes in production | PIN for `/host`. Use a long, non-guessable value. If unset, it defaults to `1234`. |
| `DATABASE_URL` | Yes in production | Postgres connection string (Neon). If unset, the game is kept in memory, so a restart or redeploy wipes it. |
| `PORT` | No | HTTP port (default 3000; Render sets this for you). |

Do not set `NODE_ENV`. The server doesn't read it.

## Neon setup (free Postgres)

1. Sign up at https://neon.tech and create a free project.
2. On the project dashboard, open **Connect** and copy the connection string. It looks like
   `postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`.
   Keep `sslmode=require`.
3. Use it as `DATABASE_URL`. The server creates its single `game_state` table on first boot.

## Deploy on Render (free tier)

1. Push this repo to GitHub.
2. In Render: **New → Web Service**, connect the GitHub repo.
3. Settings:
   - Runtime: **Node** (version 24 comes from `engines` in `package.json`)
   - Build command: `npm ci --include=dev && npm run build`
     (Vite/Tailwind are devDependencies and must be installed for the build)
   - Start command: `npm start`
   - Instance type: **Free**
4. Environment: add `HOST_PIN` and `DATABASE_URL`. Don't add `NODE_ENV`.
5. Deploy. Groups open `https://<your-app>.onrender.com/` and the host opens `https://<your-app>.onrender.com/host`.

## Class-day checklist

- **Open the site about 2 minutes before class.** The free instance sleeps after 15 minutes idle and takes around a minute to wake.
- Rehearse beforehand: host in one tab, several groups in `?slot=1`, `?slot=2`, `?slot=3` tabs, and play all 4 events. Click **Reset game** afterwards.
- On the day, the host keeps `/host` open the whole time on the presenting laptop.
- If a group's laptop dies: on the host, click **Release** for that group. The group can then join with the same number on another device and keeps its money.
- Refreshing a page is safe. Groups and the host reconnect automatically.
