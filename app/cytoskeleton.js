import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { neon } from './style.js';

// Цитоскелет в целой клетке — три сети нитей в цветах флуоресцентных снимков:
// микротрубочки (зелёные) расходятся лучами от клеточного центра к мембране,
// актиновые микрофиламенты (алые) — густая сеточка под мембраной (кортекс),
// промежуточные филаменты (жёлтые) — «корзинка» вокруг ядра и тяжи от неё к мембране.
// Нити тонкие и их много, поэтому строятся в коде и сливаются в один объект на сеть.

export const CYTO_PARTS = {
  cyto_mt:    { color: 0x5dff3a, glow: 2.2, power: 1.8, body: 0.5 },
  cyto_actin: { color: 0xff2b4a, glow: 2.0, power: 1.8, body: 0.45 },
  cyto_if:    { color: 0xffd400, glow: 2.0, power: 1.8, body: 0.45 },
  // Крупный план (cytostand.js): молекулы тубулина и актина по данным PDB, схема промежуточного филамента.
  tub_alpha:  { color: 0x2fd65a, glow: 1.9, power: 2.0, body: 0.5 },
  tub_beta:   { color: 0xa6ff5c, glow: 1.9, power: 2.0, body: 0.5 },
  actin_mono: { color: 0xff2b4a, glow: 1.9, power: 2.0, body: 0.5 },
  if_rope:    { color: 0xffd400, glow: 1.9, power: 2.0, body: 0.5 },
  kin_head:   { color: 0xc04bff, glow: 2.2, power: 2.0, body: 0.6 },
  kin_stalk:  { color: 0xc04bff, glow: 2.0, power: 1.8, body: 0.6 },
  kin_cargo:  { color: 0xff8ad0, glass: true, glow: 1.8, power: 3.0, body: 0.0, strength: 0.7 },
};

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// cell — полуоси клетки, nucleus — { center, r }, centrosome — точка клеточного центра,
// inCut(p) — лежит ли точка в вырезе мембраны (там нитей нет, чтобы не закрывать обзор).
export function createCytoskeleton({ cell, nucleus, centrosome, inCut }) {
  const rand = rng(31);
  const group = new THREE.Group();
  const dir = () => new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
  // Точка оболочки (эллипсоид клетки, уменьшенный в k раз) на луче из from в направлении d.
  const shellHit = (from, d, k) => {
    const a = cell.clone().multiplyScalar(k);
    const f = from.clone().divide(a), dd = d.clone().divide(a);
    const A = dd.dot(dd), B = 2 * f.dot(dd), C = f.dot(f) - 1;
    const s = (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
    return from.clone().addScaledVector(d, s);
  };
  // Не даёт нити пройти сквозь ядро с ЭПС: точку внутри «запретного» шара выталкивает на его край.
  const avoid = (p, R) => {
    const v = p.clone().sub(nucleus.center);
    if (v.length() < R) p.copy(nucleus.center).add(v.setLength(R));
    return p;
  };
  const mesh = (geos, part) => {
    const p = CYTO_PARTS[part];
    const m = new THREE.Mesh(mergeGeometries(geos), neon(p.color, p));
    m.material.userData.base = 1;
    m.userData.part = part;
    group.add(m);
    return m;
  };
  // Невидимые «толстые» копии нитей — по ним легче попасть пальцем.
  const hits = [];
  const hit = curve => hits.push(new THREE.TubeGeometry(curve, 10, 0.07, 4, false));
  const keepOut = nucleus.r * 1.75;

  // Микротрубочки: от клеточного центра к мембране, огибая ядро.
  const mt = [];
  for (let i = 0; i < 34; i++) {
    const d = dir();
    const end = shellHit(centrosome, d, 0.9);
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const p = centrosome.clone().lerp(end, k / 6);
      if (k > 0 && k < 6) p.add(dir().multiplyScalar(0.12));
      pts.push(k ? avoid(p, keepOut) : p);
    }
    if (inCut(end)) continue;
    const curve = new THREE.CatmullRomCurve3(pts);
    mt.push(new THREE.TubeGeometry(curve, 36, 0.012, 5, false));
    hit(curve);
  }
  mesh(mt, 'cyto_mt');

  // Актиновый кортекс: точки под мембраной, каждая связана с ближайшими соседями.
  const nodes = [];
  while (nodes.length < 260) {
    const p = shellHit(new THREE.Vector3(), dir(), 0.94);
    if (!inCut(p)) nodes.push(p);
  }
  const actin = [], seen = new Set();
  nodes.forEach((p, i) => {
    nodes.map((q, j) => [p.distanceTo(q), j]).filter(([dist, j]) => j !== i && dist < 0.95)
      .sort((x, y) => x[0] - y[0]).slice(0, 3).forEach(([, j]) => {
        const key = Math.min(i, j) + ':' + Math.max(i, j);
        if (seen.has(key)) return;
        seen.add(key);
        actin.push(new THREE.TubeGeometry(new THREE.LineCurve3(p, nodes[j]), 1, 0.006, 4, false));
      });
  });
  mesh(actin, 'cyto_actin');

  // Промежуточные филаменты: волнистые дуги вокруг ядра и тяжи от «корзинки» к мембране.
  const inter = [];
  const R1 = keepOut + 0.1;
  for (let i = 0; i < 11; i++) {
    const n = dir(), u = new THREE.Vector3().crossVectors(n, dir()).normalize(), w = new THREE.Vector3().crossVectors(n, u);
    const start = rand() * Math.PI * 2, span = Math.PI * (1 + rand() * 0.7);
    const pts = [];
    for (let k = 0; k <= 14; k++) {
      const a = start + span * k / 14, r = R1 * (1 + 0.06 * Math.sin(k * 1.7 + i));
      pts.push(nucleus.center.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(w, Math.sin(a) * r));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    inter.push(new THREE.TubeGeometry(curve, 48, 0.01, 5, false));
    hit(curve);
  }
  for (let i = 0; i < 9; i++) {
    const d = dir();
    const from = nucleus.center.clone().addScaledVector(d, R1);
    const end = shellHit(nucleus.center, d, 0.92);
    if (inCut(end)) continue;
    const pts = [];
    for (let k = 0; k <= 5; k++) pts.push(from.clone().lerp(end, k / 5).add(k && k < 5 ? dir().multiplyScalar(0.1) : new THREE.Vector3()));
    const curve = new THREE.CatmullRomCurve3(pts);
    inter.push(new THREE.TubeGeometry(curve, 24, 0.01, 5, false));
    hit(curve);
  }
  mesh(inter, 'cyto_if');

  const proxy = new THREE.Mesh(mergeGeometries(hits), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  proxy.userData.part = 'cyto_hit';
  group.add(proxy);
  return group;
}
