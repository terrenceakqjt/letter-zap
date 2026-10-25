/* garden.js — Garden Mode: a calm, endless typing activity set on a little
 * isometric garden diorama — raised blocks of grass, soil beds, planter
 * boxes, a stone path and water. Each completed word plants one flower in
 * the next soil spot (the spot glows so kids can see where it'll go).
 * Three mistakes in a row wilts the most recently planted flower. No lives,
 * no timer, no falling objects. Word difficulty matches whatever letters
 * the player has already unlocked in the main game.
 *
 * Filling every soil spot completes the round: a big permanent landmark
 * appears on one of the brick pedestals (never on a planting spot), and the
 * beds clear for the next round. Once the pedestals are full, later
 * landmarks settle onto the open grass instead.
 *
 * The board is drawn from MAP below in fixed "board pixels" and scaled as a
 * whole to fit the screen, so resizing never reshuffles anything. Planting
 * order is a seeded shuffle per round, so flowers stay put across reloads.
 */

const GardenGame = (() => {
  // Tile key:  . empty   g grass   s soil bed   b raised planter box
  //            p stone path   w water   L landmark pedestal
  //            t grass with a tree   r grass with a rock
  const MAP = [
    '..gtgs..',
    '.Lgssbg.',
    'wgsppsLg',
    'wbpLppsg',
    'gspppsb.',
    'wLgpsgsg',
    '.wspsgL.',
    '..gsgt..',
  ];
  // Landmark pedestals fill center-first, then around the edges.
  const PEDESTAL_ORDER = [[3, 3], [1, 1], [2, 6], [5, 1], [6, 6]];

  const TILE = {
    g: { elev: 12, top: '#b4c18b', left: '#98a66f', right: '#808e5b' },
    t: { elev: 12, top: '#b4c18b', left: '#98a66f', right: '#808e5b', decor: 'conifer' },
    r: { elev: 12, top: '#b4c18b', left: '#98a66f', right: '#808e5b', decor: 'rock' },
    s: { elev: 8, top: '#8b6c52', left: '#745842', right: '#614835', plantable: true },
    b: { elev: 32, top: '#7c5e47', left: '#b39373', right: '#997a5d', plantable: true, planks: true },
    p: { elev: 4, top: '#e3dcd1', left: '#cac1b4', right: '#b3aa9d', slabs: true },
    w: { elev: -4, top: '#a9c4c4', left: '#92aeae', right: '#7f9c9d', water: true },
    L: { elev: 26, top: '#dad3c7', left: '#c3bbad', right: '#a79f91', plinth: true },
  };

  const TW = 100;   // tile width in board px (top face is TW x TH, 2:1 iso)
  const TH = 50;
  const BASE = 18;  // block thickness below ground level
  const ROWS = MAP.length;
  const COLS = MAP[0].length;
  const SIDE_PAD = 170; // open space left/right of the grid for outside decorations
  const BOARD_W = (ROWS + COLS) * TW / 2 + SIDE_PAD * 2;
  const TOP_PAD = 105; // room above the back row for tall landmarks
  const BOARD_H = TOP_PAD + (ROWS + COLS - 2) * TH / 2 + TH + BASE + 20;

  const { ART, flower: flowerArt, FLOWER_KINDS } = GardenArt;
  // Grid rewards, all different: the first five stand on the stone plinths,
  // the rest on open grass.
  const LANDMARKS = [
    { art: 'fountain', name: 'stone fountain' },
    { art: 'pagoda', name: 'small pagoda' },
    { art: 'torii', name: 'torii gate' },
    { art: 'lantern', name: 'stone lantern' },
    { art: 'sundial', name: 'sundial' },
    { art: 'oak', name: 'oak tree' },
    { art: 'arbor', name: 'climbing-rose arbor' },
    { art: 'maple', name: 'maple tree' },
    { art: 'bench', name: 'garden bench' },
    { art: 'well', name: 'old well' },
    { art: 'birdbath', name: 'birdbath' },
  ];
  const GRASS_REWARD_SPOTS = LANDMARKS.length - 5; // keeps the middle of the garden from crowding
  const LANDMARK_SCALE = { big: 1.15, medium: 0.9 };
  const PLANT_SCALE = 1.45; // flowers need to read clearly at a glance on the soil
  // Later rewards that live outside the grid: little floating islands beside
  // the garden and things drifting in the sky above it. Positions are in
  // board px. After the pedestals fill, rewards alternate between these and
  // the open grass tiles.
  const OUTSIDE_DECOR = [
    { kind: 'island', tile: 'g', x: 95, y: 330, art: 'pineGrove', name: 'pine grove' },
    { kind: 'sky', x: 190, y: 80, art: 'cloud', name: 'drifting cloud' },
    { kind: 'island', tile: 'p', x: 1025, y: 330, art: 'rockGarden', name: 'raked rock garden' },
    { kind: 'sky', x: 950, y: 75, art: 'birds', name: 'flock of birds' },
    { kind: 'island', tile: 'w', x: 300, y: 500, art: 'lilyPads', name: 'lily pond' },
    { kind: 'island', tile: 'g', x: 820, y: 500, art: 'gazebo', name: 'gazebo' },
    { kind: 'sky', x: 350, y: 50, art: 'skyLantern', name: 'sky lantern' },
    { kind: 'island', tile: 'w', x: 150, y: 470, art: 'rowboat', name: 'little rowboat' },
    { kind: 'island', tile: 'g', x: 970, y: 470, art: 'cherryTree', name: 'cherry tree' },
    { kind: 'sky', x: 790, y: 45, art: 'cloudSmall', name: 'small cloud' },
  ];
  const WITHER_STREAK = 3;
  // Words get slowly longer: start at 3 letters (mixed with 2) and allow one
  // more letter every WORDS_PER_EXTRA_LETTER lifetime words (about two full
  // gardens), up to the longest words the player's letters can spell.
  const START_WORD_LEN = 3;
  const WORDS_PER_EXTRA_LETTER = 30;

  let areaEl, boardEl, promptEl, bannerEl, meterFillEl, meterTextEl, wordsEl, mistakesEl, accuracyEl;
  let hudCallbacks = {};

  let tiles = [];          // { r, c, kind, el, objEl }
  let soilTiles = [];      // plantable tiles
  let rewardSlots = [];    // where each completed garden's reward goes, in order:
                           // { tile, size, lm } on the grid or { outside, lm } beside it
  let outsideEl = null;    // layer holding the off-grid decorations
  let plantOrder = [];     // this round's planting sequence (indices into soilTiles)

  let wordPool = ['cat'];
  let currentWord = '';
  let lastWord = '';
  let typedIndex = 0;

  let plantedCount = 0;     // filled spots in the CURRENT round
  let wordsCompleted = 0;   // lifetime total, persists across rounds
  let totalMistakes = 0;    // lifetime total
  let lapsCompleted = 0;    // how many times the garden has fully filled
  let accCorrect = 0;       // keystrokes counted toward the accuracy stat —
  let accMistakes = 0;      // separate from the totals so it can be reset alone
  let consecutiveMistakes = 0;
  let running = false;
  let celebrating = false;  // garden just filled; typing pauses until the beds clear
  let newRoundTimer = null;

  function init(opts) {
    areaEl = opts.areaEl;
    boardEl = opts.boardEl;
    promptEl = opts.promptEl;
    bannerEl = opts.bannerEl;
    meterFillEl = opts.meterFillEl;
    meterTextEl = opts.meterTextEl;
    wordsEl = opts.wordsEl;
    mistakesEl = opts.mistakesEl;
    accuracyEl = opts.accuracyEl;
    hudCallbacks = opts.hudCallbacks || {};
    buildBoard();
    window.addEventListener('resize', () => { if (running) fitBoard(); });
  }

  // Small seeded PRNG (mulberry32) so layouts and planting order are stable.
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededShuffle(arr, seed) {
    const rand = rng(seed);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---------------- Board drawing ----------------
  function tileSvg(t, r, c) {
    const spec = TILE[t];
    const h = spec.elev + BASE;
    const W = TW, H = TH, hw = TW / 2, hh = TH / 2;
    const top = `${hw},0 ${W},${hh} ${hw},${H} 0,${hh}`;
    const left = `0,${hh} ${hw},${H} ${hw},${H + h} 0,${hh + h}`;
    const right = `${hw},${H} ${W},${hh} ${W},${hh + h} ${hw},${H + h}`;
    let extra = '';

    if (spec.slabs) {
      extra += `<path d="M${hw / 2},${hh * 1.5} L${hw * 1.5},${hh / 2} M${hw / 2},${hh / 2} L${hw * 1.5},${hh * 1.5}" stroke="#d0c7ba" stroke-width="1.5"/>`;
    }
    if (spec.water) {
      extra += `<polygon points="${hw},6 ${W - 12},${hh} ${hw},${H - 6} 12,${hh}" fill="#c2d6d4" opacity="0.45"/>
        <path d="M${hw - 18},${hh - 2} q6 -3 12 0 M${hw + 4},${hh + 6} q6 -3 12 0" stroke="#f4f8f7" stroke-width="1.2" fill="none" opacity="0.6"/>`;
    }
    if (spec.plinth) {
      // stone plinth: a lighter cap slab with a thin groove under it
      extra += `<path d="M0,${hh + 6} L${hw},${H + 6} L${W},${hh + 6}" stroke="#9e9688" stroke-width="1" fill="none" opacity="0.7"/>`;
      extra += `<polygon points="${hw},4 ${W - 8},${hh} ${hw},${H - 4} 8,${hh}" fill="none" stroke="#e7e1d7" stroke-width="1.2"/>`;
    }
    if (spec.planks) {
      for (let y = H + 10; y < H + h; y += 11) {
        const dy = y - H;
        extra += `<path d="M0,${hh + dy} L${hw},${H + dy} L${W},${hh + dy}" stroke="#86684d" stroke-width="1" fill="none" opacity="0.6"/>`;
      }
      // soil sits a little below the box rim
      extra += `<polygon points="${hw},5 ${W - 10},${hh} ${hw},${H - 5} 10,${hh}" fill="#8b6c52"/>`;
    }
    if (spec.plantable && !spec.planks) {
      const rand = rng(r * 31 + c * 7 + 1);
      for (let i = 0; i < 6; i++) {
        const x = 28 + rand() * 44, y = 14 + rand() * 22;
        extra += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.3" fill="#6a5140" opacity="0.6"/>`;
      }
    }
    if (t === 'g' || t === 't' || t === 'r') {
      const rand = rng(r * 13 + c * 17 + 5);
      for (let i = 0; i < 4; i++) {
        const x = 24 + rand() * 48, y = 16 + rand() * 18;
        extra += `<path d="M${x.toFixed(1)},${y.toFixed(1)} l2,-6 l2,6 l2,-5 l2,5 z" fill="${i % 2 ? '#a3b27a' : '#c3cd9d'}"/>`;
      }
    }

    return `<svg width="${W}" height="${H + h}" viewBox="0 0 ${W} ${H + h}" aria-hidden="true">
      <polygon points="${left}" fill="${spec.left}"/>
      <polygon points="${right}" fill="${spec.right}"/>
      <polygon points="${top}" fill="${spec.top}"/>
      ${extra}
      <path d="M0,${hh} L${hw},${H} L${W},${hh}" stroke="rgba(255,255,255,0.22)" stroke-width="1" fill="none"/>
    </svg>`;
  }

  function buildBoard() {
    boardEl.innerHTML = '';
    boardEl.style.width = BOARD_W + 'px';
    boardEl.style.height = BOARD_H + 'px';
    tiles = [];
    soilTiles = [];
    const grassSites = [];
    const ox = SIDE_PAD + (ROWS - 1) * TW / 2;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const kind = MAP[r][c];
        if (!TILE[kind]) continue;
        const spec = TILE[kind];
        const el = document.createElement('div');
        el.className = `iso-tile kind-${kind}`;
        el.style.left = (ox + (c - r) * TW / 2) + 'px';
        el.style.top = (TOP_PAD + (c + r) * TH / 2 - spec.elev) + 'px';
        el.style.zIndex = String((r + c) * 2);
        el.innerHTML = tileSvg(kind, r, c);
        const objEl = document.createElement('div');
        objEl.className = 'iso-obj';
        el.appendChild(objEl);
        boardEl.appendChild(el);

        const tile = { r, c, kind, el, objEl };
        tiles.push(tile);
        if (spec.plantable) soilTiles.push(tile);
        if (spec.decor) objEl.innerHTML = `<span class="iso-art">${ART[spec.decor]()}</span>`;
        if (kind === 'g') grassSites.push(tile);
      }
    }

    const at = (r, c) => tiles.find((t) => t.r === r && t.c === c);
    let gridCount = 0;
    const gridLandmark = () => LANDMARKS[gridCount++ % LANDMARKS.length];
    rewardSlots = PEDESTAL_ORDER.map(([r, c]) => ({ tile: at(r, c), size: 'big', lm: gridLandmark() }));
    const grass = seededShuffle(grassSites, 99).slice(0, GRASS_REWARD_SPOTS);
    for (let i = 0; i < Math.max(OUTSIDE_DECOR.length, grass.length); i++) {
      if (OUTSIDE_DECOR[i]) rewardSlots.push({ outside: OUTSIDE_DECOR[i], lm: OUTSIDE_DECOR[i] });
      if (grass[i]) rewardSlots.push({ tile: grass[i], size: 'medium', lm: gridLandmark() });
    }

    outsideEl = document.createElement('div');
    outsideEl.className = 'garden-outside';
    boardEl.appendChild(outsideEl);

  }

  function fitBoard() {
    const availW = areaEl.clientWidth - 24;
    const availH = areaEl.clientHeight - 60 - 100; // HUD above, word prompt below
    const scale = Math.max(0.35, Math.min(availW / BOARD_W, availH / BOARD_H, 2.4));
    boardEl.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
  }

  // ---------------- Round state ----------------
  function roundOrder() {
    return seededShuffle(soilTiles.map((_, i) => i), 1000 + lapsCompleted);
  }

  function flowerFor(seq) {
    const kind = FLOWER_KINDS[(lapsCompleted * 3 + seq) % FLOWER_KINDS.length];
    return flowerArt(kind, lapsCompleted * 100 + seq);
  }

  function renderSoil(justPlantedIdx) {
    const nextIdx = plantedCount < plantOrder.length ? plantOrder[plantedCount] : -1;
    const seqOf = new Map(plantOrder.map((tileIdx, seq) => [tileIdx, seq]));
    soilTiles.forEach((tile, i) => {
      const seq = seqOf.get(i);
      const planted = seq < plantedCount;
      tile.el.classList.toggle('next', i === nextIdx);
      if (planted) {
        tile.objEl.innerHTML = `<span class="iso-art plant${i === justPlantedIdx ? ' just-planted' : ''}" style="--s:${PLANT_SCALE}">${flowerFor(seq)}</span>`;
      } else {
        tile.objEl.innerHTML = '<span class="iso-hole"></span>';
      }
    });
  }

  function outsideDecorEl(decor, justAdded) {
    const el = document.createElement('div');
    el.className = `iso-outside ${decor.kind}${justAdded ? ' just-added' : ''}`;
    if (decor.kind === 'sky') {
      el.style.left = decor.x + 'px';
      el.style.top = decor.y + 'px';
      el.innerHTML = `<span class="sky-item">${ART[decor.art]()}</span>`;
    } else {
      // a single floating block, positioned so its top face is centred on (x, y)
      el.style.left = (decor.x - TW / 2) + 'px';
      el.style.top = (decor.y - TH / 2) + 'px';
      el.style.zIndex = String(Math.round(decor.y / 10));
      el.innerHTML = tileSvg(decor.tile, Math.round(decor.x), Math.round(decor.y)) +
        `<div class="iso-obj"><span class="iso-art" style="--s:${LANDMARK_SCALE.medium}">${ART[decor.art]()}</span></div>`;
    }
    return el;
  }

  function renderLandmarks(newIndex) {
    rewardSlots.forEach((slot) => { if (slot.tile) slot.tile.objEl.innerHTML = ''; });
    outsideEl.innerHTML = '';
    const count = Math.min(lapsCompleted, rewardSlots.length);
    for (let i = 0; i < count; i++) {
      const slot = rewardSlots[i];
      if (slot.outside) {
        outsideEl.appendChild(outsideDecorEl(slot.outside, i === newIndex));
      } else {
        slot.tile.objEl.innerHTML = `<span class="iso-art landmark${i === newIndex ? ' just-added' : ''}" ` +
          `style="--s:${LANDMARK_SCALE[slot.size]}">${ART[slot.lm.art]()}</span>`;
      }
    }
  }

  // Reward for the nth completed garden (0-based). Past the last slot, the
  // garden is full — the count keeps going but nothing new is drawn.
  function rewardFor(index) {
    return rewardSlots[index] || { lm: LANDMARKS[index % LANDMARKS.length] };
  }

  function start(wordPoolForStage, savedState) {
    wordPool = wordPoolForStage && wordPoolForStage.length ? wordPoolForStage : ['cat', 'dog', 'sun', 'red'];
    plantedCount = (savedState && savedState.plantedCount) || 0;
    wordsCompleted = (savedState && savedState.wordsCompleted) || 0;
    totalMistakes = (savedState && savedState.totalMistakes) || 0;
    lapsCompleted = (savedState && savedState.lapsCompleted) || 0;
    accCorrect = (savedState && savedState.accCorrect) || 0;
    accMistakes = (savedState && savedState.accMistakes) || 0;
    consecutiveMistakes = 0;
    running = true;
    celebrating = false;
    clearTimeout(newRoundTimer);
    bannerEl.classList.add('hidden');
    plantOrder = roundOrder();
    // a full saved garden means the player left mid-celebration: start fresh beds
    if (plantedCount >= plantOrder.length) plantedCount = 0;
    renderSoil(-1);
    renderLandmarks(-1);
    fitBoard();
    nextWord();
    updateHud();
  }

  function stop() {
    running = false;
    clearTimeout(newRoundTimer);
  }

  function reset() {
    start(wordPool);
  }

  function resetAccuracy() {
    accCorrect = 0;
    accMistakes = 0;
    updateHud();
    if (!celebrating) showToast('Accuracy reset');
  }

  function accuracyText() {
    const total = accCorrect + accMistakes;
    return total ? Math.round((accCorrect / total) * 100) + '%' : '—';
  }

  // ---------------- Typing ----------------
  function targetWordLen() {
    return START_WORD_LEN + Math.floor(wordsCompleted / WORDS_PER_EXTRA_LETTER);
  }

  const MIN_CHOICES = 8; // never drill the same handful of words

  // Words at the current target length, plus one letter shorter for a gentle
  // mix. When the player's letters can only spell a few words that long, the
  // range widens downward so there's always some variety.
  function currentCandidates() {
    const longestAvailable = Math.max(...wordPool.map((w) => w.length));
    const maxLen = Math.min(targetWordLen(), longestAvailable);
    let minLen = maxLen - 1;
    let picks = wordPool.filter((w) => w.length <= maxLen && w.length >= minLen);
    while (picks.length < MIN_CHOICES && minLen > 2) {
      minLen--;
      picks = wordPool.filter((w) => w.length <= maxLen && w.length >= minLen);
    }
    return picks.length ? picks : wordPool;
  }

  function pickWord() {
    const picks = currentCandidates();
    if (picks.length === 1) return picks[0];
    let w;
    do { w = picks[Math.floor(Math.random() * picks.length)]; } while (w === lastWord);
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
    promptEl.innerHTML = `<span class="typed">${upper.slice(0, typedIndex)}</span><span class="remaining">${upper.slice(typedIndex)}</span>`;
  }

  function flashPromptError() {
    promptEl.classList.remove('garden-shake');
    requestAnimationFrame(() => promptEl.classList.add('garden-shake'));
  }

  function handleKey(rawKey) {
    if (!running || celebrating) return;
    const key = rawKey.length === 1 ? rawKey.toLowerCase() : rawKey;
    if (!/^[a-z]$/.test(key)) return;

    if (key === currentWord[typedIndex]) {
      typedIndex++;
      accCorrect++;
      consecutiveMistakes = 0;
      if (SFX) SFX.click();
      renderPrompt();
      if (typedIndex >= currentWord.length) completeWord();
      updateHud();
    } else {
      registerMistake();
    }
  }

  function completeWord() {
    const lenBefore = targetWordLen();
    wordsCompleted++;
    const longerWords = targetWordLen() > lenBefore &&
      wordPool.some((w) => w.length === targetWordLen());
    if (plantedCount < plantOrder.length) {
      const tileIdx = plantOrder[plantedCount];
      plantedCount++;
      renderSoil(tileIdx);
    }
    if (plantedCount >= plantOrder.length) {
      lapsCompleted++;
      const newIndex = lapsCompleted - 1;
      renderLandmarks(newIndex);
      if (SFX) SFX.landmark();
      showFullBloomBanner(rewardFor(newIndex));
      celebrating = true;
      promptEl.innerHTML = '<span class="prompt-rest">Well done</span>';
      newRoundTimer = setTimeout(() => {
        celebrating = false;
        startNewRound();
        nextWord();
      }, 2600);
      updateHud();
      return;
    } else {
      if (SFX) SFX.wordComplete();
      if (longerWords) showToast(`Your words are growing — now up to ${targetWordLen()} letters`);
    }
    nextWord();
    updateHud();
  }

  function startNewRound() {
    plantedCount = 0;
    plantOrder = roundOrder();
    renderSoil(-1);
    updateHud();
  }

  function registerMistake() {
    totalMistakes++;
    accMistakes++;
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
    if (plantedCount <= 0 || plantedCount >= plantOrder.length) return;
    if (SFX) SFX.wither();
    const tile = soilTiles[plantOrder[plantedCount - 1]];
    const plant = tile.objEl.querySelector('.plant');
    plantedCount--;
    if (plant) {
      plant.classList.add('wilting');
      setTimeout(() => renderSoil(-1), 450);
    } else {
      renderSoil(-1);
    }
  }

  function rewardMessage(slot) {
    const { name } = slot.lm;
    if (slot.outside && slot.outside.kind === 'sky') return `A ${name} now drifts above your garden.`;
    if (slot.outside) return `A ${name} has appeared just beyond your garden.`;
    if (slot.size === 'big') return `A ${name} now stands on a stone plinth.`;
    if (slot.tile) return `A ${name} has been added to your garden.`;
    return 'Your garden is complete — every spot is filled.';
  }

  function showFullBloomBanner(slot) {
    if (SFX) SFX.bloomFull();
    clearTimeout(showToast.timer);
    bannerEl.innerHTML = `<b>Garden ${lapsCompleted} complete</b><br><span class="banner-sub">${rewardMessage(slot)}</span>`;
    bannerEl.classList.remove('hidden');
    bannerEl.classList.add('celebrate');
    setTimeout(() => {
      bannerEl.classList.add('hidden');
      bannerEl.classList.remove('celebrate');
    }, 3400);
  }

  // small non-celebration message in the banner spot
  function showToast(html) {
    bannerEl.innerHTML = html;
    bannerEl.classList.remove('hidden', 'celebrate');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => bannerEl.classList.add('hidden'), 2600);
  }

  // ---------------- HUD ----------------
  function fillPct() {
    return plantOrder.length ? (plantedCount / plantOrder.length) * 100 : 0;
  }

  function updateHud() {
    if (wordsEl) wordsEl.textContent = wordsCompleted;
    if (mistakesEl) mistakesEl.textContent = totalMistakes;
    if (accuracyEl) accuracyEl.textContent = accuracyText();
    if (meterFillEl) meterFillEl.style.width = fillPct() + '%';
    if (meterTextEl) meterTextEl.textContent = Math.round(fillPct()) + '%';
    if (hudCallbacks.onUpdate) {
      hudCallbacks.onUpdate({ plantedCount, wordsCompleted, totalMistakes, lapsCompleted, accCorrect, accMistakes });
    }
  }

  return { init, start, stop, reset, resetAccuracy, handleKey };
})();
