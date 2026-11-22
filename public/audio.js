// Cozy autumn music generated live with the Web Audio API (no audio files, nothing to license).
// Layers: warm F-major pad (I–vi–IV–V), gentle plucked "acoustic guitar" arpeggios, a soft
// fireplace crackle, and a little room reverb. Reveal sting: warm major bell arpeggio.
window.CozyAudio = (function(){
  let ctx, master, musicBus, sfxBus, reverb, started = false, muted = localStorage.getItem('tg_mute') === '1';
  let barTimer = null, bar = 0;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function impulse(sec, decay){
    const len = ctx.sampleRate * sec, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/len, decay); }
    return buf;
  }
  // Fireplace: low soft rumble + sparse random crackles/pops
  function fireplace(){
    const len = ctx.sampleRate * 6, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random()*2-1; last = (last + 0.02*w) / 1.02; d[i] = last * 1.2;            // soft rumble
      if (Math.random() < 0.00035) { const n = 40 + (Math.random()*260|0), a = 0.25 + Math.random()*0.5;  // crackle
        for (let k = 0; k < n && i + k < len; k++) d[i + k] += (Math.random()*2-1) * a * Math.pow(1 - k/n, 3); }
    }
    const src = ctx.createBufferSource(); src.buffer = b; src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 120;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    const g = ctx.createGain(); g.gain.value = 0.07;
    src.connect(hp).connect(lp).connect(g); g.connect(musicBus); src.start();
  }
  function padNote(m, t, dur, vol){
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.9); g.gain.setValueAtTime(vol, t + dur - 0.9); g.gain.linearRampToValueAtTime(0, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 0.5;
    [-5, 5].forEach(det => { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m); o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + dur + 0.05); });
    lp.connect(g); g.connect(musicBus); g.connect(reverb);
  }
  function pluck(m, t, vol){
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = mtof(m); o2.type = 'sine'; o2.frequency.value = mtof(m + 12);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(3500, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.6);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t + 1.8);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(lp); o2.connect(g2).connect(lp); lp.connect(g); g.connect(musicBus); g.connect(reverb);
    o.start(t); o2.start(t); o.stop(t + 1.9); o2.stop(t + 1.9);
  }
  // F – Dm – Bb – C, then F – Am – Bb – C (warm, folky, major key)
  const CHORDS = [[53,57,60],[50,53,57],[46,50,53],[48,52,55],[53,57,60],[45,48,52],[46,50,53],[48,52,55]];
  const BASS = [41, 38, 34, 36, 41, 33, 34, 36];
  const MEL = [[72,69],[69,74],[70,74],[72,67],[77,72],[76,72],[74,70],[72,76]];
  const BEAT = 60 / 76, BAR = BEAT * 4;
  function scheduleBar(){
    const t = ctx.currentTime + 0.08, i = bar % CHORDS.length, ch = CHORDS[i];
    ch.forEach(n => padNote(n, t, BAR + 0.6, 0.022));
    padNote(BASS[i], t, BAR + 0.4, 0.03);
    const arp = [ch[0], ch[1], ch[2], ch[0] + 12, ch[2], ch[1], ch[2], ch[0] + 12];
    arp.forEach((n, k) => pluck(n + 12, t + k * BEAT / 2, k % 2 ? 0.05 : 0.07));
    if (bar % 2 === 1 || Math.random() < 0.5) MEL[i].forEach((n, k) => pluck(n, t + BEAT * (1 + k * 2), 0.06));
    bar++;
  }
  function start(){
    if (started) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); started = true;
    master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.9; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
    reverb = ctx.createConvolver(); reverb.buffer = impulse(2.2, 3); const rg = ctx.createGain(); rg.gain.value = 0.35; reverb.connect(rg).connect(musicBus);
    fireplace(); scheduleBar(); barTimer = setInterval(scheduleBar, BAR * 1000);
  }
  function setMuted(m){ muted = m; localStorage.setItem('tg_mute', m ? '1' : '0'); if (master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05); }
  // Reveal sting: soft warm swell + rising F-major bell arpeggio
  function reveal(){
    if (!ctx || muted) return; const t = ctx.currentTime;
    [53, 57, 60, 65].forEach(n => padNote(n, t, 2.2, 0.03));
    [77, 81, 84, 89].forEach((m, i) => { const f = mtof(m), s = t + 0.05 + i * 0.11;
      [1, 2.76].forEach((h, j) => { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.value = f * h;
        og.gain.setValueAtTime(0, s); og.gain.linearRampToValueAtTime(j ? 0.025 : 0.1, s + 0.01); og.gain.exponentialRampToValueAtTime(0.001, s + (j ? 0.6 : 1.4));
        o.connect(og); og.connect(sfxBus); og.connect(reverb); o.start(s); o.stop(s + 1.5); }); });
  }
  return { start, reveal, setMuted, isMuted: () => muted, isStarted: () => started };
})();
