// Shared WebSocket client with auto-reconnect
window.Trivia = (function(){
  let ws, handlers = {}, queue = [], onOpenCb = null, backoff = 500;
  function url(){ return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'; }
  function connect(){
    ws = new WebSocket(url());
    ws.onopen = () => { backoff = 500; if (onOpenCb) onOpenCb(); while (queue.length) ws.send(queue.shift()); setStatus(true); };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } (handlers[m.type] || (()=>{}))(m); };
    ws.onclose = () => { setStatus(false); setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 5000); };
  }
  function setStatus(ok){ const el = document.getElementById('conn'); if (el) el.classList.toggle('hidden', ok); }
  function send(o){ const s = JSON.stringify(o); if (ws && ws.readyState === 1) ws.send(s); else queue.push(s); }
  function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  return { start(h, onOpen){ handlers = h; onOpenCb = onOpen; connect(); }, send, esc };
})();
