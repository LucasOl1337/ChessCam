## Code Context

**Query:** ChessCam full inventory frontend backend chess realtime camera analysis

### Entry Points

- **camera** (constant) - site/src/main.ts:11
  `= new THREE.PerspectiveCamera(38, 1, 0.1, 100)`
- **AnalysisResult** (interface) - src/chess/analysisEngine.ts:17
- **AnalysisEngine** (interface) - src/chess/analysisEngine.ts:25

### Related Symbols

- src/chess/analysisEngine.ts: analyze:111, MinimaxAnalysisEngine:103, analysisEngine:143

### Code

#### camera (site/src/main.ts:11)

```typescript
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
```

#### AnalysisResult (src/chess/analysisEngine.ts:17)

```typescript
export interface AnalysisResult {
  bestMove: string;           // SAN 
  eval: number;               // Rough score (positive good for side to move, in 'pawn units')
  pv?: string[];              // Principal variation
  depth?: number;             
  bestMoveUci?: string;
}
```

#### AnalysisEngine (src/chess/analysisEngine.ts:25)

```typescript
export interface AnalysisEngine {
  analyze(fen: string, options?: { depth?: number }): Promise<AnalysisResult>;
  isReady(): boolean;
}
```

#### analyze (src/chess/analysisEngine.ts:111)

```typescript
  async analyze(fen: string, options: { depth?: number } = {}): Promise<AnalysisResult> {
    this.chessEngine.load(fen);
    const depth = Math.min(options.depth || 4, 6); // safe for browser, ~instant on most pos

    const { move, score } = minimax(this.chessEngine, depth, -Infinity, Infinity, this.chessEngine.getTurn() === 'w');

    if (!move) {
      // fallback to first legal
      const legal = this.chessEngine.getLegalMoves();
      if (legal.length) {
        const first = (this.chessEngine as any).game.moves({ verbose: true })[0];
        return { bestMove: first?.san || `${first?.from}${first?.to}`, eval: 0, depth };
      }
      return { bestMove: '', eval: 0, depth };
    }

    const san = move.san || `${move.from}${move.to}`;
    // Normalize eval sign relative to side to move
    const turnAdvantage = this.chessEngine.getTurn() === 'w' ? 1 : -1;
    const normalizedEval = score * turnAdvantage;

    return {
      bestMove: san,
      eval: Math.round(normalizedEval * 100) / 100,
      depth,
      bestMoveUci: `${move.from}${move.to}${move.promotion || ''}`,
      pv: [san], // simple for now
    };
  }
```

#### MinimaxAnalysisEngine (src/chess/analysisEngine.ts:103)

```typescript
export class MinimaxAnalysisEngine implements AnalysisEngine {
  private chessEngine = new ChessEngine();
  private ready = true;

  isReady(): boolean {
    return this.ready;
  }

  async analyze(fen: string, options: { depth?: number } = {}): Promise<AnalysisResult> {
    this.chessEngine.load(fen);
    const depth = Math.min(options.depth || 4, 6); // safe for browser, ~instant on most pos

    const { move, score } = minimax(this.chessEngine, depth, -Infinity, Infinity, this.chessEngine.getTurn() === 'w');

    if (!move) {
      // fallback to first legal
      const legal = this.chessEngine.getLegalMoves();
      if (legal.length) {
        const first = (this.chessEngine as any).game.moves({ verbose: true })[0];
        return { bestMove: first?.san || `${first?.from}${first?.to}`, eval: 0, depth };
      }
      return { bestMove: '', eval: 0, depth };
    }

    const san = move.san || `${move.from}${move.to}`;
    // Normalize eval sign relative to side to move
    const turnAdvantage = this.chessEngine.getTurn() === 'w' ? 1 : -1;
    const normalizedEval = score * turnAdvantage;

    return {
      bestMove: san,
      eval: Math.round(normalizedEval * 100) / 100,
      depth,
      bestMoveUci: `${move.from}${move.to}${move.promotion || ''}`,
      pv: [san], // simple for now
    };
  }
}
```

