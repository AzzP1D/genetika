import * as THREE from 'three';
import { loadModel, PARTS } from './organelles.js';
import { neon } from './style.js';

// Цитоскелет крупным планом (стенд атласа): нити из «настоящих» молекул.
// Формы α-, β-тубулина, актина и головки кинезина — по данным банка белков PDB (модель
// cyto_pdb.glb из Blender, единица — 1 нм); укладка молекул в нити — по известной геометрии:
//   микротрубочка — 13 протофиламентов, диаметр 25 нм, димер 8 нм, трёхзаходная спираль;
//   микрофиламент — двойная спираль актина: шаг 2,75 нм, поворот −166,6° на молекулу;
//   промежуточный филамент — схема «каната» из 4 тяжей диаметром около 10 нм (полной структуры в PDB нет).
// Анимации — две, и играет только выбранная кнопкой (иначе ученик решит, что пузырёк
// «ломает» или «строит» трубку):
//   «Транспорт» — кинезин шагает по протофиламенту к плюс-концу и везёт пузырёк;
//   «Рост и катастрофа» — плюс-конец растёт (димеры с ГТФ светятся ярче — «ГТФ-шапочка»),
//   затем «катастрофа»: протофиламенты отгибаются наружу, как кожура банана, и разбираются.
// Строка-репортаж (status) называет, что происходит в данный момент.

const MT_R = 11.2;            // радиус, на котором лежат центры протофиламентов, нм
const MT_DIMERS = 5;          // постоянная часть трубки — 5 димеров (40 нм)
const EXTRA = 3;              // столько димеров может нарасти на плюс-конце каждого протофиламента
const PF = 13;
const RISE = 12 / PF;         // сдвиг соседнего протофиламента вдоль оси (3 молекулы за оборот), нм
const ACTIN = 15, ACTIN_RISE = 2.75, ACTIN_TWIST = THREE.MathUtils.degToRad(-166.6), ACTIN_R = 2.0;
const SPACING = 21;           // расстояние между нитями на стенде, нм
// Темп выбран так, чтобы ученик успевал прочитать репортаж каждого этапа.
const CYCLE = 34;             // цикл роста и «катастрофы», с
const GROW = 14, CRASH = 22, CRASH_LEN = 5;
const STEP = 2.0;             // шаг кинезина (8 нм), с
const APPROACH = 2.2;         // сколько секунд димер подплывает к плюс-концу диффузией
const KIN_PF = 3;             // протофиламент, обращённый к зрителю, — по нему шагает кинезин

export async function createCytoStand() {
  const model = await loadModel('cyto_pdb');
  // Координаты в сжатом файле — целые числа (−1…1), а размер хранится в преобразовании узла.
  // Переводим координаты в дробные и переносим размер в саму геометрию.
  const geo = {};
  model.updateMatrixWorld(true);
  const toFloat = a => {
    const f = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) f.set([a.getX(i), a.getY(i), a.getZ(i)], i * 3);
    return new THREE.BufferAttribute(f, 3);
  };
  model.traverse(o => {
    if (!o.isMesh) return;
    const g = new THREE.BufferGeometry();
    g.setIndex(o.geometry.index);
    g.setAttribute('position', toFloat(o.geometry.attributes.position));
    g.applyMatrix4(o.matrixWorld);
    g.computeVertexNormals();
    geo[o.material.name] = g;
  });
  const group = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  const Y = new THREE.Vector3(0, 1, 0);
  const material = part => { const p = PARTS[part]; const m = neon(p.color, p); m.userData.base = p.strength ?? 1; return m; };
  const inst = (part, count) => {
    const m = new THREE.InstancedMesh(geo[part], material(part), count);
    m.userData.part = part;
    group.add(m);
    return m;
  };

  // ---------- микротрубочка ----------
  // В каждом протофиламенте димеры α–β друг над другом, β — к плюс-концу (вверх).
  const N = PF * (MT_DIMERS + EXTRA);
  const alpha = inst('tub_alpha', N), beta = inst('tub_beta', N);
  // Подписи ставим только на постоянную часть трубки: верхние димеры то появляются, то исчезают.
  alpha.userData.anchorable = beta.userData.anchorable = idx => idx % (MT_DIMERS + EXTRA) < MT_DIMERS;
  const white = new THREE.Color(1, 1, 1);
  const pf = [];
  for (let i = 0; i < PF; i++) {
    const th = i / PF * Math.PI * 2;
    const radial = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
    const rot = new THREE.Quaternion().setFromAxisAngle(Y, Math.PI / 2 - th);   // наружная сторона молекулы — от оси
    const axis = new THREE.Vector3().crossVectors(Y, radial);                    // вокруг неё протофиламент отгибается наружу
    const base = new THREE.Vector3(Math.cos(th) * MT_R, 4 + i * RISE, Math.sin(th) * MT_R);
    pf.push({ radial, rot, axis, base, top: base.clone().add(new THREE.Vector3(0, MT_DIMERS * 8 - 4, 0)) });
  }
  const at = (i, k) => i * (MT_DIMERS + EXTRA) + k;
  const put = (idx, pos, rot, s = 1, tint = 1) => {
    m4.compose(pos, rot, new THREE.Vector3(s, s, s));
    alpha.setMatrixAt(idx, m4); beta.setMatrixAt(idx, m4);
    const c = white.clone().multiplyScalar(tint);
    alpha.setColorAt(idx, c); beta.setColorAt(idx, c);
  };
  for (let i = 0; i < PF; i++) {
    for (let k = 0; k < MT_DIMERS; k++) put(at(i, k), pf[i].base.clone().addScaledVector(Y, k * 8), pf[i].rot);
    for (let k = MT_DIMERS; k < MT_DIMERS + EXTRA; k++) put(at(i, k), pf[i].top, pf[i].rot, 0);   // пока не наросли
  }
  // Порядок, в котором димеры присоединяются к плюс-концу: по слоям, внутри слоя — вразнобой.
  const order = [];
  for (let k = 0; k < EXTRA; k++) {
    const layer = [...Array(PF).keys()].sort((a, b) => Math.sin(a * 7.3 + k) - Math.sin(b * 7.3 + k));
    for (const i of layer) order.push([i, k]);
  }
  // Когда димер присоединяется (с); до этого он APPROACH секунд подплывает диффузией.
  const added = order.reduce((m, [i, k], n) => { m[i * EXTRA + k] = APPROACH + n / order.length * (GROW - APPROACH); return m; }, []);
  // Случайное, но повторяющееся от цикла к циклу: направление прихода и «кувырок» каждого димера.
  const rnd = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
  const tumble = (seed, f) => new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(rnd(seed, 1) - 0.5, rnd(seed, 2) - 0.5, rnd(seed, 3) - 0.5).normalize(), (1 - f) * 5);
  // Дрожание теплового движения: тем сильнее, чем дальше димер от цели.
  const jitter = (seed, t, amp) => new THREE.Vector3(Math.sin(t * 6.1 + seed), Math.sin(t * 7.3 + seed * 2), Math.sin(t * 5.7 + seed * 3)).multiplyScalar(amp);

  function updateTubule(t) {
    const c = t % CYCLE;
    for (let i = 0; i < PF; i++) {
      for (let k = 0; k < EXTRA; k++) {
        const idx = at(i, MT_DIMERS + k), o = pf[i];
        const t0 = added[i * EXTRA + k];
        const local = Y.clone().multiplyScalar(4 + k * 8);
        if (c < t0 - APPROACH) { put(idx, o.top, o.rot, 0); continue; }
        if (c < t0) {
          // Диффузия: димер подплывает со своей стороны, кувыркаясь и подрагивая, и встаёт на место.
          const seed = i * EXTRA + k, f = (c - (t0 - APPROACH)) / APPROACH, e = f * f * (3 - 2 * f);
          const a = 0.35 + rnd(seed, 4) * 1.0;   // угол прихода: от «сбоку» до «сверху»
          const from = o.radial.clone().multiplyScalar(Math.cos(a)).addScaledVector(Y, Math.sin(a))
            .applyAxisAngle(Y, (rnd(seed, 5) - 0.5) * 1.6).multiplyScalar(16);
          const pos = o.top.clone().add(local).addScaledVector(from, 1 - e).add(jitter(seed, c, 1.2 * (1 - e)));
          put(idx, pos, tumble(seed, e).multiply(o.rot), Math.min(1, f * 3), 1.9);
          continue;
        }
        if (c < CRASH) {
          // Встроился: пока свежий — с ГТФ и светится ярче, потом ГТФ → ГДФ.
          put(idx, o.top.clone().add(local), o.rot, 1, 1 + 0.9 * Math.exp(-(c - t0) / 5));
          continue;
        }
        // «Катастрофа»: протофиламент отгибается наружу, верхние димеры сильнее; потом исчезают.
        const p = Math.min(1, (c - CRASH) / CRASH_LEN);
        const bend = new THREE.Quaternion().setFromAxisAngle(o.axis, p * (k + 1) * 0.55);
        const pos = o.top.clone().add(local.clone().applyQuaternion(bend));
        const s = p < 0.55 ? 1 : Math.max(0, 1 - (p - 0.55) / 0.45);
        put(idx, pos, bend.clone().multiply(o.rot), s, 0.8);
      }
    }
    alpha.instanceMatrix.needsUpdate = beta.instanceMatrix.needsUpdate = true;
    alpha.instanceColor.needsUpdate = beta.instanceColor.needsUpdate = true;
  }

  // Свободные димеры: подплывают к плюс-концу, касаются его и уплывают обратно — не каждое
  // столкновение заканчивается присоединением. Отдельные объекты, чтобы не мешать подписям.
  const FREE = 5;
  const freeMesh = part => {
    const m = new THREE.InstancedMesh(geo[part], material(part), FREE);
    m.userData.part = 'tub_free';
    group.add(m);
    return m;
  };
  const freeA = freeMesh('tub_alpha'), freeB = freeMesh('tub_beta');
  const tip = pf[0].top.clone().setX(0).setZ(0).addScaledVector(Y, 8);   // середина плюс-конца
  function updateFree(t, on) {
    for (let j = 0; j < FREE; j++) {
      const period = 5 + rnd(j, 6) * 3, f = ((t + rnd(j, 7) * period) % period) / period;
      const dir = (n, s) => new THREE.Vector3(rnd(j, n) - 0.5, rnd(j, n + 1) * 0.9 + 0.1, rnd(j, n + 2) - 0.5).normalize().multiplyScalar(s);
      const near = tip.clone().add(dir(10, MT_R + 3).setY(rnd(j, 13) * 6));   // точка касания у края трубки
      const far1 = tip.clone().add(dir(20, 26)), far2 = tip.clone().add(dir(30, 26));
      // 0–0,45 — подплывает, 0,45–0,55 — касается, 0,55–1 — уплывает.
      const pos = f < 0.45 ? far1.lerp(near, f / 0.45) : f < 0.55 ? near : near.lerp(far2, (f - 0.55) / 0.45);
      pos.add(jitter(j * 3, t, f > 0.45 && f < 0.55 ? 0.3 : 1.1));
      const s = on ? Math.min(1, f * 6, (1 - f) * 6) : 0;
      m4.compose(pos, tumble(j + 50, 1 - t * 0.16), new THREE.Vector3(s, s, s));
      freeA.setMatrixAt(j, m4); freeB.setMatrixAt(j, m4);
      const c = white.clone().multiplyScalar(1.9);
      freeA.setColorAt(j, c); freeB.setColorAt(j, c);
    }
    freeA.instanceMatrix.needsUpdate = freeB.instanceMatrix.needsUpdate = true;
    freeA.instanceColor.needsUpdate = freeB.instanceColor.needsUpdate = true;
  }

  // ---------- кинезин ----------
  // Две головки шагают «рука за руку» по протофиламенту, длинная ножка держит пузырёк с грузом.
  const kp = pf[KIN_PF];
  const site = n => kp.base.clone().addScaledVector(Y, n * 8 + 2).addScaledVector(kp.radial, 3.2);
  const heads = [0, 1].map(() => {
    const h = new THREE.Mesh(geo.kin_head, material('kin_head'));
    h.userData.part = 'kin_head';
    group.add(h);
    return h;
  });
  const legGeo = new THREE.CylinderGeometry(0.45, 0.45, 1, 6);
  const legs = [0, 1, 2].map(() => {
    const l = new THREE.Mesh(legGeo, material('kin_stalk'));
    l.userData.part = 'kin_stalk';
    group.add(l);
    return l;
  });
  const cargo = new THREE.Mesh(new THREE.IcosahedronGeometry(5.5, 3), material('kin_cargo'));
  cargo.userData.part = 'kin_cargo';
  group.add(cargo);
  const stretch = (mesh, a, b) => {
    const d = b.clone().sub(a);
    mesh.position.copy(a).addScaledVector(d, 0.5);
    mesh.quaternion.setFromUnitVectors(Y, d.clone().normalize());
    mesh.scale.set(1, d.length(), 1);
  };
  const kinParts = [...heads, ...legs, cargo];
  const STEPS = MT_DIMERS - 2;   // столько шагов помещается на постоянной части трубки

  function updateKinesin(t) {
    const loop = (STEPS + 1) * STEP;            // шаги + пауза на исчезновение и появление
    const c = t % loop, n = Math.floor(c / STEP), f = c / STEP - n;
    const fade = n >= STEPS ? 1 - f : Math.min(1, c / 0.4);
    const s = Math.min(n, STEPS - 1);
    // До шага n головки стоят на участках n и n+1; задняя переносится вперёд на участок n+2 по дуге.
    const swing = n < STEPS ? f * f * (3 - 2 * f) : 1;
    const back = site(s), front = site(s + 1), next = site(s + 2);
    const moving = back.clone().lerp(next, swing).addScaledVector(kp.radial, Math.sin(swing * Math.PI) * 4);
    const [hm, hs] = s % 2 ? [heads[1], heads[0]] : [heads[0], heads[1]];
    hm.position.copy(moving); hs.position.copy(front);
    for (const h of heads) h.quaternion.copy(kp.rot);
    const joint = hm.position.clone().lerp(hs.position, 0.5).addScaledVector(kp.radial, 5);
    cargo.position.copy(joint).addScaledVector(kp.radial, 14);
    stretch(legs[0], hm.position, joint);
    stretch(legs[1], hs.position, joint);
    stretch(legs[2], joint, cargo.position.clone().addScaledVector(kp.radial, -5));
    for (const o of kinParts) o.material.uniforms.strength.value = o.material.userData.base * fade;
  }

  // ---------- микрофиламент ----------
  const actin = inst('actin_mono', ACTIN);
  const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  for (let j = 0; j < ACTIN; j++) {
    const a = j * ACTIN_TWIST;
    q.setFromAxisAngle(Y, -a).multiply(tilt);
    m4.compose(new THREE.Vector3(SPACING + Math.cos(a) * ACTIN_R, 2 + j * ACTIN_RISE, Math.sin(a) * ACTIN_R), q, one);
    actin.setMatrixAt(j, m4);
  }

  // ---------- промежуточный филамент (схема): четыре тяжа, свитые в канат ----------
  for (let s = 0; s < 4; s++) {
    const pts = [];
    for (let k = 0; k <= 60; k++) {
      const y = k / 60 * 40, a = s * Math.PI / 2 + y / 20 * Math.PI * 2;
      pts.push(new THREE.Vector3(-SPACING + Math.cos(a) * 2.6, y + 2, Math.sin(a) * 2.6));
    }
    const r = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 1.5, 8, false), material('if_rope'));
    r.userData.part = 'if_rope';
    group.add(r);
  }

  // Выбранная анимация и момент, с которого она идёт (каждая начинается с начала).
  let mode = 'transport', local = 0, last = null, paused = false;   // local — время выбранной анимации, с
  const MODES = [
    { id: 'transport', text: '▶ Транспорт' },
    { id: 'dynamics', text: '▶ Рост и катастрофа' },
  ];
  function setMode(m) { mode = m; local = 0; }
  // Репортаж: заголовок этапа, короткое объяснение «почему», номер этапа и доля прошедшего времени.
  const STAGES = [
    { until: GROW, head: 'РОСТ · присоединяются димеры с ГТФ',
      detail: 'Никто их не везёт: свободные димеры приходят сами — диффузией, случайно сталкиваясь с концом. Одни прилипают, другие отскакивают. Димеры с ГТФ (яркие) «прямые» и прочно встраиваются в решётку.' },
    { until: CRASH, head: 'ГИДРОЛИЗ · ГТФ → ГДФ',
      detail: 'В решётке ГТФ расщепляется до ГДФ. Тубулин с ГДФ «хочет» изогнуться, но соседи держат его прямым — решётка напряжена, как сжатая пружина. Держит её только свежий слой с ГТФ — «шапочка».' },
    { until: CRASH + CRASH_LEN, head: 'КАТАСТРОФА · шапочки больше нет',
      detail: 'Рост случайно замедлился, и гидролиз догнал конец. Напряжение высвобождается: протофиламенты изгибаются наружу, и трубка разбирается в десятки раз быстрее, чем росла.' },
    { until: CYCLE, head: 'ТРУБКА УКОРОТИЛАСЬ · скоро снова рост',
      detail: 'Свободный тубулин снова получает ГТФ, и трубка может опять расти — «спасение». Так микротрубочки «прощупывают» клетку, например ищут хромосомы при митозе.' },
  ];
  function status() {
    const c = local;
    if (mode === 'transport') {
      return { head: 'ТРАНСПОРТ · кинезин везёт пузырёк',
        detail: 'Кинезин — белок-мотор. Его головки по очереди переступают по протофиламенту к плюс-концу: шаг 8 нм за 1 АТФ. Груз держится на длинной ножке.' };
    }
    const k = c % CYCLE;
    const i = STAGES.findIndex(s => k < s.until);
    const from = i ? STAGES[i - 1].until : 0;
    return { ...STAGES[i], step: i, total: STAGES.length, frac: (k - from) / (STAGES[i].until - from) };
  }
  function update(t) {
    if (last === null) last = t;
    if (!paused) local += Math.min(0.1, t - last);
    last = t;
    const c = local;
    const transport = mode === 'transport';
    updateTubule(transport ? CYCLE - 0.01 : c);   // в «Транспорте» трубка короткая и неподвижная
    updateFree(c, !transport);
    for (const o of kinParts) o.visible = transport;
    if (transport) updateKinesin(c);
  }
  update(0);
  updateTubule(CRASH - 0.01);   // для подбора кадра — полностью наросшая трубка
  local = 0; last = null;       // анимация пойдёт с начала с первого кадра на стенде
  return { group, update, modes: MODES, setMode, getMode: () => mode, status,
    setPaused(p) { paused = p; }, isPaused: () => paused };
}
