/* ui.js — screen navigation, tutorial content, level map, overlays, HUD wiring. */

const UI = (() => {
  let save = null;
  let currentStageIndex = 0;
  let tutorialThenStage = 0; // stage to launch when the tutorial's last step is done
  let tutStepIndex = 0;
  const TUT_STEP_COUNT = 4;

  const el = {}; // cached DOM refs, filled in init()

  function cache() {
    [
      'screen-home', 'screen-tutorial', 'screen-map', 'screen-game', 'screen-complete', 'screen-garden',
      'track-buttons', 'garden-btn-sub', 'btn-map', 'btn-tutorial', 'btn-garden', 'btn-sound-toggle',
      'tutorial-steps', 'tutorial-back', 'tutorial-next',
      'map-list', 'map-back',
      'hud-stage-title', 'hud-lives', 'hud-score', 'hud-accuracy', 'btn-pause', 'btn-skip', 'speed-slider', 'game-back',
      'gameArea', 'cannon', 'targetHint',
      'complete-title', 'complete-stars', 'complete-stats',
      'complete-retry', 'complete-next', 'complete-home',
      'overlay-keyintro', 'keyintro-heading', 'keyintro-diagrams', 'keyintro-text', 'keyintro-ready',
      'overlay-pause', 'pause-resume', 'pause-quit',
      'garden-back', 'garden-reset', 'gardenArea', 'gardenBoard', 'gardenPrompt', 'gardenBanner',
      'garden-meter-fill', 'garden-growth-text', 'garden-words', 'garden-mistakes', 'garden-accuracy', 'garden-acc-reset',
    ].forEach((id) => { el[id] = document.getElementById(id); });
  }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    el[id].classList.add('active');
    if (id === 'screen-home') { renderTrackButtons(); renderGardenButton(); }
  }

  function playClick() { if (SFX) SFX.click(); }

  // ---------------- Skill tracks (home screen) ----------------
  const TRACK_BLURBS = {
    new: 'Learn each key, one finger at a time',
    some: 'Warm up each row, then type real words',
    fast: 'Jump right into fast word challenges',
  };

  // A track resumes at its first stage the player hasn't passed yet (passing
  // earns stars). Skipped stages stay unpassed, so skipping ahead doesn't
  // move the saved starting point. Endless never awards stars, so it's
  // reached once everything before it is passed.
  function trackResumeIndex(trackId) {
    const firstUnpassed = TRACKS[trackId].stageIds.find((id) => !save.stars[id]);
    return firstUnpassed ? stageIndexById(firstUnpassed) : trackStartIndex(trackId);
  }

  function renderTrackButtons() {
    el['track-buttons'].innerHTML = '';
    Object.entries(TRACKS).forEach(([trackId, track]) => {
      const resumeIdx = trackResumeIndex(trackId);
      const sub = resumeIdx !== trackStartIndex(trackId)
        ? `Keep going: ${STAGES[resumeIdx].emoji} ${STAGES[resumeIdx].title}`
        : TRACK_BLURBS[trackId];
      const btn = document.createElement('button');
      btn.className = `big-btn track-btn ${trackId}`;
      btn.innerHTML = `<span class="track-emoji">${track.emoji}</span>
        <span><span class="track-label">${track.label}</span><span class="track-sub">${sub}</span></span>`;
      btn.addEventListener('click', () => { playClick(); startTrack(trackId); });
      el['track-buttons'].appendChild(btn);
    });
  }

  // Garden button shows the player's garden so far once they've started one
  function renderGardenButton() {
    const g = save.garden;
    el['garden-btn-sub'].textContent = g.wordsCompleted > 0
      ? `Keep growing: ${g.lapsCompleted} garden${g.lapsCompleted === 1 ? '' : 's'} grown, ${g.wordsCompleted} words typed`
      : 'Grow a calm little garden, one word at a time';
  }

  function startTrack(trackId) {
    save.track = trackId;
    const idx = trackResumeIndex(trackId);
    save.unlockedStage = Math.max(save.unlockedStage, idx); // Garden words match the chosen level
    if (trackId === 'new' && !save.seenTutorial) {
      save.seenTutorial = true;
      writeSave(save);
      openTutorial(idx);
    } else {
      writeSave(save);
      enterStage(idx);
    }
  }

  // Moving on to the next stage widens the letters Garden Mode draws words from.
  function advanceTrack(fromIndex) {
    const next = nextStageOnTrack(save.track, fromIndex);
    if (next >= 0) save.unlockedStage = Math.max(save.unlockedStage, next);
  }

  function openTutorial(thenStage) {
    tutorialThenStage = thenStage;
    renderTutorial();
    showScreen('screen-tutorial');
  }

  // ---------------- Tutorial ----------------
  function keyboardHtml(highlightBumps) {
    return `<div class="tut-keyboard">${HOME_ROW_KEYS.map((k) => {
      const bump = highlightBumps && (k === 'f' || k === 'j');
      return `<div class="tut-key home${bump ? ' bump' : ''}">${k === ';' ? ';' : k.toUpperCase()}</div>`;
    }).join('')}</div>`;
  }

  function tutorialSteps() {
    return [
      `<div class="tut-step"><p>Look down at your keyboard! The row right in the middle is the <b>Home Row</b> — it's where your fingers live when you're not typing a key. 🏠</p>${keyboardHtml(false)}</div>`,
      `<div class="tut-step"><p>Feel for the little bumps on the <b>F</b> and <b>J</b> keys. Put your left pointer finger on <b>F</b> and your right pointer finger on <b>J</b>.</p>
        <div class="keyintro-diagrams">${buildHandDiagram('f')}${buildHandDiagram('j')}</div></div>`,
      `<div class="tut-step"><p>Now rest the rest of your fingers right beside them: <b>A S D F</b> for your left hand, and <b>J K L ;</b> for your right hand.</p>${keyboardHtml(true)}</div>`,
      `<div class="tut-step"><p>Perfect! Every time a new key shows up in the game, we'll show you exactly which finger to use — just like this. Now let's zap some letters! ⚡</p></div>`,
    ];
  }

  function renderTutorial() {
    el['tutorial-steps'].innerHTML = tutorialSteps().join('');
    showTutStep(0);
  }

  function showTutStep(i) {
    tutStepIndex = Math.max(0, Math.min(TUT_STEP_COUNT - 1, i));
    const steps = el['tutorial-steps'].querySelectorAll('.tut-step');
    steps.forEach((s, idx) => s.classList.toggle('active', idx === tutStepIndex));
    el['tutorial-back'].style.visibility = tutStepIndex === 0 ? 'hidden' : 'visible';
    el['tutorial-next'].textContent = tutStepIndex === TUT_STEP_COUNT - 1 ? "Let's Play! ⚡" : 'Next ➡';
  }

  // ---------------- Level map ----------------
  // Every stage is freely selectable here — there's no lock-and-grind gate.
  // Stars just show how well a stage has been played before; picking any
  // stage (played or not) jumps straight into it.
  function renderMap() {
    el['map-list'].innerHTML = '';
    STAGES.forEach((st, i) => {
      const stars = save.stars[st.id] || 0;
      const item = document.createElement('div');
      item.className = 'map-item';
      item.innerHTML = `<div class="map-emoji">${st.emoji}</div>
        <div class="map-title">${st.title}</div>
        <div class="map-stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>`;
      item.addEventListener('click', () => {
        playClick();
        save.unlockedStage = Math.max(save.unlockedStage, i);
        writeSave(save);
        enterStage(i);
      });
      el['map-list'].appendChild(item);
    });
  }

  // ---------------- Key intro overlay ----------------
  function showKeyIntro(stage, onReady) {
    const keys = stage.newKeys;
    el['keyintro-heading'].textContent = keys.length > 1 ? 'New Keys!' : 'New Key!';
    el['keyintro-diagrams'].innerHTML = keys.map((k) => `<div>${buildHandDiagram(k)}</div>`).join('');
    el['keyintro-text'].innerHTML = keys
      .map((k) => `Use your <b>${handFingerLabel(k)}</b> finger to press <b>${k === ';' ? ';' : k.toUpperCase()}</b>.`)
      .join('<br>');
    el['overlay-keyintro'].classList.remove('hidden');
    el['keyintro-ready'].onclick = () => {
      playClick();
      el['overlay-keyintro'].classList.add('hidden');
      onReady();
    };
  }

  // ---------------- Game flow ----------------
  function enterStage(index) {
    currentStageIndex = index;
    const stage = STAGES[index];
    el['hud-stage-title'].textContent = `${stage.emoji} ${stage.title}`;
    if (stage.newKeys && stage.newKeys.length > 0) {
      showKeyIntro(stage, () => launchStage(stage, index));
    } else {
      launchStage(stage, index);
    }
  }

  function launchStage(stage, index) {
    showScreen('screen-game');
    el['btn-skip'].style.display = nextStageOnTrack(save.track, index) >= 0 ? 'inline-block' : 'none';
    Game.startStage(stage, index);
  }

  // ---------------- Garden Mode ----------------
  function enterGarden() {
    showScreen('screen-garden');
    // Beginners who've started the lessons stick to the keys they know (plus a
    // few upcoming ones as they progress); everyone else gets every key.
    const lessonsPassed = Object.values(save.stars).filter((n) => n > 0).length;
    const isBeginner = save.track === 'new' && (save.seenTutorial || lessonsPassed > 0);
    const pool = gardenWordPool(isBeginner, save.unlockedStage, lessonsPassed);
    GardenGame.start(pool, save.garden);
  }

  function updateGardenHud(state) {
    save.garden = state;
    writeSave(save);
  }

  function updateHud({ stats, accuracy, lives, livesInfinite }) {
    el['hud-score'].textContent = `⭐ ${stats.zapped}`;
    el['hud-accuracy'].textContent = `🎯 ${accuracy}%`;
    if (livesInfinite) {
      el['hud-lives'].textContent = '💗 ∞';
    } else {
      el['hud-lives'].textContent = '❤️'.repeat(Math.max(0, lives)) + '🤍'.repeat(Math.max(0, 5 - lives));
    }
  }

  function starsFromAccuracy(acc) {
    if (acc >= 0.95) return 3;
    if (acc >= 0.85) return 2;
    return 1;
  }

  function onStageEnd(result) {
    const { stage, stats, accuracy, passed, failedOnLives } = result;
    const stars = passed ? starsFromAccuracy(accuracy) : 0;

    if (passed) {
      save.stars[stage.id] = Math.max(save.stars[stage.id] || 0, stars);
      advanceTrack(currentStageIndex);
      if (SFX) SFX.levelUp();
    }
    writeSave(save);

    el['complete-title'].textContent = passed
      ? '🎉 Great Job!'
      : failedOnLives
        ? '💪 Nice Try — Let\'s Go Again!'
        : '✨ Keep Practicing!';
    el['complete-stars'].textContent = passed ? '⭐'.repeat(stars) + '☆'.repeat(3 - stars) : '— — —';

    const neededPct = Math.round(stage.minAccuracy * 100);
    const gotPct = Math.round(accuracy * 100);
    let encouragement = '';
    if (!passed) {
      encouragement = failedOnLives
        ? `<p class="complete-msg">You need <b>${neededPct}%</b> accuracy to move on, and you ran out of hearts before finishing. Try zapping each letter as soon as it appears — you're closer than you think! 💪</p>`
        : `<p class="complete-msg">You need <b>${neededPct}%</b> accuracy to move on — you got <b>${gotPct}%</b>. So close! Give it one more try, you've got this! 🌟</p>`;
    }

    el['complete-stats'].innerHTML = `
      Zapped: ${stats.zapped} &nbsp;|&nbsp; Accuracy: ${gotPct}%<br>
      Best Combo: ${stats.comboBest} &nbsp;|&nbsp; Missed: ${stats.escapes}
      ${encouragement}`;

    const hasNext = nextStageOnTrack(save.track, currentStageIndex) >= 0;
    el['complete-next'].style.display = passed && hasNext ? 'inline-block' : 'none';
    el['complete-next'].textContent = 'Next ➡';
    showScreen('screen-complete');
  }

  // ---------------- Wiring ----------------
  function wire() {
    el['btn-map'].addEventListener('click', () => { playClick(); renderMap(); showScreen('screen-map'); });
    el['btn-tutorial'].addEventListener('click', () => { playClick(); openTutorial(trackResumeIndex(save.track)); });
    el['map-back'].addEventListener('click', () => { playClick(); showScreen('screen-home'); });

    el['btn-garden'].addEventListener('click', () => { playClick(); enterGarden(); });
    el['garden-back'].addEventListener('click', () => { playClick(); GardenGame.stop(); showScreen('screen-home'); });
    // blur after clicking so a later Space/Enter keypress can't re-trigger the button mid-typing
    el['garden-reset'].addEventListener('click', () => { playClick(); el['garden-reset'].blur(); GardenGame.reset(); });
    el['garden-acc-reset'].addEventListener('click', () => { playClick(); el['garden-acc-reset'].blur(); GardenGame.resetAccuracy(); });

    el['tutorial-back'].addEventListener('click', () => { playClick(); showTutStep(tutStepIndex - 1); });
    el['tutorial-next'].addEventListener('click', () => {
      playClick();
      if (tutStepIndex >= TUT_STEP_COUNT - 1) {
        enterStage(tutorialThenStage);
      } else {
        showTutStep(tutStepIndex + 1);
      }
    });

    el['btn-sound-toggle'].addEventListener('click', () => {
      const newState = !SFX.isEnabled();
      SFX.setEnabled(newState);
      el['btn-sound-toggle'].textContent = newState ? '🔊' : '🔇';
      if (newState) SFX.click();
    });

    el['speed-slider'].addEventListener('input', () => {
      const val = parseFloat(el['speed-slider'].value);
      Game.setSpeedMultiplier(val);
      save.settings.speed = val;
      writeSave(save);
    });

    el['btn-pause'].addEventListener('click', () => {
      Game.pause();
      el['overlay-pause'].classList.remove('hidden');
    });
    el['game-back'].addEventListener('click', () => {
      playClick();
      Game.stop();
      showScreen('screen-home');
    });
    el['btn-skip'].addEventListener('click', () => {
      playClick();
      Game.stop();
      const next = nextStageOnTrack(save.track, currentStageIndex);
      if (next < 0) return;
      advanceTrack(currentStageIndex);
      writeSave(save);
      enterStage(next);
    });
    el['pause-resume'].addEventListener('click', () => {
      playClick();
      el['overlay-pause'].classList.add('hidden');
      Game.resume();
    });
    el['pause-quit'].addEventListener('click', () => {
      playClick();
      Game.stop();
      el['overlay-pause'].classList.add('hidden');
      showScreen('screen-home');
    });

    el['complete-retry'].addEventListener('click', () => { playClick(); enterStage(currentStageIndex); });
    el['complete-next'].addEventListener('click', () => {
      playClick();
      const next = nextStageOnTrack(save.track, currentStageIndex);
      if (next >= 0) enterStage(next);
    });
    el['complete-home'].addEventListener('click', () => { playClick(); showScreen('screen-home'); });

    document.addEventListener('keydown', (e) => {
      const gameActive = el['screen-game'].classList.contains('active');
      const gardenActive = el['screen-garden'].classList.contains('active');
      if (!gameActive && !gardenActive) return;
      if (gameActive) {
        if (!el['overlay-keyintro'].classList.contains('hidden')) return;
        if (!el['overlay-pause'].classList.contains('hidden')) return;
      }
      if (e.repeat) return;
      if (e.key.length === 1) e.preventDefault();
      if (gameActive) {
        Game.handleKey(e.key);
      } else {
        GardenGame.handleKey(e.key);
      }
    });
  }

  function init() {
    cache();
    save = loadSave();
    el['btn-sound-toggle'].textContent = SFX.isEnabled() ? '🔊' : '🔇';
    el['speed-slider'].value = save.settings.speed;
    Game.init({
      gameAreaEl: el['gameArea'],
      cannonEl: el['cannon'],
      hintEl: el['targetHint'],
      hudCallbacks: { onUpdate: updateHud },
      onStageEnd,
    });
    Game.setSpeedMultiplier(save.settings.speed);
    GardenGame.init({
      areaEl: el['gardenArea'],
      boardEl: el['gardenBoard'],
      promptEl: el['gardenPrompt'],
      bannerEl: el['gardenBanner'],
      meterFillEl: el['garden-meter-fill'],
      meterTextEl: el['garden-growth-text'],
      wordsEl: el['garden-words'],
      mistakesEl: el['garden-mistakes'],
      accuracyEl: el['garden-accuracy'],
      hudCallbacks: { onUpdate: updateGardenHud },
    });
    wire();
    showScreen('screen-home');
  }

  return { init };
})();
