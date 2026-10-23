/* fingerMap.js
 * Maps every letter (+ semicolon) to the hand/finger that should type it,
 * plus helpers to draw a simple two-hand SVG diagram with one finger lit up.
 */

const FINGER_MAP = {
  // left hand
  q: { hand: 'left', finger: 'pinky', row: 'top' },
  a: { hand: 'left', finger: 'pinky', row: 'home' },
  z: { hand: 'left', finger: 'pinky', row: 'bottom' },

  w: { hand: 'left', finger: 'ring', row: 'top' },
  s: { hand: 'left', finger: 'ring', row: 'home' },
  x: { hand: 'left', finger: 'ring', row: 'bottom' },

  e: { hand: 'left', finger: 'middle', row: 'top' },
  d: { hand: 'left', finger: 'middle', row: 'home' },
  c: { hand: 'left', finger: 'middle', row: 'bottom' },

  r: { hand: 'left', finger: 'index', row: 'top' },
  f: { hand: 'left', finger: 'index', row: 'home' },
  v: { hand: 'left', finger: 'index', row: 'bottom' },
  t: { hand: 'left', finger: 'index', row: 'top' },
  g: { hand: 'left', finger: 'index', row: 'home' },
  b: { hand: 'left', finger: 'index', row: 'bottom' },

  // right hand
  y: { hand: 'right', finger: 'index', row: 'top' },
  h: { hand: 'right', finger: 'index', row: 'home' },
  n: { hand: 'right', finger: 'index', row: 'bottom' },
  u: { hand: 'right', finger: 'index', row: 'top' },
  j: { hand: 'right', finger: 'index', row: 'home' },
  m: { hand: 'right', finger: 'index', row: 'bottom' },

  i: { hand: 'right', finger: 'middle', row: 'top' },
  k: { hand: 'right', finger: 'middle', row: 'home' },

  o: { hand: 'right', finger: 'ring', row: 'top' },
  l: { hand: 'right', finger: 'ring', row: 'home' },

  p: { hand: 'right', finger: 'pinky', row: 'top' },
  ';': { hand: 'right', finger: 'pinky', row: 'home' },
};

const FINGER_NAMES = {
  pinky: 'Pinky',
  ring: 'Ring Finger',
  middle: 'Middle Finger',
  index: 'Pointer Finger',
};

const FINGER_COLORS = {
  pinky: '#b06cf0',
  ring: '#5aa7ff',
  middle: '#4ed08f',
  index: '#ffb347',
};

const KEY_LABEL = { ';': ';' };
function labelFor(key) {
  return KEY_LABEL[key] || key.toUpperCase();
}

/**
 * Builds an SVG string of two simple top-down hands resting on the home row,
 * with the correct hand+finger glowing for the given key.
 */
function buildHandDiagram(key) {
  const info = FINGER_MAP[key.toLowerCase()];
  const activeHand = info ? info.hand : 'left';
  const activeFinger = info ? info.finger : 'index';
  const color = FINGER_COLORS[activeFinger];

  // finger order left-to-right as drawn, for each hand (mirrored)
  const leftFingers = ['pinky', 'ring', 'middle', 'index'];
  const rightFingers = ['index', 'middle', 'ring', 'pinky'];

  function fingerRect(x, hand, finger, lengthBoost) {
    const active = hand === activeHand && finger === activeFinger;
    const fill = active ? color : '#f3d9c4';
    const stroke = active ? color : '#d9b592';
    const h = 68 + lengthBoost;
    const y = 118 - h;
    const glow = active ? `filter="url(#glow)"` : '';
    return `<rect x="${x}" y="${y}" width="26" height="${h}" rx="13"
              fill="${fill}" stroke="${stroke}" stroke-width="2" ${glow}>
              ${active ? '<animate attributeName="y" values="' + y + ';' + (y - 6) + ';' + y + '" dur="0.9s" repeatCount="indefinite" />' : ''}
            </rect>`;
  }

  // length boosts so middle finger is tallest, pinky shortest (both hands)
  const leftBoosts = { pinky: -14, ring: 4, middle: 14, index: 0 };
  const rightBoosts = { index: 0, middle: 14, ring: 4, pinky: -14 };

  let leftX = 20;
  const leftSvgFingers = leftFingers.map((f) => {
    const r = fingerRect(leftX, 'left', f, leftBoosts[f]);
    leftX += 30;
    return r;
  }).join('');

  let rightX = 20;
  const rightSvgFingers = rightFingers.map((f) => {
    const r = fingerRect(rightX, 'right', f, rightBoosts[f]);
    rightX += 30;
    return r;
  }).join('');

  const palmPath = (startX) =>
    `<path d="M ${startX} 118 Q ${startX - 10} 160 ${startX + 20} 172
              Q ${startX + 65} 182 ${startX + 110} 172
              Q ${startX + 140} 160 ${startX + 130} 118 Z"
          fill="#ffe3c7" stroke="#d9b592" stroke-width="2"/>`;

  const thumb = (startX, side) => {
    const dx = side === 'left' ? 125 : 5;
    return `<ellipse cx="${startX + dx}" cy="150" rx="13" ry="22"
               fill="#ffe3c7" stroke="#d9b592" stroke-width="2"
               transform="rotate(${side === 'left' ? 35 : -35} ${startX + dx} 150)"/>`;
  };

  const label = info
    ? `${info.hand === 'left' ? 'LEFT' : 'RIGHT'} ${FINGER_NAMES[info.finger].toUpperCase()}`
    : '';

  return `
  <svg viewBox="0 0 320 220" class="hand-diagram" role="img" aria-label="${label} types ${labelFor(key)}">
    <defs>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <g transform="translate(0,0)">
      ${palmPath(0)}
      ${thumb(0, 'left')}
      ${leftSvgFingers}
    </g>
    <g transform="translate(170,0)">
      ${palmPath(0)}
      ${thumb(0, 'right')}
      ${rightSvgFingers}
    </g>
    <rect x="130" y="196" width="60" height="18" rx="4" fill="${color}" opacity="0.25"/>
    <text x="160" y="209" text-anchor="middle" font-size="13" font-weight="700" fill="${color}">${labelFor(key)}</text>
  </svg>`;
}

function handFingerLabel(key) {
  const info = FINGER_MAP[key.toLowerCase()];
  if (!info) return '';
  return `${info.hand === 'left' ? 'Left' : 'Right'} ${FINGER_NAMES[info.finger]}`;
}
