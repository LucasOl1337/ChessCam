# AGENTS.md

## CodeGraph

Este repositorio possui indice CodeGraph em `.codegraph/`. Proximos agentes devem usar CodeGraph primeiro para perguntas estruturais, arquitetura, fluxo, callers/callees, impacto e localizacao de simbolos.

Antes de investigar manualmente com `rg`/leitura de arquivos, consulte:

- `DocsDev/codegraph/inventory.md`: inventario das funcionalidades existentes, status e riscos.
- `DocsDev/codegraph/codegraph-visual.html`: mapa visual autocontido dos modulos e fluxos principais.
- `DocsDev/codegraph/codegraph-status.txt`: status bruto do indice.
- `DocsDev/codegraph/codegraph-files.json`: arquivos indexados.

Fluxo recomendado:

1. Rode `codegraph status .` para confirmar que o indice esta atualizado.
2. Se `.codegraph/` existir, rode `codegraph sync .`; se o status ficar inconsistente, rode `codegraph index . --force`.
3. Use `codegraph context "<tarefa>"` para mapa inicial.
4. Use `codegraph trace`, `codegraph callers`, `codegraph callees`, `codegraph impact` ou `codegraph query --json` conforme a pergunta.
5. Leia arquivos diretamente apenas para detalhes que o CodeGraph nao cobrir, como CSS, assets, docs ou trechos nao indexados.

Observacoes importantes do inventario atual:

- `src/App.tsx` nao esta conectado a `RoomManager`/`WSClient`; online/camera e principalmente visual.
- `tmp_app_good.ts` e `src/App.tsx.broken` parecem arquivos temporarios/backup e nao devem ser tratados como fonte de verdade sem confirmacao.
- Existem dois backends realtime (`server/index.ts` e `worker/src/index.ts`); cuidado para nao corrigir apenas um lado quando a mudanca for de protocolo.
