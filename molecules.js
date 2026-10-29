import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from './style.js';

// Геометрия молекул для сцены ядра: двойная спираль вдоль любой кривой
// и нуклеосома (гистоновый октамер с намотанной ДНК и «хвостами»).

const PHI = 2.35;   // сдвиг второй цепи: так видны большая и малая бороздки
const UP = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

// Перекрашивает геометрию одним цветом (через атрибут цвета вершин) и готовит к слиянию.
export function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  _c.setHex(hex);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([_c.r, _c.g, _c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function rod(a, b, r, hex, radial = 4) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, radial, 1, true);
  g.applyMatrix4(new THREE.Matrix4().compose(
    a.clone().add(b).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(UP, d.divideScalar(len)),
    new THREE.Vector3(1, 1, 1)));
  return paint(g, hex);
}

// Двойная спираль вдоль кривой: две тонкие цепи и «ступеньки» оснований.
export function dnaGeometry(curve, { r = 0.02, strand = 0.0045, pitch = 0.09, perTurn = 6, color = PALETTE.dna, rung = 0xe6fbff } = {}) {
  const len = curve.getLength(), turns = len / pitch;
  const segs = Math.max(12, Math.ceil(turns * 10));
  const { normals, binormals } = curve.computeFrenetFrames(segs, false);
  const P = new THREE.Vector3();
  const at = (u, k) => {
    const j = Math.round(u * segs), th = u * turns * Math.PI * 2 + k * PHI;
    curve.getPointAt(u, P);
    return P.clone().addScaledVector(normals[j], r * Math.cos(th)).addScaledVector(binormals[j], r * Math.sin(th));
  };
  const parts = [];
  for (let k = 0; k < 2; k++) {
    const pts = [];
    for (let j = 0; j <= segs; j++) pts.push(at(j / segs, k));
    parts.push(paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, strand, 4, false), color));
  }
  const n = Math.floor(turns * perTurn);
  for (let m = 0; m < n; m++) {
    const u = (m + 0.5) / n;
    parts.push(rod(at(u, 0), at(u, 1), strand * 0.6, rung, 3));
  }
  return mergeGeometries(parts);
}

// Размеры нуклеосомы. Вход и выход ДНК нужны, чтобы соединять нуклеосомы линкерной ДНК.
export const NUC = { R: 0.1, DNA_R: 0.02 };
const RS = 0.146, ZSPAN = 0.088, TURNS = 1.65, PHI0 = -0.6;

function superhelix(u) {
  const a = PHI0 + u * TURNS * Math.PI * 2;
  return new THREE.Vector3(RS * Math.cos(a), RS * Math.sin(a), ZSPAN * (u - 0.5));
}
const tangent = u => superhelix(Math.min(1, u + 1e-3)).sub(superhelix(Math.max(0, u - 1e-3))).normalize();
const STUB = 0.05;
NUC.entry = superhelix(0).addScaledVector(tangent(0), -STUB);
NUC.entryDir = tangent(0);                         // направление, в котором ДНК входит
NUC.exit = superhelix(1).addScaledVector(tangent(1), STUB);
NUC.exitDir = tangent(1);

function sector(a0, a1, R) {
  const s = new THREE.Shape(), mid = (a0 + a1) / 2;
  s.moveTo(0.012 * Math.cos(mid), 0.012 * Math.sin(mid));
  s.lineTo(R * Math.cos(a0), R * Math.sin(a0));
  s.absarc(0, 0, R, a0, a1, false);
  s.closePath();
  return s;
}

export function nucleosomeGeometry() {
  const parts = [];

  // Октамер: 8 гистонов в два слоя по 4 дольки.
  const depth = 0.022, bevel = 0.008, gap = 0.035;
  for (let layer = 0; layer < 2; layer++) {
    for (let q = 0; q < 4; q++) {
      const a0 = q * Math.PI / 2 + gap, a1 = (q + 1) * Math.PI / 2 - gap;
      const g = new THREE.ExtrudeGeometry(sector(a0, a1, NUC.R - 0.008), {
        depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: 0.007, bevelSegments: 2, curveSegments: 7,
      });
      g.translate(0, 0, layer ? 0.004 + bevel : -(0.004 + bevel + depth));
      parts.push(paint(g, (q + layer) % 2 ? PALETTE.h3h4 : PALETTE.h2));
    }
  }

  // ДНК, намотанная почти на два оборота.
  const pts = [NUC.entry];
  for (let j = 0; j <= 48; j++) pts.push(superhelix(j / 48));
  pts.push(NUC.exit);
  parts.push(dnaGeometry(new THREE.CatmullRomCurve3(pts), { r: NUC.DNA_R }));

  // Гистоновые «хвосты» с яркими метками на концах.
  for (let t = 0; t < 6; t++) {
    const a = t * Math.PI / 3 + 0.4, z = t % 2 ? 0.03 : -0.03;
    const out = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
    const p0 = new THREE.Vector3(0.07 * Math.cos(a), 0.07 * Math.sin(a), z);
    const p1 = p0.clone().addScaledVector(out, 0.11).add(new THREE.Vector3(0, 0, z * 1.6));
    const p2 = p1.clone().addScaledVector(out, 0.05).add(new THREE.Vector3(-out.y, out.x, 0).multiplyScalar(0.06));
    const c = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    parts.push(paint(new THREE.TubeGeometry(c, 10, 0.0055, 4, false), PALETTE.tail));
    if (t % 2 === 0) parts.push(paint(new THREE.IcosahedronGeometry(0.014, 0).translate(p2.x, p2.y, p2.z), PALETTE.mark));
  }
  return mergeGeometries(parts);
}

// Линкерная ДНК между выходом одной нуклеосомы и входом следующей.
export function linker(fromMatrix, toMatrix, opts) {
  const a = NUC.exit.clone().applyMatrix4(fromMatrix);
  const b = NUC.entry.clone().applyMatrix4(toMatrix);
  const da = NUC.exitDir.clone().transformDirection(fromMatrix);
  const db = NUC.entryDir.clone().transformDirection(toMatrix);
  const k = Math.max(0.06, a.distanceTo(b) * 0.4);
  const curve = new THREE.CubicBezierCurve3(a, a.clone().addScaledVector(da, k), b.clone().addScaledVector(db, -k), b);
  return dnaGeometry(curve, opts);
}
