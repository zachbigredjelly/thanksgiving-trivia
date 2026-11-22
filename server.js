// Thanksgiving Trivia Feast — live multiplayer server (in-memory state)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');

const PORT = parseInt(process.env.PORT || '8788', 10);
const QUESTIONS = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));

const QUESTION_MS = 20000;
const MAX_PTS = 1000, MIN_PTS = 500;

// ---- state ----
const game = {
  phase: 'lobby',          // lobby | question | reveal | final
  qi: -1,
  startedAt: 0,
  deadline: 0,             // 0 = no timer
  timerOn: true,
  timer: null,
};
const players = new Map();  // key(lowercase name) -> {name, clientId, score, answers:{qi:{choice,ms,points,correct}}, ws}
const hosts = new Set();

function keyOf(n) { return n.trim().toLowerCase(); }
function cleanName(n) { return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20); }

function standings() {
  const arr = [...players.values()].map(p => ({ name: p.name, score: p.score }));
  arr.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  let rank = 0, prev = null;
  arr.forEach((p, i) => { if (p.score !== prev) { rank = i + 1; prev = p.score; } p.rank = rank; });
  return arr;
}
function answeredCount() {
  if (game.qi < 0) return 0;
  let c = 0; for (const p of players.values()) if (p.answers[game.qi]) c++; return c;
}
function publicQuestion() {
  const q = QUESTIONS[game.qi];
  return q ? { n: game.qi + 1, total: QUESTIONS.length, text: q.q, options: q.options, cat: q.cat } : null;
}

function baseState() {
  const s = {
    phase: game.phase,
    total: QUESTIONS.length,
    playerCount: players.size,
    timerOn: game.timerOn,
    remainingMs: game.deadline ? Math.max(0, game.deadline - Date.now()) : null,
    questionMs: QUESTION_MS,
  };
  if (game.phase === 'question' || game.phase === 'reveal') {
    s.question = publicQuestion();
    s.answered = answeredCount();
  }
  if (game.phase === 'reveal' || game.phase === 'final') {
    const st = standings();
    s.top5 = st.slice(0, 5);
    if (game.phase === 'reveal') {
      const q = QUESTIONS[game.qi];
      s.answer = q.answer; s.fact = q.fact;
      const counts = [0, 0, 0, 0];
      for (const p of players.values()) { const a = p.answers[game.qi]; if (a) counts[a.choice]++; }
      s.counts = counts;
      s.isLast = game.qi >= QUESTIONS.length - 1;
    }
    if (game.phase === 'final') s.leaderboard = st;
  }
  return s;
}

function send(ws, obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

function broadcast() {
  const base = baseState();
  const st = (game.phase === 'reveal' || game.phase === 'final') ? standings() : null;
  for (const h of hosts) send(h, { type: 'state', role: 'host', ...base, players: [...players.values()].map(p => ({ name: p.name, score: p.score, online: !!(p.ws && p.ws.readyState === 1), answered: !!p.answers[game.qi] })) });
  for (const p of players.values()) {
    if (!p.ws) continue;
    const me = { name: p.name, score: p.score };
    const a = p.answers[game.qi];
    if (a) { me.choice = a.choice; }
    if (st) {
      const r = st.find(x => x.name === p.name); me.rank = r ? r.rank : null; me.of = st.length;
      if (game.phase === 'reveal') { me.correct = !!(a && a.correct); me.points = a ? a.points : 0; }
    }
    send(p.ws, { type: 'state', role: 'player', ...base, me });
  }
}

function clearTimer() { if (game.timer) { clearTimeout(game.timer); game.timer = null; } }

function startQuestion(i) {
  clearTimer();
  game.qi = i; game.phase = 'question'; game.startedAt = Date.now();
  game.deadline = game.timerOn ? game.startedAt + QUESTION_MS : 0;
  if (game.timerOn) game.timer = setTimeout(() => { if (game.phase === 'question' && game.qi === i) reveal(); }, QUESTION_MS + 300);
  broadcast();
}
function reveal() {
  if (game.phase !== 'question') return;
  clearTimer(); game.phase = 'reveal'; game.deadline = 0; broadcast();
}
function next() {
  if (game.phase !== 'reveal') return;
  if (game.qi + 1 >= QUESTIONS.length) { game.phase = 'final'; game.deadline = 0; broadcast(); }
  else startQuestion(game.qi + 1);
}
function resetGame(keepPlayers) {
  clearTimer(); game.phase = 'lobby'; game.qi = -1; game.deadline = 0;
  if (keepPlayers) for (const p of players.values()) { p.score = 0; p.answers = {}; }
  else { for (const p of players.values()) send(p.ws, { type: 'kicked' }); players.clear(); }
  broadcast();
}

function points(ms) {
  const frac = Math.min(1, Math.max(0, ms / QUESTION_MS));
  return Math.max(MIN_PTS, Math.round(MAX_PTS - (MAX_PTS - MIN_PTS) * frac));
}

// ---- HTTP ----
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const PUB = path.join(__dirname, 'public');
function serveFile(res, f) {
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = u.pathname;
  if (p === '/' || p === '/index.html') return serveFile(res, path.join(PUB, 'index.html'));
  if (p === '/host' || p === '/host/') return serveFile(res, path.join(PUB, 'host.html'));
  if (p === '/qr.svg') {
    const target = u.searchParams.get('u') || '';
    if (!/^https?:\/\//.test(target) || target.length > 300) { res.writeHead(400); return res.end(); }
    const svg = await QRCode.toString(target, { type: 'svg', margin: 1, color: { dark: '#000000', light: '#ffffff' } });
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); return res.end(svg);
  }
  if (p === '/healthz') { res.writeHead(200); return res.end('ok'); }
  const f = path.normalize(path.join(PUB, p));
  if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  serveFile(res, f);
});

// ---- WebSocket ----
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  ws.role = null;
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'hostAuth') {
      ws.role = 'host'; hosts.add(ws); return broadcast();
    }
    if (m.type === 'join') {
      const name = cleanName(m.name);
      const clientId = String(m.clientId || '').slice(0, 64);
      if (!name) return send(ws, { type: 'error', code: 'noname', message: 'Enter a nickname' });
      const k = keyOf(name);
      let p = players.get(k);
      if (p) {
        const live = p.ws && p.ws !== ws && p.ws.readyState === 1;
        if (live && p.clientId !== clientId) return send(ws, { type: 'error', code: 'taken', message: 'That nickname is already playing. Pick another.' });
        if (live) { try { p.ws.close(); } catch {} }
        p.ws = ws; p.clientId = clientId;
      } else {
        if (players.size >= 200) return send(ws, { type: 'error', code: 'full', message: 'Room is full' });
        p = { name, clientId, score: 0, answers: {}, ws };
        players.set(k, p);
      }
      ws.role = 'player'; ws.playerKey = k;
      send(ws, { type: 'joined', name: p.name });
      return broadcast();
    }
    if (ws.role === 'player' && m.type === 'answer') {
      const p = players.get(ws.playerKey);
      if (!p || p.ws !== ws) return;
      if (game.phase !== 'question' || m.qi !== game.qi || p.answers[game.qi]) return;
      if (game.deadline && Date.now() > game.deadline + 250) return;
      const choice = m.choice | 0; if (choice < 0 || choice > 3) return;
      const ms = Date.now() - game.startedAt;
      const correct = choice === QUESTIONS[game.qi].answer;
      const pts = correct ? points(ms) : 0;
      p.answers[game.qi] = { choice, ms, points: pts, correct };
      p.score += pts;
      broadcast();
      // auto-reveal when everyone connected has answered? No — host controls pace.
      return;
    }
    if (ws.role === 'host') {
      switch (m.type) {
        case 'start': if (game.phase === 'lobby' && players.size > 0) startQuestion(0); break;
        case 'reveal': reveal(); break;
        case 'next': next(); break;
        case 'timer': if (game.phase === 'lobby') { game.timerOn = !!m.on; broadcast(); } break;
        case 'restart': resetGame(true); break;
        case 'clear': resetGame(false); break;
        case 'kick': { const k = keyOf(cleanName(m.name)); const p = players.get(k); if (p) { send(p.ws, { type: 'kicked' }); players.delete(k); broadcast(); } break; }
      }
    }
  });
  ws.on('close', () => {
    hosts.delete(ws);
    if (ws.role === 'player') { const p = players.get(ws.playerKey); if (p && p.ws === ws) { p.ws = null; broadcast(); } }
  });
});
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch {} } }, 25000);

server.listen(PORT, '0.0.0.0', () => console.log(`Thanksgiving trivia on http://localhost:${PORT}  questions ${QUESTIONS.length}`));
