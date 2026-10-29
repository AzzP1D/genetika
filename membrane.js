import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { neon } from './style.js';

// Фрагмент плазматической мембраны крупным планом (жидкостно-мозаичная модель).
// Строится в коде: одна молекула липида описана один раз, а видеокарта рисует её
// около тысячи раз (InstancedMesh) — файла модели нет совсем.

const W = 4.2, D = 3.0;          // размер фрагмента
const STEP = 0.16;               // шаг между липидами
const HEAD = 0.075;              // радиус гидрофильной головки
const LEAF = 0.36;               // расстояние от середины до слоя головок

export const MEMBRANE_PARTS = {
  mem_head:     { color: 0x00e5ff, glow: 1.6, power: 2.0, body: 0.5 },
  mem_tail:     { color: 0x8a7dff, glow: 1.3, power: 2.0, body: 0.25 },
  mem_protein:  { color: 0xff8c1a, glow: 2.0, power: 1.8, body: 0.35 },
  mem_channel:  { color: 0x39ff14, glow: 2.0, power: 1.8, body: 0.3 },
  mem_periph:   { color: 0xff2bd6, glow: 2.0, power: 1.8, body: 0.35 },
  mem_chol:     { color: 0xf4ff3a, glow: 2.0, body: 0.6 },
  mem_sugar:    { color: 0xb44bff, glow: 2.2, body: 0.8 },
};

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Лёгкий изгиб фрагмента, как у куска мембраны большой клетки.
const bendY = (x, z) => -0.05 * x * x + 0.03 * z * z;

// Бугристый белок: сфера со «складками» — выглядит органично.
function blob(rand, sx, sy, sz, detail = 3) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, detail));   // общие вершины — гладкие нормали
  const p = g.attributes.position, v = new THREE.Vector3();
  const a = rand() * 9, b = rand() * 9;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + 0.12 * Math.sin(v.x * 4 + a) * Math.sin(v.y * 5 + b) + 0.06 * Math.sin(v.z * 7 + a);
    p.setXYZ(i, v.x * sx * k, v.y * sy * k, v.z * sz * k);
  }
  g.computeVertexNormals();
  return g;
}

export function createMembrane() {
  const rand = rng(17);
  const group = new THREE.Group();
  const parts = [];
  const mesh = (geo, part, count) => {
    const p = MEMBRANE_PARTS[part];
    const m = count ? new THREE.InstancedMesh(geo, neon(p.color, p), count) : new THREE.Mesh(geo, neon(p.color, p));
    m.userData.part = part;
    group.add(m);
    parts.push(m);
    return m;
  };

  // Белки: интегральные (пронизывают оба слоя), канал (с отверстием), периферические.
  const proteins = [
    { x: -1.1, z: 0.3, r: 0.36, kind: 'mem_protein' },
    { x: 1.35, z: -0.55, r: 0.34, kind: 'mem_channel' },
    { x: 0.2, z: 0.9, r: 0.3, kind: 'mem_protein' },
    { x: 0.55, z: -1.0, r: 0.22, kind: 'mem_periph', top: true },
    { x: -0.4, z: -0.6, r: 0.24, kind: 'mem_periph', top: false },
  ];
  for (const pr of proteins) {
    const y = bendY(pr.x, pr.z);
    if (pr.kind === 'mem_channel') {
      // Белок-канал: бочонок с отверстием через всю мембрану.
      const prof = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12, yy = -0.62 + 1.24 * t;
        prof.push(new THREE.Vector2(0.13 + 0.22 * Math.sin(Math.PI * t) ** 0.6, yy));
      }
      const g = new THREE.LatheGeometry(prof, 28);
      const m = mesh(g, pr.kind);
      m.material.side = THREE.DoubleSide;
      m.position.set(pr.x, y, pr.z);
    } else if (pr.kind === 'mem_periph') {
      const m = mesh(blob(rand, pr.r * 1.2, pr.r * 0.8, pr.r), pr.kind);
      m.position.set(pr.x, y + (pr.top ? 1 : -1) * (LEAF + 0.1), pr.z);
    } else {
      const m = mesh(blob(rand, pr.r, 0.62, pr.r * 0.9), pr.kind);
      m.position.set(pr.x, y + 0.05, pr.z);
    }
  }
  const free = (x, z, pad) => proteins.every(p => (p.kind === 'mem_periph') || Math.hypot(x - p.x, z - p.z) > p.r + pad);

  // Липиды двух слоёв: головки наружу, хвосты внутрь мембраны.
  const spots = [];
  for (let x = -W / 2; x <= W / 2; x += STEP) {
    for (let z = -D / 2; z <= D / 2; z += STEP) {
      for (const side of [1, -1]) {
        const jx = x + (rand() - 0.5) * 0.04, jz = z + (rand() - 0.5) * 0.04 + (side < 0 ? STEP / 2 : 0);
        if (Math.abs(jz) > D / 2 || !free(jx, jz, 0.08)) continue;
        spots.push([jx, jz, side]);
      }
    }
  }

  // Хвосты: две извилистые жирнокислотные цепочки — одна геометрия на все липиды.
  const tail = (dx, ph) => {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push(new THREE.Vector3(dx + 0.018 * Math.sin(t * 9 + ph), -HEAD * 0.6 - t * (LEAF - HEAD - 0.02), 0.012 * Math.cos(t * 7 + ph)));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.011, 5, false);
  };
  const tailGeo = mergeGeometries([tail(-0.026, 0), tail(0.026, 1.7)]);
  const heads = mesh(new THREE.IcosahedronGeometry(HEAD, 1), 'mem_head', spots.length);
  const tails = mesh(tailGeo, 'mem_tail', spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1);
  spots.forEach(([x, z, side], i) => {
    const y = bendY(x, z) + side * LEAF;
    e.set(side > 0 ? 0 : Math.PI, rand() * 6.28, (rand() - 0.5) * 0.15);
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, y, z), q, s);
    heads.setMatrixAt(i, m4);
    tails.setMatrixAt(i, m4);
  });

  // Холестерин — короткие жёсткие палочки между хвостами.
  const chol = [];
  for (let i = 0; i < 60; i++) {
    const x = (rand() - 0.5) * W * 0.95, z = (rand() - 0.5) * D * 0.95;
    if (free(x, z, 0.1)) chol.push([x, z, rand() < 0.5 ? 1 : -1]);
  }
  const cm = mesh(new THREE.CapsuleGeometry(0.03, 0.16, 3, 6), 'mem_chol', chol.length);
  chol.forEach(([x, z, side], i) => {
    m4.compose(new THREE.Vector3(x, bendY(x, z) + side * (LEAF - 0.17), z), q.identity(), s);
    cm.setMatrixAt(i, m4);
  });

  // Гликокаликс: ветвистые цепочки углеводов на наружной стороне — на белках и липидах.
  const beads = [];
  const chain = (x, y, z, n, branch) => {
    let p = new THREE.Vector3(x, y, z);
    const d = new THREE.Vector3((rand() - 0.5) * 0.6, 1, (rand() - 0.5) * 0.6).normalize();
    for (let i = 0; i < n; i++) {
      p = p.clone().addScaledVector(d, 0.075);
      d.add(new THREE.Vector3((rand() - 0.5) * 0.7, 0, (rand() - 0.5) * 0.7)).normalize();
      beads.push(p);
      if (branch && i === 2) chain(p.x, p.y, p.z, 3, false);
    }
  };
  for (const pr of proteins.filter(p => p.kind !== 'mem_periph')) chain(pr.x, bendY(pr.x, pr.z) + 0.6, pr.z, 6, true);
  for (let i = 0; i < 9; i++) {
    const [x, z] = spots[Math.floor(rand() * spots.length)];
    chain(x, bendY(x, z) + LEAF + HEAD, z, 4 + Math.floor(rand() * 3), rand() < 0.5);
  }
  const sm = mesh(new THREE.IcosahedronGeometry(0.035, 1), 'mem_sugar', beads.length);
  beads.forEach((p, i) => { m4.compose(p, q.identity(), s); sm.setMatrixAt(i, m4); });

  // Лёгкое «дыхание»: липиды в мембране подвижны.
  function update(t) {
    group.position.y = Math.sin(t * 0.6) * 0.02;
  }
  return { group, parts, update, lipids: spots.length };
}

