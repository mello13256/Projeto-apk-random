// Liga tudo: canvas, laço do jogo, mouse/teclado/toque e instalação (PWA).
'use strict';

(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const prefs = new Prefs();
  // App Android: na primeira vez, traz os recordes do app antigo (versão em Java)
  if (IS_APP && !prefs.data.migrated) {
    try {
      const old = window.HortaAndroid.legacy();
      if (old) {
        const d = JSON.parse(old);
        Object.assign(prefs.data, mergeProgress(prefs.data, d));
        if (d.playerName && !prefs.data.playerName) prefs.data.playerName = d.playerName;
        if (typeof d.sound === 'boolean') prefs.data.sound = d.sound;
        if (typeof d.music === 'boolean') prefs.data.music = d.music;
      }
    } catch (e) { /* sem dados antigos */ }
    prefs.data.migrated = true;
    prefs.save();
  }
  const sfx = new Sfx();
  sfx.enabled = prefs.data.sound;
  sfx.musicOn = prefs.data.music;
  const game = new Game();
  const ui = new Ui(game, prefs, sfx);
  const mp = new Multiplayer(game, ui);
  ui.mp = mp;
  ui.account = new Account(prefs);
  window.hortaHostil = { game, ui, mp, prefs }; // útil para depurar no console

  game.fx = {
    sound: (id) => sfx.play(id),
    vibrate: (ms) => {
      if (IS_APP && window.HortaAndroid.vibrate) window.HortaAndroid.vibrate(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
    },
    runEnded: (won, wave) => ui.runEnded(won, wave),
  };

  // --- Celular ou computador? ---
  // Começa pelo tipo de tela; depois segue o que o jogador usar de verdade.
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const touchCapable = coarse || navigator.maxTouchPoints > 0;
  ui.touch = coarse;
  const setTouch = (on) => { ui.touch = on; };

  // --- Tamanho da tela (nítido em telas de alta densidade) ---
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, IS_APP ? 1.5 : 2);
    canvas.width = Math.round((canvas.clientWidth || window.innerWidth) * dpr);
    canvas.height = Math.round((canvas.clientHeight || window.innerHeight) * dpr);
    // Celular em pé: desenha o jogo girado, assim dá pra jogar segurando deitado
    // mesmo com a rotação automática desligada.
    const rotate = touchCapable && canvas.height > canvas.width * 1.1;
    ui.setSize(canvas.width, canvas.height, rotate);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 150));
  resize();

  // --- Mouse e toque (Pointer Events cobrem os dois) ---
  const toVirtual = (e) => {
    const r = canvas.getBoundingClientRect();
    return ui.toVirtual((e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height);
  };
  const pid = (e) => (e.pointerType === 'mouse' ? 'mouse' : e.pointerId);
  canvas.addEventListener('pointerdown', (e) => {
    sfx.unlock();
    setTouch(e.pointerType !== 'mouse');
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = toVirtual(e);
    ui.onMove(pid(e), x, y);
    ui.onDown(pid(e), x, y);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) setTouch(false);
    const [x, y] = toVirtual(e);
    ui.onMove(pid(e), x, y);
  });
  const up = (e) => { const [x, y] = toVirtual(e); ui.onUp(pid(e), x, y); };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', () => ui.releaseAll());
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { ui.mouseX = ui.mouseY = -1; } });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // --- Teclado ---
  const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
  window.addEventListener('keydown', (e) => {
    const box = document.getElementById('nameBox');
    if (box && !box.hidden) return; // digitando num formulário (nome, senha, relatório...)
    sfx.unlock();
    setTouch(false);
    if (GAME_KEYS.includes(e.code)) e.preventDefault();
    if (e.code === 'KeyF' && !e.repeat) { toggleFullscreen(); return; }
    ui.keys.add(e.code);
    if (!e.repeat) ui.onKey(e.code);
  });
  window.addEventListener('keyup', (e) => ui.keys.delete(e.code));

  // Pausa sozinho se a janela perder o foco (no multiplayer não dá pra pausar)
  const autoPause = () => {
    ui.releaseAll();
    if (game.state === 'PLAYING' && !game.coop) game.paused = true;
    ui.saveIfPossible();
  };
  window.addEventListener('blur', autoPause);
  window.addEventListener('pagehide', (e) => {
    ui.saveIfPossible();
    if (!e.persisted) mp.leave(null, true); // fechou a aba: sai da sala
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      autoPause();
      if (sfx.ctx) sfx.ctx.suspend();
    } else if (sfx.ctx) {
      sfx.ctx.resume();
    }
  });

  // --- Laço principal: lógica a 60 passos/s, desenho a cada quadro ---
  const STEP = 1 / 60;
  let lastStep = performance.now(), lastDraw = lastStep, acc = 0;
  /** Avança a lógica até "agora" (pode ser chamado pelo desenho ou pelo relógio de reserva). */
  function advance(now) {
    const dt = Math.min(0.25, Math.max(0, now - lastStep) / 1000);
    lastStep = now;
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 15) {
      const [jx, jy] = ui.menuOpen() ? [0, 0] : ui.moveVector();
      game.input = ui.aimInput();
      if (mp.guestDriven()) mp.guestStep(STEP, jx, jy); // convidado: a arena vem do anfitrião
      else game.update(STEP, jx, jy);
      acc -= STEP;
      steps++;
    }
    if (steps === 15) acc = 0;
    mp.tick(dt);
  }
  function frame(now) {
    now = performance.now();
    advance(now);
    const dt = Math.min(0.1, (now - lastDraw) / 1000);
    lastDraw = now;
    const hovering = ui.draw(ctx, dt);
    canvas.style.cursor = hovering ? 'pointer' : 'default';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Relógio de reserva para o multiplayer: com a janela escondida ou minimizada, o navegador
  // para de desenhar (e o jogo do dono da sala congelaria para todos). Um "worker" continua
  // batendo e a partida segue rodando.
  try {
    const src = 'setInterval(function () { postMessage(0); }, 20);';
    const ticker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    ticker.onmessage = () => {
      const now = performance.now();
      if (mp.active && now - lastStep > 30) advance(now);
    };
  } catch (e) { /* sem worker: só o laço normal */ }

  // --- Botão "voltar" do Android: true = o jogo cuidou; false = pode fechar o app ---
  window.hortaBack = () => {
    const box = document.getElementById('nameBox');
    if (box && !box.hidden) { document.getElementById('nameCancel').click(); return true; }
    if (ui.showHelp) { ui.showHelp = false; return true; }
    if (ui.popupWeapon >= 0) { ui.popupWeapon = -1; return true; }
    const st = game.state;
    if (st === 'MENU') return false;
    if (st === 'PLAYING') { ui.doAction(ui.menuOpen() ? 'RESUME' : 'PAUSE'); return true; }
    if (st === 'LOBBY') { ui.doAction('LOBBY_LEAVE'); return true; }
    if (['CHAR_SELECT', 'RANKING', 'MP_MENU', 'ACCOUNT', 'POLLS', 'GAME_OVER', 'VICTORY'].includes(st) && !game.coop) { ui.doAction('MENU'); return true; }
    return true; // loja, melhorias, caixas, fim do multiplayer: não sai sem querer
  };

  // --- Link de convite (?sala=CODIGO) ou atalho para o multiplayer (#mp, usado pelo app Android) ---
  const params = new URLSearchParams(location.search);
  const room = (params.get('sala') || '').toUpperCase();
  if (validCode(room) || location.hash === '#mp') {
    game.state = 'MP_MENU';
    if (validCode(room)) setTimeout(() => ui.mpJoin(room), 300);
    if (params.has('sala')) history.replaceState(null, '', location.pathname + (params.get('db') ? '?db=' + encodeURIComponent(params.get('db')) : ''));
  }

  // --- PWA: funciona offline depois da primeira visita ---
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
