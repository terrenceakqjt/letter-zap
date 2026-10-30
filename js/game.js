/* game.js — the sushi-train engine: plates ride a conveyor belt from the chef
   to a sleeping cat; typing a plate's letter (or word) serves it. */

const Game = (() => {
  let gameAreaEl, chefEl, catEl, hintEl, beltSlatsEl;
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

  // Speeds are in "px per second over a 750px trip" (the old falling distance),
  // so a plate takes the same time to reach the cat whatever the belt length.
  const REF_TRIP = 750;
  const DANGER_T = 0.82; // plates wobble for the last stretch of belt
  const PLATE_GAP = 26; // min px between plates when one is set down
  const SUSHI = ['🍣', '🍙', '🍤', '🍥', '🥟', '🍡', '🍘', '🥠'];
  const PLATE_COLORS = ['blue', 'red', 'green', 'gold', 'plum'];

  let path = null; // belt geometry, rebuilt on resize
  let beltSpeed = 0;
  let beltOffset = 0;
  let catTimer = null;

  function init(opts) {
    gameAreaEl = opts.gameAreaEl;
    chefEl = opts.chefEl;
    catEl = opts.catEl;
    hintEl = opts.hintEl;
    hudCallbacks = opts.hudCallbacks || {};
    onStageEnd = opts.onStageEnd || (() => {});
    window.addEventListener('resize', () => { if (running) layout(); });
  }

  function areaHeight() { return gameAreaEl.clientHeight; }
  function areaWidth() { return gameAreaEl.clientWidth; }

  /* ---------- belt geometry ----------
     One straight belt across the restaurant counter: the chef sets plates
     down at the left end, the cat naps at the far right end. */
  function layout() {
    const w = areaWidth();
    const h = areaHeight();
    const y = Math.round(h * 0.58);
    const x0 = 170;
    const x1 = Math.max(x0 + 300, w - 170);
    path = { x0, x1, y, length: x1 - x0 };
    gameAreaEl.style.setProperty('--belt-y', y + 'px');

    const d = `M ${x0 - 40} ${y} L ${x1 + 40} ${y}`;
    let svg = gameAreaEl.querySelector('.belt');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'belt');
      gameAreaEl.querySelector('.restaurant').after(svg);
    }
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = `
      <path class="belt-shadow" d="${d}" transform="translate(0 8)"/>
      <path class="belt-rail" d="${d}"/>
      <path class="belt-surface" d="${d}"/>
      <path class="belt-slats" d="${d}"/>`;
    beltSlatsEl = svg.querySelector('.belt-slats');

    chefEl.style.left = x0 - 95 + 'px';
    chefEl.style.top = y - 50 + 'px';
    catEl.style.left = x1 + 105 + 'px';
    catEl.style.top = y - 6 + 'px';
    activeItems.forEach(placeItem);
  }

  function pointAt(t) {
    return { x: path.x0 + Math.max(0, Math.min(1, t)) * path.length, y: path.y };
  }

  function placeItem(it) {
    const pt = pointAt(it.t);
    it.el.style.left = pt.x + 'px';
    it.el.style.top = pt.y + 'px';
  }

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
    // every plate on a belt moves at the same speed, so none can overtake another
    beltSpeed = baseSpeedFor(st, stageOrdinal);
    clearTimeout(catTimer);
    catEl.classList.remove('awake');
    layout();
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
    tickBelt(dt);

    rafId = requestAnimationFrame(loop);
  }

  function tickSpawning(dt) {
    const st = stage;
    const concurrentCap = maxConcurrentFor(st);
    if (st.type === 'endless') {
      spawnAcc += dt;
      const interval = Math.max(900, 2200 - elapsedMs / 400);
      if (spawnAcc >= interval && activeItems.length < concurrentCap && beltHasRoom()) {
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
    if (spawnAcc >= interval && activeItems.length < concurrentCap && beltHasRoom()) {
      spawnAcc = 0;
      spawnItem(queue[queueIndex]);
      queueIndex++;
    }
  }

  // the newest plate must have moved far enough from the chef to fit another
  function beltHasRoom() {
    const last = activeItems[activeItems.length - 1];
    if (!last) return true;
    return last.t * path.length > last.el.offsetWidth + PLATE_GAP;
  }

  function spawnItem(text) {
    const isWord = text.length > 1;
    const el = document.createElement('div');
    const color = PLATE_COLORS[Math.floor(Math.random() * PLATE_COLORS.length)];
    el.className = `sushi-plate plate-${color}` + (isWord ? ' word' : '');
    const sushi = SUSHI[Math.floor(Math.random() * SUSHI.length)];
    el.innerHTML = `<span class="sushi" aria-hidden="true">${sushi}</span><span class="label"></span>`;
    const labelEl = el.querySelector('.label');
    renderItemText(labelEl, text, 0);
    gameAreaEl.appendChild(el);
    const it = { text, typedIndex: 0, el, labelEl, t: 0, danger: false };
    placeItem(it);
    activeItems.push(it);
    chefEl.classList.remove('serve');
    void chefEl.offsetWidth;
    chefEl.classList.add('serve');
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
    const step = (beltSpeed * speedMultiplier * dt) / 1000 / REF_TRIP;
    for (let i = activeItems.length - 1; i >= 0; i--) {
      const it = activeItems[i];
      it.t += step;
      placeItem(it);
      const isDanger = it.t > DANGER_T;
      if (isDanger !== it.danger) {
        it.danger = isDanger;
        it.el.classList.toggle('danger', isDanger);
      }
      if (it.t >= 1) {
        activeItems.splice(i, 1);
        handleEscape(it);
        if (!running) return;
      }
    }
  }

  function tickBelt(dt) {
    beltOffset += (beltSpeed * speedMultiplier * dt) / 1000 / REF_TRIP * path.length;
    if (beltSlatsEl) beltSlatsEl.style.strokeDashoffset = (-beltOffset % 1000).toFixed(1);
  }

  function handleEscape(it) {
    it.el.classList.add('eaten');
    setTimeout(() => it.el.remove(), 380);
    stats.escapes++;
    stats.comboCurrent = 0;
    if (SFX) SFX.escape();
    wakeCat();
    if (!livesInfinite) {
      lives = Math.max(0, lives - 1);
      if (lives <= 0) {
        finishStage(true);
        return;
      }
    }
    updateHud();
  }

  // the cat gobbles the plate, yowls, then dozes off again
  function wakeCat() {
    catEl.classList.remove('awake');
    void catEl.offsetWidth;
    catEl.classList.add('awake');
    clearTimeout(catTimer);
    catTimer = setTimeout(() => catEl.classList.remove('awake'), 1100);
  }

  function activeWordTarget() {
    let best = null;
    activeItems.forEach((it) => {
      if (it.text.length > 1 && it.typedIndex < it.text.length) {
        if (!best || it.t > best.t) best = it;
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
      if (it.text === key && (!target || it.t > target.t)) target = it;
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
    chefShake();
    updateHud();
  }

  function chefShake() {
    chefEl.classList.remove('shake');
    requestAnimationFrame(() => chefEl.classList.add('shake'));
  }

  function zapItem(item, isLetter, isWordFinish) {
    const idx = activeItems.indexOf(item);
    if (idx >= 0) activeItems.splice(idx, 1);
    const pt = pointAt(item.t);
    burstParticles(pt.x, pt.y);
    item.el.classList.remove('danger');
    item.el.classList.add('served');
    setTimeout(() => item.el.remove(), 420);
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

  function burstParticles(x, y) {
    for (let i = 0; i < 8; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      const angle = (Math.PI * 2 * i) / 8;
      const dist = 34 + Math.random() * 22;
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
