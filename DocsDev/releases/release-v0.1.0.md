![ChessCam v0.1.0 release card](https://github.com/LucasOl1337/ChessCam/releases/download/v0.1.0/v0.1.0-card.png)

Primeira release oficial do ChessCam, consolidando o estado atual com a landing page publica Three.js.

## Contexto

ChessCam e um app React/Vite para jogar xadrez com recursos de camera, partidas locais, salas privadas, validacao online e analise de lances. Esta release oficializa o estado do produto no app principal (`src/`), no servidor realtime (`server/`), no Worker (`worker/`) e na landing page publica (`site/`).

## Novidades

- **Landing page Three.js**: subprojeto `site/` com hero visual de tabuleiro animado.
- **Baseline do app**: tag oficial para o estado inicial do ChessCam publicado neste repositorio.

## Melhorias

- **Fluxo de analise**: history scrub, FEN/PGN, clocks, flip board e analise de posicao.
- **Partidas online**: salas privadas, camera e movimentos sincronizados por WebSocket.

## Sistemas

- **Validacao realtime**: `server/` e `worker/` validam movimentos online.
- **Assets do site**: imagens e video em `site/public/assets/` usados pela landing page.
- **Higiene do repositorio**: `.codegraph/` ignorado como artefato local de automacao.

## Verificacao

- Release reparado sem mover a tag `v0.1.0`.
- Card visual gerado a partir de `DocsDev/releases/release-v0.1.0.json`.

## Limitacoes conhecidas

- Sem CI configurado no repositorio.
- Validacao de preview do subprojeto `site/` fica para rodada futura.
