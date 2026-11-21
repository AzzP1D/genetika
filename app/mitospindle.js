import * as THREE from 'three';
import { neon } from './style.js';
import { loadModel, neonize, PARTS } from './organelles.js';

// Веретено деления для урока «Митоз»: две центросомы (готовая модель центриолей из «Атласа
// клетки») с лучами микротрубочек и нити между ними. Микротрубочки — зелёные, как в атласе.
// Состояние задают два числа:
//   dup(k)         — удвоение центросомы: 0 — одна, 1 — две рядом;
//   spread(a, b)   — путь каждой центросомы к своему полюсу: 0 — рядом друг с другом, 1 — на полюсе.
// Ось веретена — вертикальная (Y): полюса сверху и снизу ядра.

const UP = new THREE.Vector3(0, 1, 0);
const START = new THREE.Vector3(0.9, 0, 0.45).normalize();   // где центросома лежит в интерфазе (сбоку от ядра)
const NEAR = 0.2;                                            // угол между центросомами сразу после удвоения

// Трубка, форму которой можно менять каждый кадр (растущая и гнущаяся микротрубочка).
export class Tube {
  constructor(segs, radial, material) {
    this.segs = segs;
    this.radial = radial;
    const n = (segs + 1) * radial, index = [];
    for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + (j + 1) % radial;
      index.push(a, b, a + radial, b, b + radial, a + radial);
    }
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.nor = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pos);
    geo.setAttribute('normal', this.nor);
    geo.setIndex(index);
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    this.pts = Array.from({ length: segs + 1 }, () => new THREE.Vector3());
  }
  // curve(u, out) кладёт в out точку кривой (u от 0 до 1); рисуется её часть from…to.
  // Конец to — растущий: он заострён.
  set(curve, from, to, radius) {
    const { segs, radial, pts } = this, T = Tube.T, N = Tube.N, B = Tube.B;
    for (let i = 0; i <= segs; i++) curve(from + (to - from) * i / segs, pts[i]);
    N.set(0.31, 0.83, 0.46);
    for (let i = 0; i <= segs; i++) {
      T.subVectors(pts[Math.min(i + 1, segs)], pts[Math.max(i - 1, 0)]).normalize();
      N.addScaledVector(T, -N.dot(T)).normalize();
      B.crossVectors(T, N);
      const r = radius * (i === segs ? 0.3 : 1), p = pts[i];
      for (let j = 0; j < radial; j++) {
        const a = j / radial * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), k = i * radial + j;
        const nx = N.x * c + B.x * s, ny = N.y * c + B.y * s, nz = N.z * c + B.z * s;
        this.pos.setXYZ(k, p.x + nx * r, p.y + ny * r, p.z + nz * r);
        this.nor.setXYZ(k, nx, ny, nz);
      }
    }
    this.pos.needsUpdate = this.nor.needsUpdate = true;
  }
}
Tube.T = new THREE.Vector3(); Tube.N = new THREE.Vector3(); Tube.B = new THREE.Vector3();

function glowTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner); grad.addColorStop(0.4, outer); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// Метка-кольцо (полюс, цель задания): пунктирная окружность, всегда повёрнутая к камере.
let ringMap = null;
export function ringSprite() {
  ringMap ||= ringTexture();
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: ringMap, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
}
function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#d8ffd0'; g.lineWidth = 6; g.setLineDash([16, 11]);
  g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.stroke();
  return new THREE.CanvasTexture(c);
}

// nucleusR и cellR — радиусы ядра и клетки (нити их не протыкают), olymp — олимпиадный уровень:
// длинные астральные лучи до мембраны и больше нитей между полюсами.
export function createSpindle({ nucleusR, cellR, olymp = false }) {
  const group = new THREE.Group();
  const R = nucleusR + 0.8;                       // на таком расстоянии от центра ядра ходят центросомы
  const RAYS = 16, FIBERS = olymp ? 10 : 7;
  const rayMax = olymp ? 2.4 : 1.0;
  const mtMat = neon(PARTS.cyto_mt.color, PARTS.cyto_mt);
  mtMat.side = THREE.DoubleSide;
  // Нити к кинетохорам — пучки микротрубочек: толще и светлее, чтобы отличались от остальных.
  const kMat = neon(PARTS.tub_beta.color, { glow: 2.4, power: 1.8, body: 0.9 });
  kMat.side = THREE.DoubleSide;

  let dupK = 0;
  const way = [0, 0];

  // ---------- центросомы ----------
  const rayGeo = new THREE.CylinderGeometry(0.4, 1, 1, 5, 1, true).translate(0, 0.5, 0);
  const centrosomes = [1, -1].map((sign, n) => {
    const holder = new THREE.Group();
    const body = new THREE.Group();          // пара центриолей
    loadModel('centrioles').then(src => {
      const model = src.clone(true);
      neonize(model);
      const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()).length();
      model.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-0.7 / size);
      model.scale.setScalar(0.7 / size);
      body.add(model);
    });
    body.rotation.set(0.4 + n, 0.6 - n * 2, n * 0.8);
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(190,255,170,.55)', 'rgba(93,255,58,.16)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    cloud.scale.setScalar(1.5);
    const rays = new THREE.InstancedMesh(rayGeo, mtMat, RAYS);
    rays.frustumCulled = false;
    rays.raycast = () => {};
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
    holder.add(body, cloud, rays, hit);
    group.add(holder);
    // Направления лучей — равномерно во все стороны; у каждого луча свой ритм роста.
    const dirs = [], rhythm = [];
    for (let i = 0; i < RAYS; i++) {
      const y = 1 - 2 * (i + 0.5) / RAYS, r = Math.sqrt(1 - y * y), a = i * 2.39996 + n * 1.3;
      dirs.push(new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a)));
      rhythm.push([5 + (i * 7 + n * 3) % 5 * 0.9, (i * 0.37 + n * 0.21) % 1, 0.55 + (i * 5 + n) % 7 / 7 * 0.45]);
    }
    return { sign, group: holder, body, rays, hit, dirs, rhythm, marker: null };
  });

  // Метки полюсов — куда вести центросомы.
  for (const c of centrosomes) {
    c.marker = ringSprite();
    c.marker.position.set(0, c.sign * R, 0);
    c.marker.visible = false;
    group.add(c.marker);
  }

  // ---------- нити между центросомами ----------
  // Каждая нить — две микротрубочки, растущие навстречу друг другу от двух центросом;
  // посередине они перекрываются. Нити огибают ядро по разным «меридианам».
  const fibers = [];
  for (let k = 0; k < FIBERS; k++) {
    const lon = THREE.MathUtils.degToRad(-150 + 300 * k / (FIBERS - 1));
    fibers.push({ lon, r: nucleusR + 0.3 + (k * 3 % 4) * 0.06, slim: 1.25 + (k * 3 % 4) * 0.3, halves: [new Tube(14, 5, mtMat), new Tube(14, 5, mtMat)] });
    group.add(fibers[k].halves[0].mesh, fibers[k].halves[1].mesh);
  }

  const A = new THREE.Vector3(), B = new THREE.Vector3(), M = new THREE.Vector3(), S = new THREE.Vector3();
  const centralPoint = new THREE.Vector3();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), zero = new THREE.Vector3();
  let shift = 0, extension = 0, centralK = 0, bridgePinch = 0, bridgeClearance = 0, bridgeDecay = 0;
  // Точка нити: u = 0 — у верхней центросомы, 1 — у нижней.
  function fiberPoint(u, out) {
    const w = 2 * u * (1 - u) * 1.2;
    out.copy(A).multiplyScalar((1 - u) * (1 - u)).addScaledVector(M, w).addScaledVector(B, u * u).normalize();
    S.crossVectors(out, UP).normalize();
    const r = R + (fiberPoint.r - R) * Math.sin(Math.PI * u);
    out.multiplyScalar(r);
    out.y *= 1 + .18 * extension;
    if (centralK > 0) {
      centralPoint.copy(M).multiplyScalar(fiberPoint.centralRadius).addScaledVector(UP, 9 * (.5 - u));
      out.lerp(centralPoint, centralK);
    }
    out.addScaledVector(S, shift);
  }

  // ---------- нити к кинетохорам ----------
  // Нить идёт от полюса к кинетохору по слегка выгнутой дуге. Растёт при креплении,
  // втягивается при откреплении.
  let openK = 0, slimK = 0;         // ядро раскрыто (оболочка распалась); веретено стянулось
  const kfibers = new Map();        // ключ → { pole, target, grow, goal, tube, end }
  const probe = new Tube(12, 6, kMat);   // пробная нить, которую ученик тянет от полюса
  let probePole = -1;
  const probeEnd = new THREE.Vector3();
  probe.mesh.visible = false;
  group.add(probe.mesh);
  const P0 = new THREE.Vector3(), P1 = new THREE.Vector3(), PC = new THREE.Vector3();
  function arc(u, out) {
    const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    out.set(a * P0.x + b * PC.x + c * P1.x, a * P0.y + b * PC.y + c * P1.y, a * P0.z + b * PC.z + c * P1.z);
  }
  function drawArc(tube, pole, end, grow, radius) {
    P0.copy(centrosomes[pole].group.position);
    P1.copy(end);
    PC.addVectors(P0, P1).multiplyScalar(0.5);
    const h = Math.hypot(PC.x, PC.z), bow = 0.12 * P0.distanceTo(P1);
    if (h > 0.05) { PC.x += PC.x / h * bow; PC.z += PC.z / h * bow; }
    tube.set(arc, 0, grow, radius);
  }
  function remove(key) {
    const f = kfibers.get(key);
    if (!f) return;
    group.remove(f.tube.mesh);
    f.tube.mesh.geometry.dispose();
    kfibers.delete(key);
  }

  // Длина луча: растёт медленно, укорачивается быстро (динамическая нестабильность микротрубочек).
  function rayLength(t, [period, phase, top]) {
    const x = (t / period + phase) % 1;
    const k = x < 0.82 ? 1 - Math.pow(1 - x / 0.82, 2) : 0.5 + 0.5 * Math.cos((x - 0.82) / 0.18 * Math.PI);
    return 0.18 + (top * rayMax - 0.18) * k;
  }
  // До какой длины луч может дорасти, не задев ядро и мембрану.
  function room(from, dir) {
    const b = from.dot(dir), c = from.lengthSq();
    let max = -b + Math.sqrt(Math.max(0, b * b - c + (cellR - 0.25) * (cellR - 0.25)));
    const core = (nucleusR + 0.05) * (1 - openK);   // пока оболочка цела, лучи в ядро не заходят
    const d = b * b - c + core * core;
    if (core > 0.1 && d > 0 && -b - Math.sqrt(d) > 0) max = Math.min(max, -b - Math.sqrt(d));
    return Math.max(0, max - 0.05);
  }

  const spindle = {
    group, centrosomes, radius: R,
    hits: centrosomes.map(c => c.hit),

    // Удвоение центросомы: вторая пара центриолей вырастает рядом с первой.
    dup(k) { dupK = k; },
    // Путь центросом к полюсам: a — верхней, b — нижней (0…1).
    spread(a, b) { way[0] = a; way[1] = b; },
    elongate(k) { extension = THREE.MathUtils.clamp(k, 0, 1); },
    // В телофазе полярные нити собираются в пучок между дочерними ядрами.
    compact(k) { centralK = k; },
    // В мостике концы микротрубочек расходятся по обе стороны от места разрыва.
    constrictBridge(pinch, clearance = 0, decay = 0) {
      bridgePinch = pinch; bridgeClearance = clearance; bridgeDecay = decay;
    },
    // Контрольная точка проверяет реальные нити, а не только положение хромосом.
    attached(key, pole) {
      const f = kfibers.get(key);
      return !!f && f.pole === pole && f.goal === 1 && f.grow > .98;
    },
    way: i => way[i],
    // Где окажется центросома i, пройдя долю пути k (0 — исходное место, 1 — полюс).
    placeOf(i, k, out) {
      const ang = NEAR * dupK + (Math.PI / 2 - NEAR) * k;
      // Центросомы смещаются наружу, освобождая место для дочерних ядер.
      const poleR = R * (1 + .18 * extension) + 1.16 * centralK * (2 - centralK);
      return out.copy(START).multiplyScalar(R * Math.cos(ang)).addScaledVector(UP, centrosomes[i].sign * poleR * Math.sin(ang));
    },
    markers(on) { for (const c of centrosomes) c.marker.visible = on; },
    // Оболочка ядра распалась (0…1): лучи заходят в область ядра, а нити между полюсами
    // стягиваются внутрь — веретено принимает свою форму.
    open(k) { openK = slimK = k; },

    // Нить от полюса pole к кинетохору. key — имя нити; target(out) кладёт в out точку
    // кинетохора (в координатах клетки); grown — какая часть нити уже есть.
    attach(key, pole, target, grown = 0) {
      remove(key);
      const tube = new Tube(10, 6, kMat);
      group.add(tube.mesh);
      kfibers.set(key, { pole, target, grow: grown, goal: 1, tube, end: new THREE.Vector3() });
    },
    // Нить отсоединяется и втягивается к полюсу.
    detach(key) { const f = kfibers.get(key); if (f) f.goal = 0; },
    releaseKinetochores() { for (const f of kfibers.values()) f.goal = 0; },
    clear() { for (const key of [...kfibers.keys()]) remove(key); probePole = -1; },
    // Пробная нить от полюса к точке под пальцем (point = null — убрать).
    probe(pole, point) { probePole = point ? pole : -1; if (point) probeEnd.copy(point); },

    update(dt, t) {
      // Центросомы на своих местах.
      centrosomes.forEach((c, i) => {
        spindle.placeOf(i, way[i], c.group.position);
        const size = i === 0 ? 1 : dupK;
        c.group.visible = size > 0.04;
        c.group.scale.setScalar(size);
        c.body.rotation.y += dt * 0.25;
        for (let j = 0; j < RAYS; j++) {
          const len = Math.min(rayLength(t, c.rhythm[j]) * (1 - .82 * centralK), room(c.group.position, c.dirs[j]));
          m4.compose(zero, q.setFromUnitVectors(UP, c.dirs[j]), sc.set(0.02, Math.max(len, 0.01), 0.02));
          c.rays.setMatrixAt(j, m4);
        }
        c.rays.instanceMatrix.needsUpdate = true;
        if (c.marker.visible) {
          c.marker.scale.setScalar(1.25 + 0.12 * Math.sin(t * 3));
          c.marker.material.opacity = way[i] > 0.97 ? 0 : 0.9;
        }
      });

      // Нити между центросомами: чем дальше те разошлись, тем длиннее нити и тем шире они
      // расходятся вокруг ядра.
      const sep = (way[0] + way[1]) / 2;
      const grown = 0.56 * THREE.MathUtils.smoothstep(sep, 0.02, 0.85);
      const fan = THREE.MathUtils.smoothstep(sep, 0.05, 0.9);
      const from = .40 * centralK + .009 * bridgePinch;
      const mix = THREE.MathUtils.lerp;
      const radius = mix(mix(.03,.021,centralK),.027,bridgePinch)*(1-.8*bridgeDecay);
      const overlap = THREE.MathUtils.lerp(grown, .54, centralK);
      A.copy(centrosomes[0].group.position).normalize();
      B.copy(centrosomes[1].group.position).normalize();
      for (const [i, f] of fibers.entries()) {
        const show = grown > 0.03 && bridgeDecay < 1;
        f.halves[0].mesh.visible = f.halves[1].mesh.visible = show;
        if (!show) continue;
        M.copy(START).applyAxisAngle(UP, f.lon * fan);
        fiberPoint.r = THREE.MathUtils.lerp(f.r, f.slim, slimK);
        fiberPoint.centralRadius = (.14 + (f.slim - 1.25) * .26) * (1 - .53 * bridgePinch);
        const breath = 0.03 * Math.sin(t * 0.8 + f.lon * 3) * (1 - centralK);
        const clear = THREE.MathUtils.smoothstep(bridgeClearance, (i % 4) * .085, .76 + (i % 4) * .07);
        const upperEnd = mix(overlap+breath+.045*bridgePinch,.552-(i%3)*.005,clear);
        const lowerEnd = mix(1-overlap+breath,.593+(i%3)*.005,clear);
        shift = 0.05;
        f.halves[0].set(fiberPoint,mix(from,.487,bridgeDecay),mix(upperEnd,.51,bridgeDecay),radius);
        shift = -0.05;
        f.halves[1].set(fiberPoint,mix(1-from+.035*bridgePinch,.604,bridgeDecay),mix(lowerEnd,.604,bridgeDecay),radius);
      }

      // Нити к кинетохорам.
      for (const [key, f] of kfibers) {
        f.grow += (f.goal - f.grow) * (1 - Math.exp(-dt * 5));
        if (f.goal === 0 && f.grow < 0.04) { remove(key); continue; }
        f.target(f.end);
        f.tube.mesh.visible = f.grow > 0.03;
        if (f.tube.mesh.visible) drawArc(f.tube, f.pole, f.end, f.grow > 0.995 ? 1 : f.grow, 0.055);
      }
      probe.mesh.visible = probePole >= 0;
      if (probePole >= 0) drawArc(probe, probePole, probeEnd, 1, 0.05);
    },
  };
  return spindle;
}
