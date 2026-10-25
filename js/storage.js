/* storage.js — localStorage persistence of progress & settings. */

const STORAGE_KEY = 'fallingLettersSave_v1';

function defaultSave() {
  return {
    unlockedStage: 0,  // highest stage index the player may play
    stars: {},         // stageId -> 0..3
    best: {},          // stageId -> { accuracy, wpm }
    seenTutorial: false,
    track: 'new',      // skill track last chosen on the home screen
    settings: { sound: true, speed: 1 },
    garden: { plantedCount: 0, wordsCompleted: 0, totalMistakes: 0, lapsCompleted: 0, accCorrect: 0, accMistakes: 0 },
  };
}

function loadSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    const merged = Object.assign(defaultSave(), parsed);
    merged.settings = Object.assign(defaultSave().settings, parsed.settings);
    merged.garden = Object.assign(defaultSave().garden, parsed.garden);
    if (!TRACKS[merged.track]) merged.track = 'new';
    return merged;
  } catch (e) {
    return defaultSave();
  }
}

function writeSave(save) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch (e) {
    /* storage unavailable (e.g. private mode) — fail silently */
  }
}
