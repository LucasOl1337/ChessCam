import React from 'react';
import { Camera, Check, Copy, Radio, Users } from 'lucide-react';
import { ChessBoard } from './components/ChessBoard';

function App() {
  const [roomCode] = React.useState(() => Math.random().toString(36).substring(2, 8).toUpperCase());
  const [copied, setCopied] = React.useState(false);
  const [gameResult, setGameResult] = React.useState<string | null>(null);
  const [moves, setMoves] = React.useState<any[]>([]);
const copyRoom = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/?room=${roomCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleMove = (move: any) => {
    setMoves((prev) => [...prev, move]);
  };

  const resetMatchState = () => {
    setMoves([]);
    setGameResult(null);
  };

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
          <span className="status-dot" />
          Local board online
        </div>
      </header>

      <main className="game-layout">
        <section className="board-column" aria-label="Chess board">
          <PlayerStrip name="Guest opponent" label="Black" tone="dark" />
          <ChessBoard onGameOver={setGameResult} onMove={handleMove} onReset={resetMatchState} />
          <PlayerStrip name="You" label="White" tone="light" />
        </section>

        <aside className="game-panel" aria-label="Game panel">
          <section className="panel-card room-card">
            <div className="panel-kicker"><Radio size={14} /> Camera room</div>
            <div className="room-code-row">
              <span className="room-code">{roomCode}</span>
              <button className="icon-button" onClick={copyRoom} aria-label="Copy room link">
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
            <button className="match-button" disabled>
              <Users size={17} /> Pairing coming soon
            </button>
          </section>

          <section className="panel-card result-card">
            <div className="panel-title">Game</div>
            {gameResult ? (
              <div className="result-banner">{gameResult}</div>
            ) : (
              <div className="panel-muted">Make a move to start the local test match.</div>
            )}
          </section>

          <section className="panel-card move-card">
            <div className="panel-title">Moves</div>
            <div className="moves-table">
              {moves.length === 0 ? (
                <div className="empty-moves">No moves yet</div>
              ) : (
                Array.from({ length: Math.ceil(moves.length / 2) }).map((_, row) => {
                  const white = moves[row * 2];
                  const black = moves[row * 2 + 1];
                  return (
                    <div className="move-row" key={row}>
                      <span className="move-index">{row + 1}</span>
                      <span>{white?.san ?? ''}</span>
                      <span>{black?.san ?? ''}</span>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}

function PlayerStrip({ name, label, tone }: { name: string; label: string; tone: 'light' | 'dark' }) {
  return (
    <div className={`player-strip ${tone}`}>
      <div className="player-avatar">{label[0]}</div>
      <div className="player-meta">
        <div className="player-name">{name}</div>
        <div className="player-label">{label}</div>
      </div>
      <div className="player-clock">10:00</div>
    </div>
  );
}

export default App;