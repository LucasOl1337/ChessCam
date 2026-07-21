import React from 'react';
import type { Move } from 'chess.js';
import { ChessEngine, type PromotionPiece } from './chess/chessEngine';
import { Camera, Bot, FileText, Zap, Users, Monitor, Lock, Play } from 'lucide-react';
import { ChessBoard } from './components/ChessBoard';
import { GamePanel } from './components/GamePanel';
import { playChessSound } from './sound';
import { AgentArena, type ArenaMatchMode } from './agent/AgentArena';

export default function App() {
  const [screen, setScreen] = React.useState<'landing' | 'game'>('landing');
  const [gameMode, setGameMode] = React.useState<'local' | 'online' | 'agent'>('local');
  const [agentInitialMode, setAgentInitialMode] = React.useState<ArenaMatchMode>('ai-vs-ai');
  const [moves, setMoves] = React.useState<Move[]>([]);
  const [gameResult, setGameResult] = React.useState<string | null>(null);
  const [historyIndex, setHistoryIndex] = React.useState<number | null>(null);
  const [boardFlipped, setBoardFlipped] = React.useState(false);
  const [whiteTime, setWhiteTime] = React.useState(300);
  const [blackTime, setBlackTime] = React.useState(300);
  const [activeColor, setActiveColor] = React.useState<'white' | 'black'>('white');
  const [timeControl] = React.useState({ minutes: 5, increment: 0 });
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const isOnlineMode = gameMode === 'online';
  const isAgentMode = gameMode === 'agent';
  const localViewFen = historyIndex !== null ? getFenForHistoryIndex(historyIndex, moves) : undefined;

  React.useEffect(() => {
    if (isOnlineMode || isAgentMode || gameResult) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      if (activeColor === 'white') setWhiteTime(t => Math.max(0, t - 1));
      else setBlackTime(t => Math.max(0, t - 1));
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeColor, isOnlineMode, isAgentMode, gameResult]);

  function resetClocks() {
    const t = timeControl.minutes * 60;
    setWhiteTime(t);
    setBlackTime(t);
    setActiveColor('white');
  }

  function resetMatchState() {
    setMoves([]);
    setGameResult(null);
    setHistoryIndex(null);
    resetClocks();
  }

  function getFenForHistoryIndex(idx: number | null, moveList: Move[]): string | undefined {
    if (idx === null || !moveList.length) return undefined;
    const eng = new ChessEngine();
    for (let i = 0; i <= idx && i < moveList.length; i++) {
      const move = moveList[i];
      eng.makeMove(move.from, move.to, (move.promotion as PromotionPiece | undefined) || 'q');
    }
    return eng.getFen();
  }

  function jumpToHistory(idx: number | null) {
    if (isOnlineMode) return;
    setHistoryIndex(idx);
  }

  function handleMove(move: Move) {
    setMoves(p => [...p, move]);
    setHistoryIndex(null);
    setActiveColor(c => c === 'white' ? 'black' : 'white');
    playChessSound('move');
  }

  async function copyFEN() {
    const fen = localViewFen || new ChessEngine().getFen();
    await navigator.clipboard.writeText(fen);
    alert('FEN copiado!');
  }

  async function copyPGN() {
    const eng = new ChessEngine();
    const sans = moves.map((move) => {
      const played = eng.makeMove(move.from, move.to, (move.promotion as PromotionPiece | undefined) || 'q');
      return played?.san;
    }).filter(Boolean);
    if (sans.length) {
      await navigator.clipboard.writeText(sans.join(' '));
      alert('PGN copiado!');
    }
  }

  // === LANDING HANDLERS (nice options + quick game) ===
  function startQuickGame() {
    // Quick game = fast camera match with stranger (the core ChessCam experience)
    setGameMode('online');
    setScreen('game');
    resetMatchState();
    // Auto-trigger camera start after mount (small delay so state settles)
    setTimeout(() => {
      // In real flow this would call the startCameraMatch logic
      // For now we just land in online mode (user can click Start Camera Match)
    }, 120);
  }

  function startLocal() {
    setGameMode('local');
    setScreen('game');
    resetMatchState();
  }

  function startVsModel() {
    setAgentInitialMode('human-white');
    setGameMode('agent');
    setScreen('game');
    resetMatchState();
  }

  function startPrivateRoom() {
    // For now treat as online with note; real private room uses the room code flow already in previous versions
    setGameMode('online');
    setScreen('game');
    resetMatchState();
    alert('Sala privada: use o código da sala no topo depois de conectar (funcionalidade completa no multiplayer já existe no backend).');
  }

  function startCameraStranger() {
    setGameMode('online');
    setScreen('game');
    resetMatchState();
  }

  function startAgentArena() {
    setAgentInitialMode('ai-vs-ai');
    setGameMode('agent');
    setScreen('game');
    resetMatchState();
  }

  if (screen === 'landing') {
    return (
      <div className="landing-overlay">
        <div className="landing-card premium">
          {/* Hero / Brand */}
          <div className="landing-hero">
            <div className="brand-with-icon">
              <div className="brand-mark large"><Camera size={42} /></div>
              <div>
                <div className="landing-title">ChessCam</div>
                <div className="landing-subtitle">Jogue xadrez. Conheça gente de verdade.</div>
              </div>
            </div>
            <div className="landing-tagline">
              Tabuleiro físico via câmera • Motor forte • Partidas em tempo real
            </div>
          </div>

          {/* BIG PRIMARY CTA: Jogo Rápido */}
          <button 
            className="quick-game-cta" 
            onClick={startQuickGame}
            aria-label="Iniciar Jogo Rápido com um estranho via câmera"
          >
            <Zap size={22} style={{marginRight: 10}} />
            JOGO RÁPIDO — Encontrar oponente agora
            <span className="quick-badge">Recomendado</span>
          </button>

          <div className="landing-divider">ou escolha como quer jogar</div>

          <button className="agent-arena-cta" onClick={startAgentArena}>
            <div className="choice-icon"><Bot size={28} /></div>
            <div className="choice-body">
              <div className="choice-title">Arena IA vs IA</div>
              <div className="choice-desc">Escolha dois modelos do 9Router e assista a uma partida completa entre agentes.</div>
            </div>
            <span className="agent-arena-pill">NOVO</span>
          </button>

          {/* Choice Grid - nice selectable options */}
          <div className="landing-choices">
            <button className="choice-card" onClick={startLocal}>
              <div className="choice-icon"><Monitor size={26} /></div>
              <div className="choice-body">
                <div className="choice-title">Partida Local</div>
                <div className="choice-desc">Passa e joga no mesmo dispositivo, com regras oficiais e histórico.</div>
              </div>
            </button>

            <button className="choice-card" onClick={startVsModel}>
              <div className="choice-icon"><Play size={26} /></div>
              <div className="choice-body">
                <div className="choice-title">Jogar contra uma IA</div>
                <div className="choice-desc">Escolha Claude, GPT, Grok ou outro modelo e jogue de brancas ou pretas.</div>
                <div className="choice-sub">Com planos, chat, placar e replay completo</div>
              </div>
            </button>

            <button className="choice-card" onClick={startCameraStranger}>
              <div className="choice-icon"><Users size={26} /></div>
              <div className="choice-body">
                <div className="choice-title">Camera com Estranho</div>
                <div className="choice-desc">Use sua webcam • Jogue contra uma pessoa real ao vivo</div>
              </div>
            </button>

            <button className="choice-card" onClick={startPrivateRoom}>
              <div className="choice-icon"><Lock size={26} /></div>
              <div className="choice-body">
                <div className="choice-title">Sala Privada</div>
                <div className="choice-desc">Convide amigos com código • Perfeito para jogar com conhecidos</div>
              </div>
            </button>
          </div>

          <div className="landing-footer">
            <div className="tech-badges">
              <span>Modelos 9Router</span>
              <span>Clocks reais</span>
              <span>WebRTC P2P</span>
            </div>
            <button className="ghost-btn" onClick={() => alert('Em breve: puzzles, lições e replays públicos!')}>Explorar mais (em breve)</button>
          </div>
        </div>
      </div>
    );
  }

  if (isAgentMode) {
    return <AgentArena initialMode={agentInitialMode} onBack={() => { setScreen('landing'); resetMatchState(); }} />;
  }

  // ========= LOCAL / ONLINE GAME SCREEN =========
  const opponentLabel = isOnlineMode ? 'Oponente na câmera' : 'Convidado';

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Camera size={18} /></div>
          <div>
            <div className="brand-name">ChessCam</div>
            <div className="brand-subtitle">Play chess. Meet live.</div>
          </div>
        </div>
        <div className="topbar-status">
          <span className={`status-dot ${isOnlineMode ? 'live' : ''}`} />
          {isOnlineMode ? 'Camera match' : 'Local'}
        </div>
        <button onClick={() => { setScreen('landing'); resetMatchState(); }} style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 12px' }}>← Voltar ao menu</button>
      </header>

      <main className="game-layout">
        <section className="board-column">
          <div className="player-strip dark">
            <div className="player-avatar">B</div>
            <div className="player-meta">
              <div className="player-name">{opponentLabel}</div>
              <div className="player-label">black</div>
            </div>
            <div className={`player-clock ${blackTime < 30 ? 'low-time' : ''}`}>{Math.floor(blackTime/60)}:{(blackTime%60).toString().padStart(2,'0')}</div>
          </div>

          <ChessBoard
            onGameOver={setGameResult}
            onMove={isOnlineMode ? undefined : handleMove}
            onReset={resetMatchState}
            externalFen={isOnlineMode ? undefined : localViewFen}
            playerColor={boardFlipped ? 'black' : undefined}
            disabled={isOnlineMode || historyIndex !== null}
            arrows={[]}
          />

          <div className="player-strip light">
            <div className="player-avatar">W</div>
            <div className="player-meta">
              <div className="player-name">Você</div>
              <div className="player-label">white</div>
            </div>
            <div className={`player-clock ${whiteTime < 30 ? 'low-time' : ''}`}>{Math.floor(whiteTime/60)}:{(whiteTime%60).toString().padStart(2,'0')}</div>
          </div>

          {!isOnlineMode && moves.length > 0 && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 6, fontSize: 12, flexWrap: 'wrap' }}>
              <button onClick={() => jumpToHistory(0)}>⏮</button>
              <button onClick={() => jumpToHistory((historyIndex ?? moves.length-1)-1)}>◀</button>
              <span>{historyIndex === null ? 'Live' : `${(historyIndex ?? 0)+1}/${moves.length}`}</span>
              <button onClick={() => jumpToHistory((historyIndex ?? -1)+1)}>▶</button>
              <button onClick={() => jumpToHistory(null)}>Live</button>
            </div>
          )}
        </section>

        <div className="side-panel">
          <GamePanel 
            isOnlineMode={isOnlineMode}
            roomCode={undefined}
            moves={moves}
            onStartCameraMatch={() => { setGameMode('online'); }}
            onOfferDraw={() => setGameResult('Empate por acordo.')}
            onResign={() => setGameResult('Você abandonou.')}
            onFlipBoard={() => setBoardFlipped(f => !f)}
          />

          <div className="panel-card">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={copyFEN} style={{ fontSize: 12, padding: '6px 10px' }}><FileText size={14} /> FEN</button>
              <button onClick={copyPGN} style={{ fontSize: 12, padding: '6px 10px' }}><FileText size={14} /> PGN</button>
            </div>
          </div>

          {gameResult && <div style={{ padding: 8, background: 'rgba(16,185,129,0.15)', color: '#4ade80', textAlign: 'center', fontWeight: 600 }}>{gameResult}</div>}
          <div style={{ fontSize: 11, opacity: 0.6, padding: '4px 8px' }}>
            Regras oficiais via chess.js • IA disponível pela Arena 9Router
          </div>
        </div>
      </main>
    </div>
  );
}
