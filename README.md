# ChessCam ♟️

Real-time online multiplayer chess — get matched with a random opponent in seconds, or share a private room link and play a friend. Built as a full-stack, low-latency real-time app.

**Stack:** React 19 · TypeScript · Vite · Tailwind · Node/Express · `ws` (WebSocket) · chess.js · Cloudflare Workers

## Features

- **Real-time multiplayer over WebSockets** — a custom netcode layer (`src/net/protocol.ts`, `roomManager.ts`, `wsClient.ts`) on top of an Express + `ws` server (`server/index.ts`) keeps both boards in sync with low latency.
- **Instant matchmaking + private rooms** — get paired with a random opponent, or create a room and share the link.
- **Server-validated moves** — rules enforced with `chess.js` (legal moves, check, checkmate, draws) so the server stays authoritative and clients can't cheat.
- **Game clock** — per-player timer with increment.
- **Reconnect handling** — drop and rejoin an in-progress game without losing state.
- **AI Arena** — run AI-vs-AI matches or play as White/Black against Claude, GPT, or Grok profiles through 9Router.
- **Persistent match review** — saved matches, private/global chats, strategic reports, material score, captured pieces, and move-by-move review.
- **Safe agent timeouts** — transient model failures pause and preserve the match instead of injecting an automatic fallback move.
- **Edge-deployable** — the SPA and agent API ship together to Cloudflare Workers via Wrangler (`worker/`).

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
| `npm run test:agent-match` | Validate an AI-vs-AI match against a deployed endpoint |
| `npm run worker:deploy` | Build and deploy the SPA/API to Cloudflare Workers |

## Architecture

```
src/
  agent/        Arena UI, model profiles, gateway contract, persistence
  net/          WebSocket client, room manager, wire protocol
  chess/        chess.js rules wrapper
  components/   ChessBoard, GamePanel (react-chessboard + framer-motion)
server/         Express + ws development server and local agent API
worker/         Cloudflare Worker + Durable Object production backend
```

---

Built by [Lucas Oliveira](https://github.com/LucasOl1337) — full-stack / AI engineer.
More work: [LojaSync](https://github.com/LucasOl1337/LojaSync) (ERP automation, React + FastAPI).
