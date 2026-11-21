import { infoTag } from './mitoinfo.js';
import * as THREE from 'three';
import { neon, textSprite } from './style.js';
import { loadModel, PARTS } from './organelles.js';
import { Tube } from './mitospindle.js';
import { ease } from './motion.js';

// Крупный план кинетохора для урока «Митоз»: как белки кинетохора держат конец микротрубочки.
// Детали — по структурам банка PDB (blender/models/kinetochore_pdb.py), единица — 1 нм:
//   микротрубочка — 13 протофиламентов тубулина (3IZ0), диаметр 25 нм, плюс-конец у кинетохора;
//   комплекс Ndc80 — головка на тубулине в положении из 3IZ0, двойная спираль ~50 нм (в кристаллах
//   её нет — строится здесь по известной длине белка), ножка Spc24–Spc25 (2VE7);
//   комплекс Mis12 (5LSK), внутренний кинетохор CCAN (7R5S), нуклеосомы с CENP-A (3AN2);
//   на олимпиадном уровне — Mad1–Mad2 (1GO4) и комплекс контрольной точки MCC (4AEZ).
// Показана одна микротрубочка; в настоящем пучке к кинетохору человека подходит около двадцати.
// Spc24/25–MIS12–KNL1: единый экспериментальный узел 8PPR, без ручного раздвигания цепей.
// CENP-C: гибкие связи восстановлены иллюстративно; компоновка нескольких узлов и
// укладка целой хромосомы не являются экспериментальной атомной реконструкцией.

const NM = 0.02;                 // 1 нм в единицах сцены
const PF = 13, DIMER = 8.1;      // протофиламентов; длина димера тубулина, нм
const RISE = 12.15 / PF;         // сдвиг соседнего протофиламента вдоль оси (трёхзаходная спираль)
const MT_R = 11.2;               // радиус, на котором лежат центры димеров
const ROWS = 10;                 // димеров в протофиламенте (видимая часть трубки)
const FLARE = THREE.MathUtils.degToRad(17);   // на столько отгибается наружу каждый из двух концевых димеров
// Из 3IZ0, в системе димера (X — наружу от оси трубки, Y — к плюс-концу):
const NECK = new THREE.Vector3(9.02, 1.13, -0.21);            // где от головки Ndc80 отходит двойная спираль
const ROD = new THREE.Vector3(0.76, 0.58, 0.28).normalize();  // и в какую сторону
const NDC = 10;                  // комплексов Ndc80 на одну микротрубочку (в клетке — около 14)

const COLORS = {
  kt_tub_alpha: PARTS.tub_alpha, kt_tub_beta: PARTS.tub_beta,
  kt_ndc80_head: { color: 0xffd23f }, kt_ndc80_foot: { color: 0xff9f2e }, kt_mis12: { color: 0xff5fa8 },
  kt_ccan_hikm: { color: 0x4d8dff }, kt_ccan_ln: { color: 0x8f7bff }, kt_ccan_opqur: { color: 0x3fd0ff }, kt_ccan_twsx: { color: 0xb7a4ff },
  kt_ccan_dna: { color: 0x00e5ff }, kt_nuc_dna: { color: 0x00e5ff }, kt_nuc_cenpa: { color: 0xff3b5c }, kt_nuc_histone: { color: 0x9b4dff },
  kt_mad1: { color: 0xe6f0ff }, kt_mad2: { color: 0xf4ff3a },
  kt_mcc_cdc20: { color: 0xff5e3a }, kt_mcc_mad2: { color: 0xf4ff3a }, kt_mcc_bubr1: { color: 0xc04bff },
};
const mat = part => neon(COLORS[part].color, { glow: 1.15, power: 2.5, body: 0.45 });

export async function createKinetochore({ olymp = false } = {}) {
  const [model, junction, chromosome, junctionMeta] = await Promise.all([
    loadModel('kinetochore_pdb'), loadModel('kinetochore_junction'), loadModel('mitosis_chromosome'),
    fetch(new URL('./models/kinetochore_junction.json', import.meta.url)).then(r => {
      if (!r.ok) throw new Error('Не загрузились опорные точки кинетохора');
      return r.json();
    }),
  ]);
  // Координаты в сжатом файле — целые числа, размер хранится в преобразовании узла:
  // переводим в дробные и переносим размер в геометрию (как в cytostand.js).
  const geo = {};
  for (const src of [model, junction, chromosome]) {
  src.updateMatrixWorld(true);
  src.traverse(o => {
    if (!o.isMesh) return;
    const a = o.geometry.attributes.position, f = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) f.set([a.getX(i), a.getY(i), a.getZ(i)], i * 3);
    const g = new THREE.BufferGeometry();
    g.setIndex(o.geometry.index);
    g.setAttribute('position', new THREE.BufferAttribute(f, 3));
    g.applyMatrix4(o.matrixWorld);
    g.computeVertexNormals();
    geo[o.material.name] = g;
  });
  }

  const group = new THREE.Group();
  group.scale.setScalar(NM);
  // Внутри всё строится «плюс-конец вверх», а показывается перевёрнутым: микротрубочка приходит
  // сверху, от полюса, хроматида — внизу.
  const asm = new THREE.Group();
  asm.rotation.z = Math.PI;
  group.add(asm);

  const Y = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), v = new THREE.Vector3(), s3 = new THREE.Vector3();
  const inst = (part, count, material = mat(part)) => {
    const m = new THREE.InstancedMesh(geo[part], material, count);
    m.frustumCulled = false;
    asm.add(m);
    const id=part.includes('tub_')?'microtubule':part.includes('ndc80')||part.includes('foot')?'ndc80':part.includes('mis12')?'mis12':part.includes('knl1')?'knl1':part.includes('ccan')?'ccan':part.includes('cenpa')?'cenpa':part.includes('dna')?'dna':part.includes('histone')?'histones':'checkpoint';
    infoTag(m,id);return m;
  };
  const rnd = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

  // ---------- микротрубочка ----------
  const alpha = inst('kt_tub_alpha', PF * ROWS), beta = inst('kt_tub_beta', PF * ROWS);
  const pf = [];
  for (let i = 0; i < PF; i++) {
    const th = i / PF * Math.PI * 2;
    const radial = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
    pf.push({ radial, rot: new THREE.Quaternion().setFromAxisAngle(Y, -th), bend: new THREE.Vector3().crossVectors(Y, radial), tip: i * RISE - 12.15 });
  }
  // Место димера: протофиламент i, ряд k (0 — у самого плюс-конца). flare 0…1 — насколько
  // отогнуты наружу два концевых димера.
  const P = new THREE.Vector3(), Q = new THREE.Quaternion();
  function site(i, k, flare) {
    const f = pf[i];
    if (k >= 2 || flare === 0) {
      P.copy(f.radial).multiplyScalar(MT_R).addScaledVector(Y, f.tip - (k + 0.5) * DIMER);
      return Q.copy(f.rot);
    }
    const a1 = FLARE * flare, a = k === 1 ? a1 : a1 * 2;
    P.copy(f.radial).multiplyScalar(MT_R).addScaledVector(Y, f.tip - 2 * DIMER);
    if (k === 0) P.addScaledVector(Y, DIMER * Math.cos(a1)).addScaledVector(f.radial, DIMER * Math.sin(a1));
    P.addScaledVector(Y, DIMER / 2 * Math.cos(a)).addScaledVector(f.radial, DIMER / 2 * Math.sin(a));
    return Q.setFromAxisAngle(f.bend, a).multiply(f.rot);
  }

  // ---------- комплексы Ndc80: головка, двойная спираль, ножка; за ножкой — Mis12 ----------
  const heads = inst('kt_ndc80_head', NDC);
  const feet = inst('kt_junction_foot', NDC, mat('kt_ndc80_foot'));
  const mis12 = inst('kt_junction_mis12', NDC, mat('kt_mis12'));
  const knl1 = inst('kt_junction_knl1', NDC, neon(0x9876df, { glow: 1, power: 2.6, body: .4 }));
  const rodMat = mat('kt_ndc80_head');
  rodMat.side = THREE.DoubleSide;
  const ndc = [];
  for (let n = 0; n < NDC; n++) {
    const i = Math.round(n * PF / NDC) % PF, k = 2 + n * 3 % 4;
    const th = i / PF * Math.PI * 2 + (rnd(n, 1) - 0.5) * 0.5, r = 16 + (n % 3) * 7;
    const foot = new THREE.Vector3(Math.cos(th) * r, 22 + (n % 2) * 5 + rnd(n, 2) * 3, Math.sin(th) * r);
    const strands = [new Tube(26, 5, rodMat), new Tube(26, 5, rodMat)];
    asm.add(strands[0].mesh, strands[1].mesh);strands.forEach(s=>infoTag(s.mesh,'ndc80'));
    // Все три части узла получают ОДНУ матрицу: положение из 8PPR сохраняется.
    const dir = new THREE.Vector3(-Math.cos(th) * 0.18 + (rnd(n, 4) - 0.5) * 0.3, 1, -Math.sin(th) * 0.18 + (rnd(n, 5) - 0.5) * 0.3).normalize();
    const rot = q.setFromUnitVectors(Y, dir).multiply(q2.setFromAxisAngle(Y, rnd(n, 6) * 6.28)).clone();
    m4.compose(foot, rot, ONE);
    for (const mesh of [feet, mis12, knl1]) mesh.setMatrixAt(n, m4);
    const anchor = new THREE.Vector3(...junctionMeta.cenpc).applyMatrix4(m4);
    ndc.push({ i, k, foot, strands, anchor, y: pf[i].tip - (k + 0.5) * DIMER, phase: rnd(n, 3) * 6.28 });
  }
  // Двойная спираль от шеи головки до ножки: дуга, вокруг которой закручены две нити.
  const B0 = new THREE.Vector3(), B1 = new THREE.Vector3(), B2 = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3(), Bn = new THREE.Vector3(), REF = new THREE.Vector3();
  let strandPhase = 0;
  function coil(u, out) {
    const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    out.set(a * B0.x + b * B1.x + c * B2.x, a * B0.y + b * B1.y + c * B2.y, a * B0.z + b * B1.z + c * B2.z);
    T.set((1 - u) * (B1.x - B0.x) + u * (B2.x - B1.x), (1 - u) * (B1.y - B0.y) + u * (B2.y - B1.y), (1 - u) * (B1.z - B0.z) + u * (B2.z - B1.z)).normalize();
    N.crossVectors(T, REF).normalize();
    Bn.crossVectors(T, N);
    const ang = u * 3.5 * Math.PI * 2 + strandPhase;
    out.addScaledVector(N, 0.6 * Math.cos(ang)).addScaledVector(Bn, 0.6 * Math.sin(ang));
  }

  // ---------- внутренний кинетохор и центромерный хроматин ----------
  const CCAN = 5, NUC = 14;
  const ccan = ['hikm', 'ln', 'opqur', 'twsx', 'dna'].map(sub => inst('kt_ccan_' + sub, CCAN));
  const cenpa = inst('kt_nuc_cenpa', CCAN);                                  // нуклеосомы с CENP-A (красный)
  const h3 = inst('kt_nuc_cenpa', NUC - CCAN, mat('kt_nuc_histone'));        // обычные — с гистоном H3
  const hist = inst('kt_nuc_histone', NUC), nucDna = inst('kt_nuc_dna', NUC);
  const ccanFrames = [], nucFrames = [];
  for (let j = 0; j < CCAN; j++) {
    const th = j / CCAN * Math.PI * 2 + 0.3, r = j % 2 ? 26 : 15;
    const c = new THREE.Vector3(Math.cos(th) * r, 68 + rnd(j, 7) * 3, Math.sin(th) * r);
    // Внутри каждого CCAN взаимные координаты цепей остаются экспериментальными.
    m4.compose(c, q.setFromEuler(new THREE.Euler(.12, th + .4, -.12)), ONE);
    ccanFrames.push(m4.clone());
    for (const m of ccan) m.setMatrixAt(j, m4);
  }
  for (let j = 0; j < NUC; j++) {
    // Нуклеосомы лежат зигзагом по двум кольцам; под каждым CCAN — нуклеосома с CENP-A.
    const withCenpa = j % 3 === 0 && j / 3 < CCAN;
    const th = withCenpa ? (j / 3) / CCAN * Math.PI * 2 + 0.3 : j / NUC * Math.PI * 2 + 0.9;
    const r = withCenpa ? ((j / 3) % 2 ? 26 : 15) : 38 - (j % 2) * 30;
    const c = new THREE.Vector3(Math.cos(th) * r, (withCenpa ? 86 : 92) + rnd(j, 11) * 3, Math.sin(th) * r);
    m4.compose(c, q.setFromEuler(new THREE.Euler((rnd(j, 12) - 0.5) * .7, rnd(j, 13) * 6.28, (rnd(j, 14) - 0.5) * .7)), ONE);
    nucFrames.push(m4.clone());
    hist.setMatrixAt(j, m4); nucDna.setMatrixAt(j, m4);
    if (withCenpa) cenpa.setMatrixAt(j / 3, m4); else h3.setMatrixAt(j - Math.min(CCAN, Math.ceil(j / 3)), m4);
  }
  // Ближайшая вершина поверхности: опорная точка для иллюстративной гибкой связи.
  // Это не расчёт энергии связывания и не атомное моделирование интерфейса.
  function surfacePoint(part, frame, towards) {
    const a = geo[part].attributes.position, p = new THREE.Vector3(), best = new THREE.Vector3();
    let distance = Infinity;
    for (let i = 0; i < a.count; i++) {
      p.fromBufferAttribute(a, i).applyMatrix4(frame);
      const d = p.distanceToSquared(towards);
      if (d < distance) { distance = d; best.copy(p); }
    }
    return best;
  }
  const dnaMat = mat('kt_nuc_dna');
  const cenpcMat = neon(0xf1a0bf, { glow: 1.15, power: 2.5, body: .5 });
  const links = [];
  function bridge(points, radius, material, name) {
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(16, points.length * 12), radius, 6, false), material);
    mesh.name = name;
    asm.add(mesh);
    links.push({ name, start: points[0].toArray(), end: points.at(-1).toArray() });
    return mesh;
  }
  const dnaEnd = (key, frame, end) => new THREE.Vector3(...junctionMeta[key][end]).applyMatrix4(frame);
  // Линкерная ДНК выходит из экспериментальных концов ДНК, не из центра нуклеосомы.
  // Пять CCAN включены в общую иллюстративную цепь через их ДНК.
  for (let j = 0; j < NUC; j++) {
    const a = dnaEnd('nucDnaEnds', nucFrames[j], 1);
    const b = dnaEnd('nucDnaEnds', nucFrames[(j + 1) % NUC], 0);
    if (j % 3 === 0 && j / 3 < CCAN) {
      const frame = ccanFrames[j / 3];
      const c = dnaEnd('ccanDnaEnds', frame, 0), d = dnaEnd('ccanDnaEnds', frame, 1);
      bridge([a, a.clone().lerp(c,.5).add(new THREE.Vector3(2,0,3)), c], .85, dnaMat, 'DNA → CCAN');
      bridge([d, d.clone().lerp(b,.5).add(new THREE.Vector3(-2,2,3)), b], .85, dnaMat, 'CCAN → DNA');
    } else {
      bridge([a, a.clone().lerp(b,.5).add(new THREE.Vector3(0,-2,3)), b], .85, dnaMat, 'Линкерная ДНК');
    }
  }
  // Гибкие участки CENP-C связывают MIS12, CCAN и CENP-A-хроматин. Траектории
  // реконструированы; 8PPR и 3AN2 не определяют их глобальное взаимное положение.
  ndc.forEach((c, n) => {
    const j = n % CCAN, f = ccanFrames[j], nf = nucFrames[j * 3];
    const atCcan = surfacePoint('kt_ccan_hikm', f, c.anchor);
    const atNuc = surfacePoint('kt_nuc_cenpa', nf, atCcan);
    const side = new THREE.Vector3(Math.cos(n*2.4)*2.3, 0, Math.sin(n*2.4)*2.3);
    bridge([c.anchor, c.anchor.clone().lerp(atCcan,.5).add(side), atCcan,
      atCcan.clone().lerp(atNuc,.5).add(side.clone().multiplyScalar(.5)), atNuc], .65, cenpcMat, 'CENP-C (реконструкция)');
  });

  // Хромосома из Blender: непрозрачная укладка хроматина, две сестринские хроматиды.
  // Поверхность и складки — мезоскопическая иллюстрация, не измеренная атомная структура.
  const chrom = new THREE.LOD();
  chrom.name = 'Двухроматидная хромосома';
  for (const [lodName, distance] of [['near', 0], ['far', 15]]) {
    const level = new THREE.Group();
    for (let sister = 0; sister < 2; sister++) {
      const color = 0x008eaa;   // сестринские хроматиды одной хромосомы имеют один цвет
      level.add(new THREE.Mesh(geo['chrom_body_' + lodName + '_' + sister],
        neon(color, { glow: .45, power: 3, body: .32, strength: .7 })));
      if (lodName === 'near') level.add(new THREE.Mesh(geo['chrom_folds_' + sister],
        neon(0x00b9d1, { glow: .55, power: 2.8, body: .4, strength: .75 })));
    }
    // THREE.LOD сравнивает мировые расстояния; масштаб NM уже учтён в matrixWorld.
    chrom.addLevel(level, distance, .12);
  }
  asm.add(chrom);

  // Нуклеосомы поверхностного хроматина доходят до места CENP-A-нуклеосом.
  // Инстансы повторяют реальные формы, но их укладка иллюстративна.
  const SURFACE = 64;
  const surfHist = inst('kt_nuc_histone', SURFACE, neon(0x655786, {glow:.45,body:.35,strength:.75}));
  const surfH3 = inst('kt_nuc_cenpa', SURFACE, neon(0x655786, {glow:.45,body:.35,strength:.75}));
  const surfDna = inst('kt_nuc_dna', SURFACE, neon(0x009aac, {glow:.55,body:.4,strength:.75}));
  for (let j = 0; j < SURFACE; j++) {
    const angle = j * 2.399963, r = Math.sqrt((j + 1) / SURFACE) * 105;
    const x = Math.cos(angle) * r, z = Math.sin(angle) * r * .65;
    const t = x / 1050, cy = 210 - 260*Math.abs(t)**1.3;
    const radius = (116 + 49*(1-Math.exp(-t*t/.05))) * (1-Math.abs(t)**8)**.45;
    const y = cy - radius*Math.sqrt(Math.max(0,1-(z/(radius*.88))**2)) - 1.8;
    m4.compose(new THREE.Vector3(x,y,z), q.setFromEuler(new THREE.Euler(rnd(j,32)*2,angle,rnd(j,33))), ONE);
    for (const mesh of [surfHist,surfH3,surfDna]) mesh.setMatrixAt(j,m4);
  }
  for (const mesh of [surfHist,surfH3,surfDna]) chrom.levels[0].object.add(mesh);

  // ---------- олимпиадный уровень: белки контрольной точки веретена ----------
  // Пока кинетохор свободен, на нём сидят Mad1–Mad2 и собирают комплекс MCC, который
  // запрещает анафазу. Когда микротрубочка прикрепилась — они уходят.
  const SAC = olymp ? 3 : 0;
  const mad = SAC ? ['kt_mad1', 'kt_mad2'].map(p => inst(p, SAC)) : [];
  const mcc = SAC ? ['kt_mcc_cdc20', 'kt_mcc_mad2', 'kt_mcc_bubr1'].map(p => inst(p, SAC)) : [];
  const sac = [];
  for (let j = 0; j < SAC; j++) {
    const th = j / SAC * Math.PI * 2 + 1.1;
    sac.push({ at: new THREE.Vector3(Math.cos(th) * 40, 6 + j * 4, Math.sin(th) * 40), out: new THREE.Vector3(Math.cos(th), -0.25, Math.sin(th)).normalize(),
      rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(j * 1.3, j * 2.1, 0.4)) });
  }

  // ---------- подписи ----------
  const labels = new THREE.Group();
  labels.visible = false;
  asm.add(labels);
  const label = (text, color, at, to) => {
    const sp = textSprite(text, color, 7);
    sp.position.copy(at);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([at, to]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }));
    labels.add(sp, line);
    const id=text.includes('Ndc80')?'ndc80':text.includes('Mis12')?'mis12':text.includes('CENP-A')?'cenpa':text.includes('Внутренний')?'ccan':'microtubule';
    infoTag(sp,id,to.clone().sub(at));
  };
  label('Микротрубочка', '#a6ff5c', new THREE.Vector3(52, -84, 14), new THREE.Vector3(13, -84, 4));
  label('Комплекс Ndc80', '#ffd23f', new THREE.Vector3(-58, -10, 14), new THREE.Vector3(-30, -8, 6));
  label('Комплекс Mis12', '#ff8fc0', new THREE.Vector3(62, 40, 14), new THREE.Vector3(27, 40, 6));
  label(olymp ? 'Внутренний кинетохор (CCAN)' : 'Внутренний кинетохор', '#7fb0ff', new THREE.Vector3(-66, 70, 14), new THREE.Vector3(-26, 70, 6));
  label('CENP-A · хроматин центромеры', '#ff7088', new THREE.Vector3(68, 95, 14), new THREE.Vector3(26, 86, 6));
  const overviewLabels = new THREE.Group();
  overviewLabels.visible = false;
  asm.add(overviewLabels);
  const siteLabel = textSprite('Кинетохор · центромера', '#72ebf5', 34);
  siteLabel.position.set(-215, -120, 20);
  overviewLabels.add(siteLabel, new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    siteLabel.position, new THREE.Vector3(-95,-120,20),new THREE.Vector3(0,70,0),
  ]),new THREE.LineBasicMaterial({color:0x72ebf5,transparent:true,opacity:.65})));
  // Подписи белков контрольной точки видны, пока кинетохор свободен.
  const sacLabels = new THREE.Group();
  asm.add(sacLabels);
  if (SAC) {
    const add = (text, color, at, to) => {
      const sp = textSprite(text, color, 7);
      sp.position.copy(at);
      sacLabels.add(sp, new THREE.Line(new THREE.BufferGeometry().setFromPoints([at, to]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 })));
    };
    add('Mad1–Mad2', '#f4ff3a', sac[0].at.clone().add(new THREE.Vector3(0, -16, 10)), sac[0].at);
    add('MCC: запрет анафазы', '#ff8a6a', sac[1].at.clone().addScaledVector(sac[1].out, 46).add(new THREE.Vector3(0, -22, 10)), sac[1].at.clone().addScaledVector(sac[1].out, 34).add(new THREE.Vector3(0, -8, 0)));
  }

  // ---------- состояние и анимация ----------
  // grow 0…1 — микротрубочка дорастает до кинетохора, головки Ndc80 по очереди смыкаются на ней.
  let grow = 0, playing = false, time = 0, still = false, wide = false;
  const HP = new THREE.Vector3(), HQ = new THREE.Quaternion(), FQ = new THREE.Quaternion(), tilt = new THREE.Quaternion();

  function draw() {
    const e = ease(grow);
    const front = -86 + 86 * e;                                  // куда дорос плюс-конец
    const flare = THREE.MathUtils.smoothstep(grow, 0.82, 1);
    for (let i = 0; i < PF; i++) for (let k = 0; k < ROWS; k++) {
      const rot = site(i, k, flare);
      let s = THREE.MathUtils.smoothstep(front - (pf[i].tip - (k + 0.5) * DIMER), -5, 3);
      if (s < 0.04) s = 0;                                        // почти нулевой размер — сразу ноль (см. style.js)
      m4.compose(P, rot, s3.setScalar(s));
      alpha.setMatrixAt(i * ROWS + k, m4); beta.setMatrixAt(i * ROWS + k, m4);
    }
    alpha.instanceMatrix.needsUpdate = beta.instanceMatrix.needsUpdate = true;

    ndc.forEach((c, n) => {
      const f = pf[c.i];
      const bound = ease(THREE.MathUtils.smoothstep(front, c.y + 3, c.y + 20));
      const free = 1 - bound, sway = Math.sin(time * 0.9 + c.phase), sway2 = Math.sin(time * 0.63 + c.phase * 1.7);
      // Связанная головка стоит на своём димере; свободная — отведена наружу и покачивается.
      site(c.i, c.k, 0);
      HP.copy(P).addScaledVector(f.radial, free * (13 + 3 * sway)).addScaledVector(Y, free * (-5 + 2.5 * sway2)).addScaledVector(f.bend, free * 3 * sway2);
      HQ.copy(tilt.setFromAxisAngle(f.bend, -free * (0.45 + 0.12 * sway))).multiply(q.setFromAxisAngle(Y, free * 0.25 * sway2)).multiply(Q);
      heads.setMatrixAt(n, m4.compose(HP, HQ, ONE));
      B0.copy(NECK).applyQuaternion(HQ).add(HP);
      B1.copy(ROD).applyQuaternion(HQ).multiplyScalar(20).add(B0);
      B2.copy(c.foot);
      REF.copy(f.radial);
      strandPhase = 0; c.strands[0].set(coil, 0, 1, 0.55);
      strandPhase = Math.PI; c.strands[1].set(coil, 0, 1, 0.55);
    });
    heads.instanceMatrix.needsUpdate = true;

    sacLabels.visible = grow < 0.7;
    sac.forEach((o, j) => {
      const gone = THREE.MathUtils.smoothstep(grow, 0.72, 0.98);
      v.copy(o.at).addScaledVector(o.out, gone * 30).addScaledVector(Y, 1.5 * Math.sin(time * 0.8 + j));
      m4.compose(v, o.rot, s3.setScalar(Math.max(1 - gone, 0)));
      for (const m of mad) { m.setMatrixAt(j, m4); m.instanceMatrix.needsUpdate = true; }
      // Готовые комплексы MCC один за другим уплывают от кинетохора.
      const u = (time / 3.4 + j / SAC) % 1;
      let s = Math.sin(Math.PI * u) * (1 - gone);
      if (s < 0.04) s = 0;
      v.copy(o.at).addScaledVector(o.out, 9 + 50 * u).addScaledVector(Y, -10 * u);
      m4.compose(v, q.setFromAxisAngle(Y, u * 3 + j), s3.setScalar(s));
      for (const m of mcc) { m.setMatrixAt(j, m4); m.instanceMatrix.needsUpdate = true; }
    });
  }
  draw();

  return {
    group,
    view: { radius: 124 * NM, center: new THREE.Vector3(0, -8 * NM, 0) },
    overview: { radius: 1160 * NM, center: new THREE.Vector3(0, -325 * NM, 0) },
    // Диагностика для проверки конечности матриц и сохранения экспериментального узла.
    evidence: { junction: junctionMeta, links, chromosome: 'Blender; illustrative chromatin packing' },
    showOverview(on) { wide = on; overviewLabels.visible = on; labels.visible = !on && grow === 1; },
    get done() { return grow === 1; },
    // Показать прикрепление с начала.
    play() { grow = 0; playing = true; still = false; labels.visible = false; },
    // Сразу готовое состояние: микротрубочка прикреплена.
    finish() { grow = 1; playing = false; still = false; labels.visible = !wide; },
    // Освободить память видеокарты, когда крупный план закрыт.
    dispose() {
      group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
      });
    },
    update(dt) {
      time += dt;
      if (playing) {
        grow = Math.min(1, grow + dt / 9);
        if (grow === 1) { playing = false; labels.visible = !wide; }
      }
      if (still) return;               // всё прикреплено и неподвижно — пересчитывать нечего
      draw();
      still = grow === 1 && !SAC;
    },
  };
}
