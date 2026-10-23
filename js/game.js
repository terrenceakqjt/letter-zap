/* game.js — the falling-letters engine: spawning, physics, input, scoring. */

const Game = (() => {
  let gameAreaEl, cannonEl, hintEl;
  let hudCallbacks = {};
  let onStageEnd = () => {};

  let stage = null;
  let queue = [];
  let queueIndex = 0;
  let activeItems = [];
  let running = false;
  let paused = false;
  let rafId = null;
  let lastTs = null;
  let spawnAcc = 0;
  let elapsedMs = 0;

  let lives = 5;
  let livesInfinite = false;
  let stats = { correct: 0, attempts: 0, escapes: 0, zapped: 0, comboCurrent: 0, comboBest: 0 };
  let speedMultiplier = 1;

  const GROUND_Y_OFFSET = 110; // px from bottom where cannon can reach

  function init(opts) {
    gameAreaEl = opts.gameAreaEl;
    cannonEl = opts.cannonEl;
    hintEl = opts.hintEl;
    hudCallbacks = opts.hudCallbacks || {};
    onStageEnd = opts.onStageEnd || (() => {});
  }

  function areaHeight() { return gameAreaEl.clientHeight; }
  function areaWidth() { return gameAreaEl.clientWidth; }

  function weightedKeyPool(st) {
    const main = st.practiceKeys || [];
    const review = st.reviewKeys || [];
    let pool = [];
    main.forEach((k) => { pool.push(k, k, k); });
    review.forEach((k) => { pool.push(k); });
    if (pool.length === 0) pool = ['f', 'j'];
    return pool;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildQueue(st) {
    if (st.type === 'letters') {
      const total = st.minReps + 4;
      const pool = weightedKeyPool(st);
      const q = [];
      let prev = null;
      for (let i = 0; i < total; i++) {
        let pick;
        let tries = 0;
        do {
          pick = pool[Math.floor(Math.random() * pool.length)];
          tries++;
        } while (pick === prev && tries < 5 && pool.length > 1);
        q.push(pick);
        prev = pick;
      }
      return q;
    }
    if (st.type === 'words') {
      const total = Math.max(st.minReps, 10);
      const basePool = st.wordPool.length ? st.wordPool : ['cat'];
      const q = [];
      while (q.length < total) {
        q.push(...shuffle(basePool));
      }
      return q.slice(0, total);
    }
    return [];
  }

  function maxConcurrentFor(st) {
    if (st.type === 'words' || st.type === 'endless') return 2;
    return 4;
  }

  function baseSpeedFor(st, stageOrdinal) {
    // px per second; gentle start, ramps slowly across the whole game
    const base = st.type === 'words' ? 34 : 42;
    return base + Math.min(40, stageOrdinal * 1.6);
  }

  function spawnIntervalFor(st, progressCount) {
    const start = st.type === 'words' ? 2200 : 1500;
    const floor = st.type === 'words' ? 1100 : 650;
    return Math.max(floor, start - progressCount * 25);
  }

  function startStage(st, stageOrdinal) {
    stage = st;
    queue = buildQueue(st);
    queueIndex = 0;
    activeItems.forEach((it) => it.el.remove());
    activeItems = [];
    running = true;
    paused = false;
    lastTs = null;
    spawnAcc = 0;
    elapsedMs = 0;
    stats = { correct: 0, attempts: 0, escapes: 0, zapped: 0, comboCurrent: 0, comboBest: 0 };
    livesInfinite = st.type === 'endless';
    lives = livesInfinite ? Infinity : 5;
    stage._ordinal = stageOrdinal;
    updateHud();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  function pause() { paused = true; }
  function resume() { paused = false; lastTs = null; cancelAnimationFrame(rafId); rafId = requestAnimationFrame(loop); }

  function loop(ts) {
    if (!running) return;
    if (paused) { rafId = requestAnimationFrame(loop); return; }
    if (lastTs === null) lastTs = ts;
    const dt = Math.min(48, ts - lastTs); // clamp to avoid huge jumps on tab-switch
    lastTs = ts;
    elapsedMs += dt;

    tickSpawning(dt);
    tickPhysics(dt);

    rafId = requestAnimationFrame(loop);
  }

  function tickSpawning(dt) {
    const st = stage;
    const concurrentCap = maxConcurrentFor(st);
    if (st.type === 'endless') {
      spawnAcc += dt;
      const interval = Math.max(900, 2200 - elapsedMs / 400);
      if (spawnAcc >= interval && activeItems.length < concurrentCap) {
        spawnAcc = 0;
        const pool = st.wordPool.length ? st.wordPool : ['cat', 'dog', 'sun'];
        spawnItem(pool[Math.floor(Math.random() * pool.length)]);
      }
      return;
    }
    if (queueIndex >= queue.length) {
      if (activeItems.length === 0) finishStage();
      return;
    }
    spawnAcc += dt;
    const interval = spawnIntervalFor(st, queueIndex);
    if (spawnAcc >= interval && activeItems.length < concurrentCap) {
      spawnAcc = 0;
      spawnItem(queue[queueIndex]);
      queueIndex++;
    }
  }

  function spawnItem(text) {
    const isWord = text.length > 1;
    const el = document.createElement('div');
    el.className = 'falling-item' + (isWord ? ' word' : '');
    renderItemText(el, text, 0);
    const xPercent = 10 + Math.random() * 80;
    el.style.left = xPercent + '%';
    el.style.top = '-60px';
    gameAreaEl.appendChild(el);
    const speed = baseSpeedFor(stage, stage._ordinal || 0) * (0.9 + Math.random() * 0.25);
    activeItems.push({ text, typedIndex: 0, el, xPercent, y: -60, speed, danger: false });
  }

  function renderItemText(el, text, typedIndex) {
    const upper = text.toUpperCase();
    if (text.length === 1) {
      el.textContent = upper;
      return;
    }
    const typed = upper.slice(0, typedIndex);
    const rest = upper.slice(typedIndex);
    el.innerHTML = `<span class="typed">${typed}</span><span class="remaining">${rest}</span>`;
  }

  function tickPhysics(dt) {
    const groundY = areaHeight() - GROUND_Y_OFFSET;
    for (let i = activeItems.length - 1; i >= 0; i--) {
      const it = activeItems[i];
      it.y += (it.speed * speedMultiplier * dt) / 1000;
      it.el.style.top = it.y + 'px';
      const isDanger = it.y > groundY - 130;
      if (isDanger !== it.danger) {
        it.danger = isDanger;
        it.el.classList.toggle('danger', isDanger);
      }
      if (it.y >= groundY) {
        handleEscape(it);
        activeItems.splice(i, 1);
      }
    }
  }

  function handleEscape(it) {
    it.el.remove();
    stats.escapes++;
    stats.comboCurrent = 0;
    if (SFX) SFX.escape();
    spawnPoof(it.xPercent);
    if (!livesInfinite) {
      lives = Math.max(0, lives - 1);
      if (lives <= 0) {
        finishStage(true);
        return;
      }
    }
    updateHud();
  }

  function spawnPoof(xPercent) {
    const el = document.createElement('div');
    el.className = 'escape-poof';
    el.textContent = '💥';
    el.style.left = xPercent + '%';
    el.style.bottom = GROUND_Y_OFFSET - 20 + 'px';
    gameAreaEl.appendChild(el);
    setTimeout(() => el.remove(), 520);
  }

  function activeWordTarget() {
    let best = null;
    activeItems.forEach((it) => {
      if (it.text.length > 1 && it.typedIndex < it.text.length) {
        if (!best || it.y > best.y) best = it;
      }
    });
    return best;
  }

  function handleKey(rawKey) {
    if (!running || paused) return;
    const key = rawKey.length === 1 ? rawKey.toLowerCase() : rawKey;
    if (!/^[a-z;]$/.test(key)) return;

    if (stage.type === 'letters') {
      handleLetterKey(key);
    } else {
      handleWordKey(key);
    }
  }

  function handleLetterKey(key) {
    let target = null;
    activeItems.forEach((it) => {
      if (it.text === key && (!target || it.y > target.y)) target = it;
    });
    stats.attempts++;
    if (target) {
      zapItem(target, true);
    } else {
      registerMiss();
    }
  }

  function handleWordKey(key) {
    const target = activeWordTarget();
    if (!target) return; // nothing to type yet, don't penalize
    stats.attempts++;
    const expected = target.text[target.typedIndex];
    if (key === expected) {
      target.typedIndex++;
      stats.correct++;
      stats.comboCurrent++;
      stats.comboBest = Math.max(stats.comboBest, stats.comboCurrent);
      renderItemText(target.el, target.text, target.typedIndex);
      if (SFX) SFX.click();
      if (target.typedIndex >= target.text.length) {
        zapItem(target, false, true);
      } else {
        maybeShowCombo();
      }
      updateHud();
    } else {
      registerMiss();
    }
  }

  function registerMiss() {
    stats.comboCurrent = 0;
    if (SFX) SFX.miss();
    cannonShake();
    updateHud();
  }

  function cannonShake() {
    cannonEl.classList.remove('shake');
    requestAnimationFrame(() => cannonEl.classList.add('shake'));
  }

  function zapItem(item, isLetter, isWordFinish) {
    const idx = activeItems.indexOf(item);
    if (idx >= 0) activeItems.splice(idx, 1);
    moveCannonTo(item.xPercent);
    fireLaser(item.xPercent, item.y);
    burstParticles(item.xPercent, item.y);
    item.el.remove();
    stats.zapped++;
    if (isLetter) {
      stats.correct++;
      stats.comboCurrent++;
      stats.comboBest = Math.max(stats.comboBest, stats.comboCurrent);
    }
    if (SFX) (isWordFinish ? SFX.wordComplete() : SFX.zap());
    maybeShowCombo();
    updateHud();
  }

  function maybeShowCombo() {
    if (stats.comboCurrent > 0 && stats.comboCurrent % 5 === 0) {
      showComboPopup(`Combo x${stats.comboCurrent}! 🔥`);
    }
  }

  function showComboPopup(text) {
    if (!hintEl) return;
    hintEl.textContent = text;
    hintEl.style.opacity = '1';
    clearTimeout(hintEl._fadeTimer);
    hintEl._fadeTimer = setTimeout(() => { hintEl.style.opacity = '0'; }, 700);
  }

  function moveCannonTo(xPercent) {
    cannonEl.style.left = xPercent + '%';
  }

  function fireLaser(xPercent, y) {
    const laser = document.createElement('div');
    laser.className = 'laser';
    const groundY = areaHeight() - GROUND_Y_OFFSET + 30;
    const height = Math.max(10, groundY - y);
    laser.style.left = xPercent + '%';
    laser.style.height = height + 'px';
    laser.style.bottom = (areaHeight() - groundY) + 'px';
    gameAreaEl.appendChild(laser);
    setTimeout(() => laser.remove(), 110);
  }

  function burstParticles(xPercent, y) {
    for (let i = 0; i < 8; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = xPercent + '%';
      p.style.top = y + 'px';
      const angle = (Math.PI * 2 * i) / 8;
      const dist = 30 + Math.random() * 20;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      gameAreaEl.appendChild(p);
      requestAnimationFrame(() => {
        p.style.transition = 'transform 0.4s ease, opacity 0.4s ease';
        p.style.transform = `translate(${dx}px, ${dy}px)`;
        p.style.opacity = '0';
      });
      setTimeout(() => p.remove(), 420);
    }
  }

  function updateHud() {
    const accuracy = stats.attempts === 0 ? 100 : Math.round((stats.correct / stats.attempts) * 100);
    if (hudCallbacks.onUpdate) {
      hudCallbacks.onUpdate({ stats, accuracy, lives, livesInfinite });
    }
  }

  function finishStage(failedOnLives) {
    stop();
    const accuracy = stats.attempts === 0 ? 1 : stats.correct / stats.attempts;
    const queueFullyPlayed = stage.type === 'endless' ? true : queueIndex >= queue.length && activeItems.length === 0;
    const passed = stage.type === 'endless'
      ? true
      : !failedOnLives && queueFullyPlayed && accuracy >= stage.minAccuracy;
    onStageEnd({ stage, stats, accuracy, passed, failedOnLives: !!failedOnLives });
  }

  function setSpeedMultiplier(m) {
    speedMultiplier = Math.max(0.3, Math.min(2.5, m));
  }

  return { init, startStage, stop, pause, resume, handleKey, setSpeedMultiplier };
})();
