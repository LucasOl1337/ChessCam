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
};

type GatewayConfig = {
  baseUrl: string;
  apiKey: string;
  route: string;
  timeoutMs?: number;
};

const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const SYSTEM_PROMPT = [
  'Você é um agente enxadrista em uma partida real e explica seus planos para uma pessoa que conhece apenas o básico de xadrez.',
  'Retorne SOMENTE JSON compacto no formato:',
  '{"move":"e2e4","private":{"decision":"Vou avançar o peão diante do rei para ocupar o centro e abrir caminho para minhas peças.","opponentPlan":"O rival parece querer controlar o centro antes de atacar.","opponentPrediction":"Espero que ele desenvolva um cavalo ou responda com um peão central.","longTermStrategy":"Quero colocar minhas peças em casas ativas, proteger o rei e então atacar o lado mais vulnerável.","adaptations":"O último lance ameaçou meu centro; por isso adiei o ataque e primeiro reforcei minha defesa."},"global":""}',
  'move deve ser exatamente um UCI da lista legal.',
  'private é um relatório estratégico curto, não raciocínio passo a passo; use frases naturais e cada campo deve ter no máximo 170 caracteres.',
  'Escreva para humanos: explique intenção, benefício, ameaça e consequência. Prefira nomes completos como cavalo, bispo, torre, dama, rei e peão.',
  'Não entregue uma lista de códigos como Cf3, Be2, d5, f6 ou ...c5. Se uma casa ou notação for importante, diga também o que ela significa em linguagem comum.',
  'Evite jargão sem explicação: em vez de apenas "ganhar um tempo", "cravar", "dobrar torres" ou "explorar a coluna", explique a vantagem prática.',
  'longTermStrategy deve contar o plano pessoal de vários lances como um objetivo compreensível, não como uma sequência técnica de notações.',
  'opponentPrediction deve prever a intenção do rival e pode citar um lance provável somente acompanhado de uma explicação simples.',
  'adaptations deve comparar o plano anterior com o atual: o que mudou, por que mudou e qual prioridade tomou o lugar. Se nada mudou, explique por quê.',
  'global é uma mensagem opcional de até 160 caracteres que o rival verá no próximo turno. Use string vazia se não quiser falar.',
].join('\n');

export async function askChessAgent(config: GatewayConfig, input: AgentTurnInput): Promise<AgentTurnOutput> {
  const userPrompt = buildTurnPrompt(input);
  if (!config.baseUrl || !config.apiKey) throw new Error('9Router não configurado');

  const body = JSON.stringify({
    model: config.route,
    stream: false,
    temperature: 0.15,
    max_tokens: 560,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(config.timeoutMs ?? 60_000),
    body,
  });

  if (!response.ok) throw new Error(`9Router HTTP ${response.status}`);
  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = normalizeModelContent(payload.choices?.[0]?.message?.content);
  const parsed = parseAgentTurn(content, input.legalMoves);
  if (!parsed.move) throw new Error('O modelo não retornou um lance legal.');

  return {
    move: parsed.move,
    private: parsed.private,
    global: parsed.global,
    inputChars: SYSTEM_PROMPT.length + userPrompt.length,
    outputChars: content.length,
  };
}

export function buildTurnPrompt(input: AgentTurnInput) {
  const history = input.history.slice(-8).map((move) => cleanText(move, 16)).filter(Boolean).join(' ');
  const memory = cleanText(input.privateMemory ?? '', 1000);
  const globalChat = (input.globalChat ?? [])
    .slice(-6)
    .map((item) => `${item.color === 'white' ? 'B' : 'P'}${item.ply}:${cleanText(item.message, 160)}`)
    .join(' | ');

  return [
    `cor=${input.color === 'white' ? 'brancas' : 'pretas'}; ply=${input.ply}`,
    `fen=${input.fen}`,
    `hist=${history || '-'}`,
    `legal=${input.legalMoves.join(',')}`,
    `memoria_privada=${memory || '-'}`,
    `chat_global=${globalChat || '-'}`,
  ].join('\n');
}

export function parseAgentTurn(content: string, legalMoves: string[]) {
  const parsed = parseJsonObject(content);
  const rawMove = typeof parsed?.move === 'string'
    ? parsed.move
    : content.match(/[a-h][1-8][a-h][1-8][qrbn]?/i)?.[0] ?? '';
  const candidate = rawMove.toLowerCase().replace(/[^a-h1-8qrbn]/g, '');
  const move = UCI_RE.test(candidate) && legalMoves.includes(candidate) ? candidate : '';

  const privateObject = parsed?.private && typeof parsed.private === 'object'
    ? parsed.private as Record<string, unknown>
    : {};
  const legacyNote = typeof parsed?.note === 'string' ? parsed.note : '';
  const decision = cleanText(readString(privateObject, ['decision', 'moveReason', 'reason']) || legacyNote, 180);
  const opponentPlan = cleanText(readString(privateObject, ['opponentPlan', 'opponent', 'rivalPlan']), 180);
  const opponentPrediction = cleanText(readString(privateObject, ['opponentPrediction', 'prediction', 'nextMove']), 180);
  const longTermStrategy = cleanText(readString(privateObject, ['longTermStrategy', 'strategy', 'plan']), 180);
  const adaptations = cleanText(readString(privateObject, ['adaptations', 'adaptation', 'adjustments']), 180);
  const global = cleanText(typeof parsed?.global === 'string' ? parsed.global : '', 180);

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

export function compactPrivateMemory(insight: AgentPrivateInsight) {
  return cleanText([
    `Decisão anterior: ${insight.decision}`,
    `Plano rival: ${insight.opponentPlan}`,
    `Previsão rival: ${insight.opponentPrediction}`,
    `Plano de longo prazo: ${insight.longTermStrategy}`,
    `Adaptação: ${insight.adaptations}`,
  ].join(' '), 1000);
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

function normalizeModelContent(content: unknown) {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') return item.text;
        return '';
      })
      .join('\n')
      .trim();
  }
  return '';
}
