'use strict';
// ---------------------------------------------------------------------------
// Versão 5.0: modo 3D (mira manual + parry), habilidades ativas, insetos com
// estratégias novas, efeitos especiais novos dos itens e o modo Ascensão.
// Tudo aqui entra no Game/Player já existentes (Object.assign nos protótipos).
// ---------------------------------------------------------------------------

const PARRY_WINDOW = 0.22;   // segundos em que o parry está "levantado"
const PARRY_COOLDOWN = 0.9;  // espera depois de um parry que não pegou nada (pegou = recarrega na hora)

Object.assign(Player.prototype, {
  /** Multiplicador de velocidade dos efeitos da 5.0 (teia, casca, rolar, patins). */
  speed5() {
    let m = 1;
    if (this.webT > 0) m *= 0.55;
    if (this.wallT > 0) m *= 0.6;
    if (this.rollT > 0) m *= 1.8;
    if (this.ksT > 0) m *= 1 + Math.min(SP_CAP_KILLSPEED, this.specials[SP_KILLSPEED]) / 100;
    return m;
  },
  /** Recarga da habilidade ativa já com a Ampulheta & cia. */
  activeCooldown() {
    const a = this.character.active;
    return a ? a.cd * (1 - Math.min(SP_CAP_HASTE, this.specials[SP_HASTE]) / 100) : 0;
  },
  /** Zera os efeitos temporários (começo de onda / duelo). */
  reset5() {
    this.activeCd = 0; this.parryT = 0; this.parryCd = 0; this.parryFx = 0;
    this.smokeT = 0; this.popT = 0; this.wallT = 0; this.odT = 0; this.swarmT = 0; this.rollT = 0;
    this.fusionT = 0; this.webT = 0; this.ksT = 0;
  },
});

Object.assign(Game.prototype, {
  // --- Dificuldade (Ascensão cresce a cada onda) ---
  diffHp() { return this.difficulty === DIFF_ASCENT && this.pvp !== 'prep' ? ascent(this.wave).hp : DIFF_HP[this.difficulty]; },
  diffDmg() { return this.difficulty === DIFF_ASCENT && this.pvp !== 'prep' ? ascent(this.wave).dmg : DIFF_DMG[this.difficulty]; },
  diffSpawn() { return this.difficulty === DIFF_ASCENT && this.pvp !== 'prep' ? ascent(this.wave).spawn : DIFF_SPAWN[this.difficulty]; },
  diffElites() { return this.difficulty === DIFF_ASCENT && this.pvp !== 'prep' ? ascent(this.wave).elites : 0; },

  /** Quantos desse inseto estão vivos ou nascendo (para o limite do Fungo e da General). */
  aliveOf(d) {
    let n = 0;
    for (const e of this.enemies) if (!e.dead && e.def === d) n++;
    for (const t of this.telegraphs) if (t.def === d) n++;
    return n;
  },

  /** Ponto onde a habilidade cai: na mira (3D) ou no inseto mais perto (2D). */
  aimPoint(p, dist) {
    if (!this.manual) {
      const t = this.nearestFoe(p, p.x, p.y, dist + 200, null);
      if (t) return [t.x, t.y];
      const l = Math.hypot(p.lookX, p.lookY) || 1;
      return [clamp(p.x + p.lookX / l * dist, 30, WORLD_W - 30), clamp(p.y + p.lookY / l * dist, 30, WORLD_H - 30)];
    }
    return [clamp(p.x + Math.cos(p.aimAng) * dist, 30, WORLD_W - 30), clamp(p.y + Math.sin(p.aimAng) * dist, 30, WORLD_H - 30)];
  },

  /** Lê os botões novos do jogador deste aparelho (habilidade e parry). */
  readInput5(me) {
    if (this.input.skill) { this.input.skill = false; this.useActive(me); }
    if (this.input.parry) { this.input.parry = false; this.tryParry(me); }
  },

  // --- Timers da 5.0 (chamado a cada quadro durante a onda) ---
  update5(dt) {
    for (const p of this.players) {
      if (p.activeCd > 0) p.activeCd -= dt;
      if (p.parryT > 0) p.parryT -= dt;
      if (p.parryCd > 0) p.parryCd -= dt;
      if (p.parryFx > 0) p.parryFx -= dt;
      for (const k of ['smokeT', 'popT', 'wallT', 'odT', 'swarmT', 'rollT', 'fusionT', 'webT', 'ksT']) if (p[k] > 0) p[k] -= dt;
      if (p.odT > 0) { p.laser.heat = 0; p.laser.over = false; }
    }
    this.updateZones(dt);
    for (const m of this.marks) m.t -= dt;
    this.marks = this.marks.filter((m) => m.t > 0);
    if (this.tipT > 0) this.tipT -= dt;
  },

  // --- Parry (só no 3D) ---
  tryParry(p) {
    if (!this.mode3d || !p || !p.alive || p.parryCd > 0 || this.state !== 'PLAYING' || this.ending) return;
    p.parryT = PARRY_WINDOW * (1 + Math.min(SP_CAP_PARRY, p.specials[SP_PARRY]) / 100);
    p.parryCd = PARRY_COOLDOWN;
    this.snd('SHOOT', p);
  },
  /** O golpe bateu no parry? Então não machuca, atordoa quem bateu e conta ponto. */
  parried(p, source) {
    if (!this.mode3d || !(p.parryT > 0)) return false;
    p.parryCd = 0; p.parryT = Math.max(p.parryT, 0.12); p.parryFx = 0.35;
    p.iframes = Math.max(p.iframes, 0.25);
    this.runStats.parries = (this.runStats.parries || 0) + 1;
    this.addText(p.x, p.y - 50, 'PARRY!', '#7AE8FF', 30);
    this.ring(p.x, p.y, 60);
    this.snd('HIT', p);
    this.vib(25, p);
    if (source && !source.dead && source.def && !(source instanceof Player)) {
      const dx = source.x - p.x, dy = source.y - p.y, d = Math.hypot(dx, dy) + 0.01;
      if (!source.def.boss) source.stun = Math.max(source.stun || 0, 1.3);
      const dmg = this.abilityDamage(p, 8, 2, 0) + Math.round(Math.max(0, p.stats[Stat.MELEE]) * 2 * p.damageMult());
      this.damageEnemy(source, dmg, true, dx / d, dy / d, 40, 0, '#7AE8FF', p.extraSrc, p);
    }
    return true;
  },
  /** Tiro inimigo no parry: volta como tiro nosso, bem mais forte, pra onde você mira. */
  reflectBullet(p, b) {
    b.dead = true;
    this.parried(p, null);
    const a = p.aimAng, sp = 720;
    const dmg = Math.max(1, Math.round(((b.damage || 3) * 3 + p.stats[Stat.RANGED] * 1.5 + this.wave * 1.5) * p.damageMult()));
    this.bullets.push({
      x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.1, damage: dmg, crit: true,
      pierce: 2, bounce: 0, explosion: 0, burn: 0, slow: 0, source: p.extraSrc, owner: p,
      knockback: 12, color: '#7AE8FF', lightning: false, mirror: true, radius: 9, dead: false, hit: [],
    });
  },

  // --- Habilidades ativas ---
  useActive(p) {
    const a = p && p.character.active;
    if (!a || !p.alive || p.activeCd > 0 || this.state !== 'PLAYING' || this.ending) return false;
    if (this.pvp === 'duel' && this.countdown > 0) return false;
    if (a.id === 'dash') {
      if (p.dashT > 0) return false;
      p.dashCd = 0; this.tryDash(p);
    }
    p.activeCd = p.activeCooldown();
    this.runStats.actives = (this.runStats.actives || 0) + 1;
    if (a.id !== 'dash') this.addText(p.x, p.y - 62, a.icon + ' ' + a.name, '#FFE14A', 24);
    const foes = this.foesOf(p);
    const near = (r, fn) => {
      for (const f of foes) {
        if (f.dead || f.under) continue;
        const rr = r + f.radius;
        if ((f.x - p.x) * (f.x - p.x) + (f.y - p.y) * (f.y - p.y) <= rr * rr) fn(f);
      }
    };
    switch (a.id) {
      case 'chips': { // 12 batatas fritas em volta
        const dmg = this.abilityDamage(p, 8, 1.6, 0) + Math.round(Math.max(0, p.stats[Stat.RANGED]) * 1.5 * p.damageMult());
        for (let k = 0; k < 12; k++) {
          const ang = Math.PI * 2 * k / 12 + (p.aimAng || 0);
          this.bullets.push({
            x: p.x, y: p.y, vx: Math.cos(ang) * 620, vy: Math.sin(ang) * 620, life: 0.7, damage: dmg, crit: false,
            pierce: 2, bounce: 0, explosion: 0, burn: 0, slow: 0, source: p.extraSrc, owner: p,
            knockback: 8, color: '#FFD54A', lightning: false, radius: 8, dead: false, hit: [],
          });
        }
        break;
      }
      case 'slam':
        this.explodeAt(p.x, p.y, 180, this.abilityDamage(p, 14, 2.4, 0) + Math.round(Math.max(0, p.stats[Stat.MELEE]) * 2.5 * p.damageMult()), false, 60, 0, p.extraSrc, p);
        this.shakeAt(12, p);
        break;
      case 'smoke':
        p.smokeT = 3;
        this.burst(p.x, p.y, 30, '200,200,200', 200, 10, 0.9);
        break;
      case 'popcorn': p.popT = 4; break;
      case 'nova':
        this.explodeAt(p.x, p.y, 210, this.abilityDamage(p, 10, 1.8, 3), false, 30, this.abilityDamage(p, 3, 0.7, 1.5), p.extraSrc, p);
        this.burst(p.x, p.y, 30, '255,120,30', 320, 8, 0.6);
        break;
      case 'wall': p.wallT = 4; this.ring(p.x, p.y, 50); break;
      case 'spores': {
        const [x, y] = this.aimPoint(p, 260);
        this.zones.push({ kind: 'spore', x, y, r: 135, t: 4, tick: 0, owner: p, dmg: this.abilityDamage(p, 3, 0.8, 1.6) });
        break;
      }
      case 'overdrive': p.odT = 4; p.laser.heat = 0; p.laser.over = false; break;
      case 'feast': {
        let n = 0;
        const dmg = this.abilityDamage(p, 6, 1.3, 0);
        near(230, (f) => { n++; this.hitFoe(f, dmg, false, 0, 0, 0, 0, '#FF5A7A', p.extraSrc, p); });
        p.heal(Math.min(12, n));
        if (n) this.addText(p.x, p.y - 40, '+' + Math.min(12, n), '#6BFF7A', 24);
        this.ring(p.x, p.y, 230);
        break;
      }
      case 'megamine': {
        const [x, y] = this.aimPoint(p, 260);
        this.marks.push({ x, y, r: 160, t: 0.55, max: 0.55, bad: false });
        this.delayed.push({ t: 0.55, fn: () => {
          this.explodeAt(x, y, 160, this.abilityDamage(p, 26, 3.2, 3), false, 40, 0, p.extraSrc, p);
          this.burst(x, y, 28, '255,80,90', 300, 9, 0.6);
        } });
        break;
      }
      case 'swarm': p.swarmT = 8; break;
      case 'roll': p.rollT = 4; break;
      case 'bunch':
        for (let k = 0; k < 3; k++) {
          const ang = Math.PI * 2 * k / 3;
          this.decoys.push({ x: clamp(p.x + Math.cos(ang) * 90, 30, WORLD_W - 30), y: clamp(p.y + Math.sin(ang) * 90, 30, WORLD_H - 30), t: 4, owner: p, radius: 22 });
        }
        break;
      case 'exorcism': {
        const dmg = this.abilityDamage(p, 12, 2.2, 3);
        near(420, (f) => { if (!(f instanceof Player)) f.fear = 3; this.hitFoe(f, dmg, false, 0, 0, 30, 0, '#F0F4C3', p.extraSrc, p); });
        this.ring(p.x, p.y, 420);
        this.burst(p.x, p.y, 30, '230,230,200', 380, 8, 0.7);
        break;
      }
      case 'reroll': {
        const old = p.roulette >= 0 ? ROULETTE[p.roulette] : null;
        if (old && old.slowFoes) this.foeSlow /= old.slowFoes;
        p.roulette = this.rng.int(ROULETTE.length);
        const r = ROULETTE[p.roulette];
        if (r.slowFoes) this.foeSlow *= r.slowFoes;
        this.addText(p.x, p.y - 90, '🎲 ' + r.text, r.text.includes('azar') ? '#FF8A7A' : '#FFE14A', 24);
        break;
      }
      case 'singularity': {
        const [x, y] = this.aimPoint(p, 300);
        this.wells.push({ x, y, t: 1.6, owner: p, big: true });
        break;
      }
      case 'fusion': p.fusionT = 5; break;
    }
    return true;
  },

  // --- Nuvens e teias no chão ---
  updateZones(dt) {
    for (const z of this.zones) {
      z.t -= dt;
      z.tick -= dt;
      if (z.kind === 'web') {
        for (const p of this.players) {
          if (!p.alive) continue;
          const rr = z.r + p.radius * 0.5;
          if ((p.x - z.x) * (p.x - z.x) + (p.y - z.y) * (p.y - z.y) < rr * rr) p.webT = Math.max(p.webT || 0, 0.25);
        }
        continue;
      }
      if (z.tick > 0) continue;
      z.tick = z.kind === 'stink' ? 0.6 : 0.5;
      if (z.kind === 'spore') {
        const p = z.owner;
        for (const f of this.foesOf(p)) {
          if (f.dead || f.under) continue;
          const rr = z.r + f.radius;
          if ((f.x - z.x) * (f.x - z.x) + (f.y - z.y) * (f.y - z.y) > rr * rr) continue;
          if (!(f instanceof Player)) f.slowTime = Math.max(f.slowTime, 0.7);
          this.hitFoe(f, z.dmg, false, 0, 0, 0, 0, '#B388FF', p.extraSrc, p);
        }
      } else if (z.kind === 'stink') {
        for (const p of this.players) {
          if (!p.alive) continue;
          const rr = z.r + p.radius * 0.6;
          if ((p.x - z.x) * (p.x - z.x) + (p.y - z.y) * (p.y - z.y) < rr * rr) this.damagePlayer(p, z.dmg, null, 0.5);
        }
      }
    }
    this.zones = this.zones.filter((z) => z.t > 0);
    for (const d of this.delayed) { d.t -= dt; if (d.t <= 0 && !this.ending) d.fn(); }
    this.delayed = this.delayed.filter((d) => d.t > 0 && !this.ending);
  },

  // --- Efeitos dos itens novos quando acerta um inseto ---
  /** Chamado em damageEnemy antes de tirar a vida: devolve o dano já modificado. */
  hitMods5(e, dmg, crit, kx, ky, src, who) {
    if (who) {
      const el = Math.min(SP_CAP_ELITE, who.specials[SP_ELITE]);
      if (el > 0 && (e.elite || e.def.boss)) dmg *= 1 + el / 100;
    }
    // Besouro Escudeiro: o escudo da frente segura quase tudo
    if (e.def.ai === AI_SHIELDED && (kx || ky) && !(e.stun > 0)) {
      const fx = Math.cos(e.fa || 0), fy = Math.sin(e.fa || 0);
      if (kx * fx + ky * fy < -0.35) {
        dmg *= 0.15;
        if ((this.clock || 0) - (e.blockAt || -1) > 0.4) { e.blockAt = this.clock || 0; this.addText(e.x, e.y - e.radius - 18, '🛡️', '#90CAF9', 22); }
      }
    }
    return dmg;
  },
  /** Chamado em damageEnemy depois do golpe (o inseto ainda está vivo ou acabou de morrer). */
  afterHit5(e, dmg, crit, src, who) {
    if (!who || !src || !src.def) return; // só golpes de arma (evita choque em cadeia infinito)
    const ch = Math.min(SP_CAP_CHAIN, who.specials[SP_CHAIN]);
    if (ch > 0 && this.rng.int(100) < ch) {
      const n = this.nearestEnemy(e.x, e.y, 180, [e]);
      if (n) {
        this.damageEnemy(n, Math.max(1, Math.round(dmg * 0.5)), false, 0, 0, 0, 0, '#FFF59D', who.extraSrc, who);
        this.burst(n.x, n.y, 4, '255,242,122', 150, 3, 0.25);
      }
    }
    const st = Math.min(SP_CAP_STUN, who.specials[SP_STUN]);
    if (st > 0 && e.hp > 0 && !e.def.boss && !(e.stunCd > 0) && this.rng.int(100) < st) { e.stun = 0.9; e.stunCd = 2.5; }
    const ch2 = Math.min(SP_CAP_CRITHEAL, who.specials[SP_CRITHEAL]);
    if (crit && ch2 > 0 && who.alive && who.hp < who.maxHp() && this.rng.int(100) < ch2
      && (this.clock || 0) - (who.chAt === undefined ? -1 : who.chAt) >= 0.2) { who.chAt = this.clock || 0; who.heal(1); }
    if (who.fusionT > 0 && who.kind === 'elements' && e.hp > 0) { this.elementHit(who, e, dmg, 0); this.elementHit(who, e, dmg, 1); }
  },

  /** Inseto morreu: barata se divide, percevejo fede, patins aceleram. */
  onKill5(e, p) {
    if (e.def.split && this.enemies.length < this.enemyCap() + 20) {
      for (let k = 0; k < e.def.split; k++) {
        const a = this.rng.float() * Math.PI * 2;
        const c = this.spawnEnemy(E.BARATINHA, clamp(e.x + Math.cos(a) * 20, 20, WORLD_W - 20), clamp(e.y + Math.sin(a) * 20, 20, WORLD_H - 20));
        c.vx = Math.cos(a) * 160; c.vy = Math.sin(a) * 160;
      }
    }
    if (e.def.stink) {
      this.zones.push({ kind: 'stink', x: e.x, y: e.y, r: 75 * (e.elite ? 1.4 : 1), t: 3.5, tick: 0.4, dmg: Math.max(1, Math.round(e.damage * 0.35)) });
    }
    if (p && p.specials[SP_KILLSPEED] > 0) p.ksT = 2;
  },

  /** Primeira vez que um inseto novo aparece na partida: mostra a dica. */
  noteTip(d) {
    if (!d.tip || this.seenTips[d.name]) return;
    this.seenTips[d.name] = true;
    this.tip = d.icon + ' ' + d.tip; this.tipT = 5;
  },

  /** Insetos novos: devolve [mx, my, velocidade]. p = alvo, (nx, ny) = direção até ele, d = distância. */
  ai5(e, dt, p, d, nx, ny) {
    let mx = nx, my = ny, sp = e.speed * this.foeSlow;
    switch (e.def.ai) {
      case AI_DRAIN: // pica, rouba vida e foge
        if (e.aiState === 0) {
          if (d < e.radius + 26 + 12) { e.aiState = 1; e.aiTimer = 1.3; e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.35); this.burst(e.x, e.y, 5, '220,40,60', 100, 4, 0.3); }
        } else {
          mx = -nx; my = -ny; sp *= 1.15;
          e.aiTimer -= dt;
          if (e.aiTimer <= 0) e.aiState = 0;
        }
        break;
      case AI_BLINK: // some e aparece do seu lado
        e.aiTimer -= dt;
        if (e.aiState === 0) {
          if (e.aiTimer <= 0 && d > 160) { e.aiState = 1; e.aiTimer = 0.45; e.under = true; this.burst(e.x, e.y, 8, '120,120,160', 140, 5, 0.4); }
        } else if (e.aiState === 1) {
          mx = 0; my = 0;
          if (e.aiTimer <= 0) { // reaparece perto de você (ainda sem encostar por um instante)
            const a = this.rng.float() * Math.PI * 2;
            e.x = clamp(p.x + Math.cos(a) * 140, 30, WORLD_W - 30); e.y = clamp(p.y + Math.sin(a) * 140, 30, WORLD_H - 30);
            e.aiState = 2; e.aiTimer = 0.4;
            this.burst(e.x, e.y, 8, '120,120,160', 140, 5, 0.4);
          }
        } else {
          mx = 0; my = 0;
          if (e.aiTimer <= 0) { e.aiState = 0; e.aiTimer = 3.6 + this.rng.float(); e.under = false; }
        }
        break;
      case AI_LEAP: // marca o chão e pula onde você estava
        e.aiTimer -= dt;
        if (e.aiState === 0) {
          if (e.aiTimer <= 0 && d < 460) {
            e.aiState = 1; e.aiTimer = 0.6; e.lx = p.x; e.ly = p.y;
            this.marks.push({ x: p.x, y: p.y, r: 70, t: 1.15, max: 1.15, bad: true });
          }
        } else if (e.aiState === 1) {
          mx = 0; my = 0;
          if (e.aiTimer <= 0) { e.aiState = 2; e.aiTimer = 0.55; e.jx = e.x; e.jy = e.y; e.under = true; }
        } else {
          mx = 0; my = 0;
          const t = clamp(1 - e.aiTimer / 0.55, 0, 1);
          e.x = e.jx + (e.lx - e.jx) * t; e.y = e.jy + (e.ly - e.jy) * t;
          e.h = Math.sin(Math.PI * t) * 110;
          if (e.aiTimer <= 0) {
            e.aiState = 0; e.aiTimer = 3 + this.rng.float() * 1.2; e.under = false; e.h = 0;
            this.hurtAround(e, e.x, e.y, 70, e.damage);
            this.burst(e.x, e.y, 12, '139,107,74', 200, 6, 0.5);
          }
        }
        break;
      case AI_BURROW: // anda por baixo da terra e sai embaixo de você
        e.aiTimer -= dt;
        if (e.aiState === 0) {
          e.under = true;
          if (this.particles.length < 400 && this.rng.float() < dt * 10) this.burst(e.x, e.y, 1, '139,107,74', 50, 5, 0.4);
          if (d < 30 || e.aiTimer <= 0) {
            e.aiState = 1; e.aiTimer = 0.75;
            this.marks.push({ x: e.x, y: e.y, r: 70, t: 0.75, max: 0.75, bad: true });
          }
        } else if (e.aiState === 1) {
          mx = 0; my = 0;
          if (e.aiTimer <= 0) {
            e.aiState = 2; e.aiTimer = 2.4; e.under = false;
            this.hurtAround(e, e.x, e.y, 70, e.damage * 1.2);
            this.burst(e.x, e.y, 14, '139,107,74', 220, 6, 0.5);
          }
        } else {
          sp *= 0.25;
          if (e.aiTimer <= 0) { e.aiState = 0; e.aiTimer = 2.6; }
        }
        break;
      case AI_SHIELDED: { // vira o escudo devagar pra você
        const want = Math.atan2(ny, nx);
        if (e.fa === undefined) e.fa = want;
        if (!(e.stun > 0)) e.fa = lerpAngle(e.fa, want, Math.min(1, dt * 1.7));
        break;
      }
      case AI_HEALER: // fica longe e cura os amigos
        if (d < 300) { mx = -nx; my = -ny; } else if (d < 380) { mx = 0; my = 0; }
        e.aiTimer -= dt;
        if (e.aiTimer <= 0) {
          e.aiTimer = 2.5;
          let any = false;
          for (const o of this.enemies) {
            if (o.dead || o === e || o.hp >= o.maxHp) continue;
            if ((o.x - e.x) * (o.x - e.x) + (o.y - e.y) * (o.y - e.y) > 230 * 230) continue;
            o.hp = Math.min(o.maxHp, o.hp + o.maxHp * (o.def.boss ? 0.04 : 0.25));
            any = true;
          }
          if (any) { this.ring(e.x, e.y, 230); this.burst(e.x, e.y, 10, '120,255,140', 160, 5, 0.5); }
        }
        break;
      case AI_COMMANDER: // deixa os vizinhos mais rápidos e fortes e chama reforços
        for (const o of this.enemies) {
          if (o.dead || o === e) continue;
          if ((o.x - e.x) * (o.x - e.x) + (o.y - e.y) * (o.y - e.y) < 260 * 260) o.buffT = 0.3;
        }
        e.aiTimer -= dt;
        if (e.aiTimer <= 0) {
          e.aiTimer = 7;
          for (let k = 0; k < 3; k++) {
            const a = Math.PI * 2 * k / 3 + this.rng.float();
            this.telegraphs.push({ def: E.LAGARTA, x: clamp(e.x + Math.cos(a) * 90, 40, WORLD_W - 40), y: clamp(e.y + Math.sin(a) * 90, 40, WORLD_H - 40), time: 0.7 });
          }
        }
        break;
      case AI_WEB: // atira teia (deixa lento) e espalha teias no chão
        if (d > 380) { mx = nx; my = ny; } else if (d < 260) { mx = -nx * 0.8; my = -ny * 0.8; } else { mx = 0; my = 0; }
        e.aiTimer -= dt;
        if (e.aiTimer <= 0 && d < 560) {
          e.aiTimer = 2.8 + this.rng.float() * 0.6;
          const b = this.fireEnemyBullet(e.x, e.y, Math.atan2(ny, nx), 230, Math.max(1, Math.round(e.damage * 0.6)));
          b.web = true; b.radius = 12;
        }
        e.aiTimer2 -= dt;
        if (e.aiTimer2 <= 0) {
          e.aiTimer2 = 5;
          if (this.zones.filter((z) => z.kind === 'web').length < 10) this.zones.push({ kind: 'web', x: e.x, y: e.y, r: 70, t: 9, tick: 0 });
        }
        break;
      case AI_STRAFE: { // rodeia você atirando rajadas
        if (!e.dir) e.dir = this.rng.float() < 0.5 ? -1 : 1;
        const radial = d > 300 ? 1 : d < 220 ? -1 : 0;
        mx = -ny * e.dir + nx * radial * 0.7; my = nx * e.dir + ny * radial * 0.7;
        const l = Math.hypot(mx, my) + 0.0001; mx /= l; my /= l;
        e.aiTimer -= dt;
        if (e.aiTimer <= 0 && d < 560) {
          if (e.aiState < 3) {
            this.fireEnemyBullet(e.x, e.y, Math.atan2(ny, nx), 300, e.damage);
            e.aiState++; e.aiTimer = 0.14;
          } else { e.aiState = 0; e.aiTimer = 2.6 + this.rng.float() * 0.6; if (this.rng.float() < 0.3) e.dir = -e.dir; }
        }
        break;
      }
      case AI_KAMIKAZE: // corre até você e explode
        if (e.aiState === 0) {
          if (d < 75) {
            e.aiState = 1; e.aiTimer = 0.65;
            this.marks.push({ x: e.x, y: e.y, r: 100, t: 0.65, max: 0.65, bad: true });
          }
        } else {
          mx = 0; my = 0;
          e.flash = 0.05;
          e.aiTimer -= dt;
          if (e.aiTimer <= 0) {
            e.dead = true;
            this.hurtAround(e, e.x, e.y, 100, e.damage * 2);
            this.burst(e.x, e.y, 22, '255,140,40', 300, 8, 0.6);
            this.shakeAt(8);
            this.snd('KILL');
          }
        }
        break;
    }
    return [mx, my, sp];
  },

  /** Golpe de área de um inseto (pulo, saída da terra, explosão). */
  hurtAround(e, x, y, r, dmg) {
    for (const q of this.players) {
      if (!q.alive) continue;
      const rr = r + q.radius * 0.6;
      if ((q.x - x) * (q.x - x) + (q.y - y) * (q.y - y) < rr * rr) this.damagePlayer(q, Math.max(1, Math.round(dmg)), e);
    }
  },

  // --- Mira manual (3D): as armas atacam pra onde você mira, só enquanto segura ---
  manualWeapon(p, w, dt) {
    const ang = p.aimAng;
    w.angle = ang;
    w.tipX = w.x; w.tipY = w.y;
    if (!p.wantFire || w.cd > 0) return;
    w.cd = w.cooldown(p);
    if (w.def.type === MELEE) {
      const r = w.range(p);
      this.startMelee(w, { x: w.x + Math.cos(ang) * r, y: w.y + Math.sin(ang) * r }, ang);
    } else this.fireWeapon(w, ang);
  },
});

/** Sem mira automática (no 3D ninguém tem). */
Object.defineProperty(Game.prototype, 'manual', { get() { return this.mode3d; } });
