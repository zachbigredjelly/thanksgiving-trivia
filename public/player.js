(function(){
  const $view = document.getElementById('view');
  const $me = document.getElementById('meTag');
  const T = window.Trivia, esc = T.esc;
  const LET = ['A','B','C','D'];
  let clientId = localStorage.getItem('tg_cid');
  if (!clientId) { clientId = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); localStorage.setItem('tg_cid', clientId); }
  let name = localStorage.getItem('tg_name') || '';
  let joined = false, state = null, pending = null, tick = null, lastKey = '';

  function joinScreen(err){
    joined = false; $me.classList.add('hidden');
    $view.innerHTML = `
      <div class="card">
        <h1>Join the game</h1>
        <p class="muted">Everyone answers the same question at the same time. Faster correct answers score more.</p>
        <form id="jf" autocomplete="off">
          <label for="nm">Your nickname</label>
          <input id="nm" type="text" maxlength="20" placeholder="e.g. Pilgrim Pam" value="${esc(name)}" autocapitalize="words" enterkeyhint="go">
          <div class="err" id="err">${err ? esc(err) : ''}</div>
          <button class="btn block" type="submit">Join 🦃</button>
        </form>
      </div>`;
    document.getElementById('jf').onsubmit = (e) => {
      e.preventDefault();
      const v = document.getElementById('nm').value.trim();
      if (!v) { document.getElementById('err').textContent = 'Enter a nickname'; return; }
      name = v; T.send({ type: 'join', name, clientId });
    };
  }

  function lb(list, myName){
    return `<ul class="lb">${list.map(p => `<li class="${p.name === myName ? 'me' : ''}"><span class="rk">#${p.rank}</span><span class="nm">${esc(p.name)}</span><span class="sc">${p.score.toLocaleString()}</span></li>`).join('')}</ul>`;
  }

  function render(){
    const s = state; if (!s || !joined) return;
    const me = s.me || {};
    $me.textContent = `${me.name} · ${(me.score||0).toLocaleString()} pts`; $me.classList.remove('hidden');
    const key = s.phase + ':' + (s.question ? s.question.n : '') + ':' + (me.choice ?? '') + ':' + (s.phase==='final'?s.leaderboard.length:'');
    if (s.phase === 'lobby') {
      $view.innerHTML = `<div class="card center"><div class="big">🕯️</div><h2 style="margin-top:10px">You're in, ${esc(me.name)}!</h2>
        <p class="muted">Waiting for the host to start. ${s.playerCount} player${s.playerCount===1?'':'s'} here so far.</p>
        <p class="small muted">${s.total} questions${s.timerOn ? ' · 20 seconds each' : ''}</p></div>
        <button class="btn soft" id="leave">Change nickname</button>`;
      document.getElementById('leave').onclick = leave;
      return;
    }
    if (s.phase === 'question') {
      const q = s.question, locked = me.choice !== undefined && me.choice !== null;
      if (key !== lastKey) {
        $view.innerHTML = `<div class="row between"><span class="pill orange">Question ${q.n} of ${q.total}</span><span class="pill">${esc(q.cat)}</span></div>
          ${s.timerOn ? `<div class="timer"><i id="tbar"></i></div><div class="small muted" id="tsec"></div>` : ''}
          <div class="qtext">${esc(q.text)}</div>
          <div class="opts">${q.options.map((o,i)=>`<button class="opt ${locked ? (me.choice===i?'picked':'dim') : ''}" data-i="${i}" ${locked?'disabled':''}><span class="L">${LET[i]}</span><span>${esc(o)}</span></button>`).join('')}</div>
          <p class="center muted" id="lockmsg" style="margin-top:14px">${locked ? '🔒 Answer locked in. Waiting for the reveal…' : 'Tap your answer. You only get one shot.'}</p>
          <p class="center small muted" id="ac">${s.answered}/${s.playerCount} answered</p>`;
        $view.querySelectorAll('.opt').forEach(b => b.onclick = () => {
          if (b.disabled) return;
          const i = +b.dataset.i;
          $view.querySelectorAll('.opt').forEach(x => { x.disabled = true; x.classList.add(+x.dataset.i === i ? 'picked' : 'dim'); });
          document.getElementById('lockmsg').textContent = '🔒 Answer locked in. Waiting for the reveal…';
          if (navigator.vibrate) navigator.vibrate(30);
          T.send({ type: 'answer', qi: q.n - 1, choice: i });
        });
      } else { const ac = document.getElementById('ac'); if (ac) ac.textContent = `${s.answered}/${s.playerCount} answered`; }
      startTimer(s);
      lastKey = key; return;
    }
    stopTimer();
    if (s.phase === 'reveal') {
      const q = s.question;
      const answeredIt = me.choice !== undefined && me.choice !== null;
      $view.innerHTML = `<div class="row between"><span class="pill orange">Question ${q.n} of ${q.total}</span><span class="pill">Rank #${me.rank} of ${me.of}</span></div>
        <div class="card" style="margin-top:10px">
          <div class="result ${me.correct?'ok':'no'}">${me.correct ? `Correct! +${me.points}` : (answeredIt ? 'Not quite' : "Time's up")}</div>
          <div style="font-size:18px;margin-bottom:10px">Answer: <b>${LET[s.answer]}. ${esc(q.options[s.answer])}</b></div>
          <div class="fact">${esc(s.fact)}</div>
        </div>
        <div class="card"><div class="row between"><h2 style="margin:0">Top 5</h2><span class="muted small">You: ${me.score.toLocaleString()} pts · #${me.rank}</span></div><div style="height:10px"></div>${lb(s.top5, me.name)}</div>
        <p class="center muted small">${s.isLast ? 'Final results coming up…' : 'Next question when the host is ready…'}</p>`;
      lastKey = key; return;
    }
    if (s.phase === 'final') {
      const L = s.leaderboard, t = [L[0], L[1], L[2]];
      const pod = (p, cls, n) => p ? `<div class="p ${cls}"><div class="nm">${esc(p.name)}</div><div class="sc">${p.score.toLocaleString()}</div><div class="blk">${n}</div></div>` : `<div class="p ${cls}"></div>`;
      $view.innerHTML = `<div class="center"><h1>🏆 Final Results</h1><p class="muted">You finished <b>#${me.rank}</b> of ${me.of} with <b>${me.score.toLocaleString()}</b> points.</p></div>
        <div class="podium">${pod(t[1],'p2',2)}${pod(t[0],'p1',1)}${pod(t[2],'p3',3)}</div>
        <div class="card"><h2>Leaderboard</h2>${lb(L, me.name)}</div>`;
      lastKey = key;
    }
  }

  function startTimer(s){
    stopTimer();
    if (!s.timerOn || s.remainingMs == null) return;
    const end = Date.now() + s.remainingMs;
    const upd = () => {
      const left = Math.max(0, end - Date.now());
      const b = document.getElementById('tbar'), t = document.getElementById('tsec');
      if (b) b.style.width = (100 * left / s.questionMs) + '%';
      if (t) t.textContent = left > 0 ? Math.ceil(left/1000) + 's left' : "Time's up";
      if (left <= 0) { stopTimer(); $view.querySelectorAll('.opt').forEach(x => x.disabled = true); }
    };
    upd(); tick = setInterval(upd, 250);
  }
  function stopTimer(){ if (tick) { clearInterval(tick); tick = null; } }
  function leave(){ localStorage.removeItem('tg_name'); name = ''; location.reload(); }

  T.start({
    joined(m){ joined = true; name = m.name; localStorage.setItem('tg_name', m.name); lastKey=''; render(); },
    state(m){ state = m; render(); },
    error(m){ if (!joined) joinScreen(m.message); },
    kicked(){ localStorage.removeItem('tg_name'); name=''; joined=false; state=null; joinScreen('The host reset the room. Join again.'); }
  }, () => { if (name && localStorage.getItem('tg_name')) T.send({ type: 'join', name, clientId }); });

  if (name && localStorage.getItem('tg_name')) $view.innerHTML = '<div class="card center muted">Rejoining as ' + esc(name) + '…</div>';
  else joinScreen();
})();
