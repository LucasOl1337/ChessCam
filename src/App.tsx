/**
 * Xadrez Online - Jogo completo de xadrez
 * Fase atual: Tabuleiro local 100% funcional com todas as regras
 */

import React from 'react';
import { ChessBoard } from './components/ChessBoard';
import { Users, Copy, Check, Play, ArrowLeft } from 'lucide-react';
import { roomManager, type RoomState } from './net/roomManager';

type Screen = 'lobby' | 'local' | 'online';

function App() {
  const [screen, setScreen] = React.useState<Screen>('lobby');
  const [roomCode, setRoomCode] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const [gameResult, setGameResult] = React.useState<string | null>(null);
  const [moves, setMoves] = React.useState<any[]>([]);

  // Gera código de sala
  React.useEffect(() => {
    if (!roomCode) {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      setRoomCode(code);
    }
  }, [roomCode]);

  const shareableLink = `${window.location.origin}/?room=${roomCode}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareableLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const startLocalGame = () => {
    setScreen('local');
    setGameResult(null);
    setMoves([]);
  };

  const backToLobby = () => {
    setScreen('lobby');
    setGameResult(null);
    setMoves([]);
  };

  const handleGameOver = (result: string) => {
    setGameResult(result);
  };

  const handleMove = (move: any) => {
    setMoves(prev => [...prev, move]);
  };

  return (
    <div className="min-h-screen bg-[#111] text-white">
      {/* Header */}
      <header className="border-b border-white/10 py-5">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-[#b58863] to-[#8b5a2b] rounded-lg flex items-center justify-center text-xl">
              ♟
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tighter">Xadrez Online</h1>
              <p className="text-[10px] text-white/40 -mt-1">TEMPO REAL • CÂMERA • MULTIPLAYER</p>
            </div>
          </div>

          {screen !== 'lobby' && (
            <button
              onClick={backToLobby}
              className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
            >
              <ArrowLeft size={16} /> Voltar ao lobby
            </button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {screen === 'lobby' && (
          <div className="flex flex-col items-center text-center">
            <div className="mb-8">
              <h2 className="text-6xl font-bold tracking-tighter mb-3">
                Jogue xadrez<br />de verdade.
              </h2>
              <p className="text-2xl text-white/70">
                Tabuleiro premium • Regras oficiais • Multiplayer em tempo real
              </p>
            </div>

            {/* Tabuleiro de preview */}
            <div className="mb-10 opacity-80 scale-[0.92]">
              <ChessBoard onMove={() => {}} />
            </div>

            <div className="flex flex-col items-center gap-4 w-full max-w-sm">
              <button
                onClick={startLocalGame}
                className="w-full flex items-center justify-center gap-3 py-4 bg-white text-black font-semibold text-lg rounded-2xl hover:bg-white/90 active:scale-[0.985] transition-all"
              >
                <Play size={22} />
                JOGAR AGORA (Local)
              </button>

              <div className="text-xs text-white/40">
                Teste todas as regras • Xeque • Roque • Promoção • Xeque-mate
              </div>

              {/* Área de multiplayer (ainda em desenvolvimento) */}
              <div className="mt-8 w-full border border-white/10 rounded-2xl p-5 text-left bg-white/5">
                <div className="flex items-center gap-2 text-[#b58863] mb-2">
                  <Users size={18} />
                  <span className="font-medium text-sm">MULTIPLAYER — FASE 2 (EM DESENVOLVIMENTO)</span>
                </div>
                <div className="text-sm text-white/60 mb-4">
                  Conectando ao servidor WebSocket. Em breve: sala compartilhada + câmeras ao vivo.
                </div>

                <div className="flex gap-2">
                  <div className="flex-1 bg-black/50 border border-white/10 rounded-lg px-4 py-2 font-mono text-lg tracking-[3px] text-center">
                    {roomCode}
                  </div>
                  <button
                    onClick={copyLink}
                    className="px-4 bg-white/10 hover:bg-white/15 rounded-lg transition-colors flex items-center"
                  >
                    {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
                  </button>
                </div>

                <button
                  onClick={() => {
                    // Future: will actually join the room
                    alert('Multiplayer em construção! Por enquanto use o modo Local para jogar de verdade.');
                  }}
                  className="mt-3 w-full py-2 text-sm bg-[#b58863]/20 hover:bg-[#b58863]/30 border border-[#b58863]/40 rounded-lg transition-colors"
                >
                  Criar / Entrar na Sala Online (em breve)
                </button>
              </div>
            </div>
          </div>
        )}

        {screen === 'local' && (
          <div className="flex gap-8 justify-center">
            {/* Tabuleiro */}
            <div>
              <ChessBoard
                onGameOver={handleGameOver}
                onMove={handleMove}
              />
            </div>

            {/* Painel lateral */}
            <div className="w-80 flex flex-col">
              <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 flex-1">
                <div className="font-semibold mb-4 text-lg">Partida Local</div>

                {gameResult ? (
                  <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-center font-medium">
                    {gameResult}
                  </div>
                ) : (
                  <div className="mb-6 text-sm text-white/60">
                    Jogue contra você mesmo para testar todas as regras do xadrez.
                  </div>
                )}

                <div>
                  <div className="text-xs uppercase tracking-widest text-white/40 mb-2">Histórico de Lances</div>
                  {moves.length === 0 ? (
                    <div className="text-white/30 text-sm italic">Nenhum lance ainda...</div>
                  ) : (
                    <div className="font-mono text-sm space-y-0.5 max-h-[420px] overflow-auto pr-2">
                      {moves.map((move, index) => (
                        <div key={index} className="flex gap-2 text-white/80">
                          <span className="text-white/40 w-6">{Math.floor(index / 2) + 1}.</span>
                          <span>{move.san || `${move.from}-${move.to}`}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 text-[10px] text-center text-white/30">
                Todas as regras oficiais implementadas (chess.js)
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;