/* curriculum.js
 * Builds the full ordered list of STAGES the player progresses through:
 * home row letters -> home row words -> top row letters -> bigger words ->
 * bottom row letters -> full-alphabet words -> endless challenge.
 *
 * Each stage is one of:
 *   type: 'letters'  -> falling single letters drawn from practiceKeys
 *   type: 'words'    -> falling whole words drawn from wordPool
 *   type: 'endless'  -> free-play mixed words, speed keeps ramping, no gate
 *
 * newKeys on a stage = keys the player has never seen before this point;
 * the game shows a finger-diagram intro card for each before play starts.
 */

const STAGE_BLUEPRINT = [
  // ---- Home row, built up finger pair by finger pair ----
  { kind: 'letters', id: 'home-fj', title: 'Pointer Power', emoji: '👆', newKeys: ['f', 'j'] },
  { kind: 'letters', id: 'home-dk', title: 'Middle Mates', emoji: '🖕', newKeys: ['d', 'k'] },
  { kind: 'letters', id: 'home-sl', title: 'Ring Rings', emoji: '💍', newKeys: ['s', 'l'] },
  { kind: 'letters', id: 'home-pinky', title: 'Pinky Pals', emoji: '🤙', newKeys: ['a', ';'] },
  { kind: 'letters', id: 'home-gh', title: 'Stretchy Reach', emoji: '🙌', newKeys: ['g', 'h'] },
  { kind: 'review', id: 'home-mix', title: 'Home Row Mix-Up', emoji: '🏠' },

  // ---- Home row words ----
  { kind: 'words', id: 'words-home-2', title: 'Tiny Words', emoji: '🐣', minLen: 2, maxLen: 2 },
  { kind: 'words', id: 'words-home-3', title: 'Short Words', emoji: '🐥', minLen: 3, maxLen: 3 },
  { kind: 'words', id: 'words-home-4', title: 'Bigger Words', emoji: '🐤', minLen: 4, maxLen: 5 },

  // ---- Top row, mirrored finger pairs, common letters first ----
  { kind: 'letters', id: 'top-ei', title: 'Reach Up High: E & I', emoji: '☁️', newKeys: ['e', 'i'] },
  { kind: 'letters', id: 'top-ru', title: 'Reach Up High: R & U', emoji: '🌤️', newKeys: ['r', 'u'] },
  { kind: 'letters', id: 'top-ty', title: 'Reach Up High: T & Y', emoji: '🌥️', newKeys: ['t', 'y'] },
  { kind: 'letters', id: 'top-wo', title: 'Reach Up High: W & O', emoji: '⛅', newKeys: ['w', 'o'] },
  { kind: 'letters', id: 'top-qp', title: 'Reach Up High: Q & P', emoji: '🌈', newKeys: ['q', 'p'] },
  { kind: 'review', id: 'top-mix', title: 'Top Row Mix-Up', emoji: '🚀' },

  // ---- Home + top row words ----
  { kind: 'words', id: 'words-top-3', title: 'Word Climb', emoji: '🧗', minLen: 3, maxLen: 3 },
  { kind: 'words', id: 'words-top-4', title: 'Word Climb II', emoji: '🧗‍♀️', minLen: 4, maxLen: 4 },
  { kind: 'words', id: 'words-top-5', title: 'Word Climb III', emoji: '🧗‍♂️', minLen: 5, maxLen: 6 },

  // ---- Bottom row ----
  { kind: 'letters', id: 'bottom-nm', title: 'Down Low: N & M', emoji: '🌊', newKeys: ['n', 'm'] },
  { kind: 'letters', id: 'bottom-c', title: 'Down Low: C', emoji: '🐠', newKeys: ['c'] },
  { kind: 'letters', id: 'bottom-vb', title: 'Down Low: V & B', emoji: '🐬', newKeys: ['v', 'b'] },
  { kind: 'letters', id: 'bottom-x', title: 'Down Low: X', emoji: '🦑', newKeys: ['x'] },
  { kind: 'letters', id: 'bottom-z', title: 'Down Low: Z', emoji: '🐳', newKeys: ['z'] },
  { kind: 'review', id: 'full-mix', title: 'Whole Keyboard Mix-Up', emoji: '⌨️' },

  // ---- Full alphabet words, climbing length ----
  { kind: 'words', id: 'words-full-3', title: 'Word Rocket', emoji: '🚀', minLen: 3, maxLen: 3 },
  { kind: 'words', id: 'words-full-4', title: 'Word Rocket II', emoji: '🛰️', minLen: 4, maxLen: 4 },
  { kind: 'words', id: 'words-full-5', title: 'Word Rocket III', emoji: '🌕', minLen: 5, maxLen: 5 },
  { kind: 'words', id: 'words-full-6', title: 'Word Rocket IV', emoji: '🪐', minLen: 6, maxLen: 8 },

  // ---- Free play ----
  { kind: 'endless', id: 'endless', title: 'Endless Challenge', emoji: '🏆' },
];

const HOME_ROW_KEYS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'];
const TOP_ROW_KEYS = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
const BOTTOM_ROW_KEYS = ['z', 'x', 'c', 'v', 'b', 'n', 'm'];

function buildStages() {
  const stages = [];
  const unlocked = []; // cumulative letters learned, in teaching order

  for (const bp of STAGE_BLUEPRINT) {
    if (bp.kind === 'letters') {
      const brandNew = bp.newKeys.filter((k) => !unlocked.includes(k));
      brandNew.forEach((k) => unlocked.push(k));
      // practice mixes a little review in once we have more than the new keys
      const reviewPool = unlocked.filter((k) => !bp.newKeys.includes(k));
      stages.push({
        type: 'letters',
        id: bp.id,
        title: bp.title,
        emoji: bp.emoji,
        newKeys: bp.newKeys,
        practiceKeys: bp.newKeys,
        reviewKeys: reviewPool.slice(-6), // sprinkle in recent keys, not the whole history
        minReps: Math.max(16, bp.newKeys.length * 10),
        minAccuracy: 0.8,
        cumulativeLetters: unlocked.slice(),
      });
    } else if (bp.kind === 'review') {
      stages.push({
        type: 'letters',
        id: bp.id,
        title: bp.title,
        emoji: bp.emoji,
        newKeys: [],
        practiceKeys: unlocked.slice(),
        reviewKeys: [],
        minReps: Math.min(30, unlocked.length * 3),
        minAccuracy: 0.8,
        cumulativeLetters: unlocked.slice(),
      });
    } else if (bp.kind === 'words') {
      const pool = wordsFor(unlocked, bp.minLen, bp.maxLen);
      stages.push({
        type: 'words',
        id: bp.id,
        title: bp.title,
        emoji: bp.emoji,
        newKeys: [],
        wordPool: pool.length ? pool : wordsFor(unlocked, bp.minLen, bp.maxLen + 3),
        minReps: Math.min(14, Math.max(8, pool.length)),
        minAccuracy: 0.75,
        cumulativeLetters: unlocked.slice(),
      });
    } else if (bp.kind === 'endless') {
      const pool = wordsFor(unlocked, 3, 9);
      stages.push({
        type: 'endless',
        id: bp.id,
        title: bp.title,
        emoji: bp.emoji,
        newKeys: [],
        wordPool: pool,
        minReps: 0,
        minAccuracy: 0,
        cumulativeLetters: unlocked.slice(),
      });
    }
  }
  return stages;
}

const STAGES = buildStages();

/*
 * Skill tracks chosen on the home screen. Each is an ordered path of stage
 * ids through STAGES: brand-new typists get every stage, kids who've typed a
 * little skip the finger-by-finger letter intros, and speed-seekers jump
 * straight to full-alphabet words.
 */
const TRACKS = {
  new: {
    label: "I'm new to typing",
    emoji: '🐣',
    stageIds: STAGES.map((s) => s.id),
  },
  some: {
    label: "I've typed a little bit",
    emoji: '🐥',
    stageIds: [
      'home-mix', 'words-home-3', 'words-home-4',
      'top-mix', 'words-top-4', 'words-top-5',
      'full-mix', 'words-full-3', 'words-full-4', 'words-full-5', 'words-full-6',
      'endless',
    ],
  },
  fast: {
    label: 'I want to type faster',
    emoji: '🚀',
    stageIds: ['words-full-3', 'words-full-4', 'words-full-5', 'words-full-6', 'endless'],
  },
};

function stageIndexById(id) {
  return STAGES.findIndex((s) => s.id === id);
}

function trackStartIndex(trackId) {
  return stageIndexById(TRACKS[trackId].stageIds[0]);
}

/**
 * Next stage on a track after the given stage index. Works even when the
 * current stage isn't on the track (e.g. picked from the level map): it
 * returns the first track stage that comes later in the curriculum.
 * Returns -1 when there's nothing after it.
 */
function nextStageOnTrack(trackId, fromIndex) {
  const track = TRACKS[trackId] || TRACKS.new;
  for (const id of track.stageIds) {
    const idx = stageIndexById(id);
    if (idx > fromIndex) return idx;
  }
  return -1;
}

/**
 * Word pool matching whatever letters the player has unlocked by the given
 * stage index — used by modes (like the Garden) that want age/skill-
 * appropriate words without being tied to the stage-passing curriculum.
 * Covers every length; the Garden chooses which lengths to draw from.
 */
function wordPoolForProgress(stageIndex) {
  const idx = Math.max(0, Math.min(STAGES.length - 1, stageIndex));
  const letters = STAGES[idx].cumulativeLetters;
  if (!letters || letters.length === 0) return wordsFor(HOME_ROW_KEYS, 2, 12);
  return wordsFor(letters, 2, 12);
}
