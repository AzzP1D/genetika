import * as THREE from 'three';
import { neon } from './style.js';
import { PARTS } from './organelles.js';
import { createChromosome, KARYOTYPE, BEND } from './mitochrom.js';
import { createSpindle } from './mitospindle.js';

// Клетка урока «Митоз» — одна на все этапы: мембрана, ядро с оболочкой и порами, ядрышко,
// восемь хромосом, центросомы и веретено деления (mitospindle.js). Этапы (mitosis-stages.js) меняют её состояние, а не строят сцену заново.
// Цвета частей — те же, что в «Атласе клетки» (PARTS в organelles.js).

export const SCALE = 0.6;        // клетка построена в «единицах хромосомы» и уменьшена целиком
const CELL_R = 6.4;              // радиус клетки (до уменьшения)
const NUCLEUS_R = 3.0;           // радиус ядра

// Случайные, но всегда одинаковые числа: клетка выглядит одинаково при каждом запуске.
function random(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Шар с плавными неровностями — живая форма вместо идеальной сферы.
function lumpy(radius, amount, f) {
  const geo = new THREE.SphereGeometry(radius, 64, 48);
  const pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    v.multiplyScalar(radius * (1 + amount * Math.sin(v.x * f[0] + 1) * Math.sin(v.y * f[1] + 2) * Math.sin(v.z * f[2])));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  return geo;
}

// Узор, по которому оболочка ядра распадается: одна и та же формула в шейдере оболочки
// и здесь — чтобы поры исчезали, а пузырьки появлялись там, где в оболочке открылась дыра.
const breakNoise = p => 0.5 + 0.5 * Math.sin(p.x * 1.9 + 1.3 * Math.sin(p.y * 1.4)) * Math.sin(p.y * 2.1 + 1.3 * Math.sin(p.z * 1.6)) * Math.sin(p.z * 1.7 + 1.3 * Math.sin(p.x * 2.2));

// Мембрана оболочки ядра: светящееся «стекло», которое умеет распадаться (uBreak 0…1).
function shell(p) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(p.color) }, glow: { value: p.glow }, power: { value: p.power }, strength: { value: p.strength }, uBreak: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vPos;
      void main() {
        vPos = position;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float glow, power, strength, uBreak;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vPos;
      void main() {
        float n = 0.5 + 0.5 * sin(vPos.x * 1.9 + 1.3 * sin(vPos.y * 1.4)) * sin(vPos.y * 2.1 + 1.3 * sin(vPos.z * 1.6)) * sin(vPos.z * 1.7 + 1.3 * sin(vPos.x * 2.2));
        float edge = n - uBreak * 1.1;
        if (uBreak > 0.0 && edge < 0.0) discard;
        float rim = pow(1.0 - clamp(abs(dot(normalize(vNormal), normalize(vView))), 0.0, 1.0), power);
        float burn = uBreak > 0.0 ? 1.0 - smoothstep(0.0, 0.1, edge) : 0.0;   // края дыр светятся
        vec3 c = uColor * rim * glow + vec3(pow(rim, 6.0) * 0.35) + uColor * burn * 0.9;
        gl_FragColor = vec4(clamp(c * strength, 0.0, 8.0), 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
}

// Места хромосом в ядре: случайные, но так, чтобы плотные хромосомы не пересекались
// друг с другом и не выходили за оболочку.
function layout(rand) {
  const taken = [], places = [];
  const point = new THREE.Vector3();
  for (let n = 0; n < KARYOTYPE.length * 2; n++) {
    const k = KARYOTYPE[n >> 1];
    let best = null;
    for (let tries = 0; tries < 4000; tries++) {
      const u1 = rand(), u2 = rand() * Math.PI * 2, u3 = rand() * Math.PI * 2;
      const q = new THREE.Quaternion(Math.sqrt(1 - u1) * Math.sin(u2), Math.sqrt(1 - u1) * Math.cos(u2), Math.sqrt(u1) * Math.sin(u3), Math.sqrt(u1) * Math.cos(u3));
      const p = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).multiplyScalar(NUCLEUS_R * 0.75);
      const pts = [];
      let room = Infinity;
      for (let j = 0; j <= 6; j++) {
        point.set(0, (j / 6 - k.cen) * k.len, 0).applyQuaternion(q).add(p);
        room = Math.min(room, NUCLEUS_R * 0.86 - point.length());
        for (const o of taken) room = Math.min(room, point.distanceTo(o) - 1.0);
        pts.push(point.clone());
      }
      if (!best || room > best.room) best = { room, q, p, pts };
      if (room > 0) break;
    }
    taken.push(...best.pts);
    places.push(best);
  }
  return places;
}

export function createWorld() {
  const rand = random(11);
  const group = new THREE.Group();
  group.scale.setScalar(SCALE);

  // Плазматическая мембрана — полупрозрачная оболочка клетки.
  const membrane = new THREE.Mesh(lumpy(CELL_R, 0.022, [3.1, 2.7, 3.4]), neon(PARTS.cell_membrane.color, { ...PARTS.cell_membrane, power: 4.2, strength: 0.24 }));
  group.add(membrane);

  // Ядерная оболочка: две мембраны и поры.
  const nucleus = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.SphereGeometry(NUCLEUS_R, 64, 48), shell(PARTS.nuc_outer));
  const inner = new THREE.Mesh(new THREE.SphereGeometry(NUCLEUS_R - 0.14, 48, 36), shell(PARTS.nuc_inner));
  const pores = new THREE.InstancedMesh(new THREE.TorusGeometry(0.1, 0.032, 6, 16), neon(PARTS.nuc_pore.color, { ...PARTS.nuc_pore, strength: 0.7 }), 84);
  const m4 = new THREE.Matrix4(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
  const poreAt = [];   // место каждой поры: { p, q, n } (n — когда до неё дойдёт распад)
  {
    const z = new THREE.Vector3(0, 0, 1), n = new THREE.Vector3();
    for (let i = 0; i < pores.count; i++) {
      // Равномерно по сфере (спираль Фибоначчи) с небольшим разбросом.
      const y = 1 - 2 * (i + 0.5) / pores.count, r = Math.sqrt(1 - y * y), a = i * 2.39996 + rand() * 0.5;
      n.set(r * Math.cos(a), y + (rand() - 0.5) * 0.06, r * Math.sin(a)).normalize();
      const p = n.clone().multiplyScalar(NUCLEUS_R - 0.06);
      poreAt.push({ p, q: new THREE.Quaternion().setFromUnitVectors(z, n), n: breakNoise(n.clone().multiplyScalar(NUCLEUS_R)) });
    }
  }
  pores.raycast = inner.raycast = () => {};
  nucleus.add(outer, inner, pores);
  group.add(nucleus);

  // Пузырьки, на которые распадается оболочка: появляются на месте дыр и уплывают в цитоплазму.
  const vesicles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8),
    neon(PARTS.nuc_outer.color, { glass: true, glow: 1.8, power: 3.0, body: 0.0, strength: 0.6 }), 44);
  vesicles.raycast = () => {};
  vesicles.frustumCulled = false;
  vesicles.visible = false;
  const vesicleAt = [];
  for (let i = 0; i < vesicles.count; i++) {
    const y = 1 - 2 * (i + 0.5) / vesicles.count, r = Math.sqrt(1 - y * y), a = i * 2.39996 + rand() * 0.8;
    const d = new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a));
    vesicleAt.push({ d, n: breakNoise(d.clone().multiplyScalar(NUCLEUS_R)), size: 0.09 + rand() * 0.09, far: 4.4 + rand() * 1.3,
      // уплывая, пузырьки смещаются к «экватору» клетки — подальше от полюсов веретена
      to: new THREE.Vector3(d.x, d.y * 0.6, d.z).normalize(), phase: rand() * 6.28 });
  }
  group.add(vesicles);
  let breakK = 0;
  const noTurn = new THREE.Quaternion();

  // Ядрышко — плотное тельце с неровной поверхностью.
  const nucleolus = new THREE.Mesh(lumpy(0.62, 0.08, [7, 6, 8]), neon(PARTS.nuc_nucleolus.color, PARTS.nuc_nucleolus));
  nucleolus.position.set(1.0, 0.7, 0.5);
  group.add(nucleolus);

  // Хромосомы: 2n = 8. Каждая лежит на своём месте в ядре — и рыхлой нитью, и плотной хромосомой.
  const chromatin = new THREE.Group();
  const center = new THREE.Vector3();
  const chromosomes = layout(rand).map((place, n) => {
    const ch = createChromosome(n >> 1, n % 2 ? 'pat' : 'mat', { scale: SCALE });
    ch.group.position.copy(place.p);
    ch.group.quaternion.copy(place.q);
    ch.cage(center, NUCLEUS_R * 0.93);
    // rest — место в ядре; goal — куда хромосома плавно движется сейчас (этапы меняют goal).
    ch.rest = { p: place.p.clone(), q: place.q.clone() };
    ch.goal = { p: place.p.clone(), q: place.q.clone() };
    chromatin.add(ch.group);
    return ch;
  });
  group.add(chromatin);

  // Центросомы и нити веретена.
  const spindle = createSpindle({ nucleusR: NUCLEUS_R, cellR: CELL_R, olymp: !!(window.Level && window.Level.isOlymp()) });
  group.add(spindle.group);

  const world = {
    group, membrane, nucleus, nucleolus, chromatin, chromosomes, spindle, elongation: 0, metaphaseReady: false,
    radius: { cell: CELL_R * SCALE, nucleus: NUCLEUS_R * SCALE, spindle: spindle.radius * SCALE },

    // Упаковка всех хромосом: 0 — рыхлый хроматин, 1 — плотные хромосомы.
    // Ядрышко исчезает по мере упаковки.
    cond(c) {
      for (const ch of chromosomes) ch.cond(c);
      const k = 1 - THREE.MathUtils.smoothstep(c, 0.2, 0.8);
      nucleolus.visible = k > 0.05;
      nucleolus.scale.setScalar(k);
      nucleolus.material.uniforms.strength.value = 0.35 + 0.65 * k;
    },

    // Распад оболочки ядра на пузырьки: 0 — цела, 1 — распалась.
    envelope(k) {
      breakK = k;
      outer.material.uniforms.uBreak.value = inner.material.uniforms.uBreak.value = k;
      nucleus.visible = k < 1;
      vesicles.visible = k > 0;
      poreAt.forEach((o, i) => {
        const s = THREE.MathUtils.smoothstep(o.n - k * 1.1, 0, 0.1);
        pores.setMatrixAt(i, m4.compose(o.p, o.q, tmpS.setScalar(Math.max(s, 0.001))));
      });
      pores.instanceMatrix.needsUpdate = true;
      spindle.open(k);
    },

    // Поворот ядра (жест «скрутить») переносится на сами хромосомы — дальше они движутся
    // в координатах клетки, без скачка на экране.
    bake() {
      chromatin.updateMatrix();
      for (const ch of chromosomes) {
        ch.group.position.applyMatrix4(chromatin.matrix);
        ch.group.quaternion.premultiply(chromatin.quaternion);
        ch.goal.p.copy(ch.group.position);
        ch.goal.q.copy(ch.group.quaternion);
      }
      chromatin.rotation.set(0, 0, 0);
    },

    // Где кинетохор хроматиды n хромосомы ch (в координатах клетки).
    kinetochore(ch, n, out) { return group.worldToLocal(ch.chromatids[n].kinetochore.getWorldPosition(out)); },

    // Мгновенно ставит клетку в состояние начала этапа (для перехода «сразу на этап»).
    pose(stage) {
      world.elongation = 0;
      world.metaphaseReady = false;
      spindle.elongate(0);
      const early = stage === 'interphase' || stage === 'prophase';
      chromatin.rotation.set(0, 0, 0);
      for (const ch of chromosomes) {
        ch.group.position.copy(ch.rest.p);
        ch.group.quaternion.copy(ch.rest.q);
        ch.goal.p.copy(ch.rest.p);
        ch.goal.q.copy(ch.rest.q);
        ch.shine(1);
        ch.pulse(1);
        ch.apart(0);
        ch.bend(BEND.meta);
      }
      spindle.clear();
      world.envelope(0);
      world.cond(early ? 0 : 1);
      spindle.dup(stage === 'interphase' ? 0 : 1);
      spindle.spread(early ? 0 : 1, early ? 0 : 1);
      spindle.markers(false);
    },

    // Спокойная жизнь клетки: нити хроматина «дышат», мембрана чуть колышется.
    update(dt, t) {
      const k = 1 - Math.exp(-dt * 3);
      for (const ch of chromosomes) {
        ch.tick(t);
        ch.group.position.lerp(ch.goal.p, k);
        ch.group.quaternion.slerp(ch.goal.q, k);
      }
      spindle.update(dt, t);
      if (breakK > 0) {
        vesicleAt.forEach((o, i) => {
          const born = THREE.MathUtils.clamp((breakK * 1.1 - o.n) / 0.3, 0, 1);
          const gone = born * born * (3 - 2 * born);
          tmpP.copy(o.d).lerp(o.to, gone).normalize().multiplyScalar(NUCLEUS_R + (o.far - NUCLEUS_R) * gone);
          tmpP.x += 0.12 * Math.sin(t * 0.5 + o.phase); tmpP.y += 0.12 * Math.sin(t * 0.43 + o.phase * 1.7);
          vesicles.setMatrixAt(i, m4.compose(tmpP, noTurn, tmpS.setScalar(Math.max(o.size * Math.min(1, born * 2.5), 0.001))));
        });
        vesicles.instanceMatrix.needsUpdate = true;
      }
      membrane.scale.set(1 + 0.008 * Math.sin(t * 0.9), (1 + .18 * world.elongation) * (1 + 0.008 * Math.sin(t * 0.7 + 1)), 1 + 0.008 * Math.sin(t * 0.8 + 2));
      nucleolus.rotation.y = t * 0.1;
    },

    // На что нажал ученик: 'centrosome', 'nucleolus', 'nucleus', 'membrane' или null.
    pick(ray) {
      const hits = ray.intersectObjects([...spindle.hits, nucleolus, outer, membrane], false).map(h => h.object);
      if (spindle.hits.some(h => h.parent.visible && hits.includes(h))) return 'centrosome';
      if (nucleolus.visible && hits.includes(nucleolus)) return 'nucleolus';
      return breakK < 0.3 && hits.includes(outer) ? 'nucleus' : hits.includes(membrane) ? 'membrane' : null;
    },
  };
  world.pose('interphase');
  return world;
}
