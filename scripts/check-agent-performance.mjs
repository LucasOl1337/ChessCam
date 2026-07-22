import { Chess } from 'chess.js';

const baseUrl = process.argv[2] || 'https://chess.luca-ai.com.br';
const profiles = (process.argv[3] || 'gpt-5-6-sol,grok-4-5').split(',').filter(Boolean);
const maxLatencyMs = Number(process.env.AGENT_PERF_MAX_LATENCY_MS) || 25_000;
const maxInputChars = Number(process.env.AGENT_PERF_MAX_INPUT_CHARS) || 500;
const maxOutputChars = Number(process.env.AGENT_PERF_MAX_OUTPUT_CHARS) || 50;
const game = new Chess();

const results = [];
for (const profileId of profiles) {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/agent-move`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: new URL(baseUrl).origin,
      'user-agent': 'ChessCam-agent-performance/1',
    },
    body: JSON.stringify({
      fen: game.fen(),
      profileId,
      color: 'white',
      ply: 1,
      history: [],
      privateMemory: '',
      globalChat: [],
    }),
  });
  const payload = await response.json();
  const wallMs = Date.now() - startedAt;
  const legalMove = Boolean(payload.move && new Chess().move(payload.move));
  const pass = response.ok
    && payload.ok
    && legalMove
    && wallMs <= maxLatencyMs
    && payload.inputChars <= maxInputChars
    && payload.outputChars <= maxOutputChars;
  results.push({
    profileId,
    status: response.status,
    wallMs,
    inputChars: payload.inputChars ?? null,
    outputChars: payload.outputChars ?? null,
    inputTokens: payload.inputTokens ?? null,
    outputTokens: payload.outputTokens ?? null,
    legalMove,
    code: payload.code ?? null,
    pass,
  });
}

console.table(results);
if (results.some((result) => !result.pass)) {
  console.error(`RED: expected latency<=${maxLatencyMs}ms, input<=${maxInputChars} chars, output<=${maxOutputChars} chars and a legal move.`);
  process.exitCode = 1;
}
