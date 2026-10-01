// Desenhos detalhados: o visual de cada legume (de acordo com a classe), as armas,
// os projéteis e o mapa do Inferno. Tudo feito com o Canvas (sem imagens).
// As funções entram na classe Ui (ficam disponíveis como this.drawHero, this.drawWeapon...).
'use strict';

const Art = {
  // ------------------------------------------------------------------
  // Legumes
  // ------------------------------------------------------------------

  /**
   * Desenha um personagem com olhos e, em volta, pequenas partículas animadas que mostram o que ele é.
   * o = {facingLeft, lookX, lookY, bob, moving, alpha}
   */
  drawHero(c, x, y, size, o) {
    o = o || {};
    const ctx = this.ctx, t = this.time, k = size / 68;
    const left = !!o.facingLeft;
    ctx.save();
    ctx.translate(x, y);
    const bob = o.bob || 0;
    ctx.scale(1 - bob * 0.5, 1 + bob);
    ctx.scale(k, k);
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    this.heroParticles(c.look, t, o, false);
    ctx.save();
    if (!left) ctx.scale(-1, 1);
    this.emoji(c.icon, 0, 0, 68);
    ctx.restore();
    const lx = o.lookX === undefined ? (left ? -1 : 1) : o.lookX, ly = o.lookY || 0;
    this.drawEyes(0, -4, 1, lx, ly);
    this.heroParticles(c.look, t, o, true);
    ctx.restore();
  },

  /**
   * Partículas de cada classe. front = false desenha as que ficam atrás do corpo.
   * Tudo é calculado a partir do tempo (sem guardar estado), então serve pra qualquer tela.
   */
  heroParticles(look, t, o, front) {
    const ctx = this.ctx;
    const a0 = ctx.globalAlpha;
    // órbita: n partículas girando numa elipse; metade fica atrás do corpo, metade na frente
    const orbit = (n, rx, ry, speed, draw) => {
      for (let i = 0; i < n; i++) {
        const a = t * speed + i * Math.PI * 2 / n;
        const isFront = Math.sin(a) > 0;
        if (isFront !== front) continue;
        draw(Math.cos(a) * rx, Math.sin(a) * ry, i, a);
      }
    };
    // subindo: partículas nascem embaixo e somem lá em cima
    const rise = (n, w, h, speed, draw) => {
      if (!front) return;
      for (let i = 0; i < n; i++) {
        const u = (t * speed + i / n) % 1;
        const x = (i % 2 ? 1 : -1) * (20 + Math.abs(Math.sin(i * 12.9 + t)) * (w - 14));
        ctx.globalAlpha = a0 * Math.sin(u * Math.PI);
        draw(x, 24 - u * h, i, u);
      }
      ctx.globalAlpha = a0;
    };
    // piscando: pontos fixos em volta que acendem e apagam
    const twinkle = (n, r, speed, draw) => {
      if (!front) return;
      for (let i = 0; i < n; i++) {
        const ang = i * 2.39996, rr = r * (0.75 + 0.25 * Math.sin(i * 7.1));
        const v = Math.sin(t * speed + i * 1.7);
        if (v <= 0) continue;
        ctx.globalAlpha = a0 * v;
        draw(Math.cos(ang) * rr, Math.sin(ang) * rr * 0.85, i, v);
      }
      ctx.globalAlpha = a0;
    };
    const dot = (x, y, r, c) => this.circle(x, y, r, c);
    switch (look) {
      case 'potato': // folhinhas de broto subindo
        rise(4, 26, 70, 0.35, (x, y, i) => {
          ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 3 + i) * 0.6);
          ctx.fillStyle = i % 2 ? '#7CD24E' : '#5DB33A';
          ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 2.2, 0.5, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });
        break;
      case 'viking': // faíscas de força (Tomatão)
        twinkle(7, 42, 4, (x, y, i, v) => this.sparkle(x, y, 3 + v * 3, i % 2 ? '#FF7043' : '#FFD54F'));
        break;
      case 'ninja': // estrelinhas ninja girando
        orbit(3, 44, 16, 3.2, (x, y, i, a) => {
          ctx.save(); ctx.translate(x, y + 6); ctx.rotate(a * 3);
          ctx.fillStyle = '#B0BEC5';
          ctx.beginPath();
          for (let k = 0; k < 8; k++) { const rr = k % 2 ? 1.6 : 5; const aa = k * Math.PI / 4; ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); }
          ctx.closePath(); ctx.fill();
          ctx.restore();
        });
        break;
      case 'cowboy': // pipocas pulando
        rise(4, 28, 60, 0.6, (x, y, i) => {
          dot(x, y, 3.6, '#FFF8E1'); dot(x + 2.4, y - 1.6, 2.6, '#FFF8E1'); dot(x - 1, y + 1.5, 1.6, '#FFCA28');
        });
        break;
      case 'flame': // brasas subindo
        rise(7, 24, 70, 0.8, (x, y, i, u) => dot(x, y, 2.6 - u * 1.4, i % 3 ? '#FF9100' : '#FFEA00'));
        break;
      case 'lucky': // brilhinhos dourados e trevos
        twinkle(6, 40, 3, (x, y, i, v) => {
          if (i % 3 === 0) { ctx.fillStyle = '#4FD34F'; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.78; dot(x + Math.cos(a) * 2.2, y + Math.sin(a) * 2.2, 2.2, '#4FD34F'); } }
          else this.sparkle(x, y, 2.5 + v * 3, '#FFE66D');
        });
        break;
      case 'knight': // escudinhos prateados girando
        orbit(3, 42, 14, 1.4, (x, y) => {
          ctx.save(); ctx.translate(x, y + 8);
          ctx.fillStyle = '#CFD8DC'; ctx.strokeStyle = '#607D8B'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(4, -4); ctx.lineTo(4, 1); ctx.quadraticCurveTo(0, 6, -4, 1); ctx.closePath();
          ctx.fill(); ctx.stroke();
          ctx.restore();
        });
        break;
      case 'archer': // penas caindo devagar
        rise(3, 30, 66, 0.25, (x, y, i) => {
          ctx.save(); ctx.translate(x, y); ctx.rotate(0.6 + Math.sin(t * 2 + i) * 0.5);
          ctx.fillStyle = i % 2 ? '#E53935' : '#66BB6A';
          ctx.beginPath(); ctx.ellipse(0, 0, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke();
          ctx.restore();
        });
        break;
      case 'wizard': // flocos de gelo mágicos
        twinkle(6, 40, 2.5, (x, y, i, v) => this.sparkle(x, y, 3 + v * 2.5, i % 2 ? '#B3E5FC' : '#E1F5FE'));
        break;
      case 'cyborg': // pixels vermelhos e faíscas elétricas
        orbit(4, 40, 14, 2.4, (x, y, i) => {
          ctx.fillStyle = i % 2 ? '#FF3D3D' : '#80DEEA';
          ctx.fillRect(x - 2.5, y + 6 - 2.5, 5, 5);
        });
        if (front && Math.sin(t * 9) > 0.7) {
          ctx.strokeStyle = '#80DEEA'; ctx.lineWidth = 1.5;
          const a = Math.floor(t * 9) * 2.1, cx = Math.cos(a) * 30, cy = Math.sin(a) * 22;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 4, cy + 4); ctx.lineTo(cx, cy + 7); ctx.lineTo(cx + 5, cy + 11); ctx.stroke();
        }
        break;
      case 'vampire': // gotas de suco vermelho girando
        orbit(4, 40, 15, 1.8, (x, y) => {
          ctx.fillStyle = '#C62828';
          ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.quadraticCurveTo(x + 3.5, y + 7, x, y + 9); ctx.quadraticCurveTo(x - 3.5, y + 7, x, y + 2); ctx.fill();
        });
        break;
      case 'alien': // bolinhas verdes brilhando em órbita
        orbit(3, 44, 16, 2.6, (x, y) => {
          const g = ctx.createRadialGradient(x, y + 6, 0.5, x, y + 6, 7);
          g.addColorStop(0, '#E6FFE6'); g.addColorStop(0.45, '#5CFF8A'); g.addColorStop(1, 'rgba(92,255,138,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y + 6, 7, 0, Math.PI * 2); ctx.fill();
        });
        break;
      case 'miner': // sementes pretas pulando
        rise(4, 26, 50, 0.7, (x, y, i) => {
          ctx.fillStyle = '#212121';
          ctx.beginPath(); ctx.ellipse(x, y, 2, 3.2, Math.sin(i) * 0.6, 0, Math.PI * 2); ctx.fill();
        });
        break;
      case 'summoner': // faíscas de magia azul em órbita
        orbit(5, 42, 16, 2, (x, y, i) => {
          dot(x, y + 4, 3.2, 'rgba(124,140,255,0.45)');
          dot(x, y + 4, 1.8, i % 2 ? '#C5CAE9' : '#7C8CFF');
        });
        break;
      case 'racer': // lascas de coco girando e poeira quando anda
        orbit(3, 40, 14, 3, (x, y, i, a) => {
          ctx.save(); ctx.translate(x, y + 8); ctx.rotate(a * 2);
          ctx.fillStyle = i % 2 ? '#8D6E63' : '#F5F5F5'; ctx.fillRect(-3.5, -1.8, 7, 3.6);
          ctx.restore();
        });
        if (!front) {
          const n = o.moving ? 5 : 2;
          for (let i = 0; i < n; i++) {
            const u = (t * 1.6 + i / n) % 1;
            ctx.globalAlpha = a0 * (1 - u) * 0.7;
            dot(-6 + Math.sin(i * 5) * 16, 26 - u * 12, 3 + u * 6, '#BCAAA4');
          }
          ctx.globalAlpha = a0;
        }
        break;
    }
  },

  flame(x, y, w, h) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(x, y, x, y - h);
    g.addColorStop(0, '#FF3D00'); g.addColorStop(0.5, '#FF9100'); g.addColorStop(1, '#FFEA00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x - w, y - h * 0.6, x, y - h);
    ctx.quadraticCurveTo(x + w, y - h * 0.6, x + w, y);
    ctx.closePath();
    ctx.fill();
  },

  star(x, y, r, color) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  },

  sparkle(x, y, r, color) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.25, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.25, y); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - r, y); ctx.lineTo(x, y + r * 0.25); ctx.lineTo(x + r, y); ctx.lineTo(x, y - r * 0.25); ctx.closePath(); ctx.fill();
  },

  /** Tentáculos tecnológicos do Alien Hala, do corpo até cada arma. */
  drawTentacles(p) {
    const ctx = this.ctx, t = this.time;
    ctx.lineCap = 'round';
    p.weapons.forEach((w, i) => {
      const ax = p.x + Math.cos(i * 2.3) * 8, ay = p.y + 12;
      const mx = (ax + w.x) / 2 + Math.sin(t * 3 + i) * 12, my = (ay + w.y) / 2 + Math.cos(t * 2.5 + i) * 12 + 10;
      for (const [lw, col] of [[9, '#1E4A3A'], [6, '#3FA38A'], [2, '#9FFFE0']]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, w.x, w.y); ctx.stroke();
      }
      // anéis metálicos
      for (let k = 1; k <= 3; k++) {
        const u = k / 4;
        const bx = (1 - u) * (1 - u) * ax + 2 * u * (1 - u) * mx + u * u * w.x;
        const by = (1 - u) * (1 - u) * ay + 2 * u * (1 - u) * my + u * u * w.y;
        this.circle(bx, by, 4, '#B8C4CC');
        this.circle(bx, by, 2, '#5CFF8A');
      }
    });
  },

  // ------------------------------------------------------------------
  // Armas (cada uma com o seu desenho)
  // ------------------------------------------------------------------

  metal(x0, y0, x1, y1, light, dark) {
    const g = this.ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, light); g.addColorStop(0.5, dark); g.addColorStop(1, light);
    return g;
  },

  gem(x, y, r, tier) {
    const ctx = this.ctx;
    ctx.fillStyle = TIER_COLOR[tier];
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.25, 0, Math.PI * 2); ctx.fill();
  },

  drawWeapon(w, heat) {
    const ctx = this.ctx, d = w.def, t = this.time;
    const ang = w.attacking() ? Math.atan2(w.dirY, w.dirX) : w.angle;
    ctx.save();
    ctx.translate(w.tipX, w.tipY);
    ctx.rotate(ang);
    if (Math.cos(ang) < 0) ctx.scale(1, -1);
    ctx.scale(1.15, 1.15);
    // brilho de raridade
    if (w.tier >= 2) {
      const g = ctx.createRadialGradient(6, 0, 2, 6, 0, 30);
      g.addColorStop(0, w.tier === 3 ? 'rgba(255,90,74,0.35)' : 'rgba(183,107,255,0.3)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(6, 0, 30, 0, Math.PI * 2); ctx.fill();
    }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const OUT = '#1A1A1A';
    switch (d) {
      case W.SOCO: { // luva de boxe
        ctx.fillStyle = '#F5F5F5'; this.roundRect(-14, -8, 9, 16, 3, '#F5F5F5', OUT, 2);
        ctx.fillStyle = TIER_COLOR[w.tier]; ctx.fillRect(-13, -2, 7, 4);
        const g = ctx.createRadialGradient(4, -4, 2, 4, 0, 16);
        g.addColorStop(0, '#FF6B6B'); g.addColorStop(1, '#B71C1C');
        ctx.fillStyle = g; ctx.strokeStyle = OUT; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(5, 0, 13, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(-1, 9, 6, 4, 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); // polegar
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
        for (const yy of [-5, 0, 5]) { ctx.beginPath(); ctx.moveTo(12, yy); ctx.lineTo(16, yy); ctx.stroke(); }
        this.circle(1, -5, 3, 'rgba(255,255,255,0.5)');
        break;
      }
      case W.FACA: {
        this.roundRect(-14, -3.5, 13, 7, 2, '#5D3A1A', OUT, 2);
        this.circle(-10, 0, 1.4, '#E0C080'); this.circle(-5, 0, 1.4, '#E0C080');
        this.roundRect(-2, -5, 3, 10, 1, '#9AA4AE', OUT, 1.5);
        ctx.fillStyle = this.metal(0, -4, 0, 4, '#F2F6FA', '#A9B4BF'); ctx.strokeStyle = OUT; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(1, -4); ctx.lineTo(20, -4); ctx.quadraticCurveTo(26, -2, 28, 1); ctx.lineTo(1, 3.5); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(3, -2); ctx.lineTo(19, -2); ctx.stroke();
        this.gem(-16, 0, 2.5, w.tier);
        break;
      }
      case W.ESPADA: {
        this.roundRect(-15, -3.5, 13, 7, 2, '#4E2E14', OUT, 2);
        ctx.strokeStyle = '#2A1808'; ctx.lineWidth = 1;
        for (let i = -13; i < -3; i += 3) { ctx.beginPath(); ctx.moveTo(i, -3); ctx.lineTo(i + 2, 3); ctx.stroke(); }
        this.gem(-17, 0, 3.2, w.tier);
        ctx.fillStyle = this.metal(0, -10, 0, 10, '#FFE58A', '#B8860B');
        this.roundRect(-3, -10, 5, 20, 2, ctx.fillStyle, OUT, 2);
        ctx.fillStyle = this.metal(0, -5, 0, 5, '#F2F6FA', '#9DA9B5'); ctx.strokeStyle = OUT; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(2, -5); ctx.lineTo(34, -5); ctx.lineTo(42, 0); ctx.lineTo(34, 5); ctx.lineTo(2, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(80,90,100,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(32, 0); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(5, -3); ctx.lineTo(30, -3); ctx.stroke();
        break;
      }
      case W.LANCA: {
        ctx.strokeStyle = OUT; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(24, 0); ctx.stroke();
        ctx.strokeStyle = '#8B5A2B'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(24, 0); ctx.stroke();
        ctx.strokeStyle = '#B07A42'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-32, -1); ctx.lineTo(22, -1); ctx.stroke();
        // fitinha
        ctx.fillStyle = TIER_COLOR[w.tier];
        const fl = Math.sin(t * 8) * 3;
        ctx.beginPath(); ctx.moveTo(18, 0); ctx.quadraticCurveTo(10, 8 + fl, 4, 12 + fl); ctx.lineTo(9, 11 + fl); ctx.quadraticCurveTo(14, 6, 20, 1); ctx.fill();
        ctx.fillStyle = '#C9A93A'; this.roundRect(18, -3.5, 6, 7, 1, '#C9A93A', OUT, 1.5);
        ctx.fillStyle = this.metal(0, -7, 0, 7, '#FFF2C0', '#C99A2E'); ctx.strokeStyle = OUT; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(24, 0); ctx.quadraticCurveTo(30, -8, 44, 0); ctx.quadraticCurveTo(30, 8, 24, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(120,80,10,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(42, 0); ctx.stroke();
        break;
      }
      case W.ESTILINGUE: {
        ctx.strokeStyle = OUT; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(2, 0); ctx.moveTo(2, 0); ctx.lineTo(12, -10); ctx.moveTo(2, 0); ctx.lineTo(12, 10); ctx.stroke();
        ctx.strokeStyle = '#9C6B3C'; ctx.lineWidth = 4.5; ctx.stroke();
        ctx.strokeStyle = '#C4925C'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-12, -1); ctx.lineTo(1, -1); ctx.stroke();
        const pull = w.cd > 0.3 ? 0 : 6;
        ctx.strokeStyle = '#D84315'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(12, -10); ctx.lineTo(4 - pull, 0); ctx.lineTo(12, 10); ctx.stroke();
        this.roundRect(1 - pull, -3, 6, 6, 2, '#6D4C41', OUT, 1);
        this.circle(4 - pull, 0, 2.2, '#9E9E9E');
        this.gem(-15, 0, 2.5, w.tier);
        break;
      }
      case W.PISTOLA: {
        ctx.fillStyle = '#3A3F47'; ctx.strokeStyle = OUT; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(1, 2); ctx.lineTo(-1, 15); ctx.lineTo(-9, 14); ctx.closePath(); ctx.fill(); ctx.stroke(); // cabo
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-6, 5 + i * 3); ctx.lineTo(0, 5 + i * 3); ctx.stroke(); }
        ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(4, 4, 4, 0, Math.PI); ctx.stroke(); // guarda-mato
        ctx.fillStyle = this.metal(0, -7, 0, 2, '#9AA4B0', '#4A525C');
        this.roundRect(-8, -7, 30, 9, 2, ctx.fillStyle, OUT, 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
        for (let i = -6; i < 0; i += 2) { ctx.beginPath(); ctx.moveTo(i, -6); ctx.lineTo(i, -1); ctx.stroke(); }
        this.roundRect(18, -5, 6, 5, 1, '#2A2E34', OUT, 1.5);
        ctx.fillStyle = OUT; ctx.fillRect(16, -9, 3, 2);
        this.gem(-3, 7, 2.5, w.tier);
        break;
      }
      case W.SEMENTEIRA: { // metralhadora de sementes (canos girando)
        this.roundRect(-14, -8, 20, 16, 4, '#5E7A2E', OUT, 2);
        this.circle(-6, 8, 7, '#6B4A2B'); ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke(); // tambor
        this.circle(-6, 8, 3, '#A07850');
        const spin = w.cd < 0.15 ? t * 40 : t * 4;
        for (let i = 0; i < 3; i++) {
          const yy = Math.sin(spin + i * 2.09) * 4.5, bright = Math.cos(spin + i * 2.09);
          this.roundRect(6, yy - 1.8, 22, 3.6, 1.5, bright > 0 ? '#9AA4AE' : '#5A6470', OUT, 1);
        }
        this.roundRect(26, -6, 4, 12, 1, '#3A3F47', OUT, 1.5);
        this.roundRect(-4, -12, 8, 5, 2, '#3A3F47', OUT, 1.5);
        this.gem(-10, -1, 2.5, w.tier);
        break;
      }
      case W.ESCOPETA: {
        ctx.fillStyle = '#6B4A33'; ctx.strokeStyle = OUT; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-20, -3); ctx.lineTo(-6, -4); ctx.lineTo(-6, 5); ctx.quadraticCurveTo(-14, 7, -22, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#8B6247'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-18, 1); ctx.lineTo(-8, 0); ctx.stroke();
        ctx.fillStyle = this.metal(0, -5, 0, 5, '#7A828C', '#2E3238');
        this.roundRect(-7, -5, 34, 4.6, 1.5, ctx.fillStyle, OUT, 1.5);
        this.roundRect(-7, 0, 34, 4.6, 1.5, ctx.fillStyle, OUT, 1.5);
        this.roundRect(4, 4, 12, 5, 2, '#8B6247', OUT, 1.5); // pump
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
        for (let i = 6; i < 16; i += 3) { ctx.beginPath(); ctx.moveTo(i, 4.5); ctx.lineTo(i, 8.5); ctx.stroke(); }
        this.gem(-12, 3, 2.5, w.tier);
        break;
      }
      case W.CAJADO: { // cajado de fogo com orbe flamejante
        this.staff('#6B4423', '#8B5A2B');
        ctx.strokeStyle = '#C9A93A'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(12, -2); ctx.quadraticCurveTo(16, -10, 22, -8); ctx.moveTo(12, 2); ctx.quadraticCurveTo(16, 10, 22, 8); ctx.stroke();
        const r = 7 + Math.sin(t * 10) * 1;
        const g = ctx.createRadialGradient(22, 0, 1, 22, 0, r * 2);
        g.addColorStop(0, '#FFF8C0'); g.addColorStop(0.35, '#FF9100'); g.addColorStop(0.7, 'rgba(255,61,0,0.6)'); g.addColorStop(1, 'rgba(255,61,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(22, 0, r * 2, 0, Math.PI * 2); ctx.fill();
        this.gem(-14, 0, 2.5, w.tier);
        break;
      }
      case W.BAZUCA: {
        ctx.fillStyle = this.metal(0, -8, 0, 8, '#7E9F70', '#3E5A34');
        this.roundRect(-20, -7, 44, 14, 4, ctx.fillStyle, OUT, 2);
        for (const xx of [-12, 8]) this.roundRect(xx, -8, 4, 16, 1, '#2F4428', OUT, 1);
        ctx.fillStyle = '#2F4428'; ctx.strokeStyle = OUT; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-20, -7); ctx.lineTo(-27, -10); ctx.lineTo(-27, 10); ctx.lineTo(-20, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
        if (w.cd > 0.4) { // foguete aparecendo na boca
          ctx.fillStyle = '#D32F2F'; ctx.beginPath(); ctx.moveTo(24, -5); ctx.lineTo(31, 0); ctx.lineTo(24, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        this.roundRect(-4, -14, 10, 6, 2, '#3A3F47', OUT, 1.5); // mira
        this.circle(4, -11, 1.6, '#FF5252');
        this.roundRect(-6, 6, 6, 8, 2, '#3A3F47', OUT, 1.5);
        this.gem(-14, 0, 2.5, w.tier);
        break;
      }
      case W.RAIO: { // bastão elétrico com bobinas e faíscas
        this.roundRect(-16, -3, 30, 6, 2, '#4A525C', OUT, 2);
        for (let i = -10; i < 12; i += 5) this.roundRect(i, -5, 2.5, 10, 1, '#C77A2A', OUT, 1);
        const g = ctx.createRadialGradient(20, 0, 1, 20, 0, 13);
        g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.4, '#FFE14A'); g.addColorStop(1, 'rgba(255,225,74,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(20, 0, 13, 0, Math.PI * 2); ctx.fill();
        this.circle(20, 0, 5, '#FFF6B0');
        ctx.strokeStyle = '#FFF59D'; ctx.lineWidth = 1.5;
        for (let k = 0; k < 2; k++) {
          const a = Math.random() * Math.PI * 2;
          ctx.beginPath(); ctx.moveTo(20, 0);
          for (let s = 1; s <= 3; s++) ctx.lineTo(20 + Math.cos(a) * s * 5 + (Math.random() - 0.5) * 5, Math.sin(a) * s * 5 + (Math.random() - 0.5) * 5);
          ctx.stroke();
        }
        this.gem(-17, 0, 2.5, w.tier);
        break;
      }
      case W.MARTELO: {
        this.roundRect(-18, -3.5, 32, 7, 2, '#6B4423', OUT, 2);
        ctx.strokeStyle = '#2A1808'; ctx.lineWidth = 1;
        for (let i = -16; i < -6; i += 3) { ctx.beginPath(); ctx.moveTo(i, -3); ctx.lineTo(i + 2, 3); ctx.stroke(); }
        ctx.fillStyle = this.metal(10, -16, 10, 16, '#C9D1DB', '#5E6670');
        this.roundRect(10, -16, 20, 32, 4, ctx.fillStyle, OUT, 2.5);
        this.roundRect(8, -16, 4, 32, 1, '#3B4048', OUT, 1);
        this.roundRect(28, -16, 4, 32, 1, '#3B4048', OUT, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(14, -13, 3, 26);
        this.gem(20, 0, 3, w.tier);
        break;
      }
      case W.ARCO: {
        const drawn = w.cd < 0.35 ? 6 : 0;
        ctx.strokeStyle = OUT; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(-2, -22); ctx.quadraticCurveTo(16, 0, -2, 22); ctx.stroke();
        ctx.strokeStyle = '#B5793A'; ctx.lineWidth = 4.5; ctx.stroke();
        ctx.strokeStyle = '#E0A866'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(0, -19); ctx.quadraticCurveTo(13, 0, 0, 19); ctx.stroke();
        this.roundRect(4, -4, 5, 8, 2, '#4E2E14', OUT, 1);
        ctx.strokeStyle = '#EEEEEE'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(-2, -22); ctx.lineTo(-6 - drawn, 0); ctx.lineTo(-2, 22); ctx.stroke();
        // flecha
        ctx.strokeStyle = '#8B5A2B'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-6 - drawn, 0); ctx.lineTo(24 - drawn, 0); ctx.stroke();
        ctx.fillStyle = '#B0BEC5'; ctx.beginPath(); ctx.moveTo(24 - drawn, -4); ctx.lineTo(31 - drawn, 0); ctx.lineTo(24 - drawn, 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = TIER_COLOR[w.tier];
        ctx.beginPath(); ctx.moveTo(-6 - drawn, 0); ctx.lineTo(-11 - drawn, -4); ctx.lineTo(-2 - drawn, 0); ctx.lineTo(-11 - drawn, 4); ctx.closePath(); ctx.fill();
        break;
      }
      case W.GELO: { // varinha com cristal de gelo
        this.roundRect(-16, -2.5, 26, 5, 2, '#B0BEC5', OUT, 1.5);
        ctx.strokeStyle = '#78909C'; ctx.lineWidth = 1;
        for (let i = -14; i < 8; i += 4) { ctx.beginPath(); ctx.moveTo(i, -2.5); ctx.lineTo(i + 2, 2.5); ctx.stroke(); }
        const g = ctx.createRadialGradient(20, 0, 1, 20, 0, 16);
        g.addColorStop(0, 'rgba(200,245,255,0.7)'); g.addColorStop(1, 'rgba(143,227,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(20, 0, 16, 0, Math.PI * 2); ctx.fill();
        const shards = [[18, 0, 12, 4], [14, -5, 7, 3], [14, 5, 7, 3]];
        ctx.strokeStyle = '#1A5A7A'; ctx.lineWidth = 1.2;
        for (const [sx, sy, len, wd] of shards) {
          const a = Math.atan2(sy, 8);
          ctx.save(); ctx.translate(sx - 6, sy * 0.5); ctx.rotate(a);
          ctx.fillStyle = this.metal(0, -wd, 0, wd, '#E1F8FF', '#6CCFF0');
          ctx.beginPath(); ctx.moveTo(0, -wd); ctx.lineTo(len, 0); ctx.lineTo(0, wd); ctx.lineTo(-3, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.restore();
        }
        if (Math.sin(t * 5) > 0.6) this.sparkle(26, -8, 4, '#FFFFFF');
        this.gem(-17, 0, 2.5, w.tier);
        break;
      }
      case W_LASER: { // canhão laser do Cyborg
        const h = heat || 0;
        this.roundRect(-18, -9, 30, 18, 5, this.metal(0, -9, 0, 9, '#E8EDF2', '#8C96A3'), OUT, 2);
        this.roundRect(10, -6, 20, 12, 3, this.metal(0, -6, 0, 6, '#B8C2CC', '#4A525C'), OUT, 2);
        for (const xx of [14, 20, 26]) this.roundRect(xx, -7, 2.5, 14, 1, '#2A2E34', null, 0);
        // núcleo de energia
        const core = `rgba(255,${Math.round(60 + 140 * (1 - h))},${Math.round(80 * (1 - h))},`;
        const g = ctx.createRadialGradient(-4, 0, 1, -4, 0, 12);
        g.addColorStop(0, core + '1)'); g.addColorStop(1, core + '0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(-4, 0, 12, 0, Math.PI * 2); ctx.fill();
        this.circle(-4, 0, 4, '#FFFFFF');
        // aletas de ventilação que esquentam
        for (let i = 0; i < 3; i++) {
          const c = h > 0.6 ? `rgba(255,${Math.round(200 - h * 160)},40,${0.4 + h * 0.6})` : '#5A6270';
          this.roundRect(-16 + i * 5, -13, 3, 5, 1, c, null, 0);
        }
        this.circle(30, 0, 3.5, h >= 1 ? '#555' : '#FF5A70');
        break;
      }
      default:
        this.roundRect(-12, -8, 36, 15, 4, d.color, OUT, 3);
        this.circle(-4, 0, 3.5, TIER_COLOR[w.tier]);
    }
    ctx.restore();
  },

  /** Cajado de madeira torcida (usado pelos cajados). */
  staff(dark, light) {
    const ctx = this.ctx;
    ctx.strokeStyle = '#1A1A1A'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(13, 0); ctx.stroke();
    ctx.strokeStyle = dark; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = light; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = -17; x <= 12; x += 1) ctx.lineTo(x, Math.sin(x * 0.6) * 1.8);
    ctx.stroke();
  },

  // ------------------------------------------------------------------
  // Projéteis
  // ------------------------------------------------------------------

  drawBullet(b) {
    const ctx = this.ctx, d = b.wd;
    const ang = Math.atan2(b.vy, b.vx);
    if (b.minion) {
      const g = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, 10);
      g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.4, '#7C8CFF'); g.addColorStop(1, 'rgba(90,107,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, 10, 0, Math.PI * 2); ctx.fill();
      return;
    }
    if (b.lightning) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#FFE14A'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3; ctx.stroke();
      return;
    }
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(ang);
    switch (d) {
      case W.ARCO:
        ctx.strokeStyle = '#8B5A2B'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(6, 0); ctx.stroke();
        ctx.fillStyle = '#CFD8DC'; ctx.beginPath(); ctx.moveTo(6, -4); ctx.lineTo(13, 0); ctx.lineTo(6, 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#E53935'; ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-23, -4); ctx.lineTo(-14, 0); ctx.lineTo(-23, 4); ctx.closePath(); ctx.fill();
        break;
      case W.BAZUCA: {
        const fl = 8 + Math.random() * 8;
        const g = ctx.createLinearGradient(-8 - fl, 0, -8, 0);
        g.addColorStop(0, 'rgba(255,61,0,0)'); g.addColorStop(1, '#FFD54F');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-8 - fl, 0); ctx.lineTo(-8, 4); ctx.closePath(); ctx.fill();
        this.roundRect(-9, -4.5, 16, 9, 3, '#5E7A4E', '#1A1A1A', 1.5);
        ctx.fillStyle = '#D32F2F'; ctx.beginPath(); ctx.moveTo(7, -4.5); ctx.lineTo(13, 0); ctx.lineTo(7, 4.5); ctx.closePath(); ctx.fill();
        break;
      }
      case W.SEMENTEIRA:
        ctx.fillStyle = '#7A5230'; ctx.beginPath(); ctx.ellipse(0, 0, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#C49A6C'; ctx.beginPath(); ctx.ellipse(1.5, -1, 2.5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
        break;
      case W.PISTOLA:
        ctx.fillStyle = 'rgba(255,240,180,0.45)'; ctx.fillRect(-16, -1.5, 14, 3);
        this.roundRect(-4, -3, 10, 6, 3, '#FFD54F', '#7A5A00', 1.2);
        break;
      case W.ESTILINGUE:
        this.circle(0, 0, 6, '#8D8D8D'); this.circle(-2, -2, 2, '#C8C8C8');
        break;
      case W.ESCOPETA:
        this.circle(0, 0, 4.5, '#3A3A3A'); this.circle(-1, -1, 1.5, '#9E9E9E');
        break;
      case W.CAJADO: {
        const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 16);
        g.addColorStop(0, '#FFF8C0'); g.addColorStop(0.4, '#FF9100'); g.addColorStop(1, 'rgba(255,61,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(-4, 0, 16, 10, 0, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case W.GELO:
        ctx.fillStyle = 'rgba(128,216,255,0.35)'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#E6FAFF'; ctx.strokeStyle = '#4FA8D0'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(0, -5); ctx.lineTo(11, 0); ctx.lineTo(0, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      default:
        this.circle(0, 0, b.radius + 2, '#1A1A1A');
        this.circle(0, 0, b.radius, b.explosion > 0 ? '#FF7A2A' : '#FFF3C4');
    }
    ctx.restore();
  },

  // ------------------------------------------------------------------
  // Mapas
  // ------------------------------------------------------------------

  /** Chão do Inferno: pedra escura, rachaduras de lava, ossos. */
  buildInfernoArena() {
    const c = document.createElement('canvas');
    c.width = WORLD_W; c.height = WORLD_H;
    const g = c.getContext('2d');
    const tile = 100;
    for (let ty = 0; ty < WORLD_H; ty += tile) {
      for (let tx = 0; tx < WORLD_W; tx += tile) {
        g.fillStyle = ((tx + ty) / tile) % 2 === 0 ? '#3A1410' : '#331210';
        g.fillRect(tx, ty, tile, tile);
      }
    }
    const r = makeRng(666);
    // rachaduras de lava
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 0; i < 38; i++) {
      let x = r.float() * WORLD_W, y = r.float() * WORLD_H;
      const pts = [[x, y]];
      let a = r.float() * Math.PI * 2;
      for (let k = 0; k < 6; k++) { a += (r.float() - 0.5) * 1.4; x += Math.cos(a) * 30; y += Math.sin(a) * 30; pts.push([x, y]); }
      for (const [lw, col] of [[12, 'rgba(255,80,0,0.18)'], [6, '#B71C00'], [2.5, '#FFB300']]) {
        g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
        pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py)));
        g.stroke();
      }
    }
    // poças de lava
    for (let i = 0; i < 9; i++) {
      const x = 100 + r.float() * (WORLD_W - 200), y = 100 + r.float() * (WORLD_H - 200), rad = 18 + r.float() * 26;
      const lg = g.createRadialGradient(x, y, 2, x, y, rad * 1.6);
      lg.addColorStop(0, '#FFE082'); lg.addColorStop(0.4, '#FF6F00'); lg.addColorStop(0.75, '#B71C00'); lg.addColorStop(1, 'rgba(60,10,5,0)');
      g.fillStyle = lg; g.beginPath(); g.ellipse(x, y, rad * 1.6, rad, 0, 0, Math.PI * 2); g.fill();
    }
    // pedras e ossos
    for (let i = 0; i < 140; i++) {
      const x = r.float() * WORLD_W, y = r.float() * WORLD_H, k = r.int(10);
      if (k < 6) {
        g.fillStyle = k < 3 ? '#1E0B08' : '#4A1E16';
        g.beginPath(); g.arc(x, y, 3 + r.float() * 5, 0, Math.PI * 2); g.fill();
      } else if (k < 9) {
        g.strokeStyle = '#D7CCC8'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(x - 7, y); g.lineTo(x + 7, y); g.stroke();
        for (const d of [-1, 1]) { g.fillStyle = '#D7CCC8'; g.beginPath(); g.arc(x + d * 8, y - 2, 2.6, 0, Math.PI * 2); g.arc(x + d * 8, y + 2, 2.6, 0, Math.PI * 2); g.fill(); }
      } else {
        g.font = '22px ' + EMOJI_FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.globalAlpha = 0.75; g.fillText('💀', x, y); g.globalAlpha = 1;
      }
    }
    return c;
  },

  /** Faíscas subindo (Inferno). */
  drawEmbers(camX, camY) {
    const ctx = this.ctx, t = this.time;
    for (let i = 0; i < 40; i++) {
      const sx = (i * 137.5) % this.vw, speed = 30 + (i * 17) % 40;
      const y = VH - ((t * speed + i * 53) % (VH + 40));
      const x = sx + Math.sin(t * 1.5 + i) * 18;
      const a = 0.35 + 0.35 * Math.sin(t * 4 + i);
      this.circle(x, y, 1.5 + (i % 3), `rgba(255,${120 + (i * 13) % 100},40,${a})`);
    }
    void camX; void camY;
  },
};

if (typeof Ui !== 'undefined') Object.assign(Ui.prototype, Art);
