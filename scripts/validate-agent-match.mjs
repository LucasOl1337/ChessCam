import { Chess } from 'chess.js';

const baseUrl = process.argv[2] || 'https://chess.luca-ai.com.br';
const whiteProfileId = process.argv[3] || 'gpt-5-6-sol';
const blackProfileId = process.argv[4] || 'gpt-5-6-sol-high';
const maxPlies = Math.max(2, Math.min(300, Number(process.argv[5]) || 300));
const game = new Chess();
const privateMemory = { white: '', black: '' };
let globalChat = [];
let fallbacks = 0;
let totalLatency = 0;
let privateInsights = 0;
let globalMessages = 0;

async function requestMove(body) {
  const response = await fetch(`${baseUrl}/api/agent-move`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: new URL(baseUrl).origin,
      'user-agent': 'ChessCam-agent-match-validator/3',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (response.ok && payload.ok) return payload;
  throw new Error(`status=${response.status} code=${payload.code || '-'} error=${payload.error}`);
}

for (let ply = 1; ply <= maxPlies && !game.isGameOver(); ply += 1) {
  const color = game.turn() === 'w' ? 'white' : 'black';
  const profileId = color === 'white' ? whiteProfileId : blackProfileId;
  const payload = await requestMove({
    fen: game.fen(),
    profileId,
    color,
    ply,
    history: game.history().slice(-4),
    privateMemory: privateMemory[color],
    globalChat,
  });
  const move = game.move(payload.move);
  if (!move) throw new Error(`illegal move at ply=${ply}: ${payload.move}`);
  fallbacks += payload.fallback ? 1 : 0;
  totalLatency += payload.latencyMs || 0;
  if (payload.private?.decision && payload.private?.opponentPlan && payload.private?.opponentPrediction && payload.private?.longTermStrategy && payload.private?.adaptations) {
    privateInsights += 1;
    privateMemory[color] = [
      `Decisão anterior: ${payload.private.decision}`,
      `Plano rival: ${payload.private.opponentPlan}`,
      `Previsão rival: ${payload.private.opponentPrediction}`,
      `Plano de longo prazo: ${payload.private.longTermStrategy}`,
      `Adaptação: ${payload.private.adaptations}`,
    ].join(' ').slice(0, 1000);
  }
  if (payload.global) {
    globalMessages += 1;
    globalChat = [...globalChat, { color, ply, message: payload.global }].slice(-3);
  }
  if (ply % 10 === 0 || game.isGameOver()) {
    console.log(`PLY=${ply} LAST=${move.san} FALLBACKS=${fallbacks}`);
  }
}

const result = game.isCheckmate()
  ? (game.turn() === 'w' ? 'black-checkmate' : 'white-checkmate')
  : game.isStalemate()
    ? 'stalemate'
    : game.isThreefoldRepetition()
      ? 'threefold'
      : game.isInsufficientMaterial()
        ? 'insufficient-material'
        : game.isDraw()
          ? 'draw'
          : 'max-plies';

console.log(JSON.stringify({
  ok: game.isGameOver() || game.history().length === maxPlies,
  result,
  plies: game.history().length,
  fallbacks,
  averageLatencyMs: Math.round(totalLatency / Math.max(1, game.history().length)),
  privateInsights,
  globalMessages,
  finalFen: game.fen(),
}));
