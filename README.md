# ChessCam ♟️

Real-time online multiplayer chess — get matched with a random opponent in seconds, or share a private room link and play a friend. Built as a full-stack, low-latency real-time app.

**Stack:** React 19 · TypeScript · Vite · Tailwind · Node/Express · `ws` (WebSocket) · chess.js · Cloudflare Workers

## Features

- **Real-time multiplayer over WebSockets** — a custom netcode layer (`src/net/protocol.ts`, `roomManager.ts`, `wsClient.ts`) on top of an Express + `ws` server (`server/index.ts`) keeps both boards in sync with low latency.
- **Instant matchmaking + private rooms** — get paired with a random opponent, or create a room and share the link.
- **Server-validated moves** — rules enforced with `chess.js` (legal moves, check, checkmate, draws) so the server stays authoritative and clients can't cheat.
- **Game clock** — per-player timer with increment.
- **Reconnect handling** — drop and rejoin an in-progress game without losing state.
- **Built-in analysis engine** — local position evaluation / best-move hints (`src/chess/analysisEngine.ts`).
- **Edge-deployable** — ships to Cloudflare Workers via Wrangler (`worker/`).

## Run locally

```bash
npm install
npm run dev:full   # Vite client + WebSocket server together
```

| Script | What it does |
|---|---|
| `npm run dev` | Front-end only (Vite) |
| `npm run server` | WebSocket server only (`tsx server/index.ts`) |
| `npm run build` | Type-check + production build |
| `npm run worker:deploy` | Deploy to Cloudflare Workers |

## Architecture

```
src/
  net/          WebSocket client, room manager, wire protocol
  chess/        chess engine wrapper + analysis engine (chess.js)
  components/   ChessBoard, GamePanel (react-chessboard + framer-motion)
server/         Express + ws real-time server
worker/         Cloudflare Worker entry (edge deploy)
```

---

Built by [Lucas Oliveira](https://github.com/LucasOl1337) — full-stack / AI engineer.
More work: [LojaSync](https://github.com/LucasOl1337/LojaSync) (ERP automation, React + FastAPI).
