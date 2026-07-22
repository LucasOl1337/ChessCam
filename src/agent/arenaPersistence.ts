import type { AgentColor, AgentPrivateInsight } from './agentGateway';

export type PersistedArenaMove = {
  ply: number;
  san: string;
  uci: string;
  color: AgentColor;
  model: string;
  latencyMs: number;
  insight: AgentPrivateInsight;
  global: string;
  fallback: boolean;
  inputChars: number;
  outputChars: number;
  inputTokens?: number;
  outputTokens?: number;
};

export type PersistedArenaMatch = {
  version: 1;
  id: string;
  startedAt: number;
  updatedAt: number;
  whiteProfileId: string;
  blackProfileId: string;
  mode?: 'ai-vs-ai' | 'human-white' | 'human-black';
  fen: string;
  moves: PersistedArenaMove[];
  result: string;
  error: string;
  state: 'running' | 'paused' | 'finished' | 'error';
};

const ACTIVE_KEY = 'chesscam.agent-arena.active.v1';
const HISTORY_KEY = 'chesscam.agent-arena.history.v1';
const MAX_SAVED_MATCHES = 8;

export function loadActiveArenaMatch() {
  return readMatch(safeGet(ACTIVE_KEY));
}

export function loadArenaHistory() {
  const value = safeGet(HISTORY_KEY);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const match = readMatchValue(item);
      return match ? [match] : [];
    }).slice(0, MAX_SAVED_MATCHES);
  } catch {
    return [];
  }
}

export function persistArenaMatch(match: PersistedArenaMatch) {
  if (!match.moves.length) return;
  safeSet(ACTIVE_KEY, JSON.stringify(match));

  const history = [match, ...loadArenaHistory().filter((item) => item.id !== match.id)]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SAVED_MATCHES);
  if (!safeSet(HISTORY_KEY, JSON.stringify(history))) {
    safeSet(HISTORY_KEY, JSON.stringify(history.slice(0, Math.max(2, Math.floor(MAX_SAVED_MATCHES / 2)))));
  }
}

export function clearActiveArenaMatch() {
  try {
    window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Persistence is best-effort when storage is unavailable.
  }
}

export function deleteArenaMatch(id: string) {
  const history = loadArenaHistory().filter((match) => match.id !== id);
  safeSet(HISTORY_KEY, JSON.stringify(history));
  const active = loadActiveArenaMatch();
  if (active?.id === id) clearActiveArenaMatch();
  return history;
}

export function clearArenaHistory() {
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    // Persistence is best-effort when storage is unavailable.
  }
}

function readMatch(value: string | null) {
  if (!value) return null;
  try {
    return readMatchValue(JSON.parse(value));
  } catch {
    return null;
  }
}

function readMatchValue(value: unknown): PersistedArenaMatch | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<PersistedArenaMatch>;
  if (
    candidate.version !== 1
    || typeof candidate.id !== 'string'
    || typeof candidate.startedAt !== 'number'
    || typeof candidate.updatedAt !== 'number'
    || typeof candidate.whiteProfileId !== 'string'
    || typeof candidate.blackProfileId !== 'string'
    || typeof candidate.fen !== 'string'
    || !Array.isArray(candidate.moves)
  ) return null;

  const moves = candidate.moves.filter(isPersistedMove);
  if (moves.length !== candidate.moves.length) return null;
  const state = candidate.state === 'running' || candidate.state === 'finished' || candidate.state === 'error'
    ? candidate.state
    : 'paused';
  return {
    version: 1,
    id: candidate.id,
    startedAt: candidate.startedAt,
    updatedAt: candidate.updatedAt,
    whiteProfileId: candidate.whiteProfileId,
    blackProfileId: candidate.blackProfileId,
    mode: candidate.mode === 'human-white' || candidate.mode === 'human-black' ? candidate.mode : 'ai-vs-ai',
    fen: candidate.fen,
    moves,
    result: typeof candidate.result === 'string' ? candidate.result : '',
    error: typeof candidate.error === 'string' ? candidate.error : '',
    state,
  };
}

function isPersistedMove(value: unknown): value is PersistedArenaMove {
  if (!value || typeof value !== 'object') return false;
  const move = value as Partial<PersistedArenaMove>;
  const insight = move.insight as Partial<AgentPrivateInsight> | undefined;
  return typeof move.ply === 'number'
    && typeof move.san === 'string'
    && typeof move.uci === 'string'
    && (move.color === 'white' || move.color === 'black')
    && typeof move.model === 'string'
    && typeof move.latencyMs === 'number'
    && Boolean(insight)
    && typeof insight?.decision === 'string'
    && typeof insight.opponentPlan === 'string'
    && typeof insight.opponentPrediction === 'string'
    && typeof insight.longTermStrategy === 'string'
    && typeof insight.adaptations === 'string'
    && typeof move.global === 'string'
    && (move.inputTokens === undefined || typeof move.inputTokens === 'number')
    && (move.outputTokens === undefined || typeof move.outputTokens === 'number');
}

function safeGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
