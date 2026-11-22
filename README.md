# Thanksgiving Trivia Feast 🦃 (live, multiplayer)
Node 18+ app: one process serves the pages and a WebSocket (`/ws`). In-memory game state, one room, no database.
- Local: `npm install && node server.js` → http://localhost:8788 (uses `process.env.PORT` when set, e.g. on Render).
- Players: `/`  Host screen: `/host` (no PIN; don't share the host link). Health check: `/healthz`.
- Questions: `questions.json` (27 items; `answer` is the 0-based index into `options`).
- Render: Web Service, runtime Node, build `npm install`, start `node server.js`, health check path `/healthz`. Free instances sleep after ~15 min idle; open the host page a minute before the game.
- Music is generated live in the host browser with the Web Audio API (public/audio.js); no audio files.
