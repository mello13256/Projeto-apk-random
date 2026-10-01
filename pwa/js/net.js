// Rede do multiplayer: Firebase Realtime Database (pela API REST, sem bibliotecas)
// para as salas, e WebRTC para a conexão direta entre os jogadores durante a partida.
// Se a conexão direta não funcionar (algumas redes bloqueiam), tudo passa pelo Firebase.
'use strict';

/** Endereço do banco. Para testar sem internet: ?db=http://localhost:9000 */
const DB_URL = (() => {
  try {
    const q = new URLSearchParams(location.search).get('db');
    if (q && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(q)) return q.replace(/\/$/, '');
  } catch (e) { /* sem location */ }
  return 'https://horta-hostil-default-rtdb.europe-west1.firebasedatabase.app';
})();

const SERVER_TIME = { '.sv': 'timestamp' };

const Fb = {
  url(path) { return DB_URL + '/' + path + '.json'; },

  async req(method, path, body, keepalive) {
    const opt = { method, cache: 'no-store', keepalive: !!keepalive };
    if (body !== undefined) {
      opt.body = JSON.stringify(body);
      opt.headers = { 'Content-Type': 'application/json' };
    }
    const res = await fetch(this.url(path), opt);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  },
  get(path) { return this.req('GET', path); },
  put(path, v, keepalive) { return this.req('PUT', path, v, keepalive); },
  patch(path, v) { return this.req('PATCH', path, v); },
  del(path, keepalive) { return this.req('DELETE', path, undefined, keepalive); },
};

/** Coloca "value" no caminho "path" (ex.: "/a/b") dentro de "root". Devolve a nova raiz. */
function setAtPath(root, path, value) {
  const parts = path.split('/').filter((s) => s);
  if (!parts.length) return value;
  if (!root || typeof root !== 'object') root = {};
  let o = root;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!o[parts[i]] || typeof o[parts[i]] !== 'object') {
      if (value === null) return root;
      o[parts[i]] = {};
    }
    o = o[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (value === null) delete o[last];
  else o[last] = value;
  return root;
}

/**
 * Cópia ao vivo de um pedaço do banco (streaming com EventSource).
 * onChange(path, value) é chamado a cada mudança; a cópia completa fica em .data
 */
class Mirror {
  constructor(path, onChange, onFail) {
    this.data = null;
    this.ready = false;
    this.closed = false;
    this.es = new EventSource(Fb.url(path));
    const apply = (ev, merge) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || typeof m.path !== 'string') return;
      if (merge && m.data && typeof m.data === 'object') {
        const base = m.path === '/' ? '' : m.path;
        for (const k of Object.keys(m.data)) {
          this.data = setAtPath(this.data, base + '/' + k, m.data[k]);
          onChange(base + '/' + k, m.data[k]);
        }
      } else {
        this.data = setAtPath(this.data, m.path, m.data);
        onChange(m.path, m.data);
      }
      this.ready = true;
    };
    this.es.addEventListener('put', (ev) => apply(ev, false));
    this.es.addEventListener('patch', (ev) => apply(ev, true));
    this.es.addEventListener('cancel', () => { this.close(); if (onFail) onFail('cancel'); });
    this.es.onerror = () => { /* o EventSource tenta reconectar sozinho */ };
  }
  close() {
    this.closed = true;
    try { this.es.close(); } catch (e) { /* já fechado */ }
  }
}

// ---------------------------------------------------------------------------
// Conexão direta (WebRTC). Duas "linhas": rápida (pode perder pacotes, para
// posições) e segura (chega sempre e em ordem, para compras e fim de onda).
// ---------------------------------------------------------------------------

const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];
const HAS_RTC = typeof RTCPeerConnection !== 'undefined';

class Peer {
  constructor(isHost, onMessage) {
    this.onMessage = onMessage;
    this.fast = null; this.safe = null;
    this.failed = false;
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    if (isHost) {
      this.setup(this.pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 }));
      this.setup(this.pc.createDataChannel('safe', { ordered: true }));
    } else {
      this.pc.ondatachannel = (ev) => this.setup(ev.channel);
    }
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed') this.failed = true;
    };
  }

  setup(ch) {
    if (ch.label === 'fast') this.fast = ch; else this.safe = ch;
    ch.onmessage = (ev) => { if (typeof ev.data === 'string') this.onMessage(ev.data); };
    ch.onclose = () => { this.failed = true; };
  }

  isOpen() {
    return !this.failed && !!this.fast && !!this.safe && this.fast.readyState === 'open' && this.safe.readyState === 'open';
  }

  /** Espera juntar os "endereços" (ICE) para mandar tudo de uma vez pelo Firebase. */
  waitIce(ms) {
    const pc = this.pc;
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => { pc.removeEventListener('icegatheringstatechange', check); clearTimeout(t); resolve(); };
      const check = () => { if (pc.iceGatheringState === 'complete') done(); };
      const t = setTimeout(done, ms);
      pc.addEventListener('icegatheringstatechange', check);
    });
  }

  async makeOffer() {
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await this.waitIce(2500);
    return this.pc.localDescription.sdp;
  }

  async acceptOffer(sdp) {
    await this.pc.setRemoteDescription({ type: 'offer', sdp });
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await this.waitIce(2500);
    return this.pc.localDescription.sdp;
  }

  async acceptAnswer(sdp) {
    if (this.pc.signalingState !== 'have-local-offer') return;
    await this.pc.setRemoteDescription({ type: 'answer', sdp });
  }

  /** Manda uma mensagem; devolve false se a conexão direta não está aberta. */
  send(msg, safe) {
    if (!this.isOpen()) return false;
    const ch = safe ? this.safe : this.fast;
    if (!safe && ch.bufferedAmount > 200000) return true; // rede lenta: pula esta posição
    try { ch.send(msg); } catch (e) { return false; }
    return true;
  }

  close() {
    this.failed = true;
    try { this.pc.close(); } catch (e) { /* já fechado */ }
  }
}
