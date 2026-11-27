// Modo 3D (versão 5.0): o mesmo jogo visto em perspectiva, com 3 câmeras.
// Não usa WebGL: cada ponto do chão (x, y) e altura h é projetado na tela "na mão"
// (câmera com giro "yaw" e inclinação "pitch") e tudo é desenhado no canvas 2D,
// do mais longe para o mais perto. Legumes, insetos e armas reaproveitam os desenhos do 2D.
'use strict';

const CAM_FP = 0, CAM_TP = 1, CAM_TOP = 2;
const CAM_NAMES = ['1ª pessoa', '3ª pessoa', 'De cima'];
const CAM_ICONS = ['👁️', '🎥', '🦅'];
const NEAR = 8;              // plano mais perto que a câmera desenha
const FOV_V = 1.1;           // abertura vertical (≈ 63°)
const LOOK_SENS = 0.0042;    // mouse: radianos por pixel
const TOUCH_LOOK = 0.0075;   // toque: radianos por pixel arrastado

const R3D = {
  // ------------------------------------------------------------------
  // Câmera
  // ------------------------------------------------------------------
  camMode() { const m = this.prefs.data.cam3d; return m === CAM_FP || m === CAM_TOP ? m : CAM_TP; },
  is3d() { return !!this.game.mode3d && this.game.state === 'PLAYING'; },
  /** Câmera "olhando com o mouse/dedo" (1ª e 3ª pessoa). */
  freeLook() { return this.is3d() && this.camMode() !== CAM_TOP; },
  cycleCam() {
    this.prefs.data.cam3d = (this.camMode() + 1) % 3;
    this.prefs.save();
    this.showToast(CAM_ICONS[this.camMode()] + ' Câmera: ' + CAM_NAMES[this.camMode()]);
    if (this.camMode() === CAM_TOP && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  },

  /** Monta a câmera do quadro (fica em this.c3). */
  setupCam3d() {
    const g = this.game, me = g.player, mode = this.camMode();
    const focus = me.alive ? me : (g.nearestPlayer(me.x, me.y) || me);
    if (this.yaw3d === undefined) this.yaw3d = -Math.PI / 2;
    const yaw = mode === CAM_TOP ? -Math.PI / 2 : this.yaw3d;
    const fx = Math.cos(yaw), fy = Math.sin(yaw), rx = -fy, ry = fx;
    let x, y, h, pitch;
    if (mode === CAM_FP) { x = focus.x + fx * 4; y = focus.y + fy * 4; h = 50; pitch = 0.1; }
    else if (mode === CAM_TP) {
      // câmera "no ombro"; encosta no legume se for passar pra fora da cerca
      let back = 215;
      for (let i = 0; i < 12; i++) {
        const tx = focus.x - fx * back + rx * 46, ty = focus.y - fy * back + ry * 46;
        if (tx > 12 && tx < WORLD_W - 12 && ty > 12 && ty < WORLD_H - 12) break;
        back -= 16;
      }
      back = Math.max(back, 40);
      const k = this.tpBack === undefined ? 1 : 0.2; // suaviza a mudança
      this.tpBack = this.tpBack === undefined ? back : this.tpBack + (back - this.tpBack) * k;
      x = focus.x - fx * this.tpBack + rx * 46; y = focus.y - fy * this.tpBack + ry * 46; h = 60 + this.tpBack * 0.36; pitch = 0.3;
    }
    else { x = focus.x - fx * 420; y = focus.y - fy * 420; h = 600; pitch = Math.atan2(600, 420); }
    if (g.shake > 0 && !g.paused) { x += (Math.random() - 0.5) * g.shake * 0.7; y += (Math.random() - 0.5) * g.shake * 0.7; h += (Math.random() - 0.5) * g.shake * 0.4; }
    const c = this.c3 || (this.c3 = {});
    c.x = x; c.y = y; c.h = h; c.yaw = yaw; c.mode = mode; c.pitch = pitch;
    c.cy = fx; c.sy = fy; c.cp = Math.cos(pitch); c.sp = Math.sin(pitch);
    c.focal = (VH / 2) / Math.tan(FOV_V / 2);
    c.ox = this.vw / 2; c.oy = VH / 2;
    this.cam.x = focus.x - this.vw / 2; this.cam.y = focus.y - VH / 2; // o 2D usa (setas dos amigos)
    return c;
  },

  /** Ponto do mundo -> [x, y, profundidade, escala] na tela (ou null se está atrás da câmera). */
  proj(x, y, h) {
    const c = this.c3, dx = x - c.x, dy = y - c.y, up = h - c.h;
    const along = dx * c.cy + dy * c.sy, lat = -dx * c.sy + dy * c.cy;
    const z = along * c.cp - up * c.sp;
    if (z < NEAR) return null;
    const v = along * c.sp + up * c.cp, s = c.focal / z;
    return [c.ox + lat * s, c.oy - v * s, z, s];
  },

  /** Polígono no mundo [[x, y, h], ...] -> caminho na tela, cortado no plano perto da câmera. */
  polyPath(pts) {
    const c = this.c3, cam = [];
    for (const p of pts) {
      const dx = p[0] - c.x, dy = p[1] - c.y, up = p[2] - c.h;
      const along = dx * c.cy + dy * c.sy;
      cam.push([-dx * c.sy + dy * c.cy, along * c.sp + up * c.cp, along * c.cp - up * c.sp]);
    }
    const out = [];
    for (let i = 0; i < cam.length; i++) {
      const a = cam[i], b = cam[(i + 1) % cam.length];
      const ain = a[2] >= NEAR, bin = b[2] >= NEAR;
      if (ain) out.push(a);
      if (ain !== bin) {
        const t = (NEAR - a[2]) / (b[2] - a[2]);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]);
      }
    }
    if (out.length < 3) return false;
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < out.length; i++) {
      const s = c.focal / out[i][2], sx = c.ox + out[i][0] * s, sy = c.oy - out[i][1] * s;
      if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy);
    }
    ctx.closePath();
    return true;
  },

  /** Círculo deitado no chão. */
  groundCircle(x, y, r, fill, stroke, lw, h) {
    const n = r > 120 ? 40 : r > 50 ? 24 : 14, pts = [];
    for (let i = 0; i < n; i++) { const a = Math.PI * 2 * i / n; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r, h || 0]); }
    if (!this.polyPath(pts)) return;
    const ctx = this.ctx;
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
  },

  /** Linha no mundo (cortada na câmera). */
  line3(x0, y0, h0, x1, y1, h1) {
    const c = this.c3;
    const tc = (x, y, h) => { const dx = x - c.x, dy = y - c.y, up = h - c.h, al = dx * c.cy + dy * c.sy; return [-dx * c.sy + dy * c.cy, al * c.sp + up * c.cp, al * c.cp - up * c.sp]; };
    let a = tc(x0, y0, h0), b = tc(x1, y1, h1);
    if (a[2] < NEAR && b[2] < NEAR) return false;
    if (a[2] < NEAR || b[2] < NEAR) {
      const t = (NEAR - a[2]) / (b[2] - a[2]), m = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR];
      if (a[2] < NEAR) a = m; else b = m;
    }
    const sa = c.focal / a[2], sb = c.focal / b[2], ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(c.ox + a[0] * sa, c.oy - a[1] * sa);
    ctx.lineTo(c.ox + b[0] * sb, c.oy - b[1] * sb);
    return true;
  },

  /** Ponto da tela -> ponto do chão (mira com o mouse na câmera de cima). */
  groundHit(sx, sy) {
    const c = this.c3;
    if (!c) return null;
    const a = (sx - c.ox) / c.focal, b = -(sy - c.oy) / c.focal;
    const dAlong = c.cp + b * c.sp, dUp = -c.sp + b * c.cp;
    if (dUp > -1e-4) return null;
    const t = -c.h / dUp, along = t * dAlong, lat = t * a;
    return [c.x + along * c.cy - lat * c.sy, c.y + along * c.sy + lat * c.cy];
  },

  /** Ângulo na tela de uma direção (ang) no chão a partir do ponto (x, y, h). */
  screenAngle(x, y, h, ang, P) {
    const Q = this.proj(x + Math.cos(ang) * 20, y + Math.sin(ang) * 20, h);
    if (!P || !Q) return ang;
    return Math.atan2(Q[1] - P[1], Q[0] - P[0]);
  },

  // ------------------------------------------------------------------
  // Entrada (o main.js e o ui.js chamam estes)
  // ------------------------------------------------------------------

  /** Joystick/teclado girado pela câmera: "pra cima" é sempre pra frente. */
  rotateMove(x, y) {
    if (!this.is3d()) return [x, y];
    const yaw = this.camMode() === CAM_TOP ? -Math.PI / 2 : (this.yaw3d === undefined ? -Math.PI / 2 : this.yaw3d);
    const fx = Math.cos(yaw), fy = Math.sin(yaw);
    return [fx * -y + -fy * x, fy * -y + fx * x];
  },
  /** Mouse (travado) ou dedo arrastando: gira a câmera. */
  onLook(dx) {
    if (!this.freeLook() || this.menuOpen()) return;
    if (this.yaw3d === undefined) this.yaw3d = -Math.PI / 2;
    this.yaw3d += dx * LOOK_SENS * (this.prefs.data.sens3d || 1);
  },
  /** Mira e ataque no 3D: {aimAng, fire}. */
  aim3d() {
    const g = this.game, p = g.player;
    if (!p || this.menuOpen() || !p.alive) return { aimAng: p ? p.aimAng : 0, fire: false };
    const k = this.keys;
    if (this.freeLook()) {
      if (k.has('ArrowLeft')) this.yaw3d -= 2.6 / 60;
      if (k.has('ArrowRight')) this.yaw3d += 2.6 / 60;
      return { aimAng: this.yaw3d, fire: !!this.mouseHeld || !!this.aimJoy || k.has('KeyJ') || k.has('Enter') };
    }
    const aj = this.aimJoy;
    if (aj) {
      const dx = aj.x - aj.ox, dy = aj.y - aj.oy;
      if (Math.hypot(dx, dy) > 12) this.aimAng = Math.atan2(dy, dx);
      return { aimAng: this.aimAng || 0, fire: true };
    }
    if (!this.touch && this.mouseX >= 0) {
      const hit = this.groundHit(this.mouseX, this.mouseY);
      if (hit) this.aimAng = Math.atan2(hit[1] - p.y, hit[0] - p.x);
    }
    return { aimAng: this.aimAng || 0, fire: !!this.mouseHeld || k.has('KeyJ') || k.has('Enter') };
  },
  /** Trava o mouse na tela (1ª e 3ª pessoa no computador). */
  lockPointer() {
    const el = this.canvasEl;
    if (!el || this.touch || !this.freeLook() || document.pointerLockElement === el || !el.requestPointerLock) return;
    try { const r = el.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* sem trava */ }
  },

  // ------------------------------------------------------------------
  // Desenho do mundo em 3D
  // ------------------------------------------------------------------

  decor3d() {
    if (this.decor) return this.decor;
    const r = makeRng(7), list = [];
    for (let i = 0; i < 150; i++) list.push({ x: 30 + r.float() * (WORLD_W - 60), y: 30 + r.float() * (WORLD_H - 60), k: r.int(10), s: 18 + r.float() * 14 });
    this.decor = list;
    return list;
  },

  drawWorld3d() {
    const ctx = this.ctx, g = this.game, me = g.player, vw = this.vw;
    const inferno = this.isInferno(), divine = this.isDivine();
    const c = this.setupCam3d();
    // céu e horizonte
    const hy = c.oy - c.focal * Math.tan(c.pitch);
    if (hy > 0) {
      const sky = ctx.createLinearGradient(0, Math.min(0, hy - 400), 0, hy);
      if (inferno) { sky.addColorStop(0, '#12020A'); sky.addColorStop(1, '#6A1A08'); }
      else if (divine) { sky.addColorStop(0, '#6A4FC9'); sky.addColorStop(0.6, '#F7A8C8'); sky.addColorStop(1, '#FFE7A8'); }
      else { sky.addColorStop(0, '#4B9EDB'); sky.addColorStop(1, '#CDEBF5'); }
      ctx.fillStyle = sky; ctx.fillRect(0, 0, vw, hy + 2);
      if (!inferno) { // sol e nuvens que acompanham o giro
        const sx = ((-c.yaw * 400) % (vw + 400) + vw + 400) % (vw + 400) - 200;
        this.circle(sx, hy - 160, 34, 'rgba(255,240,170,0.9)');
        for (let i = 0; i < 5; i++) {
          const cx = (((-c.yaw * 520) + i * 330) % (vw + 600) + vw + 600) % (vw + 600) - 300;
          ctx.globalAlpha = 0.75; this.emoji('☁️', cx, hy - 90 - (i % 3) * 45, 70 + (i % 2) * 30); ctx.globalAlpha = 1;
        }
      }
    }
    ctx.fillStyle = inferno ? '#1E0806' : divine ? '#F4F1FF' : '#3F6630'; // na Divina, um mar de nuvens
    ctx.fillRect(0, Math.max(0, hy), vw, VH - Math.max(0, hy));

    // chão: quadradinhos da horta (mais apagados longe, tipo neblina)
    const T = 150;
    const fog = inferno ? [40, 10, 8] : divine ? [255, 236, 200] : [160, 196, 170];
    const A = inferno ? [74, 22, 16] : divine ? [250, 246, 236] : [94, 138, 58], B = inferno ? [58, 16, 12] : divine ? [236, 214, 160] : [87, 127, 54];
    for (let ty = 0; ty < WORLD_H; ty += T) {
      for (let tx = 0; tx < WORLD_W; tx += T) {
        const mx = tx + T / 2 - c.x, my = ty + T / 2 - c.y;
        if (mx * c.cy + my * c.sy < -T * 1.5) continue; // atrás da câmera
        if (!this.polyPath([[tx, ty, 0], [tx + T, ty, 0], [tx + T, ty + T, 0], [tx, ty + T, 0]])) continue;
        const d = Math.hypot(mx, my), f = clamp((d - 500) / 2200, 0, 0.75), col = ((tx + ty) / T) % 2 === 0 ? A : B;
        ctx.fillStyle = `rgb(${Math.round(col[0] + (fog[0] - col[0]) * f)},${Math.round(col[1] + (fog[1] - col[1]) * f)},${Math.round(col[2] + (fog[2] - col[2]) * f)})`;
        ctx.fill();
      }
    }

    // coisas no chão
    ctx.lineCap = 'round';
    for (const t of g.telegraphs) {
      const pulse = Math.abs(Math.sin(t.time * 12)), s = t.def.boss ? 42 : 16;
      ctx.strokeStyle = `rgba(255,50,40,${(120 + 135 * pulse) / 255})`; ctx.lineWidth = t.def.boss ? 6 : 3;
      if (this.line3(t.x - s, t.y - s, 1, t.x + s, t.y + s, 1)) ctx.stroke();
      if (this.line3(t.x - s, t.y + s, 1, t.x + s, t.y - s, 1)) ctx.stroke();
    }
    this.drawGround5(true);
    for (const p of g.players) {
      if (!p.alive) continue;
      if (p.kind === 'aura') this.groundCircle(p.x, p.y, g.auraRadius(p), 'rgba(212,255,74,0.12)', 'rgba(220,255,90,0.5)', 2);
      if (g.coop) this.groundCircle(p.x, p.y, 30, null, SLOT_COLORS[p.slot % SLOT_COLORS.length], 3);
    }
    for (const wl of g.wells) {
      const r = 50 * (wl.big ? 1.5 : 1);
      this.groundCircle(wl.x, wl.y, r + 60 - ((this.time * 120) % 60), null, 'rgba(149,117,205,0.6)', 3);
      this.groundCircle(wl.x, wl.y, r, 'rgba(10,0,25,0.85)', 'rgba(94,53,177,0.8)', 3);
    }
    for (const m of g.mines) {
      this.groundCircle(m.x, m.y, 11, '#2E7D32', '#A5D6A7', 1.5, 1);
      if (m.arm <= 0 && Math.sin(this.time * 10 + m.x) > 0) this.groundCircle(m.x, m.y, 4, '#FF3030', null, 0, 2);
    }
    if (g.zone) {
      const z = g.zone;
      this.groundCircle(z.x, z.y, z.r, null, `rgba(255,${80 + Math.round(60 * Math.sin(this.time * 6))},80,0.9)`, 5, 1);
    }

    // sombras
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    const shadow = (x, y, r) => {
      const P = this.proj(x, y, 0);
      if (!P || P[3] * r < 0.6) return;
      const d = Math.hypot(x - c.x, y - c.y), k = clamp(c.h / Math.hypot(c.h, d), 0.1, 1);
      ctx.beginPath(); ctx.ellipse(P[0], P[1], r * P[3], r * P[3] * k, 0, 0, Math.PI * 2); ctx.fill();
    };
    for (const e of g.enemies) if (!e.dead && !e.under) shadow(e.x, e.y, e.radius * 0.9);
    for (const p of g.players) if (p.alive && !(p === me && c.mode === CAM_FP)) shadow(p.x, p.y, 24);

    // tudo que fica em pé, do mais longe para o mais perto
    const items = [];
    const add = (P, f) => { if (P) items.push({ z: P[2], P, f }); };
    // cerca
    const FH = 36, seg = 150, MP = this.proj(me.x, me.y, 20), meZ = MP ? MP[2] : 0;
    const fence = (x0, y0, x1, y1) => {
      const P = this.proj((x0 + x1) / 2, (y0 + y1) / 2, FH / 2);
      const mx = (x0 + x1) / 2 - c.x, my = (y0 + y1) / 2 - c.y;
      if (mx * c.cy + my * c.sy < -seg) return;
      const z = P ? P[2] : NEAR;
      items.push({ z, P, f: () => {
        if (z < meZ) ctx.globalAlpha = 0.4; // cerca entre a câmera e o legume: fica transparente
        if (this.polyPath([[x0, y0, 0], [x1, y1, 0], [x1, y1, FH], [x0, y0, FH]])) {
          ctx.fillStyle = inferno ? '#2A0D0A' : divine ? 'rgba(255,214,90,0.55)' : '#7A5530'; ctx.fill();
          ctx.strokeStyle = inferno ? 'rgba(255,110,0,0.8)' : divine ? '#FFF3C4' : '#4E341A'; ctx.lineWidth = 2; ctx.stroke();
        }
        ctx.strokeStyle = inferno ? '#FF6D00' : divine ? '#FFD54F' : '#A97A44'; ctx.lineWidth = 3;
        if (this.line3(x0, y0, FH * 0.7, x1, y1, FH * 0.7)) ctx.stroke();
        ctx.globalAlpha = 1;
      } });
    };
    for (let x = 0; x < WORLD_W; x += seg) { fence(x, 0, x + seg, 0); fence(x, WORLD_H, x + seg, WORLD_H); }
    for (let y = 0; y < WORLD_H; y += seg) { fence(0, y, 0, y + seg); fence(WORLD_W, y, WORLD_W, y + seg); }
    // enfeites (plantinhas e pedras)
    const deco = inferno ? ['🪨', '🔥', '🪨', '💀', '🪨', '🔥', '🪨', '🪨', '🔥', '🪨'] : divine ? ['☁️', '✨', '☁️', '🕊️', '☁️', '🌟', '☁️', '✨', '🪽', '☁️'] : ['🌱', '🌼', '🌱', '🪨', '🌷', '🍀', '🌱', '🌿', '🌼', '🌱'];
    for (const d of this.decor3d()) {
      const dx = d.x - c.x, dy = d.y - c.y;
      if (dx * dx + dy * dy > 1300 * 1300) continue;
      const P = this.proj(d.x, d.y, d.s * 0.35);
      if (!P || P[3] * d.s < 3 || P[3] * d.s > 150) continue; // muito longe ou colado na câmera
      add(P, () => { ctx.globalAlpha = 0.9; this.emoji(deco[d.k], P[0], P[1], d.s * P[3]); ctx.globalAlpha = 1; });
    }
    // coletáveis
    for (const pk of g.pickups) {
      const bob = Math.sin(pk.bob * 5) * 3;
      if (pk.type === 0) {
        const r = pk.value > 1 ? 10 : 7, P = this.proj(pk.x, pk.y, r + 2 + bob);
        add(P, () => { this.circle(P[0], P[1], r * P[3], C.SEED); this.circle(P[0] - r * 0.3 * P[3], P[1] - r * 0.3 * P[3], r * 0.4 * P[3], '#D6FFB0'); });
      } else {
        const P = this.proj(pk.x, pk.y, 20 + bob);
        add(P, () => this.emoji(pk.type === 2 ? '📦' : '🍎', P[0], P[1], (pk.type === 2 ? 40 : 34) * P[3]));
      }
    }
    for (const dc of g.decoys) {
      const P = this.proj(dc.x, dc.y, 24);
      add(P, () => { ctx.globalAlpha = 0.85; this.emoji('🍇', P[0], P[1], 46 * P[3]); ctx.globalAlpha = 1; });
    }
    // insetos
    for (const e of g.enemies) {
      if (e.dead) continue;
      const P = this.proj(e.x, e.y, e.radius * 1.15 + (e.h || 0));
      if (!P || P[3] * e.radius < 0.4) continue;
      add(P, () => {
        if (e.def.ai === AI_SHIELDED) e.vfa = this.screenAngle(e.x, e.y, P[2] ? e.radius : 0, e.fa || 0, this.proj(e.x, e.y, e.radius));
        this.anchored(P, e.x, e.y, () => this.drawEnemy(e, inferno));
        e.vfa = undefined;
      });
    }
    // jogadores e armas
    for (const p of g.players) {
      const fp = p === me && c.mode === CAM_FP;
      if (!p.alive) { const P = this.proj(p.x, p.y, 34); add(P, () => this.anchored(P, p.x, p.y, () => this.drawGhost(p))); continue; }
      if (!fp) {
        const P = this.proj(p.x, p.y, 34);
        add(P, () => this.anchored(P, p.x, p.y, () => { this.drawPlayer(p); this.drawAbilityOver(p); this.drawPlayer5(p); }));
        if (g.coop && p !== me && P) items.push({ z: P[2] - 1, P, f: () => this.text(this.titled(p.name, p.emp), P[0], P[1] - 48 * P[3], clamp(18 * P[3], 12, 22), SLOT_COLORS[p.slot % SLOT_COLORS.length], 'center') });
        for (const w of p.weapons) {
          if (w.def.laser) continue;
          const Q = this.proj(w.tipX, w.tipY, 30);
          add(Q, () => this.weapon3d(w, Q, p));
        }
      }
      if (p.kind === 'minions') {
        const n = g.minionCount(p);
        for (let i = 0; i < n; i++) {
          const [x, y] = g.minionPos(p, i, n), P = this.proj(x, y, 48 + Math.sin(this.time * 6 + i) * 3);
          add(P, () => this.emoji('🫐', P[0], P[1], 26 * P[3]));
        }
      }
    }
    // tiros
    for (const b of g.bullets) {
      if (!b.wd && b.source && b.source.def) b.wd = b.source.def;
      const P = this.proj(b.x, b.y, 26);
      if (!P) continue;
      add(P, () => {
        const sa = this.screenAngle(b.x, b.y, 26, Math.atan2(b.vy, b.vx), P), sp = Math.hypot(b.vx, b.vy);
        const vx = b.vx, vy = b.vy;
        b.vx = Math.cos(sa) * sp; b.vy = Math.sin(sa) * sp;
        this.anchored(P, b.x, b.y, () => this.drawBullet(b));
        b.vx = vx; b.vy = vy;
        ctx.globalAlpha = 1;
      });
    }
    for (const b of g.enemyBullets) {
      const P = this.proj(b.x, b.y, 24);
      add(P, () => {
        const r = b.radius * P[3];
        if (b.web) { this.circle(P[0], P[1], r + 2, 'rgba(255,255,255,0.35)'); this.circle(P[0], P[1], r * 0.7, '#F5F5F5'); return; }
        this.circle(P[0], P[1], r + 3 * P[3], inferno ? 'rgba(255,80,0,0.35)' : divine ? 'rgba(255,200,40,0.35)' : '#3A0A4A');
        this.circle(P[0], P[1], r, inferno ? '#FF6D00' : divine ? '#FFB300' : '#C24BFF');
        this.circle(P[0], P[1], r * 0.4, inferno ? '#FFF59D' : divine ? '#FFFFFF' : '#F5D6FF');
      });
    }
    // partículas
    for (const pt of g.particles) {
      const a = Math.max(0, pt.life / pt.maxLife);
      if (pt.ring) { items.push({ z: 1e9, f: () => this.groundCircle(pt.x, pt.y, pt.size * (1.1 - a * 0.6), null, `rgba(${pt.color},${a})`, 6 * a + 2, 2) }); continue; }
      const P = this.proj(pt.x, pt.y, 18 + (1 - a) * 20);
      add(P, () => this.circle(P[0], P[1], pt.size * (0.4 + 0.6 * a) * P[3], `rgba(${pt.color},${a})`));
    }
    items.sort((a, b) => b.z - a.z);
    for (const it of items) it.f();

    // laser (por cima, brilhando)
    for (const p of g.players) if (p.alive && p.kind === 'laser') this.laser3d(p, p === me && c.mode === CAM_FP);
    // números de dano
    for (const t of g.texts) {
      const rise = (t.maxLife - t.life) * 50, P = this.proj(t.x, t.y + rise, 55 + rise);
      if (!P) continue;
      ctx.globalAlpha = Math.min(1, t.life / t.maxLife * 2);
      this.text(t.text, P[0], P[1], clamp(t.size * P[3] * 1.4, 12, 64), t.color, 'center');
    }
    ctx.globalAlpha = 1;
    if (c.mode === CAM_FP && me.alive) this.viewModel(me);
    this.drawAim3d(me);
  },

  /** Desenha fn() com o mundo 2D "pendurado" no ponto projetado P (x, y = âncora no mundo). */
  anchored(P, x, y, fn) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(P[0], P[1]);
    ctx.scale(P[3], P[3]);
    ctx.translate(-x, -y);
    fn();
    ctx.restore();
  },

  /** Arma em pé no mundo, virada para onde ela aponta na tela. */
  weapon3d(w, Q, p) {
    const ang = w.attacking() ? Math.atan2(w.dirY, w.dirX) : w.angle;
    const sa = this.screenAngle(w.tipX, w.tipY, 30, ang, Q);
    const keep = [w.tipX, w.tipY, w.angle, w.dirX, w.dirY];
    w.tipX = 0; w.tipY = 0; w.angle = sa; w.dirX = Math.cos(sa); w.dirY = Math.sin(sa);
    const ctx = this.ctx;
    ctx.save(); ctx.translate(Q[0], Q[1]); ctx.scale(Q[3], Q[3]);
    this.drawWeapon(w, p.laser.heat);
    ctx.restore();
    [w.tipX, w.tipY, w.angle, w.dirX, w.dirY] = keep;
  },

  /** 1ª pessoa: as armas aparecem embaixo da tela, golpeando pra frente. */
  viewModel(p) {
    const n = p.weapons.length, vw = this.vw;
    p.weapons.forEach((w, i) => {
      if (w.def.laser) return;
      const side = n === 1 ? 1 : (i % 2 ? 1 : -1), row = Math.floor(i / 2);
      let x = vw / 2 + side * (150 + row * 120), y = VH - 70 - row * 30;
      let s = 3.2 - row * 0.5;
      if (w.attacking()) { const ph = Math.sin(Math.PI * clamp(w.attackT / w.attackDur, 0, 1)); y -= ph * 90; x -= side * ph * 60; s *= 1 - ph * 0.3; }
      const keep = [w.tipX, w.tipY, w.angle, w.dirX, w.dirY, w.attackT];
      const a = -Math.PI / 2 - side * 0.5;
      w.tipX = 0; w.tipY = 0; w.angle = a; w.dirX = Math.cos(a); w.dirY = Math.sin(a); w.attackT = -1;
      const ctx = this.ctx;
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      this.drawWeapon(w, p.laser.heat);
      ctx.restore();
      [w.tipX, w.tipY, w.angle, w.dirX, w.dirY, w.attackT] = keep;
    });
    if (p.parryFx > 0 || p.parryT > 0) { // escudinho do parry
      const a = p.parryFx > 0 ? 1 : 0.6;
      this.ctx.globalAlpha = a; this.emoji('🛡️', vw / 2, VH - 120, 110); this.ctx.globalAlpha = 1;
    }
  },

  laser3d(p, fp) {
    const L = p.laser;
    if (!L.on) return;
    const g = this.game, st = p.laserView || g.laserStats(p), ctx = this.ctx;
    const beams = [[0, 1]];
    for (let k = 1; k <= (p.laserView ? p.laserView.split : p.cy.split); k++) beams.push([0.22 * k, 0.8], [-0.22 * k, 0.8]);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const [off, lm] of beams) {
      const a = p.aimAng + off, cx = Math.cos(a), sx = Math.sin(a), len = st.range * lm, N = 10;
      let prev = fp ? [this.vw / 2 + 60, VH - 40, 0, 2.5] : this.proj(p.x + cx * 30, p.y + sx * 30, 30);
      for (let i = 1; i <= N; i++) {
        const t = 30 + len * i / N, P = this.proj(p.x + cx * t, p.y + sx * t, 30);
        if (prev && P) {
          const w = st.width * (off ? 0.6 : 1) * (prev[3] + P[3]) / 2;
          for (const [lw, col] of [[w * 2.4, 'rgba(255,30,60,0.18)'], [w * 1.3, 'rgba(255,60,90,0.55)'], [w * 0.45, 'rgba(255,230,235,0.95)']]) {
            ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, lw);
            ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(P[0], P[1]); ctx.stroke();
          }
        }
        prev = P;
      }
    }
    ctx.restore();
  },

  /** Mira: a cruz onde os golpes vão (e uma linha no chão na câmera de cima). */
  drawAim3d(p) {
    if (!p.alive) return;
    const c = this.c3, ctx = this.ctx, a = p.aimAng;
    const dist = c.mode === CAM_FP ? 420 : 330;
    const P = this.proj(p.x + Math.cos(a) * dist, p.y + Math.sin(a) * dist, c.mode === CAM_TOP ? 0 : 26);
    if (c.mode === CAM_TOP) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3; ctx.setLineDash([12, 12]);
      if (this.line3(p.x, p.y, 1, p.x + Math.cos(a) * dist, p.y + Math.sin(a) * dist, 1)) ctx.stroke();
      ctx.setLineDash([]);
    }
    if (!P) return;
    const col = p.wantFire ? 'rgba(255,90,90,0.95)' : 'rgba(255,255,255,0.9)';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 5;
    const cross = () => {
      ctx.beginPath();
      ctx.moveTo(P[0] - 18, P[1]); ctx.lineTo(P[0] - 6, P[1]); ctx.moveTo(P[0] + 6, P[1]); ctx.lineTo(P[0] + 18, P[1]);
      ctx.moveTo(P[0], P[1] - 18); ctx.lineTo(P[0], P[1] - 6); ctx.moveTo(P[0], P[1] + 6); ctx.lineTo(P[0], P[1] + 18);
      ctx.stroke();
    };
    cross(); ctx.strokeStyle = col; ctx.lineWidth = 2.5; cross();
  },

  // ------------------------------------------------------------------
  // Coisas novas da 5.0 (no 2D e no 3D)
  // ------------------------------------------------------------------

  /** Marcas de perigo, nuvens e teias no chão. */
  drawGround5(is3d) {
    const g = this.game, ctx = this.ctx, t = this.time;
    const circ = (x, y, r, fill, stroke, lw) => {
      if (is3d) { this.groundCircle(x, y, r, fill, stroke, lw, 1); return; }
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
    };
    for (const z of g.zones) {
      const a = Math.min(1, z.t * 2);
      if (z.kind === 'web') {
        circ(z.x, z.y, z.r, `rgba(235,235,235,${0.16 * a})`, `rgba(240,240,240,${0.5 * a})`, 2);
        if (!is3d) {
          ctx.strokeStyle = `rgba(240,240,240,${0.35 * a})`; ctx.lineWidth = 1.5;
          for (let i = 0; i < 6; i++) { const an = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(z.x, z.y); ctx.lineTo(z.x + Math.cos(an) * z.r, z.y + Math.sin(an) * z.r); ctx.stroke(); }
          circ(z.x, z.y, z.r * 0.5, null, `rgba(240,240,240,${0.35 * a})`, 1.5);
        }
      } else if (z.kind === 'spore') circ(z.x, z.y, z.r * (0.95 + 0.05 * Math.sin(t * 6)), `rgba(179,136,255,${0.22 * a})`, `rgba(200,160,255,${0.6 * a})`, 3);
      else circ(z.x, z.y, z.r * (0.95 + 0.05 * Math.sin(t * 5)), `rgba(150,200,40,${0.28 * a})`, `rgba(170,220,60,${0.55 * a})`, 2);
    }
    for (const m of g.marks) {
      const k = clamp(1 - m.t / m.max, 0, 1);
      if (m.bad) {
        circ(m.x, m.y, m.r, `rgba(255,40,30,${0.12 + 0.1 * Math.sin(t * 20)})`, 'rgba(255,60,40,0.85)', 3);
        circ(m.x, m.y, m.r * k, 'rgba(255,40,30,0.3)', null);
      } else circ(m.x, m.y, m.r, 'rgba(255,90,90,0.12)', 'rgba(255,120,120,0.7)', 2);
    }
    for (const e of g.enemies) { // insetos embaixo da terra: montinho que anda
      if (e.dead || !e.under || e.def.ai !== AI_BURROW) continue;
      circ(e.x, e.y, e.radius * 0.9, 'rgba(110,80,50,0.85)', 'rgba(60,40,20,0.9)', 2);
    }
    for (const e of g.enemies) { // fungo e general: aura
      if (e.dead) continue;
      if (e.def.ai === AI_HEALER) circ(e.x, e.y, 230, null, 'rgba(120,255,140,0.25)', 2);
      else if (e.def.ai === AI_COMMANDER) circ(e.x, e.y, 260, 'rgba(255,170,40,0.06)', 'rgba(255,170,40,0.35)', 2);
    }
  },

  /** Efeitos da 5.0 em cima do legume (fumaça, casca, parry, bola). Desenhado no espaço do mundo 2D. */
  drawPlayer5(p) {
    const ctx = this.ctx, t = this.time;
    if (p.parryFx > 0) { ctx.strokeStyle = `rgba(122,232,255,${p.parryFx * 2.5})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(p.x, p.y, 50 + (0.35 - p.parryFx) * 80, 0, Math.PI * 2); ctx.stroke(); }
    else if (p.parryT > 0) { ctx.strokeStyle = 'rgba(122,232,255,0.8)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y, 44, 0, Math.PI * 2); ctx.stroke(); }
    if (p.wallT > 0) { ctx.strokeStyle = 'rgba(255,170,60,0.8)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(p.x, p.y, 40, 0, Math.PI * 2); ctx.stroke(); }
    if (p.smokeT > 0) for (let i = 0; i < 5; i++) this.circle(p.x + Math.cos(t * 2 + i * 1.3) * 26, p.y + Math.sin(t * 2.4 + i) * 18, 18, 'rgba(210,210,210,0.35)');
    if (p.rollT > 0 || p.popT > 0 || p.fusionT > 0 || p.odT > 0 || p.swarmT > 0) {
      const ic = p.rollT > 0 ? '🥥' : p.popT > 0 ? '🍿' : p.fusionT > 0 ? '🌈' : p.odT > 0 ? '⚡' : '🫐';
      this.emoji(ic, p.x - 30, p.y - 36, 22);
    }
    if (p.webT > 0) this.emoji('🕸️', p.x + 26, p.y + 14, 22);
  },

  /** Botões de toque da habilidade, do parry e da câmera + dica dos insetos novos. */
  drawHud5(p) {
    const g = this.game, vw = this.vw, a = p.character.active;
    if (a) {
      const ready = !(p.activeCd > 0), b = this.dashButton();
      const cx = b.x + b.s / 2, cy = b.y + b.s / 2;
      if (this.touch || g.mode3d) {
        this.circle(cx, cy, b.s / 2, ready ? 'rgba(255,214,74,0.45)' : 'rgba(60,60,60,0.5)');
        if (!ready) { // pizza da recarga
          const f = clamp(p.activeCd / Math.max(0.1, p.activeCooldown()), 0, 1), ctx = this.ctx;
          ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, b.s / 2, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.closePath(); ctx.fill();
        }
        this.emoji(a.icon, cx, cy, b.s * 0.5);
        if (!ready) this.text(p.activeCd.toFixed(1), cx, cy + b.s / 2 + 22, 20, '#FFFFFF', 'center');
        else if (!this.touch) this.keyBadge('Q', b.x + b.s - 14, b.y + 8);
        if (this.touch) this.register(b.x, b.y, b.s, b.s, 'SKILL', 0, true);
      } else {
        const line = ready ? a.icon + ' ' + a.name + ' pronta (Q)' : a.icon + ' ' + a.name + ': ' + p.activeCd.toFixed(1) + ' s';
        this.textFit(line, vw / 2, 156, 19, 420, ready ? '#FFE14A' : '#CFCFCF');
      }
    }
    if (g.mode3d) {
      const pb = this.parryButton(), ready = !(p.parryCd > 0);
      this.circle(pb.x + pb.s / 2, pb.y + pb.s / 2, pb.s / 2, p.parryT > 0 ? 'rgba(122,232,255,0.7)' : ready ? 'rgba(122,232,255,0.35)' : 'rgba(60,60,60,0.5)');
      this.emoji('🛡️', pb.x + pb.s / 2, pb.y + pb.s / 2, pb.s * 0.5);
      if (this.touch) this.register(pb.x, pb.y, pb.s, pb.s, 'PARRY', 0, true);
      else this.keyBadge('␣', pb.x + pb.s - 12, pb.y + 6);
      this.button(vw - 86, 96, 68, 68, CAM_ICONS[this.camMode()], 'CAM', 0, 'rgba(51,51,51,0.67)', true, 30);
      if (p.parryFx > 0) { // tela pisca azul no parry
        this.ctx.fillStyle = `rgba(122,232,255,${(p.parryFx * 0.5).toFixed(3)})`;
        this.ctx.fillRect(0, 0, vw, VH);
      }
      if (this.camMode() !== CAM_TOP) this.drawRadar(p);
      if (g.wave === 1 && g.waveTime < 8 && !g.pvp) {
        const hint = this.touch
          ? (this.camMode() === CAM_TOP ? 'Esquerda: andar • Direita: mirar e ATACAR • 🛡️ parry na hora do golpe' : 'Esquerda: andar • Direita: girar e ATACAR • 🛡️ parry na hora do golpe')
          : (this.camMode() === CAM_TOP ? 'WASD: andar • Mouse: mirar • Segure o clique: ATACAR • Espaço/botão direito: PARRY • C: câmera' : 'Clique pra travar o mouse • Segure o clique: ATACAR • Espaço/botão direito: PARRY • C: câmera');
        this.textFit(hint, vw / 2, VH - 150, 22, vw - 80, 'rgba(255,255,255,0.85)');
      }
    }
    if (g.tipT > 0 && g.tip) {
      this.ctx.globalAlpha = Math.min(1, g.tipT);
      const w = Math.min(vw - 60, this.measure(g.tip, 22) + 40);
      this.roundRect(vw / 2 - w / 2, 178, w, 40, 12, 'rgba(0,0,0,0.6)', 'rgba(255,214,74,0.5)', 2);
      this.textFit(g.tip, vw / 2, 205, 22, w - 20, '#FFE678');
      this.ctx.globalAlpha = 1;
    }
  },
  parryButton() { const s = 92; return { x: this.vw - s - 180, y: VH - s - 40, s }; },

  /** Radar (1ª e 3ª pessoa): os insetos em volta, com a frente pra cima. */
  drawRadar(p) {
    const g = this.game, R = 70, cx = this.vw - 120, cy = 250, range = 900, ctx = this.ctx;
    this.circle(cx, cy, R, 'rgba(0,0,0,0.45)');
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    const yaw = this.c3 ? this.c3.yaw : -Math.PI / 2, cyw = Math.cos(yaw), syw = Math.sin(yaw);
    const dot = (x, y, r, col) => {
      const dx = x - p.x, dy = y - p.y, f = dx * cyw + dy * syw, l = -dx * syw + dy * cyw, d = Math.hypot(f, l);
      const k = d > range ? R / d : R / range;
      this.circle(cx + l * k, cy - f * k, r, col);
    };
    for (const e of g.enemies) if (!e.dead) dot(e.x, e.y, e.def.boss ? 6 : e.elite ? 4 : 2.5, e.def.boss ? '#B03AFF' : e.elite ? '#FFC400' : e.under ? '#A0784A' : '#FF5040');
    for (const b of g.enemyBullets) dot(b.x, b.y, 1.5, '#E0A0FF');
    for (const q of g.players) if (q !== p && q.alive) dot(q.x, q.y, 4, SLOT_COLORS[q.slot % SLOT_COLORS.length]);
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.moveTo(cx, cy - 7); ctx.lineTo(cx - 5, cy + 5); ctx.lineTo(cx + 5, cy + 5); ctx.closePath(); ctx.fill();
  },
};

if (typeof Ui !== 'undefined') Object.assign(Ui.prototype, R3D);
