(function(){
  const $view = document.getElementById('view'), $mute = document.getElementById('mute');
  const T = window.Trivia, esc = T.esc, A = window.CozyAudio, LET = ['A','B','C','D'];
  let authed = false, s = null, tick = null, lastPhaseKey = '';
  const joinUrl = location.origin + '/';

  function muteLabel(){ $mute.textContent = !A.isStarted() ? '🔈 Tap to start music' : (A.isMuted() ? '🔇 Music off' : '🔊 Music on'); }
  $mute.onclick = (e) => { e.stopPropagation(); if (!A.isStarted()) { A.start(); A.setMuted(false); } else A.setMuted(!A.isMuted()); muteLabel(); };
  // Browsers require a user gesture before audio: start on the host's first tap anywhere.
  document.addEventListener('pointerdown', () => { if (!A.isStarted() && !A.isMuted()) { A.start(); muteLabel(); } }, { once: false });
  muteLabel();

  function lb(list){ return `<ul class="lb">${list.map(p => `<li><span class="rk">#${p.rank}</span><span class="nm">${esc(p.name)}</span><span class="sc">${p.score.toLocaleString()}</span></li>`).join('')}</ul>`; }
  function chips(players, mode){
    if (!players.length) return '<p class="muted">No one yet. Scan the QR code to join.</p>';
    return `<div class="chips">${players.map(p => `<span class="chip ${p.online?'':'off'} ${mode==='q' && p.answered ? 'ans' : ''}">${mode==='q' ? (p.answered ? '✅ ' : '⏳ ') : ''}${esc(p.name)}</span>`).join('')}</div>`;
  }
  function joinCard(compact){
    return `<div class="card center"><div class="muted small">Join on your phone</div>
      <img class="qr" alt="QR code to join" src="/qr.svg?u=${encodeURIComponent(joinUrl)}" style="${compact?'max-width:150px':''}">
      <div class="joinurl" style="margin-top:8px">${esc(joinUrl.replace(/^https?:\/\//,'').replace(/\/$/,''))}</div></div>`;
  }

  function render(){
    if (!authed || !s) return;
    const phaseKey = s.phase + ':' + (s.question ? s.question.n : '');
    if (phaseKey !== lastPhaseKey && s.phase === 'reveal') A.reveal();
    lastPhaseKey = phaseKey;
    stopTimer();
    if (s.phase === 'lobby') {
      $view.innerHTML = `<div class="hostgrid">
        <div><div class="card"><h1>Waiting for players…</h1>
          <p class="muted">${s.total} questions. Everyone sees the same question at the same time; you control the pace.</p>
          <div class="row between" style="margin:12px 0"><div><div class="stat">${s.playerCount}</div><div class="muted small">players joined</div></div>
          <label class="row" style="font-weight:600;cursor:pointer"><input type="checkbox" id="tm" ${s.timerOn?'checked':''} style="width:22px;height:22px"> 20-second countdown</label></div>
          ${chips(s.players)}
          <div class="row" style="margin-top:16px"><button class="btn" id="go" ${s.playerCount ? '' : 'disabled'}>▶ Start game</button>
          ${s.playerCount ? '<button class="btn soft" id="clr">Clear all players</button>' : ''}</div></div></div>
        <div>${joinCard()}</div></div>`;
      document.getElementById('go').onclick = () => { A.start(); muteLabel(); T.send({ type: 'start' }); };
      document.getElementById('tm').onchange = (e) => T.send({ type: 'timer', on: e.target.checked });
      const c = document.getElementById('clr'); if (c) c.onclick = () => { if (confirm('Remove every player from the room?')) T.send({ type: 'clear' }); };
      return;
    }
    if (s.phase === 'question' || s.phase === 'reveal') {
      const q = s.question, rev = s.phase === 'reveal';
      const max = Math.max(1, ...(s.counts || [0]));
      $view.innerHTML = `<div class="hostgrid"><div>
        <div class="row between"><span class="pill orange">Question ${q.n} of ${q.total}</span><span class="pill">${esc(q.cat)}</span></div>
        ${!rev && s.timerOn ? '<div class="timer" style="margin-top:10px"><i id="tbar"></i></div>' : ''}
        <div class="qtext">${esc(q.text)}</div>
        <div class="opts">${q.options.map((o,i)=>`<div class="opt ${rev ? (i===s.answer?'right':'dim') : ''}"><span class="L">${LET[i]}</span><span style="flex:1">${esc(o)}${rev ? `<div class="bar"><i style="width:${100*s.counts[i]/max}%"></i></div>` : ''}</span>${rev ? `<b>${s.counts[i]}</b>` : ''}</div>`).join('')}</div>
        ${rev ? `<div class="fact" style="margin-top:14px">${esc(s.fact)}</div>` : ''}
        <div class="row" style="margin-top:16px">${rev ? `<button class="btn" id="nx">${s.isLast ? '🏆 Show final results' : 'Next question ▶'}</button>` : `<button class="btn cran" id="rv">Reveal answer</button>`}</div>
      </div><div>
        <div class="card"><div class="row between"><div><div class="stat"><span>${s.answered}</span>/<span>${s.playerCount}</span></div><div class="muted small">answered</div></div><div class="stat" id="tsec"></div></div></div>
        ${rev ? `<div class="card"><h2>Top 5</h2>${lb(s.top5)}</div>` : `<div class="card">${chips(s.players,'q')}</div>`}
        ${joinCard(true)}
      </div></div>`;
      if (rev) document.getElementById('nx').onclick = () => T.send({ type: 'next' });
      else { document.getElementById('rv').onclick = () => T.send({ type: 'reveal' }); startTimer(); }
      return;
    }
    if (s.phase === 'final') {
      const L = s.leaderboard, t = [L[0], L[1], L[2]];
      const pod = (p, cls, n) => p ? `<div class="p ${cls}"><div class="nm">${esc(p.name)}</div><div class="sc">${p.score.toLocaleString()}</div><div class="blk">${n}</div></div>` : `<div class="p ${cls}"></div>`;
      $view.innerHTML = `<div class="center"><h1>🏆 Final Results 🥧</h1></div>
        <div class="podium" style="max-width:560px;margin-left:auto;margin-right:auto">${pod(t[1],'p2',2)}${pod(t[0],'p1',1)}${pod(t[2],'p3',3)}</div>
        <div class="card" style="max-width:640px;margin:0 auto 12px"><h2>Full leaderboard</h2>${lb(L)}</div>
        <div class="row" style="justify-content:center"><button class="btn cran" id="again">Play again (same players)</button><button class="btn soft" id="clr">New room (clear players)</button></div>`;
      document.getElementById('again').onclick = () => { if (confirm('Reset all scores and go back to the lobby?')) T.send({ type: 'restart' }); };
      document.getElementById('clr').onclick = () => { if (confirm('Remove all players and go back to the lobby?')) T.send({ type: 'clear' }); };
    }
  }
  function startTimer(){
    if (!s.timerOn || s.remainingMs == null) return;
    const end = Date.now() + s.remainingMs;
    const upd = () => { const left = Math.max(0, end - Date.now()); const b = document.getElementById('tbar'), t = document.getElementById('tsec');
      if (b) b.style.width = (100*left/s.questionMs) + '%'; if (t) t.textContent = Math.ceil(left/1000) + 's'; if (left <= 0) stopTimer(); };
    upd(); tick = setInterval(upd, 250);
  }
  function stopTimer(){ if (tick) { clearInterval(tick); tick = null; } }

  T.start({
    state(m){ if (m.role !== 'host') return; authed = true; s = m; render(); }
  }, () => T.send({ type: 'hostAuth' }));
  $view.innerHTML = '<div class="card center muted">Connecting…</div>';
})();
