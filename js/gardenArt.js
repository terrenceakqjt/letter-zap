/* gardenArt.js — hand-built SVG art for Garden Mode, in a soft low-poly
 * style with a muted palette (no emoji). Every drawing is an SVG string with
 * its ground point at (0, 0) — the spot where it touches the tile — plus a
 * soft contact shadow, so garden.js can stand it on any tile.
 *
 * Shapes are built from a few isometric primitives (box, cylinder, faceted
 * cone, faceted "gem" for foliage and clouds). Light comes from the upper
 * left, so left faces are lighter than right faces throughout.
 */

const GardenArt = (() => {
  // ---------------- helpers ----------------
  const r1 = (n) => Math.round(n * 10) / 10;
  const pts = (arr) => arr.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ');
  const poly = (arr, fill) => `<polygon points="${pts(arr)}" fill="${fill}"/>`;

  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ch = (sh) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

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

  // viewBox spans x in [-w/2, w/2] and y in [-top, 12]; ground is y = 0
  function wrap(body, w, top, shadow) {
    return `<svg viewBox="${-w / 2} ${-top} ${w} ${top + 12}" width="${w}" height="${top + 12}" aria-hidden="true">` +
      (shadow ? `<ellipse cx="0" cy="1" rx="${shadow}" ry="${r1(shadow * 0.34)}" fill="rgba(52,40,28,0.15)"/>` : '') +
      body + '</svg>';
  }

  // Isometric box: footprint centred at (cx, cy) on its base, extent U along
  // the right-going axis and V along the left-going axis, height h.
  // c = [top, left, right] colours.
  function box(cx, cy, U, V, h, c) {
    const L = [cx - U / 2 - V / 2, cy + U / 4 - V / 4];
    const R = [cx + U / 2 + V / 2, cy - U / 4 + V / 4];
    const F = [cx - U / 2 + V / 2, cy + U / 4 + V / 4];
    const B = [cx + U / 2 - V / 2, cy - U / 4 - V / 4];
    const up = ([x, y]) => [x, y - h];
    return poly([L, F, up(F), up(L)], c[1]) + poly([F, R, up(R), up(F)], c[2]) +
      poly([up(L), up(F), up(R), up(B)], c[0]);
  }

  // Upright cylinder with base ellipse centred at (cx, cy).
  function cyl(cx, cy, rx, h, c) {
    const ry = rx / 2;
    const left = `M${r1(cx)},${r1(cy + ry)} A${rx},${ry} 0 0 1 ${r1(cx - rx)},${r1(cy)} L${r1(cx - rx)},${r1(cy - h)} L${r1(cx)},${r1(cy - h)} Z`;
    const right = `M${r1(cx)},${r1(cy + ry)} A${rx},${ry} 0 0 0 ${r1(cx + rx)},${r1(cy)} L${r1(cx + rx)},${r1(cy - h)} L${r1(cx)},${r1(cy - h)} Z`;
    return `<path d="${left}" fill="${c[1]}"/><path d="${right}" fill="${c[2]}"/>` +
      `<ellipse cx="${r1(cx)}" cy="${r1(cy - h)}" rx="${rx}" ry="${r1(ry)}" fill="${c[0]}"/>`;
  }

  // Faceted cone (conifer tiers, roofs): n visible facets shaded light → dark.
  function cone(cx, cy, r, h, light, dark, n = 4) {
    const apex = [cx, cy - h];
    let s = '';
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI - (i / n) * Math.PI;
      const a1 = Math.PI - ((i + 1) / n) * Math.PI;
      const p0 = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r / 2];
      const p1 = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r / 2];
      s += poly([apex, p0, p1], mix(light, dark, n === 1 ? 0 : i / (n - 1)));
    }
    return s;
  }

  // Faceted blob for tree canopies and clouds: a fan of triangles around an
  // off-centre point, each shaded by which way it faces the light.
  function gem(cx, cy, r, light, dark, seed = 1, n = 8, squash = 0.92) {
    const rand = rng(seed);
    const centre = [cx - r * 0.22, cy - r * 0.28 * squash];
    const outer = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.35;
      const rr = r * (0.86 + rand() * 0.16);
      outer.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * squash]);
    }
    let s = '';
    for (let i = 0; i < n; i++) {
      const p = outer[i];
      const q = outer[(i + 1) % n];
      const mid = Math.atan2((p[1] + q[1]) / 2 - cy, (p[0] + q[0]) / 2 - cx);
      const t = (1 - Math.cos(mid + 2.36)) / 2; // 0 when facing the upper-left light
      s += poly([centre, p, q], mix(light, dark, t));
    }
    return s;
  }

  // a quad on a box's left face, for windows: fractions along the bottom edge, heights above base
  function leftFaceQuad(cx, cy, U, V, t0, t1, h0, h1, fill) {
    const L = [cx - U / 2 - V / 2, cy + U / 4 - V / 4];
    const F = [cx - U / 2 + V / 2, cy + U / 4 + V / 4];
    const at = (t, h) => [L[0] + (F[0] - L[0]) * t, L[1] + (F[1] - L[1]) * t - h];
    return poly([at(t0, h0), at(t1, h0), at(t1, h1), at(t0, h1)], fill);
  }

  // ---------------- palette ----------------
  const STONE = ['#ddd6ca', '#c7bfb1', '#aca496'];
  const STONE_DARK = ['#b3ab9e', '#9c9488', '#857e73'];
  const WOOD = ['#b08b65', '#96724f', '#7b5c3f'];
  const ROOF_L = '#77706a';
  const ROOF_D = '#4b4642';
  const PLASTER = ['#eee8dd', '#d9d0c2', '#c1b7a7'];
  const VERM = ['#c46a52', '#a95440', '#8d4535'];
  const WATER = '#a7c3c4';
  const WATER_DEEP = '#86a5a7';
  const STEM = '#6b7c4f';
  const LEAF = '#83955f';
  const FOLIAGE = ['#b2bf85', '#5e6f48'];
  const CONIFER = ['#8c9c68', '#4b5c3c'];

  // ---------------- small pieces ----------------
  function conifer(cx, cy, s, seed = 1) {
    const rand = rng(seed);
    const lean = (rand() - 0.5) * 2;
    return box(cx, cy, 4 * s, 4 * s, 8 * s, WOOD) +
      cone(cx, cy - 6 * s, 17 * s, 26 * s, CONIFER[0], CONIFER[1]) +
      cone(cx + lean * 0.4, cy - 19 * s, 13 * s, 22 * s, CONIFER[0], CONIFER[1]) +
      cone(cx + lean * 0.8, cy - 31 * s, 9 * s, 18 * s, CONIFER[0], CONIFER[1]);
  }

  function rockShape(cx, cy, s, seed = 1) {
    const rand = rng(seed);
    const j = () => (rand() - 0.5) * 3 * s;
    const p = [
      [cx - 14 * s, cy], [cx - 10 * s + j(), cy - 9 * s], [cx - 2 * s + j(), cy - 14 * s],
      [cx + 9 * s + j(), cy - 10 * s], [cx + 14 * s, cy - 1 * s], [cx + 5 * s, cy + 4 * s], [cx - 7 * s, cy + 3 * s],
    ];
    const c = [cx - 2 * s, cy - 6 * s];
    return poly([c, p[0], p[1]], '#b9b2a7') + poly([c, p[1], p[2]], '#cdc6bb') + poly([c, p[2], p[3]], '#c2bbb0') +
      poly([c, p[3], p[4]], '#a19a8f') + poly([c, p[4], p[5]], '#8d877d') + poly([c, p[5], p[6]], '#99938a') +
      poly([c, p[6], p[0]], '#aaa398');
  }

  function canopyTree(light, dark, seed) {
    return box(0, 0, 7, 7, 40, WOOD) +
      gem(-17, -46, 17, light, dark, seed + 1, 7) +
      gem(19, -50, 19, light, dark, seed + 2, 7) +
      gem(0, -64, 31, light, dark, seed, 9);
  }

  // ---------------- flowers ----------------
  const FLOWER_KINDS = ['tulip', 'lavender', 'daisy', 'poppy', 'allium', 'cosmos'];

  function petalRing(hx, hy, n, len, wid, fill) {
    let s = '';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 360;
      s += `<ellipse cx="${r1(hx)}" cy="${r1(hy - len / 2)}" rx="${wid}" ry="${r1(len / 2)}" fill="${fill}" transform="rotate(${r1(a)} ${r1(hx)} ${r1(hy)})"/>`;
    }
    return s;
  }

  function flower(kind, seed) {
    const rand = rng(seed * 97 + 13);
    const stems = kind === 'allium' ? 1 : 2 + Math.floor(rand() * 2);
    let body = '';
    // a couple of leaves at the base
    body += `<path d="M-1,0 q-9,-5 -13,-14 q9,3 13,14 z" fill="${LEAF}"/>`;
    body += `<path d="M1,0 q9,-4 12,-12 q-8,2 -12,12 z" fill="${mix(LEAF, '#4f5e3a', 0.3)}"/>`;
    for (let i = 0; i < stems; i++) {
      const x0 = (i - (stems - 1) / 2) * 5;
      const h = (kind === 'allium' ? 44 : 26) + rand() * 12;
      const hx = x0 + (rand() - 0.5) * 10;
      const hy = -h;
      body += `<path d="M${r1(x0)},0 Q${r1(x0 + (hx - x0) * 0.2)},${r1(hy * 0.5)} ${r1(hx)},${r1(hy)}" stroke="${STEM}" stroke-width="1.6" fill="none"/>`;
      if (kind === 'tulip') {
        const c = ['#c9737c', '#d98f74', '#e0b4a6'][Math.floor(rand() * 3)];
        body += `<path d="M${r1(hx - 5)},${r1(hy)} q0,-9 5,-11 q5,2 5,11 q-5,3 -10,0 z" fill="${c}"/>`;
        body += `<path d="M${r1(hx - 1.5)},${r1(hy - 1)} q1,-7 3,-9 q1,5 0,9 z" fill="${mix(c.replace('#', '#'), '#ffffff', 0.25)}"/>`;
      } else if (kind === 'daisy' || kind === 'cosmos') {
        const petal = kind === 'daisy' ? '#f2eee5' : ['#e4aebb', '#d993a5'][Math.floor(rand() * 2)];
        body += petalRing(hx, hy, 8, 6, 1.9, petal);
        body += `<circle cx="${r1(hx)}" cy="${r1(hy)}" r="2.2" fill="${kind === 'daisy' ? '#d2a64a' : '#c39a45'}"/>`;
      } else if (kind === 'poppy') {
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          body += `<circle cx="${r1(hx + Math.cos(a) * 3)}" cy="${r1(hy + Math.sin(a) * 3)}" r="3.6" fill="${k % 2 ? '#d87b55' : '#c86a49'}"/>`;
        }
        body += `<circle cx="${r1(hx)}" cy="${r1(hy)}" r="1.6" fill="#3e342d"/>`;
      } else if (kind === 'lavender') {
        for (let k = 0; k < 6; k++) {
          body += `<ellipse cx="${r1(hx + (k % 2 ? 1 : -1))}" cy="${r1(hy + k * 2.4)}" rx="1.9" ry="1.5" fill="${k % 2 ? '#9a8cc1' : '#8575b0'}"/>`;
        }
      } else if (kind === 'allium') {
        for (let k = 0; k < 11; k++) {
          const a = rand() * Math.PI * 2;
          const rr = rand() * 5;
          body += `<circle cx="${r1(hx + Math.cos(a) * rr)}" cy="${r1(hy + Math.sin(a) * rr)}" r="1.9" fill="${mix('#b39bd0', '#8670ab', rand())}"/>`;
        }
      }
    }
    return wrap(body, 56, 62, 11);
  }

  // ---------------- landmarks (grid) ----------------
  const ART = {
    fountain() {
      let s = cyl(0, 0, 36, 10, STONE);
      s += `<ellipse cx="0" cy="-10" rx="31" ry="15.5" fill="${WATER}"/>`;
      s += `<ellipse cx="0" cy="-10" rx="22" ry="11" fill="none" stroke="#c9dcdb" stroke-width="1" opacity="0.7"/>`;
      s += cyl(0, -10, 6, 24, STONE);
      s += cyl(0, -34, 18, 6, STONE);
      s += `<ellipse cx="0" cy="-40" rx="15" ry="7.5" fill="${WATER}"/>`;
      s += cyl(0, -40, 3, 9, STONE) + `<circle cx="0" cy="-51" r="3.2" fill="${STONE[0]}"/>`;
      s += '<g stroke="#eef4f3" stroke-width="1.4" fill="none" opacity="0.85">' +
        '<path d="M0,-52 Q-8,-58 -13,-41"/><path d="M0,-52 Q8,-58 13,-41"/>' +
        '<path d="M-16,-37 Q-24,-34 -26,-15"/><path d="M16,-37 Q24,-34 26,-15"/></g>';
      return wrap(s, 112, 72, 34);
    },
    oak() { return wrap(canopyTree(FOLIAGE[0], FOLIAGE[1], 3), 120, 104, 24); },
    maple() { return wrap(canopyTree('#dc9a63', '#9a4e31', 7), 120, 104, 24); },
    cherry() { return wrap(canopyTree('#efd0d1', '#bd8a91', 11), 120, 104, 24); },
    lantern() {
      let s = box(0, 0, 20, 20, 7, STONE);
      s += cyl(0, -7, 5, 22, STONE);
      s += box(0, -29, 18, 18, 4, STONE);
      s += box(0, -33, 13, 13, 14, STONE);
      s += leftFaceQuad(0, -33, 13, 13, 0.3, 0.7, 3, 11, '#efd9a2');
      s += cone(0, -46, 23, 13, ROOF_L, ROOF_D, 4);
      s += `<circle cx="0" cy="-60" r="3" fill="${STONE_DARK[0]}"/>`;
      return wrap(s, 80, 68, 20);
    },
    torii() {
      let s = '';
      s += box(-24, 0, 7, 7, 4, STONE_DARK) + box(24, 0, 7, 7, 4, STONE_DARK);
      s += box(-24, -4, 5, 5, 60, VERM) + box(24, -4, 5, 5, 60, VERM);
      s += `<rect x="-35" y="-49" width="70" height="4.5" fill="${VERM[1]}"/>`;
      s += `<rect x="-2.5" y="-60" width="5" height="11" fill="${VERM[2]}"/>`;
      s += `<path d="M-37,-64 L37,-64 L35,-59 L-35,-59 Z" fill="${VERM[0]}"/>`;
      s += '<path d="M-45,-70 Q0,-63 45,-70 L41,-64 Q0,-58 -41,-64 Z" fill="#433a36"/>';
      return wrap(s, 100, 78, 32);
    },
    pagoda() {
      let s = '';
      let y = 0;
      [[24, 15], [18, 12], [13, 10]].forEach(([w, h]) => {
        s += box(0, y, w, w, h, PLASTER);
        s += leftFaceQuad(0, y, w, w, 0.35, 0.65, 2, h - 4, '#6f5f50');
        y -= h;
        s += cone(0, y + 3, w + 11, 10, ROOF_L, ROOF_D, 4);
        y -= 4;
      });
      s += `<line x1="0" y1="${y + 2}" x2="0" y2="${y - 14}" stroke="${ROOF_D}" stroke-width="1.6"/>`;
      s += `<circle cx="0" cy="${y - 15}" r="2.2" fill="#b89a5e"/>`;
      return wrap(s, 96, 96, 28);
    },
    sundial() {
      let s = box(0, 0, 14, 14, 5, STONE) + box(0, -5, 9, 9, 22, STONE);
      s += cyl(0, -27, 18, 3, STONE);
      for (let k = 0; k < 7; k++) {
        const a = Math.PI + (k / 6) * Math.PI;
        s += `<line x1="${r1(Math.cos(a) * 12)}" y1="${r1(-30 + Math.sin(a) * 6)}" x2="${r1(Math.cos(a) * 15)}" y2="${r1(-30 + Math.sin(a) * 7.5)}" stroke="#8f887d" stroke-width="1"/>`;
      }
      s += '<polygon points="0,-30 11,-39 11,-30" fill="#8a7a5c"/>';
      return wrap(s, 70, 50, 18);
    },
    birdbath() {
      let s = box(0, 0, 14, 14, 5, STONE) + cyl(0, -5, 5, 24, STONE) + cyl(0, -29, 21, 5, STONE);
      s += `<ellipse cx="0" cy="-34" rx="17.5" ry="8.7" fill="${WATER}"/>`;
      s += '<path d="M8,-36 q3,-6 7,-5 l3,-2 l-1,3 q1,5 -5,5 z" fill="#6c625a"/>';
      return wrap(s, 70, 52, 18);
    },
    arbor() {
      let s = box(22, -11, 5, 5, 60, WOOD) + box(-22, 11, 5, 5, 60, WOOD);
      s += box(0, -60, 60, 5, 4, WOOD);
      for (let k = -2; k <= 2; k++) s += box(k * 11, -60 - k * 5.5 - 4, 4, 18, 3, WOOD);
      [[-22, -18, 10, 1], [-20, -40, 11, 2], [-23, -58, 9, 3], [22, -34, 11, 4], [19, -56, 10, 5], [0, -68, 12, 6], [-11, -66, 9, 7], [11, -70, 9, 8]]
        .forEach(([x, y, r, sd]) => { s += gem(x, y, r, FOLIAGE[0], FOLIAGE[1], sd, 6); });
      [[-17, -44], [-24, -60], [16, -60], [4, -72], [24, -38]].forEach(([x, y]) => {
        s += `<circle cx="${x}" cy="${y}" r="2.2" fill="#e2b8bf"/>`;
      });
      return wrap(s, 96, 90, 30);
    },
    well() {
      let s = '';
      s += box(-20, -6, 4, 4, 36, WOOD);
      s += cyl(0, 0, 22, 16, STONE);
      s += `<ellipse cx="0" cy="-16" rx="18" ry="9" fill="#3f4747"/><ellipse cx="2" cy="-14.5" rx="11" ry="5" fill="${WATER_DEEP}" opacity="0.7"/>`;
      s += box(20, -6, 4, 4, 36, WOOD);
      s += `<line x1="-19" y1="-36" x2="19" y2="-36" stroke="${WOOD[2]}" stroke-width="2.4"/>`;
      s += '<line x1="2" y1="-36" x2="2" y2="-25" stroke="#7b6b58" stroke-width="1"/>';
      s += box(2, -21, 6, 6, 5, WOOD);
      s += `<polygon points="-29,-39 0,-54 0,-48 -24,-36" fill="${ROOF_L}"/>`;
      s += `<polygon points="0,-54 29,-39 24,-36 0,-48" fill="${ROOF_D}"/>`;
      return wrap(s, 80, 64, 24);
    },
    bench() {
      const legC = [WOOD[1], WOOD[2], '#664a32'];
      let s = box(-17, 8, 4, 10, 12, legC) + box(17, -9, 4, 10, 12, legC);
      s += box(-4, -14, 48, 3, 15, WOOD);
      s += box(0, -12, 48, 12, 3, WOOD);
      return wrap(s, 80, 40, 26);
    },

    // ---------------- outside decorations ----------------
    pineGrove() {
      return wrap(conifer(14, -6, 1.0, 2) + conifer(-14, 2, 0.85, 5) + conifer(4, 10, 0.7, 9), 90, 90, 30);
    },
    rockGarden() {
      let s = '<g stroke="#c7bdac" stroke-width="1" fill="none">';
      for (let k = 1; k <= 3; k++) s += `<ellipse cx="-8" cy="2" rx="${10 + k * 6}" ry="${5 + k * 3}"/>`;
      s += '</g>';
      s += rockShape(-8, 2, 1.0, 3) + rockShape(16, -6, 0.6, 7) + rockShape(12, 10, 0.45, 11);
      return wrap(s, 90, 30, 0);
    },
    gazebo() {
      let s = cyl(0, 0, 27, 5, STONE);
      const post = (x, y) => box(x, y - 5, 3.5, 3.5, 30, ['#e8e1d5', '#d2c9ba', '#b9af9f']);
      s += post(0, -11) + post(-21, 0) + post(21, 0);
      s += cone(0, -33, 32, 19, ROOF_L, ROOF_D, 6);
      s += post(0, 11).replace(/^/, '');
      s += `<circle cx="0" cy="-53" r="2.4" fill="#b89a5e"/>`;
      return wrap(s, 90, 62, 30);
    },
    cherryTree() { return ART.cherry(); },
    lilyPads() {
      let s = '';
      [[-12, -2, 9], [10, 4, 7], [8, -8, 6], [-2, 9, 6]].forEach(([x, y, r], i) => {
        s += `<path d="M${x},${y} m${-r},0 a${r},${r / 2} 0 1,0 ${2 * r},0 a${r},${r / 2} 0 1,0 ${-2 * r},0 M${x},${y} l${r},-1 l0,2 z" fill="${i % 2 ? '#7f9a62' : '#8fa86f'}"/>`;
      });
      s += petalRing(-12, -5, 6, 5, 1.8, '#e7c3c8') + '<circle cx="-12" cy="-5" r="1.6" fill="#d8b25a"/>';
      return wrap(s, 70, 20, 0);
    },
    rowboat() {
      let s = '<polygon points="-24,-2 22,-8 18,1 -19,7" fill="#8f6c4c"/>';
      s += '<polygon points="-24,-2 22,-8 20,-10 -21,-5" fill="#b49270"/>';
      s += '<polygon points="-19,-4 17,-9 15,-6 -16,-1" fill="#6f5139"/>';
      s += '<line x1="-6" y1="-5" x2="-20" y2="8" stroke="#a88a6a" stroke-width="1.6"/>';
      s += '<ellipse cx="2" cy="6" rx="26" ry="4" fill="none" stroke="#d6e4e3" stroke-width="1" opacity="0.7"/>';
      return wrap(s, 70, 20, 0);
    },
    cloud() {
      const s = gem(-20, 2, 13, '#fbfaf8', '#d8dbdc', 4, 7, 0.7) + gem(20, 3, 12, '#fbfaf8', '#d8dbdc', 6, 7, 0.7) +
        gem(0, -4, 19, '#fdfdfc', '#dcdfe0', 2, 8, 0.75);
      return wrap(s, 80, 26, 0);
    },
    cloudSmall() {
      const s = gem(-10, 1, 10, '#fbfaf8', '#d8dbdc', 8, 7, 0.7) + gem(6, -2, 13, '#fdfdfc', '#dcdfe0', 12, 7, 0.75);
      return wrap(s, 56, 20, 0);
    },
    birds() {
      let s = '<g stroke="#5f5b55" stroke-width="1.5" fill="none" stroke-linecap="round">';
      [[-18, 4, 6], [-4, -6, 7], [10, 2, 5], [22, -8, 4.5]].forEach(([x, y, w]) => {
        s += `<path d="M${x - w},${y - w * 0.3} Q${x - w * 0.4},${y - w * 0.7} ${x},${y} Q${x + w * 0.4},${y - w * 0.7} ${x + w},${y - w * 0.3}"/>`;
      });
      return wrap(s + '</g>', 64, 20, 0);
    },
    skyLantern() {
      let s = '<circle cx="0" cy="-10" r="16" fill="#f3d9a6" opacity="0.28"/>';
      s += '<polygon points="-8,-20 8,-20 6,0 -6,0" fill="#e9c08a"/>';
      s += '<polygon points="0,-20 8,-20 6,0 0,0" fill="#d9a46d"/>';
      s += '<ellipse cx="0" cy="-1" rx="3" ry="1.5" fill="#f7e3a8"/>';
      return wrap(s, 40, 28, 0);
    },

    // ---------------- fixed decor ----------------
    conifer() { return wrap(conifer(0, 0, 1.05, 1), 60, 80, 16); },
    rock() { return wrap(rockShape(0, 0, 1.1, 2), 50, 22, 15); },
  };

  return { ART, flower, FLOWER_KINDS };
})();
