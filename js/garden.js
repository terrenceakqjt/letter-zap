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
  const BLOOM_PALETTE = ['🌻', '🌸', '🌹', '🌼', '🌺', '🌷', '🏵️'];
  const COARSE_CELL = 110;   // spacing basis for the jittered layout
  const JITTER_RATIO = 0.32; // how far a plot can wander from its grid point
  const MAX_SLOTS = 160;
  const WITHER_STREAK = 3;

  let gridEl, promptEl, bannerEl, meterFillEl, meterTextEl, wordsEl, mistakesEl;
  let hudCallbacks = {};
  let slotEls = [];
  let plantedFlower = []; // per-slot: emoji string once planted, else null

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

      const slot = document.createElement('div');
      slot.className = 'garden-slot';
      slot.style.left = (centerX + jitterX) + 'px';
      slot.style.top = (centerY + jitterY) + 'px';
      slot.innerHTML = '<span class="garden-dot"></span><span class="garden-plant"></span>';
      gridEl.appendChild(slot);
      slotEls.push(slot);
    }

    // Re-fill however many spots were already planted this round (e.g. on
    // resize) so progress isn't lost, just re-laid-out.
    plantedCount = Math.min(prevPlanted, total);
    for (let i = 0; i < plantedCount; i++) {
      plantedFlower[i] = BLOOM_PALETTE[i % BLOOM_PALETTE.length];
    }
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
    if (SFX) SFX.wordComplete();
    if (plantedCount >= slotEls.length) {
      lapsCompleted++;
      showFullBloomBanner();
      setTimeout(() => { if (running) startNewRound(); }, 1800);
    }
    nextWord();
    updateHud();
  }

  function plantOneFlower() {
    if (plantedCount >= slotEls.length) return;
    const index = plantedCount;
    const flower = BLOOM_PALETTE[(lapsCompleted + index) % BLOOM_PALETTE.length];
    plantedFlower[index] = flower;
    plantedCount++;
    renderSlot(index, true);
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
    const index = plantedCount - 1;
    plantedCount--;
    plantedFlower[index] = null;
    renderSlot(index, false);
  }

  function showFullBloomBanner() {
    if (SFX) SFX.bloomFull();
    bannerEl.textContent = `🎉 Garden #${lapsCompleted} complete! A new garden is sprouting...`;
    bannerEl.classList.remove('hidden');
    setTimeout(() => bannerEl.classList.add('hidden'), 3000);
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
