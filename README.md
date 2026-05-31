# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```


## ChessCam - Chess + Live Camera

Jogue xadrez com recursos inspirados no chess.com + vídeo P2P.

### Features de Gameplay (Melhorias recentes)
- **History Scrub / Analysis**: Clique nos lances na lista de moves (local) para rever posições. Botões de navegação ⏮ ◀ ▶ ⏭ Live. (Novo na rodada!)
- **Material / Captured**: Mostra contagem básica de peças capturadas.
- **Draw Offers completo**: Botão Offer Draw, prompts de aceite/recusa, funciona local e online (com server/worker).
- **Resign**: Botão dedicado, encerra o jogo corretamente.
- **Promoção melhorada**: Diálogo com símbolos unicode bonitos ♕♛ etc.
- Clocks com time controls, increment, timeout.
- Sons chess.com-like (move/capture/check...).
- Move list SAN, last-move highlights, legal dots, check indicator.
- Online camera matches com WebRTC vídeo + WS moves authoritativos.

### Como rodar
```bash
npm install
npm run dev:full
```
Abra http://localhost:5173 (ou o Vite). Use outra aba para simular oponente.

Para deploy worker: `npm run worker:deploy`

### Roadmap / Próximas melhorias
- PGN/FEN export + import
- Board flip + themes
- Keyboard shortcuts
- Melhor engine analysis (Stockfish WASM em rodada futura)
- Premoves, variações, etc.

Feito com React + chess.js + react-chessboard + Cloudflare Workers + WebRTC.
