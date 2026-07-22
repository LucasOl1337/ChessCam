import { Chess } from 'chess.js';

export type AgentColor = 'white' | 'black';

export type AgentPrivateInsight = {
  decision: string;
  opponentPlan: string;
  opponentPrediction: string;
  longTermStrategy: string;
  adaptations: string;
};

export type AgentGlobalMessage = {
  color: AgentColor;
  ply: number;
  message: string;
};

export type AgentTurnInput = {
  color: AgentColor;
  ply: number;
  fen: string;
  legalMoves: string[];
  history: string[];
  privateMemory?: string;
  globalChat?: AgentGlobalMessage[];
};

export type AgentTurnOutput = {
  move: string;
  private: AgentPrivateInsight;
  global: string;
  inputChars: number;
  outputChars: number;
  inputTokens: number;
  outputTokens: number;
};

type GatewayConfig = {
  baseUrl: string;
  apiKey: string;
  route: string;
  timeoutMs?: number;
};

const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const MAX_MEMORY_CHARS = 280;
const MAX_GLOBAL_CHARS = 80;
const MAX_INSIGHT_CHARS = 84;
export const AGENT_MAX_OUTPUT_TOKENS = 24;
export const AGENT_TIMEOUT_MS = 45_000;
export const SYSTEM_PROMPT = 'Escolha o melhor lance e chame play_move imediatamente. Não escreva texto.';

export async function askChessAgent(config: GatewayConfig, input: AgentTurnInput): Promise<AgentTurnOutput> {
  const userPrompt = buildTurnPrompt(input);
  if (!config.baseUrl || !config.apiKey) throw new Error('9Router não configurado');

  const requestSessionId = crypto.randomUUID();
  const body = JSON.stringify({
    model: config.route,
    prompt_cache_key: requestSessionId,
    stream: true,
    temperature: 0.1,
    max_tokens: AGENT_MAX_OUTPUT_TOKENS,
    max_output_tokens: AGENT_MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    tools: [{
      type: 'function',
      function: {
        name: 'play_move',
        description: 'Joga imediatamente um lance legal.',
        parameters: {
          type: 'object',
          properties: { move: { type: 'string', enum: input.legalMoves } },
          required: ['move'],
          additionalProperties: false,
        },
      },
    }],
    tool_choice: { type: 'function', function: { name: 'play_move' } },
  });

  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'X-Session-ID': requestSessionId,
    },
    signal: AbortSignal.timeout(config.timeoutMs ?? AGENT_TIMEOUT_MS),
    body,
  });

  if (!response.ok) throw new Error(`9Router HTTP ${response.status}`);
  const streamed = await readAgentMoveStream(response, input.legalMoves);
  if (!streamed.move) throw new Error('O modelo não retornou um lance legal.');

  return {
    move: streamed.move,
    private: describeMove(input, streamed.move),
    global: '',
    inputChars: SYSTEM_PROMPT.length + userPrompt.length,
    outputChars: streamed.move.length,
    inputTokens: streamed.inputTokens,
    outputTokens: streamed.outputTokens,
  };
}

export function buildTurnPrompt(input: AgentTurnInput) {
  const latestMessage = input.globalChat?.at(-1)?.message;
  return [
    `F=${input.fen}`,
    `L=${input.legalMoves.join(',')}`,
    latestMessage ? `M=${cleanText(latestMessage, MAX_GLOBAL_CHARS)}` : '',
  ].filter(Boolean).join('\n');
}

export function shortlistAgentMoves(fen: string, maxCandidates = 12) {
  const game = new Chess(fen);
  return game.moves({ verbose: true })
    .map((move) => {
      const uci = `${move.from}${move.to}${move.promotion ?? ''}`;
      let score = 0;
      if (move.san.includes('#')) score += 10_000;
      else if (move.san.includes('+')) score += 800;
      if (move.captured) score += 500 + pieceValue(move.captured) * 80 - pieceValue(move.piece) * 8;
      if (move.promotion) score += 700;
      if (move.isKingsideCastle() || move.isQueensideCastle()) score += 360;
      if (['d4', 'e4', 'd5', 'e5'].includes(move.to)) score += 140;
      if ((move.piece === 'n' || move.piece === 'b') && ['1', '8'].includes(move.from[1])) score += 110;
      return { uci, score };
    })
    .sort((left, right) => right.score - left.score || left.uci.localeCompare(right.uci))
    .slice(0, maxCandidates)
    .map(({ uci }) => uci);
}

export function parseAgentTurn(content: string, legalMoves: string[]) {
  const parsed = parseJsonObject(content);
  const rawMove = typeof parsed?.m === 'string'
    ? parsed.m
    : typeof parsed?.move === 'string'
      ? parsed.move
      : content.match(/[a-h][1-8][a-h][1-8][qrbn]?/i)?.[0] ?? '';
  const candidate = rawMove.toLowerCase().replace(/[^a-h1-8qrbn]/g, '');
  const move = UCI_RE.test(candidate) && legalMoves.includes(candidate) ? candidate : '';

  const privateObject = parsed?.private && typeof parsed.private === 'object'
    ? parsed.private as Record<string, unknown>
    : {};
  const legacyNote = typeof parsed?.note === 'string' ? parsed.note : '';
  const decision = cleanText(readString(parsed ?? {}, ['d']) || readString(privateObject, ['decision', 'moveReason', 'reason']) || legacyNote, MAX_INSIGHT_CHARS);
  const opponentPlan = cleanText(readString(parsed ?? {}, ['o']) || readString(privateObject, ['opponentPlan', 'opponent', 'rivalPlan']), MAX_INSIGHT_CHARS);
  const opponentPrediction = cleanText(readString(parsed ?? {}, ['p']) || readString(privateObject, ['opponentPrediction', 'prediction', 'nextMove']), MAX_INSIGHT_CHARS);
  const longTermStrategy = cleanText(readString(parsed ?? {}, ['s']) || readString(privateObject, ['longTermStrategy', 'strategy', 'plan']), MAX_INSIGHT_CHARS);
  const adaptations = cleanText(readString(parsed ?? {}, ['a']) || readString(privateObject, ['adaptations', 'adaptation', 'adjustments']), MAX_INSIGHT_CHARS);
  const global = cleanText(typeof parsed?.g === 'string' ? parsed.g : typeof parsed?.global === 'string' ? parsed.global : '', MAX_GLOBAL_CHARS);

  return {
    move,
    private: {
      decision: decision || (move ? `Vou jogar ${move} para melhorar minha posição.` : ''),
      opponentPlan: opponentPlan || 'Ainda estou identificando o plano atual do oponente.',
      opponentPrediction: opponentPrediction || 'Espero que o rival dispute minhas peças ativas e o controle do centro.',
      longTermStrategy: longTermStrategy || 'Meu plano de longo prazo será refinado conforme a estrutura da posição.',
      adaptations: adaptations || 'Mantive o plano anterior porque o último lance não exigiu uma mudança imediata.',
    },
    global,
  };
}

function describeMove(input: AgentTurnInput, uci: string): AgentPrivateInsight {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const pieceCode = fenBoardPieceAt(input.fen, from);
  const piece = pieceName(pieceCode);
  const center = ['c4', 'd4', 'e4', 'f4', 'c5', 'd5', 'e5', 'f5'].includes(to);
  const development = (pieceCode === 'n' || pieceCode === 'b') && ['1', '8'].includes(from[1]);
  const castling = pieceCode === 'k' && Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 2;
  const promotion = uci.length === 5;
  const action = castling
    ? 'Vou fazer o roque para proteger o rei e aproximar a torre do centro.'
    : promotion
      ? `Vou promover o peão em ${to} para aumentar minha força de ataque.`
      : center
        ? `Vou mover ${piece} para ${to}, disputando espaço e influência no centro.`
        : development
          ? `Vou desenvolver ${piece} para ${to}, deixando essa peça mais ativa.`
          : `Vou mover ${piece} de ${from} para ${to} e reorganizar minha posição.`;
  return {
    decision: action,
    opponentPlan: 'O rival tentará responder à nova atividade e proteger seus pontos frágeis.',
    opponentPrediction: center
      ? 'Espero uma reação no centro ou o desenvolvimento de uma peça para contestá-lo.'
      : 'Espero que o rival melhore uma peça ou crie uma ameaça contra meu último lance.',
    longTermStrategy: castling
      ? 'Com o rei seguro, quero ativar as torres e disputar as linhas abertas.'
      : 'Quero coordenar minhas peças, manter o rei seguro e criar pressão progressiva.',
    adaptations: `A posição agora gira em torno da atividade de ${piece} em ${to}.`,
  };
}

function pieceName(code: string) {
  return ({ p: 'o peão', n: 'o cavalo', b: 'o bispo', r: 'a torre', q: 'a dama', k: 'o rei' } as Record<string, string>)[code] ?? 'a peça';
}

function pieceValue(code: string) {
  return ({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 } as Record<string, number>)[code] ?? 0;
}

export function compactPrivateMemory(insight: AgentPrivateInsight) {
  return cleanText([
    `D:${insight.decision}`,
    `O:${insight.opponentPlan}`,
    `P:${insight.opponentPrediction}`,
    `S:${insight.longTermStrategy}`,
    `A:${insight.adaptations}`,
  ].join(' '), MAX_MEMORY_CHARS);
}

function fenBoardPieceAt(fen: string, square: string) {
  const [board] = fen.split(' ');
  const rows = board.split('/');
  const rank = Number(square[1]);
  const file = square.charCodeAt(0) - 97;
  const row = rows[8 - rank] ?? '';
  let column = 0;
  for (const char of row) {
    if (/\d/.test(char)) column += Number(char);
    else {
      if (column === file) return char.toLowerCase();
      column += 1;
    }
  }
  return '';
}

async function readAgentMoveStream(response: Response, legalMoves: string[]) {
  if (!response.body) return { move: '', inputTokens: 0, outputTokens: 0 };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let argumentsBuffer = '';
  let contentBuffer = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:') || trimmed === 'data: [DONE]') continue;
        try {
          const event = JSON.parse(trimmed.slice(5).trim()) as {
            choices?: Array<{ delta?: { content?: unknown; tool_calls?: Array<{ function?: { arguments?: unknown } }> } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number };
          };
          const delta = event.choices?.[0]?.delta;
          if (typeof delta?.content === 'string') contentBuffer += delta.content;
          for (const call of delta?.tool_calls ?? []) {
            if (typeof call.function?.arguments === 'string') argumentsBuffer += call.function.arguments;
          }
          inputTokens = event.usage?.prompt_tokens ?? event.usage?.input_tokens ?? inputTokens;
          outputTokens = event.usage?.completion_tokens ?? event.usage?.output_tokens ?? outputTokens;
          const toolMove = readMoveArguments(argumentsBuffer);
          const parsed = parseAgentTurn(toolMove || contentBuffer, legalMoves);
          if (parsed.move) {
            await reader.cancel('move selected');
            return { move: parsed.move, inputTokens, outputTokens };
          }
        } catch {
          // Partial SSE chunks are completed by subsequent lines.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { move: parseAgentTurn(contentBuffer, legalMoves).move, inputTokens, outputTokens };
}

function readMoveArguments(value: string) {
  if (!value.includes('}')) return '';
  try {
    const args = JSON.parse(value) as { move?: unknown };
    return typeof args.move === 'string' ? args.move : '';
  } catch {
    return '';
  }
}

function parseJsonObject(content: string): Record<string, unknown> | null {
  const unfenced = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const candidates = [unfenced];
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(unfenced.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
    } catch {
      // Some gateways wrap JSON in prose; the UCI fallback below still handles it.
    }
  }
  return null;
}

function readString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (typeof source[key] === 'string') return source[key] as string;
  }
  return '';
}

function cleanText(value: string, maxLength: number) {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, maxLength);
}
