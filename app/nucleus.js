import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bio, PALETTE } from './style.js';
import { dnaGeometry, nucleosomeGeometry, linker, paint, NUC } from './molecules.js';

// Внутренность ядра, построенная программно. На переднем плане — один участок
// хроматина: плотно упакованная фибрилла переходит в раскрытые нуклеосомы,
// а между ними — свободная от гистонов ДНК с точкой начала репликации.

export const NUCLEUS_RADIUS = 4.5;
export const ORI = new THREE.Vector3(0.48, 0.07, 0.38);   // точка начала репликации
export const VIEW = { camera: new THREE.Vector3(0.45, 0.4, 3.1), target: new THREE.Vector3(0.05, 0.05, 0) };

// Детерминированный генератор случайных чисел: сцена всегда одинаковая.
function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Случайное блуждание внутри шарового слоя — для дальних нитей хроматина.
function walk(rand, start, steps, minR, maxR) {
  const pts = [start.clone()];
  const dir = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
  const p = start.clone();
  for (let i = 0; i < steps; i++) {
    dir.multiplyScalar(0.7).add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.8)).normalize();
    p.addScaledVector(dir, 0.35);
    const l = p.length();
    if (l > maxR || l < minR) { p.multiplyScalar(THREE.MathUtils.clamp(l, minR, maxR) / l); dir.reflect(p.clone().normalize()); }
    pts.push(p.clone());
  }
  return pts;
}

function subCurve(curve, u0, u1, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(curve.getPointAt(u0 + (u1 - u0) * i / n));
  return new THREE.CatmullRomCurve3(pts);
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,230,140,1)');
  grad.addColorStop(0.35, 'rgba(255,200,80,.45)');
  grad.addColorStop(1, 'rgba(255,190,60,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function createNucleus() {
  const rand = rng(7);
  const group = new THREE.Group();

  // Ядерная оболочка видна изнутри, на ней — поры.
  group.add(new THREE.Mesh(
    new THREE.SphereGeometry(NUCLEUS_RADIUS, 64, 48),
    bio(0x2b2458, { side: THREE.BackSide })
  ));
  const pores = new THREE.InstancedMesh(new THREE.TorusGeometry(0.13, 0.035, 6, 18), bio(PALETTE.pore), 140);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), z = new THREE.Vector3(0, 0, 1), one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < pores.count; i++) {
    const n = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
    pores.setMatrixAt(i, m.compose(n.clone().multiplyScalar(NUCLEUS_RADIUS - 0.02), q.setFromUnitVectors(z, n), one));
  }
  group.add(pores);

  // Ядрышко — плотное тельце с неровной поверхностью.
  const nucGeo = new THREE.SphereGeometry(0.85, 48, 36);
  const pos = nucGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    v.multiplyScalar(1 + 0.08 * Math.sin(v.x * 7) * Math.sin(v.y * 6) * Math.sin(v.z * 8));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  nucGeo.computeVertexNormals();
  const nucleolus = new THREE.Mesh(nucGeo, bio(PALETTE.nucleolus));
  nucleolus.position.set(-2.3, -1.7, -2.6);
  group.add(nucleolus);

  // Дальние нити хроматина — простые трубки, тонут в дымке.
  const far = [];
  for (let f = 0; f < 14; f++) {
    const start = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize().multiplyScalar(2.2 + rand() * 1.4);
    far.push(paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(walk(rand, start, 22, 1.9, 3.9)), 160, 0.03, 5, false), f % 3 ? 0x5a4aa8 : 0x3f8f9e));
  }
  const background = new THREE.Mesh(mergeGeometries(far), bio(0xffffff, { vertexColors: true }));
  group.add(background);

  const nucGeometry = nucleosomeGeometry();
  const nucMat = bio(0xffffff, { vertexColors: true });

  // Плотно упакованная фибрилла: нуклеосомы уложены по спирали (соленоид).
  const axis = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.2, -0.2, -0.05), new THREE.Vector3(-1.55, 0.1, -0.45),
    new THREE.Vector3(-1.8, 0.55, -1.0), new THREE.Vector3(-1.85, 1.15, -1.65),
  ]);
  const CLOSED = 30;
  const frames = axis.computeFrenetFrames(CLOSED - 1, false);
  const closedM = [];
  for (let j = 0; j < CLOSED; j++) {
    const u = j / (CLOSED - 1), a = j * Math.PI * 2 / 6;
    const N = frames.normals[j], B = frames.binormals[j], T = frames.tangents[j];
    const radial = N.clone().multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
    const around = N.clone().multiplyScalar(-Math.sin(a)).addScaledVector(B, Math.cos(a)).addScaledVector(T, 0.35).normalize();
    const y = new THREE.Vector3().crossVectors(around, radial).normalize();
    const x = new THREE.Vector3().crossVectors(y, around);
    const M = new THREE.Matrix4().makeBasis(x, y, around).setPosition(axis.getPointAt(u).addScaledVector(radial, 0.19));
    closedM.push(M);
  }

  // Раскрытый участок: нуклеосомы разошлись, между ними видна линкерная ДНК.
  const openAt = [
    [-0.92, -0.04, 0.05], [-0.6, 0.17, 0.2], [-0.28, -0.05, 0.27], [0.02, 0.16, 0.32],
    [0.98, 0.04, 0.22], [1.3, 0.24, -0.05], [1.56, 0.02, -0.38], [1.8, 0.3, -0.75],
  ];
  const openM = openAt.map(p => new THREE.Matrix4().compose(
    new THREE.Vector3(...p),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 1.4 - 0.7, rand() * 1.4 - 0.7, rand() * 6.3)),
    one));

  const closed = new THREE.InstancedMesh(nucGeometry, nucMat, CLOSED);
  closedM.forEach((M, i) => closed.setMatrixAt(i, M));
  const open = new THREE.InstancedMesh(nucGeometry, nucMat, openM.length);
  openM.forEach((M, i) => open.setMatrixAt(i, M));

  const dnaMat = bio(0xffffff, { vertexColors: true });
  const closedLinks = [], openLinks = [];
  for (let j = CLOSED - 1; j > 0; j--) closedLinks.push(linker(closedM[j], closedM[j - 1]));
  closedLinks.push(linker(closedM[0], openM[0]));
  for (let i = 0; i < 3; i++) openLinks.push(linker(openM[i], openM[i + 1]));
  for (let i = 4; i < openM.length - 1; i++) openLinks.push(linker(openM[i], openM[i + 1]));

  // Свободный от гистонов участок ДНК между 4-й и 5-й нуклеосомами.
  const start = NUC.exit.clone().applyMatrix4(openM[3]), startDir = NUC.exitDir.clone().transformDirection(openM[3]);
  const end = NUC.entry.clone().applyMatrix4(openM[4]), endDir = NUC.entryDir.clone().transformDirection(openM[4]);
  const naked = new THREE.CatmullRomCurve3([
    start, start.clone().addScaledVector(startDir, 0.08), new THREE.Vector3(0.28, 0.03, 0.38), ORI,
    new THREE.Vector3(0.68, 0.12, 0.37), end.clone().addScaledVector(endDir, -0.08), end,
  ]);
  openLinks.push(dnaGeometry(subCurve(naked, 0, 0.36)), dnaGeometry(subCurve(naked, 0.64, 1)));
  const closedDna = new THREE.Mesh(mergeGeometries(closedLinks), dnaMat);
  const openDna = new THREE.Mesh(mergeGeometries(openLinks), dnaMat);
  group.add(closed, open, closedDna, openDna);

  // Точка начала репликации: светящийся участок ДНК.
  const ori = new THREE.Mesh(
    dnaGeometry(subCurve(naked, 0.36, 0.64), { color: 0xffe08a, rung: 0xfff3c4 }),
    bio(0xffffff, { vertexColors: true, neon: { body: 1.0, glow: 2.2 } })
  );
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  halo.position.copy(ORI);
  group.add(ori, halo);

  function update(t) {
    const k = 0.5 + 0.5 * Math.sin(t * 3);
    ori.material.uniforms.strength.value = 0.9 + 0.8 * k;
    halo.scale.setScalar(0.45 + 0.2 * k);
    halo.material.opacity = 0.45 + 0.4 * k;
  }

  return { group, ori, halo, open: [open, openDna], closed: [closed, closedDna], nucleolus, background, update };
}

