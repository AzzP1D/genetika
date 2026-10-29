import * as THREE from 'three';
import { bio, PALETTE, BASE_COLORS as COLORS, letterSprite, textSprite } from './style.js';

// Репликационная вилка. Хеликаза расплетает ДНК, ученик достраивает начало
// ведущей цепи, затем показывается, почему отстающая цепь собирается
// из фрагментов Оказаки, и как лигаза их сшивает.
//
// Левая матрица идёт 3'→5' сверху вниз, правая — 5'→3'. Вилка движется вниз.
// Новая цепь растёт только 5'→3': слева — вниз (вслед за вилкой, ведущая),
// справа — вверх (против движения вилки, отстающая).

const COMP = { 'А': 'Т', 'Т': 'А', 'Г': 'Ц', 'Ц': 'Г' };
const RNA_COMP = { 'А': 'У', 'Т': 'А', 'Г': 'Ц', 'Ц': 'Г' };
const TEMPLATE = 'АТГЦЦАТГАТЦГГАТЦАТГЦАТ' + 'ТАЦГГАТЦЦАГТАЦГАТТГЦАГ';
const N = TEMPLATE.length;
const RISE = 0.34, TWIST = Math.PI * 2 / 10.5, R = 1.0, PHI = 2.35;
const OPEN_X = 1.75, BASE_LEN = 0.45, NEW_X = OPEN_X - 2 * BASE_LEN - 0.05;
const PRIMER = 3;                // длина РНК-праймера
const SLOTS = 6;                 // сколько нуклеотидов ведущей цепи ставит ученик
const LAG_SLOTS = 3;             // и сколько — в каждом фрагменте Оказаки
const FIRST_OPEN = 14;           // сколько пар расплетает хеликаза в начале
const FRAGMENTS = [[0, 13], [14, 26], [27, 39]];   // фрагменты Оказаки: [верх, низ]; праймер — внизу

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const yOf = i => (N - 1) / 2 * RISE - i * RISE;
const ease = x => x * x * (3 - 2 * x);
const easeOut = x => 1 - Math.pow(1 - x, 3);

function setCyl(mesh, i, a, b, r) {
  _v.subVectors(b, a);
  const len = _v.length();
  if (len < 1e-4) { mesh.setMatrixAt(i, HIDDEN); return; }
  _q.setFromUnitVectors(UP, _v.divideScalar(len));
  _m.compose(_s.addVectors(a, b).multiplyScalar(0.5), _q, new THREE.Vector3(r, len, r));
  mesh.setMatrixAt(i, _m);
}
function setSph(mesh, i, p, r) {
  _m.compose(p, _q.identity(), _s.set(r, r, r));
  mesh.setMatrixAt(i, _m);
}

// ---------- лента цепи ДНК ----------
// Цепь — плоская лента (как в учебниках): сечение-эллипс шириной RW и толщиной RT,
// проведённое по сглаженной кривой через все нуклеотиды. Пересчитывается каждый кадр.
const SUB = 5, RING = 10, RW = 0.12, RT = 0.03;
const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function makeRibbon(mat, colored) {
  const n = (N - 1) * SUB + 1;
  const geo = new THREE.BufferGeometry();
  const attr = size => new THREE.BufferAttribute(new Float32Array(n * RING * size), size).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', attr(3));
  geo.setAttribute('normal', attr(3));
  if (colored) geo.setAttribute('color', attr(3));
  const idx = [];
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < RING; j++) {
    const a = i * RING + j, b = i * RING + (j + 1) % RING, c = a + RING, d = b + RING;
    idx.push(a, c, b, b, c, d);
  }
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, n, colored };
}

const _P = new THREE.Vector3(), _T = new THREE.Vector3(), _W = new THREE.Vector3(), _N = new THREE.Vector3(), _o = new THREE.Vector3(), _c = new THREE.Color();
// pts[i] — центр ленты у нуклеотида i, wdir[i] — направление ширины, width(i, t) — толщина (0…1)
// между нуклеотидами i и i+1, colors[i] — цвет (если лента цветная).
function updateRibbon(rb, pts, wdir, width, colors) {
  const pos = rb.mesh.geometry.attributes.position, nor = rb.mesh.geometry.attributes.normal;
  const colA = rb.colored ? rb.mesh.geometry.attributes.color : null;
  const samples = [];
  for (let i = 0; i < N - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, N - 1)];
    for (let k = 0; k < (i === N - 2 ? SUB + 1 : SUB); k++) {
      const t = k / SUB, t2 = t * t, t3 = t2 * t;
      // Кривая Катмулла — Рома: проходит через все нуклеотиды плавно, без изломов.
      const p = new THREE.Vector3(
        0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3));
      samples.push({ p, i, t });
    }
  }
  samples.forEach((sm, k) => {
    const a = samples[Math.max(k - 1, 0)].p, b = samples[Math.min(k + 1, samples.length - 1)].p;
    _T.subVectors(b, a).normalize();
    _W.copy(wdir[sm.i]).lerp(wdir[Math.min(sm.i + 1, N - 1)], sm.t);
    _W.addScaledVector(_T, -_W.dot(_T)).normalize();
    _N.crossVectors(_T, _W);
    const s = width(sm.i, sm.t);
    if (colA) _c.copy(colors[sm.i]).lerp(colors[Math.min(sm.i + 1, N - 1)], sm.t);
    for (let j = 0; j < RING; j++) {
      const ang = j / RING * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang);
      const v = k * RING + j;
      _o.copy(sm.p).addScaledVector(_W, RW * s * cs).addScaledVector(_N, RT * s * sn);
      pos.setXYZ(v, _o.x, _o.y, _o.z);
      _o.copy(_W).multiplyScalar(cs / RW).addScaledVector(_N, sn / RT).normalize();
      nor.setXYZ(v, _o.x, _o.y, _o.z);
      if (colA) colA.setXYZ(v, _c.r, _c.g, _c.b);
    }
  });
  pos.needsUpdate = nor.needsUpdate = true;
  if (colA) colA.needsUpdate = true;
}

export function createHelix(ui, { onFinish }) {
  const group = new THREE.Group();

  // Основания — скруглённые капсулы высотой 1 (растягиваются по длине основания).
  const capsule = new THREE.CapsuleGeometry(1, 4, 4, 10);
  capsule.scale(1, 1 / 6, 1);
  const mk = (geo, mat, n, colored) => {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    if (colored) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    for (let i = 0; i < n; i++) m.setMatrixAt(i, HIDDEN);
    group.add(m);
    return m;
  };
  const oldMat = bio(PALETTE.dna), white = bio(0xffffff);
  const tBase = mk(capsule, white, 2 * N, true), nBase = mk(capsule, white, 2 * N, true);
  // Цепи-ленты: две материнские (бирюзовые) и две новые (цвет — по нуклеотидам: ДНК или РНК-праймер).
  const tRib = [makeRibbon(oldMat), makeRibbon(oldMat)];
  const newMat = bio(0xffffff, { vertexColors: true });
  const nRib = [makeRibbon(newMat, true), makeRibbon(newMat, true)];
  for (const r of [...tRib, ...nRib]) group.add(r.mesh);
  const vecs = () => Array.from({ length: N }, () => new THREE.Vector3());
  const tPts = [vecs(), vecs()], tW = [vecs(), vecs()], nPts = [vecs(), vecs()];
  const nW = [Array(N).fill(new THREE.Vector3(1, 0, 0)), Array(N).fill(new THREE.Vector3(1, 0, 0))];
  const nCol = [Array.from({ length: N }, () => new THREE.Color()), Array.from({ length: N }, () => new THREE.Color())];

  const seq = [[...TEMPLATE], [...TEMPLATE].map(b => COMP[b])];   // [левая матрица, правая матрица]
  const col = new THREE.Color();
  for (let s = 0; s < 2; s++) for (let i = 0; i < N; i++) tBase.setColorAt(s * N + i, col.setHex(COLORS[seq[s][i]]));

  // Новые цепи: буква, РНК ли это (праймер), насколько нуклеотид «прилетел» (0…1),
  // и разрывы между соседними фрагментами (до работы лигазы).
  const placed = [Array(N).fill(null), Array(N).fill(null)];
  const rna = [Array(N).fill(false), Array(N).fill(false)];
  const arrive = [Array(N).fill(0), Array(N).fill(0)];
  const nick = [Array(N).fill(false), Array(N).fill(false)];
  const flash = [Array(N).fill(0), Array(N).fill(0)];
  // Сборка ленты новой цепи: сначала основание «садится» на место (land: 0…1),
  // потом от соседа к нему дорастает звено ленты (link: 0…1) — по одному, в своём темпе.
  const land = [Array(N).fill(0), Array(N).fill(0)];
  const link = [Array(N).fill(0), Array(N).fill(0)];

  const letters = [[], []], newLetters = [[], []];
  for (let s = 0; s < 2; s++) for (let i = 0; i < N; i++) {
    const a = letterSprite(seq[s][i], 0.34); a.visible = false; group.add(a); letters[s].push(a);
    const b = letterSprite('', 0.34); b.visible = false; b.userData.ch = ''; group.add(b); newLetters[s].push(b);
  }
  function setLetter(sprite, ch) {
    if (sprite.userData.ch === ch) return;
    const fresh = letterSprite(ch, 0.34);
    sprite.material.map.dispose();
    sprite.material.map = fresh.material.map;
    sprite.userData.ch = ch;
  }

  // Метки концов цепей 5' и 3'.
  const pool = { "5'": [], "3'": [] };
  let used = { "5'": 0, "3'": 0 };
  function endLabel(text, color, x, y) {
    const key = text + color;
    pool[key] = pool[key] || [];
    used[key] = used[key] || 0;
    let sp = pool[key][used[key]];
    if (!sp) { sp = letterSprite(text, 0.32, color); sp.renderOrder = 8; sp.material.depthTest = false; group.add(sp); pool[key].push(sp); }
    used[key]++;
    sp.visible = true;
    sp.position.set(x, y, 0.15);
  }

  // Стрелки направления синтеза (5'→3').
  function makeArrow() {
    const g = new THREE.Group();
    const mat = bio(0xfff1e0);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1, 8), mat);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.24, 14), mat);
    g.add(shaft, head);
    g.visible = false;
    g.set = (x, y0, y1) => {
      const dir = Math.sign(y1 - y0) || 1, len = Math.abs(y1 - y0);
      g.visible = len > 0.45;
      shaft.scale.y = Math.max(0.01, len - 0.24);
      shaft.position.set(x, (y0 + y1 - dir * 0.24) / 2, 0.1);
      head.position.set(x, y1 - dir * 0.12, 0.1);
      head.rotation.z = dir > 0 ? 0 : Math.PI;
    };
    group.add(g);
    return g;
  }
  const leadArrow = makeArrow();
  const lagArrows = FRAGMENTS.map(makeArrow);
  let arrowsOn = false;

  // ---------- ферменты ----------

  const enzymes = [];
  function enzyme(obj, label, color, labelY = 0.75) {
    const e = { obj, label: label && textSprite(label, color, 0.3), labelY, target: new THREE.Vector3(), on: false, k: 0, labelOn: true };
    group.add(obj);
    if (e.label) group.add(e.label);
    enzymes.push(e);
    return e;
  }
  function show(e, pos) { if (!e.on) e.obj.position.copy(pos); e.target.copy(pos); e.on = true; }
  function hide(e) { e.on = false; }
  const blob = (color, sx, sy, sz) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), bio(color));
    m.scale.set(sx, sy, sz);
    return m;
  };

  // Хеликаза: кольцо из шести вытянутых субъединиц.
  const ring = new THREE.Group();
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3;
    const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.24, 4, 10), bio(PALETTE.helicase));
    c.position.set(0.48 * Math.cos(a), 0, 0.48 * Math.sin(a));
    c.rotation.set(0.25 * Math.sin(a), 0, 0.25 * Math.cos(a));
    ring.add(c);
  }
  const helicase = enzyme(ring, 'Хеликаза', '#7af0a8', -0.75);

  // ДНК-полимераза с кольцом-«зажимом» PCNA вокруг новой цепи.
  function polymeraseObj(outward) {
    const g = new THREE.Group();
    const clamp = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 10, 28), bio(PALETTE.pcna));
    clamp.rotation.x = Math.PI / 2;
    const body = blob(PALETTE.polymerase, 0.2, 0.34, 0.17);
    body.position.set(outward * 0.4, 0.05, -0.42);
    g.add(clamp, body);
    return g;
  }
  const polL = enzyme(polymeraseObj(-1), 'ДНК-полимераза', '#ffc2ab');
  const polR = enzyme(polymeraseObj(1), 'ДНК-полимераза', '#ffc2ab');
  const primaseObj = outward => { const g = new THREE.Group(); const b = blob(PALETTE.primase, 0.26, 0.32, 0.22); b.position.set(outward * 0.42, 0, -0.3); g.add(b); return g; };
  const primaseL = enzyme(primaseObj(-1), 'Праймаза', '#d6b8ff');
  const primaseR = enzyme(primaseObj(1), 'Праймаза', '#d6b8ff');
  const ligaseG = new THREE.Group();
  const ligBody = blob(PALETTE.ligase, 0.24, 0.3, 0.2);
  ligBody.position.set(0.32, 0, -0.25);
  ligaseG.add(ligBody);
  const ligase = enzyme(ligaseG, 'ДНК-лигаза', '#b8f6ff');

  // Ячейка, куда ставится следующий нуклеотид.
  const ghost = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }));
  ghost.visible = false;
  group.add(ghost);

  const site = (s, i) => new THREE.Vector3(s ? NEW_X : -NEW_X, yOf(i), 0);

  // ---------- раскладка ----------

  let fork = 0;
  let spin = 0;            // поворот ещё не расплетённой спирали: хеликаза её раскручивает
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), _w = new THREE.Vector3();

  // Положение цепи s у нуклеотида i. Вилка раскрывается плавно, на протяжении трёх пар.
  // w — направление ширины ленты: в спирали лента обвивает цилиндр, в расплетённой цепи повёрнута к зрителю.
  function backbone(s, i, out, w) {
    const y = yOf(i), a = i * TWIST + (s ? PHI : 0) + spin;
    const o = ease(THREE.MathUtils.clamp((fork - i + 2) / 3, 0, 1) * Math.min(1, fork));
    out.set(R * Math.cos(a), y, R * Math.sin(a)).lerp(_v.set(s ? OPEN_X : -OPEN_X, y, 0), o);
    if (w) {
      const T = _w.set(-Math.sin(a) * R * TWIST, -RISE, Math.cos(a) * R * TWIST).normalize();
      w.crossVectors(T, _s.set(Math.cos(a), 0, Math.sin(a))).normalize();
      if (w.x < 0) w.negate();
      w.lerp(_s.set(1, 0, 0), o).normalize();
    }
    return o;
  }
  const tWidth = (i, t) => smooth(0, 0.35, i + t) * smooth(0, 0.35, N - 1 - i - t);
  // Новая цепь: лента между соседними «прилетевшими» нуклеотидами; на концах и у разрывов — скруглённые обрывы.
  // Звено растёт в направлении синтеза 5'→3': на левой цепи — вниз (от i к i+1), на правой — вверх.
  function newWidth(s, i, t) {
    const along = s === 0 ? t : 1 - t;
    const p = link[s][i];
    const seg = p > 0 ? 1 - smooth(p - 0.05, p + 0.15, along) : 0;
    const a = land[s][i] * (1 - smooth(0.12, 0.42, t));
    const b = i + 1 < N ? land[s][i + 1] * (1 - smooth(0.12, 0.42, 1 - t)) : 0;
    return Math.max(seg, a, b);
  }
  // Звено между i и i+1 может расти, когда оба нуклеотида сели и нет разрыва.
  const canLink = (s, i) => i >= 0 && i + 1 < N && land[s][i] >= 1 && land[s][i + 1] >= 1 && !nick[s][i];

  // Непрерывные участки новой цепи (между разрывами).
  function runs(s) {
    const out = [];
    let start = -1;
    for (let i = 0; i < N; i++) {
      const on = placed[s][i] && arrive[s][i] > 0.5;
      if (on && start < 0) start = i;
      if (start >= 0 && (!on || i === N - 1 || nick[s][i] || !(placed[s][i + 1] && arrive[s][i + 1] > 0.5))) {
        out.push([start, on ? i : i - 1]);
        start = -1;
      }
    }
    return out;
  }

  function layout() {
    for (let i = 0; i < N; i++) {
      const o = backbone(0, i, tPts[0][i], tW[0][i]); backbone(1, i, tPts[1][i], tW[1][i]);
      for (let s = 0; s < 2; s++) {
        const P = tPts[s][i], Q = tPts[1 - s][i];
        const half = THREE.MathUtils.lerp(P.distanceTo(Q) / 2 - 0.02, BASE_LEN, o);
        tmpA.subVectors(Q, P).normalize().multiplyScalar(half).add(P);
        setCyl(tBase, s * N + i, P, tmpA, 0.05);
        const L = letters[s][i];
        L.visible = o > 0.8;
        L.position.copy(tmpA).lerp(P, 0.45); L.position.z += 0.25;

        const k = arrive[s][i];
        const nl = newLetters[s][i];
        if (placed[s][i] && k > 0) {
          const dirX = s ? -1 : 1;
          tmpB.copy(site(s, i));
          nPts[s][i].copy(tmpB);
          tmpB.z += (1 - ease(k)) * 2.5;
          nCol[s][i].setHex(rna[s][i] ? PALETTE.primer : PALETTE.newDna).lerp(_white, flash[s][i]);
          tmpA.copy(tmpB); tmpA.x -= dirX * BASE_LEN;
          setCyl(nBase, s * N + i, tmpB, tmpA, 0.05);
          nBase.setColorAt(s * N + i, col.setHex(COLORS[placed[s][i]]));
          setLetter(nl, placed[s][i]);
          nl.visible = k > 0.8;
          nl.position.copy(tmpA).lerp(tmpB, 0.45); nl.position.z += 0.25;
        } else {
          nPts[s][i].copy(site(s, i));
          nBase.setMatrixAt(s * N + i, HIDDEN); nl.visible = false;
        }
      }
    }
    for (let s = 0; s < 2; s++) {
      updateRibbon(tRib[s], tPts[s], tW[s], tWidth);
      updateRibbon(nRib[s], nPts[s], nW[s], (i, t) => newWidth(s, i, t), nCol[s]);
    }
    for (const m of [tBase, nBase]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    // Метки 5' и 3': у матриц — на концах, у новых цепей — на концах каждого участка.
    for (const key in pool) { pool[key].forEach(sp => { sp.visible = false; }); used[key] = 0; }
    const tc = '#8eeef4', nc = '#ffb59a';
    backbone(0, 0, tmpA); endLabel("3'", tc, tmpA.x - 0.3, tmpA.y + 0.35);
    backbone(1, 0, tmpA); endLabel("5'", tc, tmpA.x + 0.3, tmpA.y + 0.35);
    backbone(0, N - 1, tmpA); endLabel("5'", tc, tmpA.x - 0.3, tmpA.y - 0.4);
    backbone(1, N - 1, tmpA); endLabel("3'", tc, tmpA.x + 0.3, tmpA.y - 0.4);
    for (let s = 0; s < 2; s++) for (const [a, b] of runs(s)) {
      const x = (s ? NEW_X : -NEW_X) * 0.62;
      endLabel(s ? "3'" : "5'", nc, x, yOf(a) + 0.22);
      endLabel(s ? "5'" : "3'", nc, x, yOf(b) - 0.22);
    }

    // Стрелки: куда растёт каждая новая цепь.
    const lead = runs(0)[0];
    if (lead && arrowsOn) leadArrow.set(-0.3, yOf(lead[0]) + 0.1, yOf(lead[1]) - 0.05);
    else leadArrow.visible = false;
    FRAGMENTS.forEach(([top, bottom], f) => {
      let hi = bottom + 1;
      while (hi > top && placed[1][hi - 1] && arrive[1][hi - 1] > 0.5) hi--;
      if (arrowsOn && hi <= bottom) lagArrows[f].set(0.3, yOf(bottom) - 0.1, yOf(hi) + 0.05);
      else lagArrows[f].visible = false;
    });
  }
  const _white = new THREE.Color(0xffffff);

  // ---------- анимация по шагам ----------

  const waits = [];
  const wait = sec => new Promise(r => waits.push({ t: sec, r }));
  const tween = (sec, fn) => new Promise(r => waits.push({ t: sec, total: sec, fn, r }));
  const next = (text = 'Далее') => new Promise(r => ui.buttons([{ text, primary: true, onClick: () => { ui.buttons([]); r(); } }]));

  const track = new THREE.Vector3(0, yOf(4), 0);
  const zoom = { k: 1, pending: false };          // во сколько раз отодвинуть камеру
  const setZoom = k => { zoom.k = k; zoom.pending = true; };
  let follow = null;

  function place(s, i, isRna) {
    const t = seq[s][i];
    placed[s][i] = isRna ? RNA_COMP[t] : COMP[t];
    rna[s][i] = isRna;
  }

  // Синтез участка нуклеотид за нуклеотидом; фермент едет следом.
  async function synth(s, from, to, e, delay, isRna = false, behindFork = false) {
    const dir = Math.sign(to - from) || 1;
    for (let i = from; dir > 0 ? i <= to : i >= to; i += dir) {
      while (behindFork && fork < Math.min(i + 1.2, to + 1) - 1e-3) await wait(0.03);
      show(e, site(s, i));
      place(s, i, isRna);
      await wait(delay);
    }
  }

  function intro() {
    ui.hud('<b>Двойная спираль ДНК</b><span>Две цепи соединены азотистыми основаниями. Цепи антипараллельны: напротив 3\'-конца одной цепи — 5\'-конец другой.</span>');
    ui.buttons([{ text: 'Запустить хеликазу', primary: true, onClick: () => { ui.buttons([]); run(); } }]);
    ui.label(null);
  }

  async function run() {
    // 1. Долгое расплетание с плавным замедлением.
    show(helicase, new THREE.Vector3(0, yOf(0) + 0.2, 0));
    ui.label('<b>Хеликаза</b><br>Фермент разрывает водородные связи между основаниями и расплетает двойную спираль. Место расхождения цепей — репликационная вилка.');
    follow = () => yOf(fork) + 1.4;
    await tween(6.5, k => { fork = FIRST_OPEN * easeOut(k); });
    await wait(0.5);
    helicase.labelOn = false;
    follow = null;
    track.y = yOf(PRIMER + SLOTS / 2) + 0.5;

    // 2. Праймер на левой цепи; ученик сам решает, когда читать дальше.
    ui.hud('<b>Затравка</b><span>Смотрите на левую цепь сверху.</span>');
    ui.label('ДНК-полимераза не умеет начинать цепь с нуля — она только удлиняет готовую. Поэтому фермент <b>праймаза</b> сначала строит короткую затравку из РНК — <b>праймер</b> (розовый).');
    await wait(0.8);
    await synth(0, 0, PRIMER - 1, primaseL, 0.45, true);
    await wait(0.4);
    hide(primaseL);
    await next('Понятно');
    ui.label('Праймер готов. В нём урацил (У), ведь это РНК. Теперь к его 3\'-концу полимераза будет присоединять нуклеотиды ДНК.');
    await next('Начать');

    // 3. Ученик достраивает начало ведущей цепи.
    arrowsOn = true;
    const lead = Array.from({ length: SLOTS }, (_, k) => PRIMER + k);
    await pairing(0, lead, polL, '<b>Достройте новую цепь</b><span>Полимераза удлиняет праймер по принципу комплементарности. Выберите основание для светящейся ячейки.</span>');

    // 4. Ведущая цепь дорастает до вилки.
    ui.hud('<b>Отлично!</b><span>Полимераза продолжает новую цепь до самой вилки.</span>');
    ui.label(null);
    await synth(0, PRIMER + SLOTS, FIRST_OPEN - 1, polL, 0.18);
    track.y = yOf(FIRST_OPEN / 2) + 0.3;
    ui.hud('<b>Ведущая цепь</b><span>Полимераза присоединяет нуклеотиды только к 3\'-концу, то есть строит цепь в направлении 5\'→3\'.</span>');
    ui.label('Слева это направление совпадает с движением вилки (стрелка вниз), поэтому цепь растёт непрерывно. Это <b>ведущая цепь</b>.');
    await next();

    // 5. Почему вторая цепь растёт в другую сторону.
    ui.hud('<b>А что же происходит с другой цепью?</b><span>Посмотрите на метки 5\' и 3\' справа.</span>');
    ui.label('Правая матрица идёт 5\'→3\' сверху вниз. Новая цепь антипараллельна ей, а полимераза строит только 5\'→3\' — значит, здесь цепь может расти лишь <b>вверх, от вилки</b>. Поэтому начинать приходится у самой вилки, кусочками.');
    await next('Построить первый кусок');

    // 6. Ученик строит каждый фрагмент Оказаки.
    for (let f = 0; f < FRAGMENTS.length; f++) {
      const [top, bottom] = FRAGMENTS[f];
      const title = '<b>Фрагмент ' + (f + 1) + ' из ' + FRAGMENTS.length + '</b>';
      if (f > 0) {
        ui.hud('<b>Вилка движется дальше</b><span>Хеликаза расплетает новый участок, ведущая цепь просто удлиняется вслед за ней.</span>');
        ui.label(null);
        await advance(bottom + 1, 3.2);
      }
      track.y = (yOf(top) + yOf(bottom)) / 2;
      if (top > 0) nick[1][top - 1] = true;
      ui.hud(title + '<span>Праймаза ставит праймер у вилки…</span>');
      ui.label(null);
      await synth(1, bottom, bottom - PRIMER + 1, primaseR, 0.35, true);
      hide(primaseR);
      const list = Array.from({ length: LAG_SLOTS }, (_, k) => bottom - PRIMER - k);
      await pairing(1, list, polR, title + '<span>Достройте начало фрагмента — полимераза идёт вверх, от вилки.</span>');
      ui.label(null);
      await synth(1, bottom - PRIMER - LAG_SLOTS, top, polR, 0.12);
      ui.label(f === 0
        ? '<b>Это фрагмент Оказаки</b> — короткий кусок новой цепи со своим праймером. Дальше строить нечего: нужно ждать, пока вилка откроет новый участок.'
        : '<b>Фрагмент ' + (f + 1) + ' готов.</b> Полимераза дошла до праймера предыдущего фрагмента и остановилась — между ними остался разрыв.');
      await next(f < FRAGMENTS.length - 1 ? 'Двигать вилку дальше' : 'Далее');
    }

    // 7. Общий вид.
    hide(polL); hide(polR);
    track.y = yOf(20);
    setZoom(1.9);
    ui.hud('<b>Две новые цепи</b><span>Ведущая — одна длинная. Отстающая — из фрагментов Оказаки, у каждого свой праймер.</span>');
    ui.label(null);
    await next();

    // 8. Праймеры заменяются на ДНК.
    ui.hud('<b>Замена праймеров</b><span>РНК-праймеры удаляются, а на их место встраиваются нуклеотиды ДНК: У меняется на Т.</span>');
    const primers = [[0, 0], ...FRAGMENTS.map(([, b]) => [1, b - PRIMER + 1])];
    for (const [s, from] of primers) for (let i = from; i < from + PRIMER; i++) {
      place(s, i, false);
      flash[s][i] = 1;
      await wait(0.15);
    }
    ui.label('Праймеров больше нет, но фрагменты отстающей цепи ещё не соединены — видите разрывы между ними?');
    await next();

    // 9. Какой фермент сошьёт фрагменты? Затем ученик сам нажимает на разрывы.
    await chooseLigase();
    arrowsOn = false;
    ui.hud('<b>Репликация завершена</b><span>Получились две молекулы ДНК. В каждой одна цепь материнская (бирюзовая), а другая — новая (оранжевая). Такая репликация называется <b>полуконсервативной</b>.</span>');
    ui.label(null);
    await next('Что дальше?');
    onFinish();
  }

  function chooseLigase() {
    ui.hud('<b>Сшивание</b><span>Какой фермент соединит фрагменты в одну цепь?</span>');
    ui.label(null);
    const hints = {
      'Хеликаза': 'Хеликаза расплетает ДНК, а не соединяет цепи.',
      'ДНК-полимераза': 'Полимераза присоединяет отдельные нуклеотиды к 3\'-концу, но не умеет соединить два готовых фрагмента.',
      'Праймаза': 'Праймаза строит РНК-праймеры — затравки для полимеразы.',
    };
    return new Promise(resolve => {
      ui.buttons(['Хеликаза', 'ДНК-полимераза', 'Праймаза', 'ДНК-лигаза'].map(text => ({ text, onClick: () => {
        if (hints[text]) return ui.label('<b class="err">' + text + ' — не то.</b><br>' + hints[text]);
        ui.buttons([]);
        ui.label('<b class="ok">Верно — ДНК-лигаза!</b><br>Нажмите на каждый светящийся разрыв, чтобы его сшить.');
        ui.hud('<b>Сшивание</b><span>Нажмите на светящиеся разрывы на правой цепи.</span>');
        show(ligase, site(1, FRAGMENTS[1][0] - 0.5));
        step = 'ligate';
        markers.forEach(m => { m.visible = true; });
        onLigated = resolve;
      } })));
    });
  }

  // Разрывы между фрагментами, на которые нажимает ученик.
  const markers = FRAGMENTS.slice(1).map(([top]) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14),
      new THREE.MeshBasicMaterial({ color: PALETTE.ligase, transparent: true, opacity: 0.45, depthWrite: false }));
    m.position.copy(site(1, top - 0.5)).setZ(0.15);
    m.userData.top = top;
    m.visible = false;
    group.add(m);
    return m;
  });
  let onLigated = null, sealing = false;

  async function tap(ray) {
    if (step !== 'ligate' || sealing) return;
    const hit = ray.intersectObjects(markers.filter(m => m.visible), false)[0];
    if (!hit) return ui.label('Нажмите на светящийся разрыв между фрагментами.');
    const m = hit.object, top = m.userData.top;
    sealing = true;
    show(ligase, site(1, top - 0.5));
    await wait(0.8);
    m.visible = false;
    nick[1][top - 1] = false;
    flash[1][top - 1] = flash[1][top] = 1;
    sealing = false;
    if (markers.every(x => !x.visible)) {
      ui.label('<b class="ok">Готово!</b> Лигаза соединила фрагменты — отстающая цепь стала непрерывной.');
      await wait(1.6);
      hide(ligase);
      step = 'auto';
      onLigated();
    } else ui.label('<b class="ok">Сшито!</b> Остался ещё один разрыв.');
  }

  // Ход вилки вниз: ведущая цепь синтезируется следом.
  async function advance(to, sec) {
    const from = fork;
    follow = () => yOf(fork) + 2.2;
    show(polL, polL.target);
    const start = placed[0].indexOf(null);
    await Promise.all([
      tween(sec, k => { fork = from + (to - from) * ease(k); helicase.target.y = yOf(fork + 1); }),
      synth(0, start, to - 1, polL, 0.08, false, true),
    ]);
    follow = null;
  }

  // Задание: ученик ставит нуклеотиды в ячейки list на новой цепи s.
  let onPaired = null, slots = [], slot = 0, pairStrand = 0, pairEnzyme = null, step = 'intro';
  function pairing(s, list, e, hud) {
    step = 'pairing';
    pairStrand = s; slots = list; slot = 0; pairEnzyme = e;
    show(e, site(s, list[0]));
    ui.hud(hud);
    ui.label(null);
    ui.buttons(['А', 'Т', 'Г', 'Ц', 'У'].map(b => ({ text: b, color: '#' + COLORS[b].toString(16).padStart(6, '0'), onClick: () => pick(b) })), 'palette');
    track.y = (yOf(list[0]) + yOf(list[list.length - 1])) / 2 + 0.5;
    return new Promise(r => { onPaired = r; });
  }

  function pick(b) {
    if (step !== 'pairing') return;
    const s = pairStrand, i = slots[slot], t = seq[s][i];
    if (b === COMP[t]) {
      place(s, i, false);
      slot++;
      pairEnzyme.labelOn = false;
      ui.label('<b class="ok">Верно: ' + t + ' — ' + b + '</b><br>' + (t === 'А' || t === 'Т' ? 'А и Т соединяются двумя водородными связями.' : 'Г и Ц соединяются тремя водородными связями.'));
      if (slot === slots.length) { step = 'auto'; ghost.visible = false; ui.buttons([]); wait(0.9).then(onPaired); }
      else show(pairEnzyme, site(s, slots[slot]));
      return;
    }
    let why;
    if (b === 'У') why = 'Урацил (У) входит в состав РНК — например, розового праймера. В ДНК вместо него тимин (Т).';
    else if (b === t) why = 'Напротив основания не может стоять такое же: пары образуются по принципу комплементарности.';
    else if (t === 'А' || t === 'Т') why = 'Основание ' + t + ' образует пару через две водородные связи. Г и Ц соединяются тремя — они пара друг другу.';
    else why = 'Основание ' + t + ' образует пару через три водородные связи. А и Т соединяются двумя — они пара друг другу.';
    ui.label('<b class="err">' + b + ' не подходит к ' + t + '.</b><br>' + why);
  }

  // ---------- кадр ----------

  function update(dt, t) {
    for (let i = waits.length - 1; i >= 0; i--) {
      const w = waits[i];
      w.t -= dt;
      if (w.fn) w.fn(Math.min(1, 1 - w.t / w.total));
      if (w.t <= 0) { waits.splice(i, 1); w.r(); }
    }
    if (follow) track.y = follow();

    for (let s = 0; s < 2; s++) for (let i = 0; i < N; i++) {
      if (placed[s][i] && arrive[s][i] < 1) arrive[s][i] = Math.min(1, arrive[s][i] + dt * 2.4);
      if (placed[s][i] && arrive[s][i] >= 1) land[s][i] = Math.min(1, land[s][i] + dt * 5);
      if (flash[s][i] > 0) flash[s][i] = Math.max(0, flash[s][i] - dt * 1.5);
    }
    // Звенья ленты: каждое начинает расти, только когда готово предыдущее по ходу синтеза.
    for (let s = 0; s < 2; s++) for (let k = 0; k < N - 1; k++) {
      const i = s === 0 ? k : N - 2 - k;
      if (!canLink(s, i)) { if (nick[s][i]) link[s][i] = 0; continue; }
      const prev = s === 0 ? i - 1 : i + 1;
      const ready = !canLink(s, prev) || link[s][prev] >= 1;
      if (ready && link[s][i] < 1) link[s][i] = Math.min(1, link[s][i] + dt * 4);
    }

    if (step === 'intro' || fork < FIRST_OPEN + 0.01) helicase.target.y = yOf(fork + 1);
    ring.rotation.y += dt * 3;
    spin = fork * TWIST * 0.5;
    for (const e of enzymes) {
      e.k = THREE.MathUtils.clamp(e.k + (e.on ? dt : -dt) * 4, 0, 1);
      e.obj.visible = e.k > 0;
      e.obj.scale.setScalar(ease(e.k));
      e.obj.position.lerp(e.target, Math.min(1, dt * 8));
      if (e.label) {
        e.label.visible = e.k > 0.5 && e.labelOn;
        e.label.position.copy(e.obj.position).add(_v.set(0, e.labelY, 0.5));
      }
    }

    if (step === 'pairing') {
      ghost.visible = true;
      ghost.position.copy(site(pairStrand, slots[slot]));
      ghost.material.opacity = 0.2 + 0.3 * (0.5 + 0.5 * Math.sin(t * 5));
    }
    for (const m of markers) m.scale.setScalar(1 + 0.2 * Math.sin(t * 5));
    layout();
  }

  // Расстояние камеры, при котором обе расплетённые цепи помещаются по ширине экрана.
  const viewDistance = (aspect, fov) => Math.max(7.5, (OPEN_X + 0.5) / (Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect));
  return { group, update, intro, tap, focus: track.clone(), track, zoom, viewDistance };
}
