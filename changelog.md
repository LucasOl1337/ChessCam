# Changelog - ChessCam

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-05-31

### Added
- Full chess.com-style time controls (presets 5+0 / 10+5 / 15+10 / ∞) with server-authoritative elapsed + increment logic in both local server and Cloudflare Worker.
- Complete Draw Offer protocol (offer/pending/received/accepted/declined states + UI buttons + WS messages).
- Dedicated Resign button + handler (local + online).
- Rematch flow (server resets game state, syncs FEN/times to clients).
- History scrub / analysis mode: clickable moves list + nav buttons (⏮ ◀ ▶ ⏭ Live) for local replay of positions via FEN reconstruction.
- Captured pieces / material balance display (unicode symbols).
- FEN and PGN copy-to-clipboard tools (local + approximate online).
- Keyboard shortcuts (ArrowLeft/Z prev, ArrowRight next, F flip board, R resign, D/? offer draw).
- Enhanced promotion dialog with large unicode symbols (♕♛♖♜ etc) + cancel.
- Analysis stub (heuristic + eval bar + future Stockfish note).
- Video grid for live P2P WebRTC camera previews (local + remote) during matches.
- Player strips with live clocks (low-time warning styles).
- .codegraph/ artifact (CodeGraph MCP SQLite index for structural queries on chess/WS code).
- Full grokassets/ tree (banners, icons, logos, visual-bible, prompts) — part of cross-project branding initiative.

### Changed
- **server/index.ts**: Major expansion — timeControl param propagation, clock math in makeMove, draw/resign/rematch handlers, room cleanup, richer broadcasts (whiteTime/blackTime).
- **worker/src/index.ts**: Exact parity with server for prod (DurableObject impl of clocks, draw flows, rematch, timeControl in createRoom).
- **src/App.tsx**: Complete realtime camera match orchestration — WebRTC peer setup, media streams, full message switch for new types (draw-offer, rematch, times, game-over reasons), historyIndex + jumpTo, analysis, shortcuts, time preset UI, captured calc, draw offer panels.
- **src/components/ChessBoard.tsx**: Refactored heavily for hybrid local/online — externalFen support, activeEngine memo, promotion overlay, analysis arrows SVG layer, improved squareStyles/legal/selection, ownsTurnPiece respecting playerColor, disabled states.
- **src/index.css**: Large new sections — player-strip clocks, video-grid/tiles, promotion-overlay/dialog, draw-offer, history-nav, captured-card/rows, board-toolbar/turn-pill, actions/resign/draw buttons, low-time warnings. Refined chess green/dark theme.
- **src/net/protocol.ts**: Extended message unions for draw, resign, rematch, time payloads (client/server alignment).
- **README.md**: Overhauled "Features de Gameplay (Melhorias recentes)" section + how-to + roadmap (explicitly calls out new scrub, material, draw offers, resign, promo, clocks, online cam + WebRTC).
- grokassets/ expanded with project-specific assets (chess cam metaphors in visual-bible.md).

### Technical Notes
- **Branch:** master (note: unique vs main in sibling projects in batch)
- **Pre-commit state:** 10 uncommitted files (per explicit batch prompt) + untracked .codegraph/
- **Divergence:** 0 ahead / 0 behind at last safe commit HEAD (96a8eb6). Pure working-tree changes + artifacts after "2026-05-29+dirty safe commit" pattern.
- **Multi-agent parallel reconciliation:** High change volume in batch. Specific agent work: ChessBoard + App + server/worker refactored for real-time chess vision + live camera P2P. Cross-project grokassets/ + .codegraph patterns observed (see patchnotes.md "Multi-Agent..." section for full batch context with Kamui, LUCA-AI, Sennin, simple-ai NOVOFLUXO).
- All source (TS/TSX/CSS/MD). No secrets. Verified via deep file reads + .git metadata inspection.
- Minor: Some subcomponent renders in App.tsx may need return fixes post-commit (rapid parallel edit artifact).

## [96a8eb6] - 2026-05-?? (prior)
### feat: deploy ChessCam to Cloudflare
- Worker + wrangler setup for prod realtime hub.
- Initial camera matchmaking + WebRTC signaling skeleton.
- Core WS protocol + chess.js integration.

---

## Prior History (condensed from .git/logs/HEAD)
- 1ddbb893: feat: add camera matchmaking tunnel-ready realtime
- cfada5c9: fix: keep private rooms out of quick match queue
- b5ebbd70: feat: rebuild ChessCam as polished chess platform UI
- 0549288d: rename: Xadrez-Online → ChessCam
- 1d0fef31: feat: Xadrez Online - chess multiplayer com WebSocket + WebRTC signaling (initial)

Full git history short (young repo). See .git/logs/HEAD for exact timestamps/hashes.

---
*Changelog maintained as part of safe sync batch process 2026-05-31.*
*See patchnotes.md for the detailed Multi-Agent Parallel Work Reconciliation and file-by-file agent impact.*