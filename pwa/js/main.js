// Liga tudo: canvas, laço do jogo, mouse/teclado/toque e instalação (PWA).
'use strict';

(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const prefs = new Prefs();
  const sfx = new Sfx();
  sfx.enabled = prefs.data.sound;
  const game = new Game();
  const ui = new Ui(game, prefs, sfx);
  window.hortaHostil = { game, ui }; // útil para depurar no console

  game.fx = {
    sound: (id) => sfx.play(id),
    vibrate: (ms) => { if (navigator.vibrate) navigator.vibrate(ms); },
    runEnded: (won, wave) => prefs.recordRun(won, wave),
  };

  // --- Tamanho da tela (nítido em telas de alta densidade) ---
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    ui.setSize(canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);
  resize();

  // --- Mouse e toque (Pointer Events cobrem os dois) ---
  const toVirtual = (e) => {
    const r = canvas.getBoundingClientRect();
    const k = canvas.height / r.height / ui.scale;
    return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
  };
  const pid = (e) => (e.pointerType === 'mouse' ? 'mouse' : e.pointerId);
  canvas.addEventListener('pointerdown', (e) => {
    sfx.unlock();
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = toVirtual(e);
    ui.onMove(pid(e), x, y);
    ui.onDown(pid(e), x, y);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => { const [x, y] = toVirtual(e); ui.onMove(pid(e), x, y); });
  const up = (e) => { const [x, y] = toVirtual(e); ui.onUp(pid(e), x, y); };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', () => ui.releaseAll());
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { ui.mouseX = ui.mouseY = -1; } });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // --- Teclado ---
  const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
  window.addEventListener('keydown', (e) => {
    sfx.unlock();
    if (GAME_KEYS.includes(e.code)) e.preventDefault();
    if (e.code === 'KeyF' && !e.repeat) { toggleFullscreen(); return; }
    ui.keys.add(e.code);
    if (!e.repeat) ui.onKey(e.code);
  });
  window.addEventListener('keyup', (e) => ui.keys.delete(e.code));

  // Pausa sozinho se a janela perder o foco
  const autoPause = () => {
    ui.releaseAll();
    if (game.state === 'PLAYING') game.paused = true;
  };
  window.addEventListener('blur', autoPause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });

  // --- Laço principal: lógica a 60 passos/s, desenho a cada quadro ---
  const STEP = 1 / 60;
  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      const [jx, jy] = ui.moveVector();
      game.update(STEP, jx, jy);
      acc -= STEP;
      steps++;
    }
    if (steps === 5) acc = 0;
    const hovering = ui.draw(ctx, dt);
    canvas.style.cursor = hovering ? 'pointer' : 'default';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // --- PWA: funciona offline depois da primeira visita ---
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
