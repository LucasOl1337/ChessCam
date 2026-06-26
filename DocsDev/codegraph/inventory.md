# Inventario CodeGraph - ChessCam

Gerado em 2026-06-26 a partir do indice CodeGraph local (`codegraph 0.9.4`) e de leituras pontuais de arquivos reais do projeto. O indice estava sincronizado: 17 arquivos, 313 nodes, 755 edges, backend `node:sqlite`, journal `wal`.

Escopo analisado: `src/`, `server/`, `worker/`, `site/`, configs Vite/Wrangler, assets e docs existentes. Diretórios ignorados: `node_modules`, `.git`, `dist`, `.wrangler`, `.codegraph` e caches.

Arquivos de referencia gerados nesta pasta:

- `codegraph-status.txt`: status bruto do indice.
- `codegraph-files.json`: lista JSON de arquivos indexados.
- `codegraph-context.md`: contexto bruto gerado por `codegraph context`.
- `codegraph-visual.html`: visual interativo autocontido dos modulos e fluxos.

## 1. Funcoes de uso do cliente / usuario comum

### Menu inicial e selecao de modo

- Nome: Landing/Menu ChessCam.
- Descricao: tela inicial com opcoes para jogo rapido, partida local, computador, camera com estranho e sala privada.
- Arquivos relacionados: `src/App.tsx`, `src/App.css`, `src/index.css`, `src/assets/hero.png`.
- Como e acessada/usada: `src/main.tsx` renderiza `App`; `App` inicia na tela `landing` e muda `screen` para `game`.
- Dependencias internas: `Camera`, `Monitor`, `Play`, `Users`, `Lock`, `Zap` de `lucide-react`; estado local de `App`.
- Status: parcial.
- Observacoes tecnicas: os botoes mudam o modo visual, mas `Jogo Rapido` apenas entra em modo online; o comentario no proprio codigo diz que a chamada real de camera ainda nao e executada. `Sala Privada` exibe `alert` e nao chama `RoomManager.joinRoom`.

### Partida local no navegador

- Nome: Local chess game.
- Descricao: tabuleiro jogavel para duas pessoas no mesmo dispositivo, com validacao de lances, historico e fim de jogo.
- Arquivos relacionados: `src/App.tsx`, `src/components/ChessBoard.tsx`, `src/chess/chessEngine.ts`.
- Como e acessada/usada: botao "Partida Local" chama `startLocal`; `App` renderiza `ChessBoard` com `onMove={handleMove}`.
- Dependencias internas: `ChessBoard`, `ChessEngine`, `playChessSound`, `GamePanel`.
- Status: funcional.
- Observacoes tecnicas: `ChessBoard` usa `chess.js` via `ChessEngine` para movimentos legais, xeque, mate, empate e FEN. O historico e mantido em `moves` dentro de `App`.

### Jogo contra computador

- Nome: Vs Computer.
- Descricao: modo em que o usuario joga de brancas e o app tenta responder com um lance calculado por minimax.
- Arquivos relacionados: `src/App.tsx`, `src/chess/analysisEngine.ts`, `src/chess/chessEngine.ts`.
- Como e acessada/usada: botao "Contra o Computador" chama `startVsComputer`; depois `handleMove` dispara `analysisEngine.analyze`.
- Dependencias internas: `MinimaxAnalysisEngine`, `ChessEngine`, estado `computerLevel`.
- Status: parcial.
- Observacoes tecnicas: `analysisEngine.analyze` retorna `bestMove` em SAN e `bestMoveUci`, mas `App.handleMove` interpreta `res.bestMove` como UCI (`slice(0,2)`, `slice(2,4)`). Isso pode quebrar respostas do computador quando SAN nao coincidir com coordenadas UCI. O proprio arquivo indica Stockfish WASM como proximo passo.

### Interacao com o tabuleiro

- Nome: ChessBoard drag/click move UI.
- Descricao: selecao de pecas, destinos legais, aplicacao de lances, highlights, setas de analise e promocao.
- Arquivos relacionados: `src/components/ChessBoard.tsx`, `src/chess/chessEngine.ts`.
- Como e acessada/usada: `App` renderiza `ChessBoard`; o usuario clica ou arrasta pecas.
- Dependencias internas: `ChessEngine.getLegalMoves`, `ChessEngine.getPromotionOptions`, `ChessEngine.makeMove`, `react-chessboard`.
- Status: funcional.
- Observacoes tecnicas: quando `onMoveRequest` existe, o componente fica controlado e envia o lance para fora; no `App` atual esse caminho nao esta conectado para online.

### Promocao de peao

- Nome: Promotion dialog.
- Descricao: quando um lance exige promocao, o tabuleiro mostra opcoes de peca antes de aplicar.
- Arquivos relacionados: `src/components/ChessBoard.tsx`, `src/chess/chessEngine.ts`.
- Como e acessada/usada: `handleMoveAttempt` consulta `getPromotionOptions`; `confirmPromotion` aplica o lance.
- Dependencias internas: `PromotionPiece`, `ChessEngine`.
- Status: funcional.
- Observacoes tecnicas: funciona no fluxo local/controlado do `ChessBoard`; depende do estado `pendingPromotion`.

### Historico e revisao de lances

- Nome: History scrub / review.
- Descricao: permite navegar para posicoes anteriores da partida local.
- Arquivos relacionados: `src/App.tsx`, `src/components/GamePanel.tsx`, `src/chess/chessEngine.ts`.
- Como e acessada/usada: botoes de navegacao em `App` chamam `jumpToHistory`; `getFenForHistoryIndex` reconstrói FEN.
- Dependencias internas: `ChessEngine.makeMove`, `ChessBoard.externalFen`.
- Status: funcional para local; nao conectada para online.
- Observacoes tecnicas: `jumpToHistory` retorna sem agir em modo online. `GamePanel` apenas mostra contagem de lances, nao lista lances clicaveis.

### Relogios

- Nome: Local clocks.
- Descricao: decrementa o tempo do lado ativo em partidas nao-online.
- Arquivos relacionados: `src/App.tsx`, `src/components/GamePanel.tsx`.
- Como e acessada/usada: `useEffect` em `App` cria intervalo de 1 segundo quando nao esta online.
- Dependencias internas: `activeColor`, `whiteTime`, `blackTime`, `timeControl`.
- Status: parcial.
- Observacoes tecnicas: nao ha incremento local efetivo alem do valor fixo `5+0`; nao ha disparo de game-over local quando tempo chega a zero. Em online, a logica de clock fica no backend.

### Analise de posicao

- Nome: Analyze position.
- Descricao: calcula melhor lance/eval com minimax e desenha uma seta no tabuleiro.
- Arquivos relacionados: `src/App.tsx`, `src/chess/analysisEngine.ts`, `src/components/ChessBoard.tsx`.
- Como e acessada/usada: botao "Analisar" chama `analyzePosition`; resultado aparece no painel e em `arrows`.
- Dependencias internas: `analysisEngine`, `ChessEngine`, `ChessBoard.arrows`.
- Status: parcial.
- Observacoes tecnicas: para online, `analyzePosition` usa lista vazia e analisa a posicao inicial; para local reconstroi a partida por `moves`.

### Copiar FEN/PGN

- Nome: Clipboard export.
- Descricao: copia FEN e PGN simplificado para a area de transferencia.
- Arquivos relacionados: `src/App.tsx`.
- Como e acessada/usada: funcoes `copyFEN` e `copyPGN`.
- Dependencias internas: `ChessEngine`, `navigator.clipboard`.
- Status: parcial.
- Observacoes tecnicas: as funcoes existem, mas no trecho renderizado atual nao ha botao confirmado para chama-las. `copyFEN` usa FEN inicial quando nao ha `localViewFen`, mesmo que a partida tenha lances.

### Sons

- Nome: Chess sounds.
- Descricao: feedback sonoro por Web Audio para move, capture, check, promote e gameover.
- Arquivos relacionados: `src/sound.ts`, `src/App.tsx`.
- Como e acessada/usada: `handleMove` chama `playChessSound('move')`.
- Dependencias internas: Web Audio API.
- Status: parcial.
- Observacoes tecnicas: a funcao cobre mais tipos do que o app atual chama. Por restricoes de autoplay, pode falhar silenciosamente.

### Draw, resign e flip board

- Nome: GamePanel actions.
- Descricao: botoes de empate, abandono e virar tabuleiro.
- Arquivos relacionados: `src/components/GamePanel.tsx`, `src/App.tsx`, `server/index.ts`, `worker/src/index.ts`.
- Como e acessada/usada: `GamePanel` recebe callbacks de `App`.
- Dependencias internas: `onOfferDraw`, `onResign`, `onFlipBoard`.
- Status: parcial.
- Observacoes tecnicas: no `App` atual os botoes apenas setam `gameResult` local ou invertem `boardFlipped`; nao enviam mensagens `offer-draw`/`resign` ao backend. Backend possui handlers reais.

### Camera match / WebRTC

- Nome: Camera room UI.
- Descricao: painel de "Camera Room" com room code, botao Start Camera Match e placeholders de video.
- Arquivos relacionados: `src/components/GamePanel.tsx`, `src/App.tsx`, `src/net/wsClient.ts`, `server/index.ts`, `worker/src/index.ts`.
- Como e acessada/usada: selecionando modo online; `GamePanel` mostra placeholders "Remote Video" e "Your Camera".
- Dependencias internas: protocolo WebSocket e mensagens `webrtc-offer`, `webrtc-answer`, `ice-candidate`.
- Status: parcial/quebrada na UI atual.
- Observacoes tecnicas: backend encaminha sinalizacao WebRTC, mas nao ha codigo de `RTCPeerConnection`, `getUserMedia`, elementos `<video>` reais ou conexao `RoomManager` no `App` atual. O arquivo `tmp_app_good.ts` parece conter uma implementacao mais completa, mas esta desconectado.

### Site promocional/visual Three.js

- Nome: Standalone site lens.
- Descricao: projeto separado em `site/` com cena Three.js e assets de marketing/demo.
- Arquivos relacionados: `site/src/main.ts`, `site/src/styles.css`, `site/package.json`, `site/public/*`.
- Como e acessada/usada: app Vite separado dentro de `site/`.
- Dependencias internas: `three`.
- Status: funcional/incerto.
- Observacoes tecnicas: indexado pelo CodeGraph como TypeScript, mas nao esta conectado ao app principal nem ao `package.json` raiz.

## 2. Funcoes de estrutura e backend

### Servidor local Express + ws

- Nome: Local realtime server.
- Descricao: servidor Node local com Express e `ws` para desenvolvimento.
- Arquivos relacionados: `server/index.ts`, `vite.config.ts`, `package.json`.
- Como e acessada/usada: `npm run dev:full` executa Vite e `npm run server`; Vite proxy encaminha `/ws` e `/api` para `localhost:3001`.
- Dependencias internas: `chess.js`, `express`, `ws`.
- Status: funcional como backend isolado.
- Observacoes tecnicas: possui rota `GET /api/health` e WebSocket em `/ws`. O frontend atual nao instancia `RoomManager`, portanto o caminho online nao esta totalmente ligado.

### Cloudflare Worker Durable Object

- Nome: ChessCamHub.
- Descricao: Durable Object que centraliza salas, clientes, matchmaking, lances, draw/resign/rematch e sinalizacao WebRTC.
- Arquivos relacionados: `worker/src/index.ts`, `wrangler.toml`.
- Como e acessada/usada: `wrangler.toml` define `main = "worker/src/index.ts"`, binding `CHESSCAM_HUB`, assets de `dist` e rota `chess.luca-ai.com.br`.
- Dependencias internas: `chess.js`, tipos `@cloudflare/workers-types`.
- Status: funcional como backend isolado/incerto em deploy.
- Observacoes tecnicas: `fetch` responde `/api/realtime-health` e aceita WebSocket. O inventario nao executou deploy nem teste externo.

### Gerenciamento de salas no backend

- Nome: Rooms and matchmaking.
- Descricao: cria salas, associa jogadores a cores, faz quick-match e join por codigo.
- Arquivos relacionados: `server/index.ts`, `worker/src/index.ts`.
- Como e acessada/usada: mensagens `quick-match` e `join-room` no WebSocket.
- Dependencias internas: `generateRoomCode`, `normalizeRoomCode`, `createRoom`, `addClientToRoom`, `roomJoinedPayload`.
- Status: funcional no backend; parcial no frontend.
- Observacoes tecnicas: existem duas implementacoes paralelas (Node local e Worker), aumentando risco de divergencia.

### Validacao autoritativa de lances

- Nome: Server-side move validation.
- Descricao: backend valida turno, assento, movimento legal, atualiza FEN e transmite `move-made`.
- Arquivos relacionados: `server/index.ts`, `worker/src/index.ts`.
- Como e acessada/usada: mensagem `make-move` pelo WebSocket.
- Dependencias internas: `chess.js`, `broadcast`, `send`, `RoomState/GameRoom`.
- Status: funcional no backend.
- Observacoes tecnicas: servidor local tambem calcula clocks e transmite `whiteTime/blackTime`, mas o tipo `ServerMessage` do cliente nao declara esses campos.

### Draw, resign, rematch e leave no backend

- Nome: Match lifecycle handlers.
- Descricao: processa abandono, oferta/aceite/recusa de empate, rematch e saida de sala.
- Arquivos relacionados: `server/index.ts`, `worker/src/index.ts`.
- Como e acessada/usada: mensagens `resign`, `offer-draw`, `accept-draw`, `decline-draw`, `rematch`, `leave`.
- Dependencias internas: `getOpponent`, `broadcast`, `leaveRoom`, `createRoom`.
- Status: funcional no backend; nao conectada na UI atual.
- Observacoes tecnicas: `src/net/protocol.ts` nao inclui `rematch`, `leave`, `draw-offered`, `draw-declined`, `rematch-requested`, `opponent-left` ou campos de tempo.

### Sinalizacao WebRTC

- Nome: WebRTC signaling relay.
- Descricao: encaminha offer, answer e ICE candidates ao oponente.
- Arquivos relacionados: `server/index.ts`, `worker/src/index.ts`, `src/net/protocol.ts`.
- Como e acessada/usada: mensagens `webrtc-offer`, `webrtc-answer`, `ice-candidate`.
- Dependencias internas: `forwardToOpponent`.
- Status: funcional no backend; nao conectada no frontend.
- Observacoes tecnicas: faltam chamadas reais de camera e peer connection no `src/App.tsx` atual.

### Cliente WebSocket

- Nome: WSClient singleton.
- Descricao: encapsula conexao WebSocket, parsing de mensagens, reconnect e registro de handlers.
- Arquivos relacionados: `src/net/wsClient.ts`, `src/net/protocol.ts`.
- Como e acessada/usada: `RoomManager` chama `wsClient.connect`, `send`, `onMessage`.
- Dependencias internas: `ClientMessage`, `ServerMessage`.
- Status: funcional/nao conectado.
- Observacoes tecnicas: `WSClient` existe e e exportado como singleton, mas `App` nao importa `roomManager` nem `wsClient`.

### RoomManager frontend

- Nome: RoomManager.
- Descricao: camada de estado de sala para o frontend, com subscribe, joinRoom, makeMove, resign e disconnect.
- Arquivos relacionados: `src/net/roomManager.ts`, `src/net/wsClient.ts`.
- Como e acessada/usada: deveria ser consumido por componentes React; atualmente nao ha uso confirmado pelo CodeGraph a partir de `App`.
- Dependencias internas: `wsClient`, `ServerMessage`, `RoomState`.
- Status: nao conectada.
- Observacoes tecnicas: trata somente `room-joined`, `move-made`, `game-over` e `error`; ignora WebRTC, draw, rematch, opponent-left e clocks.

### Protocolos TypeScript

- Nome: ClientMessage/ServerMessage.
- Descricao: tipos compartilhados para mensagens WebSocket do frontend.
- Arquivos relacionados: `src/net/protocol.ts`, `server/index.ts`, `worker/src/index.ts`.
- Como e acessada/usada: `WSClient` e `RoomManager`.
- Dependencias internas: tipos literais de mensagens.
- Status: parcial/inconsistente.
- Observacoes tecnicas: backend aceita mais mensagens do que `ClientMessage` declara e emite mais payloads do que `ServerMessage` cobre. O servidor local e o worker tambem declaram seus proprios tipos internos.

### Deploy e build

- Nome: Build/deploy pipeline.
- Descricao: Vite build e deploy Cloudflare Worker com assets SPA.
- Arquivos relacionados: `package.json`, `vite.config.ts`, `wrangler.toml`, `tsconfig*.json`.
- Como e acessada/usada: `npm run build`, `npm run worker:deploy`, `npm run deploy`.
- Dependencias internas: TypeScript, Vite, Wrangler.
- Status: funcional/incerto.
- Observacoes tecnicas: nao foi feito build nesta automacao; status funcional e inferido dos scripts/configs existentes.

## 3. Funcoes de estrutura frontend

### Bootstrap React

- Nome: React entrypoint.
- Descricao: cria root React e renderiza `App`.
- Arquivos relacionados: `src/main.tsx`, `index.html`.
- Como e acessada/usada: Vite carrega `/src/main.tsx` a partir de `index.html`.
- Dependencias internas: `App`, `src/index.css`.
- Status: funcional.
- Observacoes tecnicas: entrada principal do app root.

### App shell

- Nome: App state coordinator.
- Descricao: coordena tela, modo de jogo, lances, resultado, clocks, analise, historico e painel lateral.
- Arquivos relacionados: `src/App.tsx`.
- Como e acessada/usada: renderizado pelo bootstrap React.
- Dependencias internas: `ChessBoard`, `GamePanel`, `ChessEngine`, `analysisEngine`, `playChessSound`.
- Status: parcial.
- Observacoes tecnicas: mistura landing, game screen, clocks, computador, historico e analise em um componente grande. Online/camera nao esta integrado com `RoomManager`.

### ChessBoard component

- Nome: Board UI component.
- Descricao: componente de tabuleiro baseado em `react-chessboard`, com FEN, highlights, lances legais, promocao e callbacks.
- Arquivos relacionados: `src/components/ChessBoard.tsx`.
- Como e acessada/usada: `App` renderiza o componente na tela de jogo.
- Dependencias internas: `ChessEngine`, `PromotionPiece`, `ChessboardOptions`.
- Status: funcional.
- Observacoes tecnicas: o componente suporta modo controlado por `onMoveRequest`, mas o app principal usa somente modo local.

### GamePanel component

- Nome: Side game panel.
- Descricao: painel de sala/camera, placeholders de video, time control, acoes e resumo de lances.
- Arquivos relacionados: `src/components/GamePanel.tsx`.
- Como e acessada/usada: `App` passa callbacks e `moves`.
- Dependencias internas: props simples; `navigator.clipboard`.
- Status: parcial.
- Observacoes tecnicas: implementado com `React.createElement`; time presets nao alteram estado; videos sao placeholders; room code sempre `undefined` no `App`.

### ChessEngine wrapper

- Nome: ChessEngine.
- Descricao: wrapper de `chess.js` com FEN, turno, lances legais, promocao, status de jogo, historico, undo, reset e load.
- Arquivos relacionados: `src/chess/chessEngine.ts`, `src/chess/types.ts`.
- Como e acessada/usada: `ChessBoard`, `App` e `analysisEngine`.
- Dependencias internas: `chess.js`.
- Status: funcional.
- Observacoes tecnicas: encapsula o motor principal; `analysisEngine` acessa internamente `(eng as any).game`, furando a abstracao.

### MinimaxAnalysisEngine

- Nome: Analysis engine.
- Descricao: busca minimax alpha-beta com avaliacao material/mobilidade simples.
- Arquivos relacionados: `src/chess/analysisEngine.ts`.
- Como e acessada/usada: singleton `analysisEngine` importado por `App`.
- Dependencias internas: `ChessEngine`.
- Status: parcial.
- Observacoes tecnicas: avaliacao tem placeholder de centro (`'d4e4d5e5'.includes(...)` sem efeito real). Retorno `bestMove`/`bestMoveUci` e consumo no `App` estao desalinhados.

### Estilos e assets

- Nome: UI styling/assets.
- Descricao: CSS global e assets para aparencia do app.
- Arquivos relacionados: `src/App.css`, `src/index.css`, `src/assets/*`, `public/*`.
- Como e acessada/usada: CSS importado pelo app e assets referenciaveis pelo bundle.
- Dependencias internas: Vite asset pipeline.
- Status: funcional/incerto.
- Observacoes tecnicas: CSS nao e indexado pelo CodeGraph; inventario tratou como suporte visual, nao como simbolos.

### Configuracao Vite

- Nome: Vite app config.
- Descricao: configura React, Tailwind Vite e proxy local para `/ws` e `/api`.
- Arquivos relacionados: `vite.config.ts`.
- Como e acessada/usada: `npm run dev` e `npm run build`.
- Dependencias internas: `@vitejs/plugin-react`, `@tailwindcss/vite`.
- Status: funcional.
- Observacoes tecnicas: proxy aponta para o backend local em `localhost:3001`; deploy Cloudflare usa `wrangler.toml`.

## Mapa dos principais fluxos do sistema

1. Bootstrap local: `index.html` -> `src/main.tsx` -> `App` -> `ChessBoard`/`GamePanel`.
2. Partida local: usuario seleciona peca -> `ChessBoard.applyMove` -> `ChessEngine.makeMove` -> `onMove` -> `App.handleMove` -> lista `moves`, clock ativo e som.
3. Promocao: `ChessBoard.handleMoveAttempt` -> `ChessEngine.getPromotionOptions` -> modal de promocao -> `confirmPromotion` -> `applyMove`.
4. Analise: botao "Analisar" -> `App.analyzePosition` -> `analysisEngine.analyze` -> `MinimaxAnalysisEngine` -> `ChessBoard.arrows`.
5. Computador: `App.handleMove` -> `analysisEngine.analyze` -> tentativa de converter `bestMove` em from/to -> `ChessEngine.makeMove`.
6. Online pretendido: UI online -> deveria chamar `RoomManager.joinRoom` -> `WSClient.connect` -> backend `/ws` -> `room-joined`/`move-made`. No `App` atual esse fluxo nao esta ligado.
7. Backend local: Vite proxy `/ws` -> `server/index.ts` WebSocket -> `handleClientMessage` -> sala/lance/draw/resign/WebRTC.
8. Backend Cloudflare: request -> `ChessCamHub.fetch` -> WebSocketPair -> `handleSocket` -> `handleMessage` -> sala/lance/draw/resign/WebRTC.
9. Deploy: `npm run build` -> `wrangler deploy` -> Worker serve assets de `dist` e Durable Object.

## Dependencias principais

- Frontend: React 19, Vite 8, TypeScript 6, lucide-react, react-chessboard, framer-motion.
- Xadrez: `chess.js` como regra/motor legal.
- Realtime local: Express 5 e `ws`.
- Realtime deploy: Cloudflare Workers, Durable Objects, Wrangler.
- Visual/site separado: Three.js em `site/`.
- Qualidade/tooling: ESLint, TypeScript, CodeGraph.

## Pontos criticos, riscos e inconsistencias

- `src/App.tsx` nao usa `RoomManager`/`WSClient`; online/camera esta majoritariamente visual.
- `GamePanel` recebe `roomCode={undefined}` e mostra placeholders de video.
- Backend tem WebRTC signaling, mas frontend atual nao implementa camera real.
- `ClientMessage`/`ServerMessage` em `src/net/protocol.ts` nao cobrem todas as mensagens e payloads do backend.
- Existem duas implementacoes de backend realtime (`server/index.ts` e `worker/src/index.ts`) com risco de divergencia.
- `tmp_app_good.ts` no root parece codigo temporario/backup com uma versao mais completa de `App`; esta indexado pelo CodeGraph e pode confundir futuros agentes.
- `src/App.tsx.broken` tambem parece backup quebrado/desconectado e nao e indexado como TSX pelo CodeGraph.
- Computador provavelmente quebra ou joga errado porque `App` usa `bestMove` como UCI, mas `analysisEngine` documenta/retorna SAN em `bestMove` e UCI em `bestMoveUci`.
- `analysisEngine.evaluate` tem placeholder sem efeito para controle de centro.
- `copyFEN` nao reconstroi a FEN atual completa quando fora de review; tende a copiar FEN inicial.
- Clock local nao encerra partida por timeout; backend possui timeout online, mas tipos do cliente nao acompanham.
- `RoomManager` ignora mensagens relevantes: WebRTC, draw offered/declined, rematch, opponent-left e clocks.
- O README ainda e majoritariamente template Vite e pode induzir agentes a subestimar a estrutura real.

## Proximos passos recomendados

1. Decidir uma fonte unica de verdade para realtime: manter `server/index.ts` como dev mirror do Worker ou gerar/compartilhar handlers para evitar divergencia.
2. Conectar `App` a `RoomManager` para join/quick-match, room code, FEN externo, `onMoveRequest`, resign/draw e game-over online.
3. Implementar ou remover a promessa de camera: `getUserMedia`, `RTCPeerConnection`, elementos de video e handlers de signaling.
4. Unificar protocolo em `src/net/protocol.ts` com todas as mensagens realmente aceitas/emitidas por Node e Worker.
5. Corrigir `analysisEngine`/`App`: usar `bestMoveUci` para computador e setas, ou padronizar retorno.
6. Remover/arquivar `tmp_app_good.ts` e `src/App.tsx.broken` fora do root/source para nao poluir CodeGraph e build mental.
7. Completar clocks locais com timeout e time controls clicaveis, ou deixar claro que clocks autoritativos existem apenas online.
8. Atualizar README com arquitetura real, scripts e status das features.
9. Adicionar testes focados para `ChessEngine`, `analysisEngine`, protocolo e handlers de backend.
