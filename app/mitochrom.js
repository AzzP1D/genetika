import * as THREE from 'three';
import { PALETTE, neon } from './style.js';

// Хромосома для урока «Митоз»: две сестринские хроматиды, центромера-перетяжка, кинетохоры.
// Хроматида — не гладкая трубка, а толстая нить, уложенная плотной спиралью (фибрилла).
// Форма считается в видеокарте (в шейдере) по трём числам:
//   uCond — упаковка: 0 — рыхлая длинная нить хроматина, 1 — плотная хроматида;
//   uBend — изгиб плеч: меньше нуля — плечи слегка разведены (Х-образная метафазная хромосома),
//           больше нуля — плечи отстают от центромеры (V-образная хроматида в анафазе);
//   uTime — время: рыхлая нить медленно «дышит».
// Поэтому скручивание и изгиб идут плавно и не нагружают процессор телефона.

// Хромосомный набор урока: 2n = 8, четыре пары разной длины и формы.
// len — длина хроматиды, cen — где центромера (доля длины от нижнего конца).
export const KARYOTYPE = [
  { len: 2.7, cen: 0.5, name: 'метацентрическая' },       // плечи равны
  { len: 2.3, cen: 0.34, name: 'субметацентрическая' },   // одно плечо заметно короче
  { len: 1.8, cen: 0.45, name: 'метацентрическая' },
  { len: 1.35, cen: 0.2, name: 'акроцентрическая' },      // центромера почти у конца
];

// Изгиб плеч (радианы): метафаза и анафаза.
export const BEND = { meta: -0.16, ana: 1.15 };

const PITCH = 0.13;      // шаг спирали: соседние витки нити касаются друг друга
const GAP = 0.14;        // хроматида отстоит от середины хромосомы на столько
// Уровни детализации: [шагов на виток, шагов вокруг нити, с какого расстояния до камеры].
const DETAIL = [[32, 10, 0], [20, 8, 3.2], [14, 4, 7]];

const vertexShader = /* glsl */`
  uniform float uCond, uBend, uSide, uLen, uCen, uTurns, uCurl, uTime;
  uniform vec3 uSeed, uHome;
  uniform float uCage;
  varying vec3 vNormal;
  varying vec3 vView;
  #include <fog_pars_vertex>

  const float TAU = 6.2831853;
  const float FIBER = 0.075;    // толщина нити в плотной хроматиде
  const float COIL = 0.13;      // радиус спирали
  const float GAP = ${GAP};
  const float STRETCH = 2.0;    // во сколько раз рыхлая нить длиннее хроматиды
  const float RHO = 0.3;        // радиус, по которому плечо отгибается у центромеры

  // Безопасная нормализация: вырожденный вектор на телефонах даёт «битые» точки (см. style.js).
  vec3 safeNorm(vec3 v) { float l = length(v); return l > 1e-5 && l < 1e5 ? v / l : vec3(0.0, 0.0, 1.0); }

  // Ось плотной хроматиды: прямая вдоль Y, центромера в нуле. Плечи отгибаются по дуге:
  // в анафазе — назад, от полюса (он со стороны uSide), в метафазе — чуть в стороны от сестры.
  vec3 tightAxis(float u) {
    float y = (u - uCen) * uLen;
    float s = abs(y);
    float a = min(s / RHO, abs(uBend));
    float rest = max(s - RHO * abs(uBend), 0.0);
    float along = RHO * sin(a) + rest * cos(uBend);
    float lag = sign(uBend) * RHO * (1.0 - cos(a)) + rest * sin(uBend);
    return vec3(uSide * (GAP - lag), y < 0.0 ? -along : along, 0.0);
  }

  // Ось рыхлой нити: вдвое длиннее, изогнута дугой и волной. У сестёр она общая — после
  // удвоения ДНК две нити лежат рядом по всей длине.
  vec3 looseAxis(float u) {
    float len = uLen * STRETCH;
    float q = (u - uCen) * len;
    float k = uCurl / len;
    float w = uTime * 0.25;
    vec3 p = vec3((1.0 - cos(k * q)) / k - (1.0 - cos(uCurl * 0.5)) / k * 0.5, sin(k * q) / k, 0.0);
    p.x += uSide * 0.1 + 0.16 * sin(TAU * 0.9 * u + uSeed.x + w);
    p.z += 0.22 * sin(TAU * 1.3 * u + uSeed.x * 1.7 - w);
    return p;
  }

  // Смещение нити от оси: рыхлая — неровные широкие петли, плотная — ровная тугая спираль
  // с перетяжкой у центромеры и скруглёнными концами.
  vec3 coil(float u, vec3 nv, vec3 bv, float c) {
    float y = (u - uCen) * uLen;
    float waist = 1.0 - 0.5 * exp(-y * y / 0.05);
    float e = clamp(min(u, 1.0 - u) * uTurns / 1.2, 0.0, 1.0);
    float tight = COIL * waist * sqrt(e * (2.0 - e));
    float loose = 0.22 * (0.6 + 0.28 * sin(TAU * 3.1 * u + uSeed.z) + 0.12 * sin(TAU * 7.3 * u + uSeed.z * 2.3));
    float lo = 1.0 - c;
    float w = uTime * 0.2;
    float th = TAU * uTurns * u + lo * 1.6 * sin(TAU * 2.3 * u + uSeed.y);
    vec3 o = mix(loose, tight, c) * (cos(th) * nv + sin(th) * bv);
    o += lo * lo * 0.3 * ((sin(TAU * 5.3 * u + uSeed.y * 1.3 + w) + 0.5 * sin(TAU * 8.9 * u + uSeed.z)) * nv
      + (cos(TAU * 3.7 * u + uSeed.y * 0.7 - w) + 0.5 * sin(TAU * 7.1 * u + uSeed.y * 2.1)) * bv);
    return o;
  }

  // Ядро не выпускает рыхлую нить наружу: чем ближе к оболочке (радиус uCage вокруг uHome),
  // тем сильнее нить прижимается обратно. k — сила: 1 — рыхлая нить, 0 — плотная хромосома.
  vec3 cage(vec3 p, float k) {
    vec3 d = p - uHome;
    float l = length(d), a = 0.7 * uCage, b = 0.3 * uCage;
    float inside = l > a ? a + b * (1.0 - exp(-(l - a) / b)) : l;
    return mix(p, uHome + d * (inside / max(l, 1e-4)), k);
  }

  void main() {
    float u = position.x, ang = position.y * TAU;
    float ca = smoothstep(0.0, 0.9, uCond);   // сначала нить укорачивается…
    float cc = smoothstep(0.1, 1.0, uCond);   // …и следом стягиваются витки
    float du = 0.02 / uTurns;

    // Ось и её направление — по двум соседним точкам.
    vec3 p0 = mix(looseAxis(u), tightAxis(u), ca);
    vec3 p1 = mix(looseAxis(u + du), tightAxis(u + du), ca);
    vec3 t = safeNorm(p1 - p0);
    vec3 nv = safeNorm(cross(vec3(0.0, 0.0, 1.0), t));
    vec3 bv = cross(t, nv);

    // Нить и её направление; сечение нити — круг поперёк этого направления.
    vec3 o0 = coil(u, nv, bv, cc), o1 = coil(u + du, nv, bv, cc);
    vec3 c0 = p0 + o0, c1 = p1 + o1;
    if (uCage > 0.0) { float k = 1.0 - ca * ca; c0 = cage(c0, k); c1 = cage(c1, k); }
    vec3 tf = safeNorm(c1 - c0);
    vec3 g = o0 + nv * 1e-3;
    vec3 e1 = safeNorm(g - tf * dot(g, tf));
    vec3 e2 = cross(tf, e1);
    float tip = clamp(min(u, 1.0 - u) * uTurns / 0.3, 0.0, 1.0);
    float rf = mix(0.024, FIBER, cc) * sqrt(tip * (2.0 - tip));
    vec3 n = cos(ang) * e1 + sin(ang) * e2;

    vec4 mvPosition = modelViewMatrix * vec4(c0 + rf * n, 1.0);
    vNormal = safeNorm(normalMatrix * n);
    vView = safeNorm(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

// Раскраска — та же «био-неон», что в style.js: тёмное тело и свечение по краям.
const fragmentShader = /* glsl */`
  uniform vec3 uColor;
  uniform float glow, power, body, strength;
  varying vec3 vNormal;
  varying vec3 vView;
  #include <fog_pars_fragment>
  vec3 safeNorm(vec3 v) { float l = length(v); return l > 1e-5 && l < 1e5 ? v / l : vec3(0.0, 0.0, 1.0); }
  void main() {
    vec3 n = safeNorm(vNormal);
    float ndv = clamp(abs(dot(n, safeNorm(vView))), 0.0, 1.0);
    float rim = pow(1.0 - ndv, power);
    float light = 0.35 + 0.65 * max(dot(n, normalize(vec3(0.4, 0.7, 0.6))), 0.0);
    vec3 c = uColor * body * light + uColor * rim * glow + vec3(pow(rim, 6.0) * 0.35);
    gl_FragColor = vec4(clamp(c * strength, 0.0, 8.0), 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

// Сетка-заготовка: nu шагов вдоль нити, nv — вокруг неё. В вершинах — не точки в пространстве,
// а «адрес» (доля длины, доля окружности): саму форму строит шейдер.
const grids = new Map();
function grid(nu, nv) {
  const key = nu + 'x' + nv;
  if (grids.has(key)) return grids.get(key);
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3);
  const index = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const a = i * (nv + 1) + j;
    pos[a * 3] = i / nu;
    pos[a * 3 + 1] = j / nv;
    if (i < nu && j < nv) { const b = a + nv + 1; index.push(a, a + 1, b, a + 1, b + 1, b); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(index);
  grids.set(key, geo);
  return geo;
}

// Случайные, но всегда одинаковые числа: хромосомы выглядят одинаково при каждом запуске.
function random(seed) {
  let a = (seed + 1) * 0x9e3779b9 >>> 0;
  return () => { a = a + 0x6d2b79f5 >>> 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Хромосома: type — номер в KARYOTYPE, parent — 'mat' (материнская) или 'pat' (отцовская).
// Гомологи различаются оттенком, сестринские хроматиды одного цвета — они одинаковы.
// scale — во сколько раз сцена уменьшена (расстояния смены детализации уменьшаются так же).
export function createChromosome(type, parent = 'mat', { scale = 1 } = {}) {
  const k = KARYOTYPE[type];
  const turns = Math.round(k.len / PITCH);
  const rnd = random(type * 2 + (parent === 'pat' ? 1 : 0));
  const wave = rnd() * 6.28, curl = (rnd() < 0.5 ? -1 : 1) * (1.5 + rnd() * 0.9);
  const group = new THREE.Group();
  const color = parent === 'pat' ? PALETTE.chromPat : PALETTE.chromMat;

  const chromatids = [1, -1].map(side => {
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uColor: { value: new THREE.Color(color) },
        uCond: { value: 1 }, uBend: { value: BEND.meta }, uSide: { value: side },
        uLen: { value: k.len }, uCen: { value: k.cen }, uTurns: { value: turns },
        uCurl: { value: curl }, uTime: { value: 0 },
        uSeed: { value: new THREE.Vector3(wave, rnd() * 6.28, rnd() * 6.28) },
        uHome: { value: new THREE.Vector3() }, uCage: { value: 0 },
        glow: { value: 1.5 }, power: { value: 2.2 }, body: { value: 0.55 }, strength: { value: 1 },
      }]),
      vertexShader, fragmentShader, fog: true,
    });
    // Уровни детализации: чем ближе камера к хроматиде, тем подробнее модель.
    const object = new THREE.LOD();
    for (const [segs, around, from] of DETAIL) {
      const mesh = new THREE.Mesh(grid(turns * segs, around), material);
      mesh.frustumCulled = false;   // настоящую форму знает только шейдер
      mesh.raycast = () => {};
      object.addLevel(mesh, from * scale, 0.1);
    }
    // Кинетохор — пластинка на наружной стороне центромеры, обращена к «своему» полюсу.
    const kinetochore = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), neon(PALETTE.kinetochore, { body: 0.6 }));
    kinetochore.position.x = side * (GAP + 0.15);
    object.add(kinetochore);
    group.add(object);
    return { side, object, material, kinetochore };
  });

  let grown = 1, pulse = 1;
  function kinetochores() {
    const s = grown * pulse;
    for (const ch of chromatids) {
      ch.kinetochore.visible = s > 0.04;
      ch.kinetochore.scale.set(0.05 * s, 0.1 * s, 0.1 * s);
    }
  }

  const api = {
    group, type, parent, chromatids,
    // Упаковка: 0 — рыхлая нить, 1 — плотная хромосома. Кинетохоры собираются в самом конце.
    cond(c) {
      grown = THREE.MathUtils.smoothstep(c, 0.82, 1);
      for (const ch of chromatids) ch.material.uniforms.uCond.value = c;
      kinetochores();
    },
    // Яркость хромосомы (1 — обычная) и размер кинетохоров (1 — обычный): для подсветки в заданиях.
    shine(v) { for (const ch of chromatids) ch.material.uniforms.strength.value = v; },
    pulse(s) { pulse = s; kinetochores(); },
    // Изгиб плеч обеих хроматид (см. BEND).
    bend(phi) { for (const ch of chromatids) ch.material.uniforms.uBend.value = phi; },
    // Смещение сестёр от общей центромеры после снятия когезии (локальная ось X).
    apart(distance) { for (const ch of chromatids) ch.object.position.x = ch.side * distance; },
    tint(hex) { for (const ch of chromatids) ch.material.uniforms.uColor.value.set(hex); },
    tick(t) { for (const ch of chromatids) ch.material.uniforms.uTime.value = t; },
    // Ядро, внутри которого лежит рыхлая нить: центр (в координатах сцены-родителя) и радиус.
    // Вызывать после того, как хромосома поставлена на место. radius = 0 — без ядра.
    cage(center, radius) {
      group.updateMatrix();
      const home = center.clone().applyMatrix4(group.matrix.clone().invert());
      for (const ch of chromatids) { ch.material.uniforms.uHome.value.copy(home); ch.material.uniforms.uCage.value = radius; }
    },
  };
  api.cond(1);
  return api;
}

// Сколько треугольников в одной хромосоме на каждом уровне детализации — для отчёта о весе.
export function triangles(type) {
  const turns = Math.round(KARYOTYPE[type].len / PITCH);
  return DETAIL.map(([segs, around]) => (turns * segs * around * 2 + 288) * 2);
}
