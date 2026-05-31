import React from 'react';
import { ChessEngine } from './chess/chessEngine';
import { Camera, BarChart3, FileText } from 'lucide-react';
import { ChessBoard } from './components/ChessBoard';
import { GamePanel } from './components/GamePanel';
import { playChessSound } from './sound';
import { analysisEngine } from './chess/analysisEngine';

export default function App() {
  const [screen, setScreen] = React.useState<'landing' | 'game'>('landing');
  const [gameMode, setGameMode] = React.useState<'local' | 'online'>('local');
  const [moves, setMoves] = React.useState<any[]>([]);
  const [gameResult, setGameResult] = React.useState<string | null>(null);
  const [historyIndex, setHistoryIndex] = React.useState<number | null>(null);
  const [boardFlipped, setBoardFlipped] = React.useState(false);
  const [analysisResult, setAnalysisResult] = React.useState<any>(null);
  const [whiteTime, setWhiteTime] = React.useState(300);
  const [blackTime, setBlackTime] = React.useState(300);
  const [activeColor, setActiveColor] = React.useState<'white' | 'black'>('white');
  const [timeControl] = React.useState({ minutes: 5, increment: 0 });
  const timerRef = React.useRef<any>(null);

  const isOnlineMode = gameMode === 'online';
  const localViewFen = historyIndex !== null ? getFenForHistoryIndex(historyIndex, moves) : undefined;

  React.useEffect(() => {
    if (isOnlineMode || gameResult) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      if (activeColor === 'white') setWhiteTime(t => Math.max(0, t - 1));
      else setBlackTime(t => Math.max(0, t - 1));
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeColor, isOnlineMode, gameResult]);

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
    setAnalysisResult(null);
    resetClocks();
  }

  function getFenForHistoryIndex(idx: number | null, moveList: any[]): string | undefined {
    if (idx === null || !moveList.length) return undefined;
    const eng = new ChessEngine();
    for (let i = 0; i <= idx && i < moveList.length; i++) {
      const m = moveList[i];
      if (m?.from && m?.to) try { eng.makeMove(m.from, m.to, m.promotion || 'q'); } catch {}
    }
    return eng.getFen();
  }

  function jumpToHistory(idx: number | null) {
    if (isOnlineMode) return;
    setHistoryIndex(idx);
  }

  function handleMove(move: any) {
    setMoves(p => [...p, move]);
    setHistoryIndex(null);
    setActiveColor(c => c === 'white' ? 'black' : 'white');
    playChessSound('move');
  }

  async function analyzePosition() {
    const eng = new ChessEngine();
    (isOnlineMode ? [] : moves).forEach((m: any) => {
      if (m?.from && m?.to) try { eng.makeMove(m.from, m.to, m.promotion || 'q'); } catch {}
    });
    const res = await analysisEngine.analyze(eng.getFen(), { depth: 5 });
    setAnalysisResult(res);
  }

  async function copyFEN() {
    const fen = localViewFen || new ChessEngine().getFen();
    await navigator.clipboard.writeText(fen);
    alert('FEN copiado!');
  }

  async function copyPGN() {
    const eng = new ChessEngine();
    const sans = moves.map((m: any) => {
      if (m?.from && m?.to) {
        const mo = eng.makeMove(m.from, m.to, m.promotion || 'q');
        return mo?.san;
      }
      return null;
    }).filter(Boolean);
    if (sans.length) {
      await navigator.clipboard.writeText(sans.join(' '));
      alert('PGN copiado!');
    }
  }

  function handleStartLocal() {
    setGameMode('local');
    setScreen('game');
    resetMatchState();
  }

  function handleStartCamera() {
    setGameMode('online');
    setScreen('game');
  }

  if (screen === 'landing') {
    return (
      <div className="landing-overlay">
        <div className="landing-card">
          <div className="landing-brand"><Camera size={32} /><div><div className="landing-title">ChessCam</div><div className="landing-subtitle">Play chess. Meet live.</div></div></div>
          <div className="landing-options">
            <button className="landing-option local" onClick={handleStartLocal}><div className="opt-icon">♟︎</div><div><div className="opt-title">Local Game</div><div className="opt-desc">Pass &amp; play • Strong analysis</div></div></button>
            <button className="landing-option online" onClick={handleStartCamera}><div className="opt-icon">📷</div><div><div className="opt-title">Camera Match</div><div className="opt-desc">Play vs stranger via webcam</div></div><div className="opt-badge">Recommended</div></button>
          </div>
          <div className="landing-hint">Minimax engine • Real time controls • WebRTC</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup"><div className="brand-mark"><Camera size={18} /></div><div><div className="brand-name">ChessCam</div><div className="brand-subtitle">Play chess. Meet live.</div></div></div>
        <div className="topbar-status"><span className={`status-dot ${isOnlineMode ? 'live' : ''}`} />{isOnlineMode ? 'Camera match' : 'Local board'}</div>
        <button onClick={() => setScreen('landing')} style={{ marginLeft: 'auto', fontSize: 12 }}>Menu</button>
      </header>

      <main className="game-layout">
        <section className="board-column">
          <div className="player-strip dark">
            <div className="player-avatar">B</div>
            <div className="player-meta"><div className="player-name">Guest opponent</div><div className="player-label">black</div></div>
            <div className={`player-clock ${blackTime < 30 ? 'low-time' : ''}`}>{Math.floor(blackTime/60)}:{(blackTime%60).toString().padStart(2,'0')}</div>
          </div>

          <ChessBoard
            onGameOver={setGameResult}
            onMove={isOnlineMode ? undefined : handleMove}
            onReset={resetMatchState}
            externalFen={isOnlineMode ? undefined : localViewFen}
            playerColor={boardFlipped ? 'black' : undefined}
            disabled={isOnlineMode || historyIndex !== null}
            arrows={analysisResult ? [{ from: (analysisResult.bestMove || '').slice(0,2), to: (analysisResult.bestMove || '').slice(2,4), color: '#4ade80' }] : []}
          />

          <div className="player-strip light">
            <div className="player-avatar">W</div>
            <div className="player-meta"><div className="player-name">You</div><div className="player-label">white</div></div>
            <div className={`player-clock ${whiteTime < 30 ? 'low-time' : ''}`}>{Math.floor(whiteTime/60)}:{(whiteTime%60).toString().padStart(2,'0')}</div>
          </div>

          {!isOnlineMode && moves.length > 0 && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 6, fontSize: 12 }}>
              <button onClick={() => jumpToHistory(0)}>⏮</button>
              <button onClick={() => jumpToHistory((historyIndex ?? moves.length-1)-1)}>◀</button>
              <span>{historyIndex === null ? 'Live' : `${(historyIndex ?? 0)+1}/${moves.length}`}</span>
              <button onClick={() => jumpToHistory((historyIndex ?? -1)+1)}>▶</button>
              <button onClick={() => jumpToHistory(null)}>Live</button>
              <button onClick={analyzePosition} style={{ background: '#1e40af', color: '#fff', padding: '0 8px' }}><BarChart3 size={14} /> Analyze</button>
            </div>
          )}
        </section>

        <div className="side-panel">
          <GamePanel 
            isOnlineMode={isOnlineMode}
            roomCode={undefined}
            moves={moves}
            onStartCameraMatch={() => { setGameMode('online'); }}
            onOfferDraw={() => setGameResult('Draw by agreement.')}
            onResign={() => setGameResult('You resigned.')}
            onFlipBoard={() => setBoardFlipped(f => !f)}
          />

          {analysisResult && (
            <div className="panel-card" style={{ borderColor: '#4ade80', background: 'rgba(74,222,128,0.1)' }}>
              <div style={{ color: '#4ade80', fontWeight: 600 }}>Analysis (depth {analysisResult.depth || 4})</div>
              <div>Best: <strong>{analysisResult.bestMove}</strong> Eval: <span style={{ color: analysisResult.eval > 0 ? '#4ade80' : '#f87171' }}>{analysisResult.eval}</span></div>
            </div>
          )}

          <div className="panel-card">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={copyFEN} style={{ fontSize: 12, padding: '6px 10px' }}><FileText size={14} /> FEN</button>
              <button onClick={copyPGN} style={{ fontSize: 12, padding: '6px 10px' }}><FileText size={14} /> PGN</button>
              <button onClick={analyzePosition} style={{ fontSize: 12, padding: '6px 10px', background: '#1e40af', color: '#fff' }}><BarChart3 size={14} /> Analyze</button>
            </div>
          </div>

          {gameResult && <div style={{ padding: 8, background: 'rgba(16,185,129,0.15)', color: '#4ade80', textAlign: 'center', fontWeight: 600 }}>{gameResult}</div>}
          <div style={{ fontSize: 11, opacity: 0.6, padding: '4px 8px' }}>Engine: Minimax αβ depth 5 • Rumo ao Stockfish para nível chess.com</div>
        </div>
      </main>
    </div>
  );
}
