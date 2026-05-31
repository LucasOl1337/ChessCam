import React from "react";

interface GamePanelProps {
  isOnlineMode: boolean;
  roomCode?: string;
  moves?: any[];
  onStartCameraMatch?: () => void;
  onOfferDraw?: () => void;
  onResign?: () => void;
  onFlipBoard?: () => void;
}

export function GamePanel({
  isOnlineMode,
  roomCode,
  moves = [],
  onStartCameraMatch,
  onOfferDraw,
  onResign,
  onFlipBoard,
}: GamePanelProps) {
  return React.createElement("aside", { className: "game-panel", "aria-label": "Game panel" },
    // Camera Room
    React.createElement("div", { className: "panel-card room-card" },
      React.createElement("div", { className: "panel-kicker" }, "📷 Camera Room"),
      isOnlineMode 
        ? React.createElement("div", null,
            React.createElement("div", { className: "room-code-row" },
              React.createElement("span", { className: "room-code" }, roomCode || "------"),
              React.createElement("button", { 
                className: "icon-button", 
                onClick: () => navigator.clipboard?.writeText(roomCode || ""),
                title: "Copy room code"
              }, "⎘")
            ),
            React.createElement("button", { 
              className: "match-button", 
              onClick: onStartCameraMatch 
            }, roomCode ? "Reconnect Camera" : "Start Camera Match"),
            React.createElement("div", { style: { marginTop: 6, fontSize: 12, color: "#666" } }, 
              "Peer-to-peer webcam • Server validated moves")
          )
        : React.createElement("div", { style: { fontSize: 13, color: "#888", marginTop: 8, lineHeight: 1.35 } },
            "Local test board. Start a Camera Match from the landing to play live against strangers.")
    ),

    // Video Previews (when online)
    isOnlineMode && React.createElement("div", { className: "panel-card", style: { padding: 8 } },
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } },
        React.createElement("div", { 
          style: { 
            background: "#111", height: 92, borderRadius: 8, 
            display: "flex", alignItems: "center", justifyContent: "center", 
            fontSize: 11, color: "#555", border: "1px solid #222" 
          } 
        }, "Remote Video"),
        React.createElement("div", { 
          style: { 
            background: "#111", height: 92, borderRadius: 8, 
            display: "flex", alignItems: "center", justifyContent: "center", 
            fontSize: 11, color: "#555", border: "1px solid #222" 
          } 
        }, "Your Camera")
      )
    ),

    // Time Control
    React.createElement("div", { className: "panel-card time-control-card" },
      React.createElement("div", { className: "panel-title" }, "Time Control ", isOnlineMode ? "(online)" : "(local)", " +0s"),
      React.createElement("div", { className: "time-presets", style: { display: "flex", gap: 6, flexWrap: "wrap" } },
        ["5+0", "10+5", "15+10", "∞"].map(tc => 
          React.createElement("button", { 
            key: tc, 
            className: "time-preset-btn", 
            style: { fontSize: 12, padding: "4px 10px" } 
          }, tc)
        )
      )
    ),

    // Actions
    React.createElement("div", { className: "panel-card actions-card" },
      React.createElement("div", { className: "panel-title" }, "Actions"),
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
        React.createElement("button", { className: "draw-button", onClick: onOfferDraw, style: { width: "100%" } }, "Offer Draw"),
        React.createElement("button", { className: "resign-button", onClick: onResign, style: { width: "100%" } }, "Resign"),
        React.createElement("button", { 
          className: "draw-button", 
          onClick: onFlipBoard, 
          style: { width: "100%", background: "#3a3a2e" } 
        }, "⟳ Flip Board")
      )
    ),

    // Moves
    React.createElement("div", { className: "panel-card move-card" },
      React.createElement("div", { className: "panel-title" }, 
        "Moves ", React.createElement("span", { style: { fontSize: 10, opacity: 0.7 } }, "(click to review)")
      ),
      moves.length > 0 
        ? React.createElement("div", { style: { fontSize: 12, opacity: 0.85 } }, moves.length + " moves played")
        : React.createElement("div", { className: "empty-moves", style: { fontSize: 12 } }, "No moves yet")
    )
  );
}

