import React from 'react';
import { ArrowDown, Bot, ChevronLeft, ChevronRight, CircleStop, Gauge, History, MessageCircle, Play, Radio, RefreshCw, Swords, Trash2 } from 'lucide-react';
import { Chess, type Move, type Square } from 'chess.js';
import { ChessBoard } from '../components/ChessBoard';
import type { PromotionPiece } from '../chess/chessEngine';
import { AGENT_MODEL_PROFILES, getAgentModelProfile } from './models';
import type { AgentColor, AgentGlobalMessage, AgentPrivateInsight } from './agentGateway';
import {
  clearActiveArenaMatch,
  clearArenaHistory,
  deleteArenaMatch,
  loadActiveArenaMatch,
  loadArenaHistory,
  persistArenaMatch,
  type PersistedArenaMatch,
} from './arenaPersistence';
import './AgentArena.css';

type ArenaStatus = 'idle' | 'running' | 'stopping' | 'finished' | 'error';
type ChatTab = AgentColor | 'global';
export type ArenaMatchMode = 'ai-vs-ai' | 'human-white' | 'human-black';

type ArenaMove = {
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
};

type ArenaSession = {
  id: string;
  startedAt: number;
};

type AgentMoveResponse = {
  ok: boolean;
  move?: string;
  private?: AgentPrivateInsight;
  global?: string;
  latencyMs?: number;
  fallback?: boolean;
  inputChars?: number;
  outputChars?: number;
  error?: string;
  code?: string;
  retryable?: boolean;
};

const START_FEN = new Chess().fen();
const MAX_PLIES = 300;
const TURN_GAP_MS = 120;
const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const PIECE_SYMBOLS: Record<'w' | 'b', Record<string, string>> = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};

type ReviewPosition = {
  fen: string;
  capturedByWhite: string[];
  capturedByBlack: string[];
  materialScore: number;
};

function createArenaSession(): ArenaSession {
  return { id: crypto.randomUUID(), startedAt: Date.now() };
}

function restorePrivateMemory(moves: ArenaMove[]) {
  const memory: Record<AgentColor, string> = { white: '', black: '' };
  (['white', 'black'] as const).forEach((color) => {
    const last = [...moves].reverse().find((move) => move.color === color);
    if (!last) return;
    memory[color] = [
      `Decisão anterior: ${last.insight.decision}`,
      `Plano rival: ${last.insight.opponentPlan}`,
      `Previsão rival: ${last.insight.opponentPrediction}`,
      `Plano de longo prazo: ${last.insight.longTermStrategy}`,
      `Adaptação: ${last.insight.adaptations}`,
    ].join(' ').slice(0, 1000);
  });
  return memory;
}

function restoreGlobalChat(moves: ArenaMove[]): AgentGlobalMessage[] {
  return moves.filter((move) => move.global).slice(-6).map((move) => ({
    color: move.color,
    ply: move.ply,
    message: move.global,
  }));
}

function gameFromArenaMoves(moves: ArenaMove[]) {
  const game = new Chess();
  for (const move of moves) {
    const played = game.move({
      from: move.uci.slice(0, 2),
      to: move.uci.slice(2, 4),
      promotion: move.uci[4] || 'q',
    });
    if (!played) throw new Error(`Não foi possível restaurar o lance ${move.uci}.`);
  }
  return game;
}

function reviewPositionAt(moves: ArenaMove[], ply: number): ReviewPosition {
  const game = new Chess();
  const capturedByWhite: string[] = [];
  const capturedByBlack: string[] = [];

  for (const move of moves.slice(0, ply)) {
    const played = game.move({
      from: move.uci.slice(0, 2),
      to: move.uci.slice(2, 4),
      promotion: move.uci[4] || 'q',
    });
    if (!played) break;
    if (played.captured) {
      const capturedColor = played.color === 'w' ? 'b' : 'w';
      const symbol = PIECE_SYMBOLS[capturedColor][played.captured] ?? played.captured;
      (played.color === 'w' ? capturedByWhite : capturedByBlack).push(symbol);
    }
  }

  let whiteMaterial = 0;
  let blackMaterial = 0;
  game.board().flat().forEach((piece) => {
    if (!piece) return;
    if (piece.color === 'w') whiteMaterial += PIECE_VALUES[piece.type] ?? 0;
    else blackMaterial += PIECE_VALUES[piece.type] ?? 0;
  });

  return {
    fen: game.fen(),
    capturedByWhite,
    capturedByBlack,
    materialScore: whiteMaterial - blackMaterial,
  };
}

function resultFor(game: Chess, maxReached = false) {
  if (game.isCheckmate()) return game.turn() === 'w' ? 'Xeque-mate — Pretas vencem' : 'Xeque-mate — Brancas vencem';
  if (game.isStalemate()) return 'Empate por afogamento';
  if (game.isThreefoldRepetition()) return 'Empate por repetição tripla';
  if (game.isInsufficientMaterial()) return 'Empate por material insuficiente';
  if (game.isDraw()) return 'Empate pelas regras do xadrez';
  if (maxReached) return `Empate técnico após ${MAX_PLIES} meios-lances`;
  return 'Partida encerrada';
}

function moveToUci(move: Move) {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function defaultInsight(move: string): AgentPrivateInsight {
  return {
    decision: `Vou fazer ${move} para melhorar minha posição.`,
    opponentPlan: 'Ainda estou identificando o plano atual do oponente.',
    opponentPrediction: 'Espero que o rival dispute minhas peças ativas e o controle do centro.',
    longTermStrategy: 'Vou desenvolver minhas peças, proteger o rei e criar um plano conforme a estrutura.',
    adaptations: 'Mantive o plano anterior porque o último lance não exigiu uma mudança imediata.',
  };
}

function AutoScrollFeed({ itemCount, className, children }: {
  itemCount: number;
  className: string;
  children: React.ReactNode;
}) {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const previousCountRef = React.useRef(itemCount);
  const followingRef = React.useRef(true);
  const [following, setFollowing] = React.useState(true);
  const [unseen, setUnseen] = React.useState(0);

  const jumpToLatest = React.useCallback((behavior: ScrollBehavior = 'smooth') => {
    const list = listRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior });
    followingRef.current = true;
    setFollowing(true);
    setUnseen(0);
  }, []);

  React.useEffect(() => {
    const previousCount = previousCountRef.current;
    previousCountRef.current = itemCount;
    if (itemCount < previousCount) {
      followingRef.current = true;
      const frame = window.requestAnimationFrame(() => jumpToLatest('auto'));
      return () => window.cancelAnimationFrame(frame);
    }

    const added = itemCount - previousCount;
    if (added <= 0) return;
    if (!followingRef.current) {
      setUnseen((current) => current + added);
      return;
    }
    const frame = window.requestAnimationFrame(() => jumpToLatest('smooth'));
    return () => window.cancelAnimationFrame(frame);
  }, [itemCount, jumpToLatest]);

  function handleScroll() {
    const list = listRef.current;
    if (!list) return;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 56;
    followingRef.current = nearBottom;
    setFollowing(nearBottom);
    if (nearBottom) setUnseen(0);
  }

  return (
    <>
      <div className={className} ref={listRef} onScroll={handleScroll}>{children}</div>
      {!following && (
        <button className="scroll-follow-button" onClick={() => jumpToLatest()}>
          <ArrowDown size={14} /> {unseen ? `${unseen} ${unseen === 1 ? 'novo lance' : 'novos lances'}` : 'Ir ao mais recente'}
        </button>
      )}
    </>
  );
}

export function AgentArena({ onBack, initialMode = 'ai-vs-ai' }: { onBack: () => void; initialMode?: ArenaMatchMode }) {
  const restoredMatch = React.useMemo(() => loadActiveArenaMatch(), []);
  const [matchMode, setMatchMode] = React.useState<ArenaMatchMode>(restoredMatch?.mode ?? initialMode);
  const [whiteProfileId, setWhiteProfileId] = React.useState(restoredMatch?.whiteProfileId ?? 'gpt-5-6-sol');
  const [blackProfileId, setBlackProfileId] = React.useState(restoredMatch?.blackProfileId ?? 'gpt-5-6-luna-xhigh');
  const [fen, setFen] = React.useState(restoredMatch?.fen ?? START_FEN);
  const [moves, setMoves] = React.useState<ArenaMove[]>(restoredMatch?.moves ?? []);
  const [status, setStatus] = React.useState<ArenaStatus>(
    restoredMatch?.state === 'finished' ? 'finished' : restoredMatch?.state === 'error' ? 'error' : 'idle',
  );
  const [result, setResult] = React.useState(restoredMatch?.result ?? '');
  const [error, setError] = React.useState(restoredMatch?.error ?? '');
  const [thinkingColor, setThinkingColor] = React.useState<AgentColor | null>(null);
  const [mobileChatTab, setMobileChatTab] = React.useState<ChatTab>('global');
  const [reviewPly, setReviewPly] = React.useState<number | null>(null);
  const [humanChatDraft, setHumanChatDraft] = React.useState('');
  const [session, setSession] = React.useState<ArenaSession>(() => restoredMatch
    ? { id: restoredMatch.id, startedAt: restoredMatch.startedAt }
    : createArenaSession());
  const [savedMatches, setSavedMatches] = React.useState<PersistedArenaMatch[]>(() => loadArenaHistory());
  const abortRef = React.useRef<AbortController | null>(null);
  const shouldRunRef = React.useRef(false);
  const activeGameRef = React.useRef<Chess | null>(null);
  const activeHumanColorRef = React.useRef<AgentColor | null>(null);
  const humanMoveResolverRef = React.useRef<((move: Move | null) => void) | null>(null);
  const privateMemoryRef = React.useRef<Record<AgentColor, string>>(restorePrivateMemory(restoredMatch?.moves ?? []));
  const globalChatRef = React.useRef<AgentGlobalMessage[]>(restoreGlobalChat(restoredMatch?.moves ?? []));

  const whiteProfile = getAgentModelProfile(whiteProfileId)!;
  const blackProfile = getAgentModelProfile(blackProfileId)!;
  const humanColor: AgentColor | null = matchMode === 'human-white' ? 'white' : matchMode === 'human-black' ? 'black' : null;
  const whiteMoves = React.useMemo(() => moves.filter((move) => move.color === 'white'), [moves]);
  const blackMoves = React.useMemo(() => moves.filter((move) => move.color === 'black'), [moves]);
  const globalMessages = React.useMemo(() => moves.filter((move) => move.global), [moves]);
  const averageLatency = moves.length
    ? Math.round(moves.reduce((total, move) => total + move.latencyMs, 0) / moves.length)
    : 0;
  const displayedPly = reviewPly === null ? moves.length : Math.min(reviewPly, moves.length);
  const reviewPosition = React.useMemo(() => reviewPositionAt(moves, displayedPly), [displayedPly, moves]);
  const reviewing = reviewPly !== null && displayedPly < moves.length;

  React.useEffect(() => () => {
    shouldRunRef.current = false;
    abortRef.current?.abort();
  }, []);

  React.useEffect(() => {
    if (!moves.length) return;
    const persisted: PersistedArenaMatch = {
      version: 1,
      id: session.id,
      startedAt: session.startedAt,
      updatedAt: Date.now(),
      whiteProfileId,
      blackProfileId,
      mode: matchMode,
      fen,
      moves,
      result,
      error,
      state: status === 'running' || status === 'stopping' ? 'running' : status === 'finished' ? 'finished' : status === 'error' ? 'error' : 'paused',
    };
    persistArenaMatch(persisted);
  }, [blackProfileId, error, fen, matchMode, moves, result, session, status, whiteProfileId]);

  const visibleSavedMatches = React.useMemo(() => {
    if (!moves.length) return savedMatches;
    const liveMatch: PersistedArenaMatch = {
      version: 1,
      id: session.id,
      startedAt: session.startedAt,
      updatedAt: savedMatches.find((match) => match.id === session.id)?.updatedAt ?? session.startedAt,
      whiteProfileId,
      blackProfileId,
      mode: matchMode,
      fen,
      moves,
      result,
      error,
      state: status === 'running' || status === 'stopping' ? 'running' : status === 'finished' ? 'finished' : status === 'error' ? 'error' : 'paused',
    };
    return [liveMatch, ...savedMatches.filter((match) => match.id !== session.id)]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8);
  }, [blackProfileId, error, fen, matchMode, moves, result, savedMatches, session, status, whiteProfileId]);

  function clearMatch() {
    privateMemoryRef.current = { white: '', black: '' };
    globalChatRef.current = [];
    setFen(START_FEN);
    setMoves([]);
    setResult('');
    setError('');
    setThinkingColor(null);
    setReviewPly(null);
  }

  function resetArena() {
    shouldRunRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    clearActiveArenaMatch();
    clearMatch();
    setSession(createArenaSession());
    setStatus('idle');
  }

  function loadSavedMatch(match: PersistedArenaMatch) {
    shouldRunRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    setMatchMode(match.mode ?? 'ai-vs-ai');
    setWhiteProfileId(match.whiteProfileId);
    setBlackProfileId(match.blackProfileId);
    setFen(match.fen);
    setMoves(match.moves);
    setResult(match.result);
    setError(match.error);
    setThinkingColor(null);
    setReviewPly(null);
    setSession({ id: match.id, startedAt: match.startedAt });
    privateMemoryRef.current = restorePrivateMemory(match.moves);
    globalChatRef.current = restoreGlobalChat(match.moves);
    setStatus(match.state === 'finished' ? 'finished' : match.state === 'error' ? 'error' : 'idle');
  }

  function removeSavedMatch(id: string) {
    setSavedMatches(deleteArenaMatch(id));
    if (session.id === id) resetArena();
  }

  function removeAllSavedMatches() {
    clearArenaHistory();
    setSavedMatches([]);
  }

  function stopMatch() {
    shouldRunRef.current = false;
    setStatus('stopping');
    abortRef.current?.abort();
    humanMoveResolverRef.current?.(null);
    humanMoveResolverRef.current = null;
    activeGameRef.current = null;
    activeHumanColorRef.current = null;
  }

  function handleHumanMove(from: Square, to: Square, promotion: PromotionPiece = 'q') {
    const game = activeGameRef.current;
    const activeHumanColor = activeHumanColorRef.current;
    if (!game || !activeHumanColor || reviewing || status !== 'running') return;
    const turnColor: AgentColor = game.turn() === 'w' ? 'white' : 'black';
    if (turnColor !== activeHumanColor) return;
    const played = game.move({ from, to, promotion });
    if (!played) return;
    humanMoveResolverRef.current?.(played);
    humanMoveResolverRef.current = null;
  }

  async function requestAgentMove(game: Chess, profileId: string, color: AgentColor) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const controller = new AbortController();
      abortRef.current = controller;
      const response = await fetch('/api/agent-move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          fen: game.fen(),
          profileId,
          color,
          ply: game.history().length + 1,
          history: game.history().slice(-8),
          privateMemory: privateMemoryRef.current[color],
          globalChat: globalChatRef.current.slice(-6),
        }),
      });
      const payload = await response.json() as AgentMoveResponse;
      if (response.ok && payload.ok && payload.move) return payload;

      if (payload.code === 'AGENT_TEMPORARILY_UNAVAILABLE') {
        throw new Error(payload.error || 'O modelo ficou temporariamente indisponível.');
      }
      const retryable = response.status === 429 || response.status === 502 || response.status === 503;
      if (!retryable || attempt === 2) throw new Error(payload.error || `Falha do agente (${response.status})`);
      const retryAfterSeconds = Math.min(8, Number(response.headers.get('Retry-After')) || attempt);
      await delay(retryAfterSeconds * 1000);
    }
    throw new Error('O agente não conseguiu concluir a jogada.');
  }

  async function runMatch(game: Chess, resume = false, mode: ArenaMatchMode = matchMode) {
    const runHumanColor: AgentColor | null = mode === 'human-white' ? 'white' : mode === 'human-black' ? 'black' : null;
    if ((!runHumanColor || runHumanColor === 'black') && !whiteProfile.available) return;
    if ((!runHumanColor || runHumanColor === 'white') && !blackProfile.available) return;
    shouldRunRef.current = true;
    activeGameRef.current = game;
    activeHumanColorRef.current = runHumanColor;
    if (!resume) {
      clearActiveArenaMatch();
      setSession(createArenaSession());
      clearMatch();
    } else {
      setError('');
      setResult('');
    }
    setStatus('running');

    try {
      while (shouldRunRef.current && !game.isGameOver() && game.history().length < MAX_PLIES) {
        const color: AgentColor = game.turn() === 'w' ? 'white' : 'black';
        const profile = color === 'white' ? whiteProfile : blackProfile;
        let played: Move;
        let insight: AgentPrivateInsight;
        let global = '';
        let latencyMs = 0;
        let fallback = false;
        let inputChars = 0;
        let outputChars = 0;
        let model = profile.label;

        if (color === runHumanColor) {
          setThinkingColor(null);
          model = 'Você';
          const humanMove = await new Promise<Move | null>((resolve) => {
            humanMoveResolverRef.current = resolve;
          });
          if (!humanMove || !shouldRunRef.current) break;
          played = humanMove;
          global = humanChatDraft.trim().slice(0, 180);
          setHumanChatDraft('');
          if (global) globalChatRef.current = [...globalChatRef.current, { color, ply: game.history().length, message: global }].slice(-6);
          insight = {
            decision: `Você escolheu ${played.san}.`,
            opponentPlan: 'O modelo tentará interpretar sua intenção no próximo turno.',
            opponentPrediction: 'A resposta será calculada a partir da nova posição.',
            longTermStrategy: 'Seu plano é definido pelas decisões que você tomar no tabuleiro.',
            adaptations: 'Este lance foi escolhido diretamente por você.',
          };
        } else {
          setThinkingColor(color);
          const response = await requestAgentMove(game, profile.id, color);
          if (!shouldRunRef.current) break;
          const agentMove = game.move(response.move!);
          if (!agentMove) throw new Error('O servidor devolveu um lance que não é legal nesta posição.');
          played = agentMove;
          insight = response.private ?? defaultInsight(played.san);
          global = response.global?.trim() ?? '';
          latencyMs = response.latencyMs ?? 0;
          fallback = Boolean(response.fallback);
          inputChars = response.inputChars ?? 0;
          outputChars = response.outputChars ?? 0;
          privateMemoryRef.current[color] = [
            `Decisão anterior: ${insight.decision}`,
            `Plano rival: ${insight.opponentPlan}`,
            `Previsão rival: ${insight.opponentPrediction}`,
            `Plano de longo prazo: ${insight.longTermStrategy}`,
            `Adaptação: ${insight.adaptations}`,
          ].join(' ').slice(0, 1000);
          if (global) globalChatRef.current = [...globalChatRef.current, { color, ply: game.history().length, message: global }].slice(-6);
        }

        const ply = game.history().length;
        setFen(game.fen());
        setMoves((current) => [...current, {
          ply,
          san: played.san,
          uci: moveToUci(played),
          color,
          model,
          latencyMs,
          insight,
          global,
          fallback,
          inputChars,
          outputChars,
        }]);
        await delay(TURN_GAP_MS);
      }

      setThinkingColor(null);
      if (!shouldRunRef.current) {
        setStatus('idle');
        return;
      }
      setResult(resultFor(game, game.history().length >= MAX_PLIES));
      setStatus('finished');
    } catch (caught) {
      setThinkingColor(null);
      if (caught instanceof DOMException && caught.name === 'AbortError') {
        setStatus('idle');
        return;
      }
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus(game.history().length > 0 ? 'idle' : 'error');
    } finally {
      shouldRunRef.current = false;
      abortRef.current = null;
      activeGameRef.current = null;
      activeHumanColorRef.current = null;
      humanMoveResolverRef.current = null;
    }
  }

  function startMatch() {
    void runMatch(new Chess(), false, matchMode);
  }

  function resumeMatch() {
    try {
      void runMatch(gameFromArenaMoves(moves), true, matchMode);
    } catch {
      setError('Não foi possível restaurar a posição salva.');
      setStatus('error');
    }
  }

  const running = status === 'running' || status === 'stopping';
  const canResume = moves.length > 0 && !result && !new Chess(fen).isGameOver();

  return (
    <div className="agent-arena-shell">
      <header className="agent-arena-topbar">
        <button className="arena-back" onClick={onBack}>← Menu</button>
        <div className="arena-brand"><Swords size={18} /> Arena de agentes</div>
        <div className={`arena-live ${running ? 'is-live' : ''}`}>
          <span /> {running ? 'partida ao vivo' : '9Router conectado'}
        </div>
      </header>

      <main className="agent-arena-workspace">
        <PrivateChatPanel
          color="black"
          profile={humanColor === 'black' ? 'Você' : blackProfile.label}
          entries={blackMoves}
          active={thinkingColor === 'black'}
          human={humanColor === 'black'}
          className={mobileChatTab === 'black' ? 'mobile-active' : ''}
        />

        <section className="agent-center-stage">
          <div className="arena-mode-switch" aria-label="Formato do duelo">
            <button className={matchMode === 'ai-vs-ai' ? 'active' : ''} disabled={running} onClick={() => setMatchMode('ai-vs-ai')}>IA vs IA</button>
            <button className={matchMode === 'human-white' ? 'active' : ''} disabled={running} onClick={() => setMatchMode('human-white')}>Você de brancas</button>
            <button className={matchMode === 'human-black' ? 'active' : ''} disabled={running} onClick={() => setMatchMode('human-black')}>Você de pretas</button>
          </div>
          <div className="agent-match-toolbar">
            <div className="arena-model-pair">
              {matchMode === 'human-white' ? <HumanSeat label="Brancas" /> : <ModelSelect label="Brancas" value={whiteProfileId} disabled={running} onChange={setWhiteProfileId} />}
              <span className="arena-versus">VS</span>
              {matchMode === 'human-black' ? <HumanSeat label="Pretas" /> : <ModelSelect label="Pretas" value={blackProfileId} disabled={running} onChange={setBlackProfileId} />}
            </div>
            <div className="arena-actions">
              {!running ? (
                canResume ? (
                  <button className="arena-primary" onClick={resumeMatch}>
                    <Play size={16} fill="currentColor" /> Continuar do lance {moves.length}
                  </button>
                ) : (
                  <button className="arena-primary" onClick={startMatch}>
                    <Play size={16} fill="currentColor" /> {moves.length ? 'Jogar novamente' : 'Iniciar duelo'}
                  </button>
                )
              ) : (
                <button className="arena-danger" onClick={stopMatch} disabled={status === 'stopping'}>
                  <CircleStop size={16} /> {status === 'stopping' ? 'Parando…' : 'Parar'}
                </button>
              )}
              <button className="arena-reset" onClick={resetArena} disabled={running} aria-label="Reiniciar arena">
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          {(result || error) && (
            <div className={`arena-outcome ${error ? 'is-error' : ''}`}>
              <strong>{error ? 'Partida interrompida' : result}</strong>
              {error && <span>{error}</span>}
            </div>
          )}

          <AgentStrip color="black" profile={humanColor === 'black' ? 'Você' : blackProfile.label} active={thinkingColor === 'black'} human={humanColor === 'black'} />
          <MaterialScoreBar position={reviewPosition} />
          {reviewing && (
            <div className="arena-review-notice">
              <History size={15} /> Revendo o lance {displayedPly} de {moves.length}. A partida ao vivo continua sem alterações.
            </div>
          )}
          <div className={`agent-board-frame ${reviewing ? 'is-reviewing' : ''}`}>
            <ChessBoard
              externalFen={reviewPosition.fen}
              disabled={reviewing || !humanColor || status !== 'running'}
              playerColor={humanColor ?? undefined}
              onMoveRequest={humanColor ? handleHumanMove : undefined}
            />
          </div>
          <ReviewControls
            currentPly={displayedPly}
            totalPlies={moves.length}
            reviewing={reviewing}
            onChange={(ply) => setReviewPly(ply >= moves.length ? null : ply)}
            onLive={() => setReviewPly(null)}
          />
          <AgentStrip color="white" profile={humanColor === 'white' ? 'Você' : whiteProfile.label} active={thinkingColor === 'white'} human={humanColor === 'white'} />

          <div className="arena-performance">
            <span><Gauge size={14} /> média {averageLatency ? `${(averageLatency / 1000).toFixed(1)}s` : '—'}</span>
            <span>{moves.length} meios-lances</span>
            <span>contexto compacto · 8 lances</span>
          </div>

          <div className="arena-mobile-tabs" aria-label="Selecionar chat">
            <button className={mobileChatTab === 'black' ? 'active' : ''} onClick={() => setMobileChatTab('black')}>Privado P</button>
            <button className={mobileChatTab === 'global' ? 'active' : ''} onClick={() => setMobileChatTab('global')}>Global</button>
            <button className={mobileChatTab === 'white' ? 'active' : ''} onClick={() => setMobileChatTab('white')}>Privado B</button>
          </div>
        </section>

        <PrivateChatPanel
          color="white"
          profile={humanColor === 'white' ? 'Você' : whiteProfile.label}
          entries={whiteMoves}
          active={thinkingColor === 'white'}
          human={humanColor === 'white'}
          className={mobileChatTab === 'white' ? 'mobile-active' : ''}
        />

        <SavedMatchesPanel
          matches={visibleSavedMatches}
          activeId={session.id}
          onLoad={loadSavedMatch}
          onDelete={removeSavedMatch}
          onClear={removeAllSavedMatches}
        />

        <MoveHistoryPanel
          entries={moves}
          selectedPly={reviewing ? displayedPly : null}
          onSelect={(ply) => setReviewPly(ply >= moves.length ? null : ply)}
        />

        <GlobalChatPanel
          entries={globalMessages}
          humanColor={humanColor}
          humanDraft={humanChatDraft}
          onHumanDraftChange={setHumanChatDraft}
          className={mobileChatTab === 'global' ? 'mobile-active' : ''}
        />
      </main>
    </div>
  );
}

function AgentStrip({ color, profile, active, human = false }: { color: AgentColor; profile: string; active: boolean; human?: boolean }) {
  return (
    <div className={`agent-strip ${color} ${active ? 'thinking' : ''} ${human ? 'human' : ''}`}>
      <div className="agent-avatar">{human ? <span>♟</span> : <Bot size={18} />}</div>
      <div>
        <strong>{profile}</strong>
        <span>{color === 'white' ? 'Brancas' : 'Pretas'} · {human ? 'jogue diretamente no tabuleiro' : active ? 'calculando e atualizando o chat privado…' : 'aguardando'}</span>
      </div>
      <i>{human ? 'HUMANO' : active ? 'THINKING' : 'READY'}</i>
    </div>
  );
}

function MaterialScoreBar({ position }: { position: ReviewPosition }) {
  const advantage = position.materialScore > 0
    ? `Brancas +${position.materialScore}`
    : position.materialScore < 0
      ? `Pretas +${Math.abs(position.materialScore)}`
      : 'Material empatado';
  return (
    <div className="material-score-bar">
      <div className="captured-side black">
        <span>Pretas capturaram</span>
        <strong>{position.capturedByBlack.join(' ') || '—'}</strong>
      </div>
      <div className={`material-advantage ${position.materialScore > 0 ? 'white' : position.materialScore < 0 ? 'black' : ''}`}>
        {advantage}
      </div>
      <div className="captured-side white">
        <span>Brancas capturaram</span>
        <strong>{position.capturedByWhite.join(' ') || '—'}</strong>
      </div>
    </div>
  );
}

function ReviewControls({ currentPly, totalPlies, reviewing, onChange, onLive }: {
  currentPly: number;
  totalPlies: number;
  reviewing: boolean;
  onChange: (ply: number) => void;
  onLive: () => void;
}) {
  return (
    <div className="review-controls" aria-label="Navegação do histórico da partida">
      <button onClick={() => onChange(Math.max(0, currentPly - 1))} disabled={currentPly === 0} aria-label="Lance anterior">
        <ChevronLeft size={18} /> Anterior
      </button>
      <span>{currentPly === 0 ? 'Posição inicial' : `Após o meio-lance ${currentPly}`}</span>
      <button onClick={() => onChange(Math.min(totalPlies, currentPly + 1))} disabled={currentPly >= totalPlies} aria-label="Próximo lance">
        Próximo <ChevronRight size={18} />
      </button>
      <button className="review-live" onClick={onLive} disabled={!reviewing}>
        <Radio size={15} /> Ao vivo
      </button>
    </div>
  );
}

function PrivateChatPanel({ color, profile, entries, active, human = false, className = '' }: {
  color: AgentColor;
  profile: string;
  entries: ArenaMove[];
  active: boolean;
  human?: boolean;
  className?: string;
}) {
  return (
    <aside className={`agent-chat-panel private ${color} ${className}`}>
      <ChatHeader
        icon={<Bot size={17} />}
        eyebrow={human ? 'SEUS LANCES' : 'CHAT PRIVADO'}
        title={profile}
        meta={human ? `${color === 'white' ? 'Brancas' : 'Pretas'} · registro das suas decisões` : `${color === 'white' ? 'Brancas' : 'Pretas'} · só este modelo recebe esta memória`}
        active={active}
      />
      <AutoScrollFeed itemCount={entries.length} className="agent-chat-feed">
        {entries.length === 0 ? (
          <ChatEmpty text="As decisões, a leitura do rival e a estratégia aparecerão aqui." />
        ) : entries.map((entry) => (
          <article className="private-thought" key={entry.ply}>
            <div className="thought-meta">
              <strong>{entry.ply}. {entry.san}</strong>
              <span>{(entry.latencyMs / 1000).toFixed(1)}s</span>
            </div>
            <ThoughtLine label="O que vou fazer agora" text={entry.insight.decision} />
            <ThoughtLine label="O que acredito que o rival quer" text={entry.insight.opponentPlan} />
            <ThoughtLine label="O que espero que aconteça em seguida" text={entry.insight.opponentPrediction} />
            <ThoughtLine label="Meu objetivo para os próximos lances" text={entry.insight.longTermStrategy} emphasis />
            <ThoughtLine label="Como adaptei meu plano" text={entry.insight.adaptations} emphasis />
            <small>{entry.fallback ? 'lance de segurança · ' : ''}{entry.inputChars} entrada / {entry.outputChars} saída</small>
          </article>
        ))}
      </AutoScrollFeed>
    </aside>
  );
}

function GlobalChatPanel({ entries, humanColor, humanDraft, onHumanDraftChange, className = '' }: {
  entries: ArenaMove[];
  humanColor: AgentColor | null;
  humanDraft: string;
  onHumanDraftChange: (value: string) => void;
  className?: string;
}) {
  return (
    <section className={`agent-chat-panel global ${className}`}>
      <ChatHeader
        icon={<MessageCircle size={17} />}
        eyebrow="CANAL COMPARTILHADO"
        title="Chat global"
        meta="Mensagens opcionais que os dois modelos podem ler"
      />
      <AutoScrollFeed itemCount={entries.length} className="agent-chat-feed global-feed">
        {entries.length === 0 ? (
          <ChatEmpty text="Os agentes podem conversar, provocar ou ficar em silêncio." />
        ) : entries.map((entry) => (
          <article className={`global-message ${entry.color}`} key={entry.ply}>
            <div><strong>{entry.model}</strong><span>após {entry.ply}. {entry.san}</span></div>
            <p>{entry.global}</p>
          </article>
        ))}
      </AutoScrollFeed>
      {humanColor && (
        <label className="human-global-composer">
          <span>Sua mensagem opcional para o modelo — será enviada junto com seu próximo lance</span>
          <input
            value={humanDraft}
            maxLength={180}
            placeholder="Ex.: Quero ver como você reage a este ataque…"
            onChange={(event) => onHumanDraftChange(event.target.value)}
          />
        </label>
      )}
    </section>
  );
}

function SavedMatchesPanel({ matches, activeId, onLoad, onDelete, onClear }: {
  matches: PersistedArenaMatch[];
  activeId: string;
  onLoad: (match: PersistedArenaMatch) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <section className="saved-matches-panel">
      <div className="saved-matches-heading">
        <div>
          <span>ARQUIVO LOCAL</span>
          <strong>Histórico de partidas</strong>
          <small>Salvo automaticamente neste navegador, inclusive durante a partida</small>
        </div>
        {matches.length > 0 && <button onClick={onClear}><Trash2 size={14} /> Limpar histórico</button>}
      </div>
      {matches.length === 0 ? (
        <div className="saved-matches-empty">Seu primeiro duelo aparecerá aqui assim que o primeiro lance for jogado.</div>
      ) : (
        <div className="saved-matches-list">
          {matches.map((match) => {
            const white = getAgentModelProfile(match.whiteProfileId)?.label ?? match.whiteProfileId;
            const black = getAgentModelProfile(match.blackProfileId)?.label ?? match.blackProfileId;
            return (
              <article className={`saved-match ${match.id === activeId ? 'active' : ''}`} key={match.id}>
                <button className="saved-match-main" onClick={() => onLoad(match)}>
                  <span>{new Date(match.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  <strong>{white} <i>vs</i> {black}</strong>
                  <small>{match.moves.length} meios-lances · {match.result || (match.state === 'running' ? 'interrompida pelo F5 — pronta para continuar' : 'em andamento')}</small>
                </button>
                <button className="saved-match-delete" onClick={() => onDelete(match.id)} aria-label="Excluir partida salva">
                  <Trash2 size={15} />
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MoveHistoryPanel({ entries, selectedPly, onSelect }: {
  entries: ArenaMove[];
  selectedPly: number | null;
  onSelect: (ply: number) => void;
}) {
  const rounds = React.useMemo(() => {
    const grouped: Array<{ number: number; white?: ArenaMove; black?: ArenaMove }> = [];
    entries.forEach((entry) => {
      const index = Math.floor((entry.ply - 1) / 2);
      grouped[index] ??= { number: index + 1 };
      grouped[index][entry.color] = entry;
    });
    return grouped;
  }, [entries]);

  return (
    <section className="agent-history-panel">
      <ChatHeader
        icon={<History size={17} />}
        eyebrow="PARTIDA"
        title="Histórico de lances"
        meta="Acompanha o lance mais recente; role para cima para pausar"
      />
      <AutoScrollFeed itemCount={entries.length} className="arena-history-feed">
        {rounds.length === 0 ? (
          <ChatEmpty text="Os lances completos aparecerão aqui em ordem." />
        ) : rounds.map((round) => (
          <div className="history-round" key={round.number}>
            <span>{round.number}.</span>
            <HistoryMove entry={round.white} label="Brancas" selected={selectedPly === round.white?.ply} onSelect={onSelect} />
            <HistoryMove entry={round.black} label="Pretas" selected={selectedPly === round.black?.ply} onSelect={onSelect} />
          </div>
        ))}
      </AutoScrollFeed>
    </section>
  );
}

function HistoryMove({ entry, label, selected, onSelect }: {
  entry?: ArenaMove;
  label: string;
  selected: boolean;
  onSelect: (ply: number) => void;
}) {
  if (!entry) return <div className="history-move empty">—</div>;
  return (
    <button
      className={`history-move ${entry.color} ${selected ? 'selected' : ''}`}
      title={`${label}: ${entry.model} · ${entry.uci}`}
      onClick={() => onSelect(entry.ply)}
    >
      <strong>{entry.san}</strong>
      <small>{label} · {(entry.latencyMs / 1000).toFixed(1)}s</small>
    </button>
  );
}

function ChatHeader({ icon, eyebrow, title, meta, active = false }: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  meta: string;
  active?: boolean;
}) {
  return (
    <div className="chat-panel-header">
      <div className="chat-header-icon">{icon}</div>
      <div>
        <span>{eyebrow}</span>
        <strong>{title}</strong>
        <small>{meta}</small>
      </div>
      {active && <i>pensando</i>}
    </div>
  );
}

function ThoughtLine({ label, text, emphasis = false }: { label: string; text: string; emphasis?: boolean }) {
  return <p className={emphasis ? 'strategy-emphasis' : ''}><b>{label}</b>{text}</p>;
}

function ChatEmpty({ text }: { text: string }) {
  return <div className="chat-empty"><MessageCircle size={22} /><span>{text}</span></div>;
}

function HumanSeat({ label }: { label: string }) {
  return (
    <div className="arena-human-seat">
      <span>{label}</span>
      <strong>Você</strong>
    </div>
  );
}

function ModelSelect({ label, value, disabled, onChange }: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="arena-model-field">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {AGENT_MODEL_PROFILES.map((profile) => (
          <option key={profile.id} value={profile.id} disabled={!profile.available}>
            {profile.label}{profile.available ? '' : ' — indisponível'}
          </option>
        ))}
      </select>
    </label>
  );
}
