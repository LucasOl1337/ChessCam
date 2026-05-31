/**
 * Analysis Engine Abstraction
 * 
 * This service provides chess analysis capabilities.
 * Currently implements a simple heuristic engine.
 * 
 * Roadmap to chess.com parity:
 * - Replace HeuristicAnalysisEngine with Stockfish WASM (via Web Worker + UCI)
 * - Support multi-PV (multiple best moves)
 * - Provide real evaluation scores (centipawns)
 * - Add principal variation (PV) lines
 * - Support analysis depth/time controls
 * - Add blunder detection, accuracy calculation, etc.
 */

import { ChessEngine } from './chessEngine';

export interface AnalysisResult {
  bestMove: string;           // SAN or UCI
  eval: number;               // Rough evaluation (positive = advantage for side to move)
  pv?: string[];              // Principal variation (future)
  depth?: number;             // Search depth (future - Stockfish)
}

export interface AnalysisEngine {
  analyze(fen: string): Promise<AnalysisResult>;
  isReady(): boolean;
}

/**
 * Simple heuristic-based analysis (current implementation)
 * This is a placeholder until we integrate real Stockfish.
 */
export class HeuristicAnalysisEngine implements AnalysisEngine {
  private chessEngine = new ChessEngine();

  isReady(): boolean {
    return true;
  }

  async analyze(fen: string): Promise<AnalysisResult> {
    this.chessEngine.load(fen);
    
    const verboseMoves = (this.chessEngine as any).game.moves({ verbose: true }) as any[];
    if (!verboseMoves || !verboseMoves.length) {
      return { bestMove: '', eval: 0 };
    }

    const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    let best: any = null;
    let bestScore = -999;

    verboseMoves.forEach((m: any) => {
      let score = 0;
      if (m.captured) score += (pieceValues[m.captured] || 0) * 10;
      
      const temp = new ChessEngine(fen);
      temp.makeMove(m.from, m.to, m.promotion);
      if (temp.isCheck()) score += 5;
      
      const center = ["d4", "d5", "e4", "e5"];
      if (center.includes(m.to)) score += 2;
      
      if ((m.piece === "n" || m.piece === "b") && ["1", "8"].some((r: string) => m.from.endsWith(r))) {
        score += 1;
      }
      
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    });

    if (!best) {
      return { bestMove: '', eval: 0 };
    }

    const san = best.san || `${best.from}${best.to}`;
    const evalScore = bestScore / 10;

    return {
      bestMove: san,
      eval: evalScore,
    };
  }
}

// Singleton for now (we can make this injectable later when we add Stockfish)
export const analysisEngine: AnalysisEngine = new HeuristicAnalysisEngine();
