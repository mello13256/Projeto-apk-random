// Firebase Realtime Database "de mentira" para testar o multiplayer sem internet.
// Imita a API REST: GET/PUT/PATCH/DELETE em /caminho.json, ?shallow=true,
// streaming (EventSource) com eventos put/patch e {".sv":"timestamp"}.
// Uso: node tools/fake-firebase.js [porta] [atraso_ms]   e abra o jogo com ?db=http://localhost:porta
'use strict';
const http = require('http');

const port = Number(process.argv[2] || 9000);
const delay = Number(process.argv[3] || 0);
let root = null;
const streams = new Set();
const stats = { writes: 0, bytesOut: 0, reads: 0 };

const split = (p) => p.split('/').filter((s) => s);
function getAt(parts) {
  let o = root;
  for (const k of parts) { if (!o || typeof o !== 'object') return null; o = o[k]; }
  return o === undefined ? null : o;
}
function resolveSv(v) {
  if (v && typeof v === 'object') {
    if (v['.sv'] === 'timestamp') return Date.now();
    const o = Array.isArray(v) ? [] : {};
    for (const k of Object.keys(v)) { const r = resolveSv(v[k]); if (r !== null && r !== undefined) o[k] = r; }
    return Object.keys(o).length ? o : null;
  }
  return v;
}
function prune(o) {
  if (!o || typeof o !== 'object') return o;
  for (const k of Object.keys(o)) { o[k] = prune(o[k]); if (o[k] === null || o[k] === undefined) delete o[k]; }
  return Object.keys(o).length ? o : null;
}
function setAt(parts, value) {
  if (!parts.length) { root = prune(value); return; }
  if (!root || typeof root !== 'object') root = {};
  let o = root;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!o[parts[i]] || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
    o = o[parts[i]];
  }
  o[parts[parts.length - 1]] = value;
  root = prune(root);
}
function send(res, event, data) {
  const s = 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';
  stats.bytesOut += s.length;
  const go = () => { try { res.write(s); } catch (e) { /* fechou */ } };
  if (delay) setTimeout(go, delay); else go();
}
/** Avisa os streams afetados por uma escrita em "parts". patch = objeto de filhos (PATCH). */
function notify(parts, patch) {
  for (const st of streams) {
    const L = st.parts;
    const under = L.every((k, i) => parts[i] === k) && parts.length >= L.length; // escrita dentro do stream
    const above = !under && parts.every((k, i) => L[i] === k);                    // escrita acima do stream
    if (under) {
      const rel = '/' + parts.slice(L.length).join('/');
      if (patch) send(st.res, 'patch', { path: rel, data: patch });
      else send(st.res, 'put', { path: rel, data: getAt(parts) });
    } else if (above) {
      send(st.res, 'put', { path: '/', data: getAt(L) });
    }
  }
}

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,PATCH,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__stats') { res.end(JSON.stringify(Object.assign({ streams: streams.size, root }, stats))); return; }
  if (!url.pathname.endsWith('.json')) { res.writeHead(404); res.end('{"error":"404"}'); return; }
  const parts = split(decodeURIComponent(url.pathname.slice(0, -5)));
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const reply = (code, v) => {
      const s = JSON.stringify(v === undefined ? null : v);
      stats.bytesOut += s.length;
      const go = () => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(s); };
      if (delay) setTimeout(go, delay); else go();
    };
    let data;
    try { data = body ? JSON.parse(body) : undefined; } catch (e) { reply(400, { error: 'Invalid data' }); return; }
    if (req.method === 'GET' && (req.headers.accept || '').includes('text/event-stream')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      const st = { parts, res };
      streams.add(st);
      send(res, 'put', { path: '/', data: getAt(parts) });
      res.on('close', () => streams.delete(st));
      return;
    }
    if (req.method === 'GET') {
      stats.reads++;
      const v = getAt(parts);
      if (url.searchParams.get('shallow') === 'true' && v && typeof v === 'object') {
        const o = {};
        for (const k of Object.keys(v)) o[k] = true;
        reply(200, o);
      } else reply(200, v);
      return;
    }
    stats.writes++;
    if (req.method === 'PUT') {
      const v = resolveSv(data);
      setAt(parts, v);
      notify(parts, null);
      reply(200, v);
    } else if (req.method === 'PATCH') {
      const v = resolveSv(data) || {};
      for (const k of Object.keys(v)) setAt(parts.concat(split(k)), v[k]);
      notify(parts, v);
      reply(200, v);
    } else if (req.method === 'DELETE') {
      setAt(parts, null);
      notify(parts, null);
      reply(200, null);
    } else if (req.method === 'POST') {
      const id = '-N' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      setAt(parts.concat(id), resolveSv(data));
      notify(parts.concat(id), null);
      reply(200, { name: id });
    } else reply(405, { error: 'method' });
  });
}).listen(port, () => console.log('fake firebase em http://localhost:' + port + (delay ? ' (atraso ' + delay + ' ms)' : '')));
