import React from 'react';

interface GamePanelProps {
  // Add props as needed when wiring
  isOnlineMode: boolean;
  // ... other props from the old right panel
}

export function GamePanel(props: GamePanelProps) {
  return (
    <aside className="game-panel" aria-label="Game panel">
      <div style={{padding: 16, color: '#888', fontSize: 13}}>
        Game panel is being rebuilt for better chess.com-style experience.<br />
        Landing page + full polish coming in next steps.
      </div>
    </aside>
  );
}
