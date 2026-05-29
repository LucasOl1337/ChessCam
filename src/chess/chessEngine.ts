/**
 * Chess Engine Wrapper
 * Thin wrapper around chess.js providing a clean API
 */

import { Chess } from 'chess.js';
import type { Move as ChessMove, Square } from 'chess.js';

type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export class ChessEngine {
  private game: Chess;

  constructor(fen?: string) {
    this.game = fen ? new Chess(fen) : new Chess();
  }

  getFen(): string {
    return this.game.fen();
  }

  getTurn(): 'w' | 'b' {
    return this.game.turn();
  }

  getLegalMoves(square?: Square): string[] {
    const moves = square
      ? this.game.moves({ square, verbose: true })
      : this.game.moves({ verbose: true });

    return moves.map((move) => move.to);
  }

  makeMove(from: Square, to: Square, promotion: PromotionPiece = 'q'): ChessMove | null {
    try {
      return this.game.move({ from, to, promotion });
    } catch {
      return null;
    }
  }

  isCheck(): boolean {
    return this.game.isCheck();
  }

  isCheckmate(): boolean {
    return this.game.isCheckmate();
  }

  isStalemate(): boolean {
    return this.game.isStalemate();
  }

  isDraw(): boolean {
    return this.game.isDraw();
  }

  isGameOver(): boolean {
    return this.game.isGameOver();
  }

  getHistory(): ChessMove[] {
    return this.game.history({ verbose: true });
  }

  undo(): ChessMove | null {
    return this.game.undo();
  }

  reset(): void {
    this.game.reset();
  }

  load(fen: string): boolean {
    try {
      this.game.load(fen);
      return true;
    } catch {
      return false;
    }
  }
}

export const localGame = new ChessEngine();
