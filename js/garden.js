/* garden.js — Garden Mode: a calm, endless typing activity. Each completed
 * word instantly plants one full flower in the next open spot — no gradual
 * growing or augmenting, just plant-and-done. Three mistakes in a row wilts
 * away the most recently planted flower. No lives, no timer, no falling
 * objects. Word difficulty matches whatever letters the player has already
 * unlocked in the main game.
 *
 * The garden is a scatter of flower spots covering the whole screen (not a
 * single centered box, not a rigid spreadsheet grid) — positions are a
 * coarse grid with randomized jitter, computed from the actual available
 * space so it adapts to any viewport. Once every spot is filled, the
 * garden celebrates and a fresh round starts automatically — lifetime
 * totals (flowers planted, mistakes) keep accumulating across rounds, so
 * reaching a truly huge total is a long-term, play-a-little-every-day
 * pursuit rather than a single sitting.
 */

const GardenGame = (() => {
  const BLOOM_PALETTE = ['🌸', '🪷', '💮', '⚘', '🏵️'];
  // Big permanent rewards for fully filling the garden — Japanese garden
  // landmarks and animals, so each completed round adds something
  // substantial and visible, not just a reset.
  const LANDMARK_POOL = ['⛩️', '🎋', '🏮', '🐢', '🍁', '🗻', '🪷', '🦆', '🏯'];
  const LANDMARK_NAMES = {
    '⛩️': 'torii gate', '🎋': 'bamboo grove', '🏮': 'paper lantern', '🐢': 'turtle',
    '🍁': 'maple tree', '🗻': 'view of Mt. Fuji', '🪷': 'lotus pond', '🦆': 'duck', '🏯': 'pagoda',
  };
  const COARSE_CELL = 220;   // spacing basis for the jittered layout — wider
                              // spacing means ~1/4 as many plots per screen,
                              // so a full garden takes ~1/4 as many words
  const JITTER_RATIO = 0.32; // how far a plot can wander from its grid point
  const MAX_SLOTS = 160;
  const WITHER_STREAK = 3;

  let gridEl, promptEl, bannerEl, meterFillEl, meterTextEl, wordsEl, mistakesEl, landmarksEl;
  let hudCallbacks = {};
  let slotEls = [];
  let plantedFlower = []; // per-slot: emoji string once planted, else null
  let plantOrder = [];    // shuffled slot indices — planting fills this sequence,
                           // so flowers scatter across the whole bed instead of
                           // filling row by row from the top
  let landmarkEls = [];   // big milestone structures, one per fully-completed garden round

  let wordPool = ['cat'];
  let currentWord = '';
  let lastWord = '';
  let typedIndex = 0;

  let plantedCount = 0;     // filled spots in the CURRENT round
  let wordsCompleted = 0;   // lifetime total, persists across rounds
  let totalMistakes = 0;    // lifetime total
  let lapsCompleted = 0;    // how many times the garden has fully filled
  let consecutiveMistakes = 0;
  let running = false;
  let resizeTimer = null;

  function init(opts) {
    gridEl = opts.gridEl;
    promptEl = opts.promptEl;
    bannerEl = opts.bannerEl;
    meterFillEl = opts.meterFillEl;
    meterTextEl = opts.meterTextEl;
    wordsEl = opts.wordsEl;
    mistakesEl = opts.mistakesEl;
    landmarksEl = opts.landmarksEl;
    hudCallbacks = opts.hudCallbacks || {};

    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!running) return;
        buildLayout();
        renderAll();
      }, 200);
    });
  }

  // Deterministic pseudo-random in [0,1) — same seed always gives the same
  // value, so a landmark's position is stable across reloads/resizes
  // instead of jumping around.
  function seededRand(seed) {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function landmarkPosition(index) {
    const xPct = 6 + seededRand(index * 2 + 1) * 88;
    const yPct = 55 + seededRand(index * 2 + 2) * 42;
    return { xPct, yPct };
  }

  function addLandmarkEl(index, animate) {
    const emoji = LANDMARK_POOL[index % LANDMARK_POOL.length];
    const pos = landmarkPosition(index);
    const el = document.createElement('div');
    el.className = 'garden-landmark' + (animate ? ' just-added' : '');
    el.style.left = pos.xPct + '%';
    el.style.top = pos.yPct + '%';
    el.textContent = emoji;
    landmarksEl.appendChild(el);
    landmarkEls.push(el);
  }

  // One landmark per completed garden round — lapsCompleted is persisted,
  // so this always matches exactly how many the player has earned.
  function rebuildLandmarks() {
    landmarksEl.innerHTML = '';
    landmarkEls = [];
    for (let i = 0; i < lapsCompleted; i++) addLandmarkEl(i, false);
  }

  function buildLayout() {
    const w = gridEl.clientWidth || 600;
    const h = gridEl.clientHeight || 400;
    const columns = Math.max(3, Math.floor(w / COARSE_CELL));
    let rows = Math.max(2, Math.floor(h / COARSE_CELL));
    if (columns * rows > MAX_SLOTS) rows = Math.max(2, Math.floor(MAX_SLOTS / columns));
    const total = columns * rows;

    const prevPlanted = plantedCount;

    gridEl.innerHTML = '';
    slotEls = [];
    plantedFlower = new Array(total).fill(null);

    for (let i = 0; i < total; i++) {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const centerX = col * COARSE_CELL + COARSE_CELL / 2;
      const centerY = row * COARSE_CELL + COARSE_CELL / 2;
      const jitterX = (Math.random() * 2 - 1) * COARSE_CELL * JITTER_RATIO;
      const jitterY = (Math.random() * 2 - 1) * COARSE_CELL * JITTER_RATIO;

      const finalY = centerY + jitterY;
      // cheap perspective cue: plots lower in the bed read as "closer"
      // and render a bit bigger, since there's no real 3D here.
      const depthScale = 0.78 + Math.max(0, Math.min(1, finalY / h)) * 0.55;

      const slot = document.createElement('div');
      slot.className = 'garden-slot';
      slot.style.left = (centerX + jitterX) + 'px';
      slot.style.top = finalY + 'px';
      slot.style.setProperty('--depth-scale', depthScale.toFixed(2));
      slot.innerHTML = '<span class="garden-dot"></span><span class="garden-plant"></span>';
      gridEl.appendChild(slot);
      slotEls.push(slot);
    }

    plantOrder = shuffle(Array.from({ length: total }, (_, i) => i));

    // Re-fill however many spots were already planted this round (e.g. on
    // resize) so progress isn't lost, just re-laid-out.
    plantedCount = Math.min(prevPlanted, total);
    for (let seq = 0; seq < plantedCount; seq++) {
      const slotIndex = plantOrder[seq];
      plantedFlower[slotIndex] = BLOOM_PALETTE[(lapsCompleted + seq) % BLOOM_PALETTE.length];
    }
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function start(wordPoolForStage, savedState) {
    wordPool = wordPoolForStage && wordPoolForStage.length ? wordPoolForStage : ['cat', 'dog', 'sun', 'red'];
    if (savedState) {
      plantedCount = savedState.plantedCount || 0;
      wordsCompleted = savedState.wordsCompleted || 0;
      totalMistakes = savedState.totalMistakes || 0;
      lapsCompleted = savedState.lapsCompleted || 0;
    } else {
      plantedCount = 0;
      wordsCompleted = 0;
      totalMistakes = 0;
      lapsCompleted = 0;
    }
    consecutiveMistakes = 0;
    running = true;
    bannerEl.classList.add('hidden');
    buildLayout();
    rebuildLandmarks();
    renderAll();
    nextWord();
    updateHud();
  }

  function stop() { running = false; }

  function pickWord() {
    if (wordPool.length === 1) return wordPool[0];
    let w;
    do { w = wordPool[Math.floor(Math.random() * wordPool.length)]; } while (w === lastWord);
    return w;
  }

  function nextWord() {
    currentWord = pickWord();
    lastWord = currentWord;
    typedIndex = 0;
    renderPrompt();
  }

  function renderPrompt() {
    const upper = currentWord.toUpperCase();
    const typed = upper.slice(0, typedIndex);
    const rest = upper.slice(typedIndex);
    promptEl.innerHTML = `<span class="typed">${typed}</span><span class="remaining">${rest}</span>`;
  }

  function flashPromptError() {
    promptEl.classList.remove('garden-shake');
    requestAnimationFrame(() => promptEl.classList.add('garden-shake'));
  }

  function flashWither() {
    gridEl.classList.remove('wither-flash');
    requestAnimationFrame(() => gridEl.classList.add('wither-flash'));
    setTimeout(() => gridEl.classList.remove('wither-flash'), 500);
  }

  function handleKey(rawKey) {
    if (!running) return;
    const key = rawKey.length === 1 ? rawKey.toLowerCase() : rawKey;
    if (!/^[a-z]$/.test(key)) return;

    const expected = currentWord[typedIndex];
    if (key === expected) {
      typedIndex++;
      consecutiveMistakes = 0;
      if (SFX) SFX.click();
      renderPrompt();
      if (typedIndex >= currentWord.length) {
        completeWord();
      }
      updateHud();
    } else {
      registerMistake();
    }
  }

  function completeWord() {
    wordsCompleted++;
    plantOneFlower();
    if (plantedCount >= slotEls.length) {
      lapsCompleted++;
      const newEmoji = LANDMARK_POOL[(lapsCompleted - 1) % LANDMARK_POOL.length];
      addLandmarkEl(landmarkEls.length, true);
      if (SFX) SFX.landmark();
      showFullBloomBanner(newEmoji);
      setTimeout(() => { if (running) startNewRound(); }, 2600);
    } else if (SFX) {
      SFX.wordComplete();
    }
    nextWord();
    updateHud();
  }

  function plantOneFlower() {
    if (plantedCount >= slotEls.length) return;
    const seq = plantedCount;
    const slotIndex = plantOrder[seq];
    const flower = BLOOM_PALETTE[(lapsCompleted + seq) % BLOOM_PALETTE.length];
    plantedFlower[slotIndex] = flower;
    plantedCount++;
    renderSlot(slotIndex, true);
  }

  function startNewRound() {
    plantedCount = 0;
    plantedFlower = plantedFlower.map(() => null);
    for (let i = 0; i < slotEls.length; i++) renderSlot(i, false);
    updateHud();
  }

  function registerMistake() {
    totalMistakes++;
    consecutiveMistakes++;
    if (SFX) SFX.miss();
    flashPromptError();
    if (consecutiveMistakes >= WITHER_STREAK) {
      consecutiveMistakes = 0;
      witherLastPlant();
    }
    updateHud();
  }

  function witherLastPlant() {
    if (plantedCount <= 0) return;
    if (SFX) SFX.wither();
    flashWither();
    const slotIndex = plantOrder[plantedCount - 1];
    plantedCount--;
    plantedFlower[slotIndex] = null;
    renderSlot(slotIndex, false);
  }

  function showFullBloomBanner(emoji) {
    if (SFX) SFX.bloomFull();
    const name = LANDMARK_NAMES[emoji] || 'surprise';
    bannerEl.innerHTML =
      `🎉✨ Garden #${lapsCompleted} Complete! ✨🎉<br>` +
      `A new ${name} ${emoji} has joined your garden forever!`;
    bannerEl.classList.remove('hidden');
    bannerEl.classList.add('celebrate');
    setTimeout(() => {
      bannerEl.classList.add('hidden');
      bannerEl.classList.remove('celebrate');
    }, 3400);
  }

  function reset() {
    start(wordPool);
  }

  function renderSlot(index, justPlanted) {
    const slot = slotEls[index];
    if (!slot) return;
    const plantEl = slot.querySelector('.garden-plant');
    const filled = !!plantedFlower[index];
    slot.classList.toggle('filled', filled);
    plantEl.textContent = plantedFlower[index] || '';
    plantEl.classList.toggle('just-planted', justPlanted && filled);
  }

  function renderAll() {
    for (let i = 0; i < slotEls.length; i++) renderSlot(i, false);
    if (meterFillEl) meterFillEl.style.width = fillPct() + '%';
    if (meterTextEl) meterTextEl.textContent = Math.round(fillPct()) + '%';
  }

  function fillPct() {
    return slotEls.length ? (plantedCount / slotEls.length) * 100 : 0;
  }

  function updateHud() {
    if (wordsEl) wordsEl.textContent = `🌼 ${wordsCompleted}`;
    if (mistakesEl) mistakesEl.textContent = `✋ ${totalMistakes}`;
    if (meterFillEl) meterFillEl.style.width = fillPct() + '%';
    if (meterTextEl) meterTextEl.textContent = Math.round(fillPct()) + '%';
    if (hudCallbacks.onUpdate) {
      hudCallbacks.onUpdate({ plantedCount, wordsCompleted, totalMistakes, lapsCompleted });
    }
  }

  return { init, start, stop, reset, handleKey };
})();
