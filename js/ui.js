/* ui.js — screen navigation, tutorial content, level map, overlays, HUD wiring. */

const UI = (() => {
  let save = null;
  let currentStageIndex = 0;
  let tutStepIndex = 0;
  const TUT_STEP_COUNT = 4;

  const el = {}; // cached DOM refs, filled in init()

  function cache() {
    [
      'screen-home', 'screen-tutorial', 'screen-map', 'screen-game', 'screen-complete', 'screen-garden',
      'btn-start', 'btn-map', 'btn-tutorial', 'btn-garden', 'btn-sound-toggle',
      'tutorial-steps', 'tutorial-back', 'tutorial-next',
      'map-list', 'map-back',
      'hud-stage-title', 'hud-lives', 'hud-score', 'hud-accuracy', 'btn-pause', 'btn-skip', 'speed-slider',
      'gameArea', 'cannon', 'targetHint',
      'complete-title', 'complete-stars', 'complete-stats',
      'complete-retry', 'complete-next', 'complete-home',
      'overlay-keyintro', 'keyintro-heading', 'keyintro-diagrams', 'keyintro-text', 'keyintro-ready',
      'overlay-pause', 'pause-resume', 'pause-quit',
      'garden-back', 'garden-reset', 'gardenGrid', 'gardenPrompt', 'gardenBanner',
      'garden-meter-fill', 'garden-growth-text', 'garden-words', 'garden-mistakes',
    ].forEach((id) => { el[id] = document.getElementById(id); });
  }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    el[id].classList.add('active');
  }

  function playClick() { if (SFX) SFX.click(); }

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
    el['btn-skip'].style.display = index < STAGES.length - 1 ? 'inline-block' : 'none';
    Game.startStage(stage, index);
  }

  // ---------------- Garden Mode ----------------
  function enterGarden() {
    showScreen('screen-garden');
    const pool = wordPoolForProgress(save.unlockedStage);
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
      if (currentStageIndex === save.unlockedStage && currentStageIndex < STAGES.length - 1) {
        save.unlockedStage = currentStageIndex + 1;
      }
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

    const hasNext = currentStageIndex < STAGES.length - 1;
    el['complete-next'].style.display = passed && hasNext ? 'inline-block' : 'none';
    el['complete-next'].textContent = 'Next ➡';
    showScreen('screen-complete');
  }

  // ---------------- Wiring ----------------
  function wire() {
    el['btn-start'].addEventListener('click', () => {
      playClick();
      if (!save.seenTutorial) {
        save.seenTutorial = true;
        writeSave(save);
        renderTutorial();
        showScreen('screen-tutorial');
      } else {
        enterStage(save.unlockedStage);
      }
    });

    el['btn-map'].addEventListener('click', () => { playClick(); renderMap(); showScreen('screen-map'); });
    el['btn-tutorial'].addEventListener('click', () => { playClick(); renderTutorial(); showScreen('screen-tutorial'); });
    el['map-back'].addEventListener('click', () => { playClick(); showScreen('screen-home'); });

    el['btn-garden'].addEventListener('click', () => { playClick(); enterGarden(); });
    el['garden-back'].addEventListener('click', () => { playClick(); GardenGame.stop(); showScreen('screen-home'); });
    el['garden-reset'].addEventListener('click', () => { playClick(); GardenGame.reset(); });

    el['tutorial-back'].addEventListener('click', () => { playClick(); showTutStep(tutStepIndex - 1); });
    el['tutorial-next'].addEventListener('click', () => {
      playClick();
      if (tutStepIndex >= TUT_STEP_COUNT - 1) {
        enterStage(save.unlockedStage);
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
    el['btn-skip'].addEventListener('click', () => {
      playClick();
      Game.stop();
      if (currentStageIndex === save.unlockedStage && currentStageIndex < STAGES.length - 1) {
        save.unlockedStage = currentStageIndex + 1;
      }
      writeSave(save);
      enterStage(Math.min(currentStageIndex + 1, STAGES.length - 1));
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
    el['complete-next'].addEventListener('click', () => { playClick(); enterStage(currentStageIndex + 1); });
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
      gridEl: el['gardenGrid'],
      promptEl: el['gardenPrompt'],
      bannerEl: el['gardenBanner'],
      meterFillEl: el['garden-meter-fill'],
      meterTextEl: el['garden-growth-text'],
      wordsEl: el['garden-words'],
      mistakesEl: el['garden-mistakes'],
      hudCallbacks: { onUpdate: updateGardenHud },
    });
    wire();
    showScreen('screen-home');
  }

  return { init };
})();
