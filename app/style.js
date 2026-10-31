import * as THREE from 'three';

// Общий стиль 3D-сцен — «био-неон»: тёмный фон, яркие кислотные цвета,
// молекулы светятся по краям, как биолюминесцентные организмы.
// Цвет закреплён за молекулой во всех модулях: зелёное кольцо — всегда хеликаза и т. д.

export const PALETTE = {
  dna: 0x00e5ff,        // материнская ДНК — электрический циан
  newDna: 0xff8c1a,     // новая цепь ДНК — кислотный оранжевый
  primer: 0xff2bd6,     // РНК (праймер, иРНК) — фуксия
  helicase: 0x39ff14,   // кислотно-зелёный
  polymerase: 0xff5e7a,
  pcna: 0xf4ff3a,
  primase: 0xb44bff,
  ligase: 0x00ffc8,
  h3h4: 0x9b4dff,       // гистоны H3 и H4
  h2: 0x4dffd2,         // гистоны H2A и H2B
  tail: 0xd9a8ff,       // гистоновые «хвосты»
  mark: 0xff3b5c,       // метки на хвостах
  nucleolus: 0xff2bd6,
  pore: 0xe8ff00,
  ink: 0x070a10,        // контур (прежний стиль)
};

export const BASE_COLORS = { 'А': 0xff3b5c, 'Т': 0xffe600, 'Г': 0x39ff14, 'Ц': 0x2f8bff, 'У': 0xc04bff };

// Прежний стиль «научная иллюстрация»: три ступени светотени (для сравнения на странице образцов).
const ramp = new THREE.DataTexture(new Uint8Array([80, 160, 255]), 3, 1, THREE.RedFormat);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
ramp.needsUpdate = true;

export function toon(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: ramp, toneMapped: false, ...opts });
}

export function addLights(group) {
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(3, 5, 6);
  group.add(sun, new THREE.HemisphereLight(0xcfe4ff, 0x1a2436, 1.6));
}

// Контур: копия объекта, вывернутая наизнанку и раздутая вдоль нормалей.
// Толщина задана в долях расстояния до камеры, поэтому на экране она постоянна.
const outlineMats = new Map();
function outlineMaterial(width) {
  if (outlineMats.has(width)) return outlineMats.get(width);
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      width: { value: width },
      color: { value: new THREE.Color(PALETTE.ink) },
    }]),
    vertexShader: /* glsl */`
      uniform float width;
      #include <fog_pars_vertex>
      void main() {
        vec4 p = vec4(position, 1.0);
        vec3 n = normal;
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
          n = mat3(instanceMatrix) * n;
        #endif
        vec4 mvPosition = modelViewMatrix * p;
        mvPosition.xyz += normalize(normalMatrix * n) * width * -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 color;
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(color, 1.0);
        #include <fog_fragment>
      }`,
    side: THREE.BackSide,
    fog: true,
  });
  outlineMats.set(width, mat);
  return mat;
}

export function outline(mesh, width = 0.0025) {
  const mat = outlineMaterial(width);
  let o;
  if (mesh.isInstancedMesh) {
    o = new THREE.InstancedMesh(mesh.geometry, mat, mesh.count);
    o.instanceMatrix = mesh.instanceMatrix;
    o.frustumCulled = mesh.frustumCulled;
  } else o = new THREE.Mesh(mesh.geometry, mat);
  o.raycast = () => {};
  mesh.add(o);
  return o;
}

// ---------- био-неон ----------
// Тёмное тело и свечение по краям, как у биолюминесцентных организмов.
// glass — полупрозрачная светящаяся оболочка (мембраны): видно, что внутри.

const neonVertex = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vTint;
  #include <fog_pars_vertex>
  // Безопасная нормализация: у объекта почти нулевого размера (в анимациях) нормаль вырождается,
  // и на телефонах с пониженной точностью получаются «битые» точки (NaN) — свечение раздувает их
  // в мигающие чёрные квадраты. Такой вектор заменяем запасным.
  vec3 safeNorm(vec3 v) { float l = length(v); return l > 1e-5 && l < 1e5 ? v / l : vec3(0.0, 0.0, 1.0); }
  void main() {
    vTint = vec3(1.0);
    #ifdef USE_COLOR
      vTint *= color.rgb;
    #endif
    #ifdef USE_INSTANCING_COLOR
      vTint *= instanceColor;
    #endif
    vec4 p = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 mvPosition = modelViewMatrix * p;
    vNormal = safeNorm(normalMatrix * n);
    vView = safeNorm(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

export function neon(color, { glow = 1.5, power = 2.2, body = 0.2, glass = false, strength = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uColor: { value: new THREE.Color(color) },   // не «color»: так называется атрибут цвета вершин
      glow: { value: glow }, power: { value: power }, body: { value: body }, strength: { value: strength },
    }]),
    vertexShader: neonVertex,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float glow, power, body, strength;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vTint;
      #include <fog_pars_fragment>
  // Безопасная нормализация: у объекта почти нулевого размера (в анимациях) нормаль вырождается,
  // и на телефонах с пониженной точностью получаются «битые» точки (NaN) — свечение раздувает их
  // в мигающие чёрные квадраты. Такой вектор заменяем запасным.
  vec3 safeNorm(vec3 v) { float l = length(v); return l > 1e-5 && l < 1e5 ? v / l : vec3(0.0, 0.0, 1.0); }
      void main() {
        vec3 base = uColor * vTint;
        vec3 n = safeNorm(vNormal);
        float ndv = clamp(abs(dot(n, safeNorm(vView))), 0.0, 1.0);
        float rim = pow(1.0 - ndv, power);
        float light = 0.35 + 0.65 * max(dot(n, normalize(vec3(0.4, 0.7, 0.6))), 0.0);
        vec3 c = base * body * light + base * rim * glow + vec3(pow(rim, 6.0) * 0.35);
        gl_FragColor = vec4(clamp(c * strength, 0.0, 8.0), 1.0);   // без «бесконечной» яркости
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: glass,
    blending: glass ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: !glass,
    side: glass ? THREE.DoubleSide : THREE.FrontSide,
    fog: true,
  });
}

// Материал «био-неон» с привычными параметрами: прозрачность → светящееся стекло,
// цвета вершин и экземпляров (vertexColors, setColorAt) поддерживаются.
export function bio(color, opts = {}) {
  const glass = !!opts.transparent && (opts.opacity ?? 1) < 1;
  const m = neon(color, { glow: 1.5, power: 2.2, body: 0.55, glass, strength: glass ? opts.opacity * 1.6 : 1, ...(opts.neon || {}) });
  if (opts.vertexColors) m.vertexColors = true;
  if (opts.side !== undefined && !glass) m.side = opts.side;
  return m;
}

// Ореол вокруг объекта: раздутая изнанка, которая светится у края и гаснет наружу.
export function halo(mesh, color, width = 0.035, strength = 0.9) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, width: { value: width }, strength: { value: strength } },
    vertexShader: /* glsl */`
      uniform float width;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        mvPosition.xyz += vNormal * width * -mvPosition.z;
        vView = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float strength;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float k = pow(clamp(-dot(normalize(vNormal), normalize(vView)), 0.0, 1.0), 2.5);
        gl_FragColor = vec4(uColor * k * strength, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const o = new THREE.Mesh(mesh.geometry, mat);
  o.raycast = () => {};
  mesh.add(o);
  return o;
}

// Светящиеся частицы, медленно плывущие в темноте.
export function motes(count = 300, radius = 6, color = 0x7ff7ff) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(radius * Math.cbrt(Math.random()));
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.3, 'rgba(255,255,255,.35)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    color, size: 0.06, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  pts.update = t => { pts.rotation.y = t * 0.015; pts.rotation.x = Math.sin(t * 0.05) * 0.1; };
  return pts;
}

// Подписи: буква на тёмной обводке и плашка с текстом.
export function letterSprite(text, size = 0.42, color = '#fff') {
  const c = document.createElement('canvas');
  c.width = 192; c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 84px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 14; g.lineJoin = 'round'; g.strokeStyle = 'rgba(6,10,16,.9)'; g.strokeText(text, 96, 70);
  g.fillStyle = color; g.fillText(text, 96, 70);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false }));
  s.scale.set(size * 1.5, size, 1);
  return s;
}

export function textSprite(text, color, height = 0.36) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = '600 52px system-ui, sans-serif';
  c.width = Math.ceil(g.measureText(text).width) + 72; c.height = 96;
  g.font = '600 52px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(10,16,24,.82)';
  g.beginPath(); g.roundRect(6, 8, c.width - 12, 80, 24); g.fill();
  g.strokeStyle = color; g.lineWidth = 3; g.stroke();
  g.fillStyle = color; g.fillText(text, c.width / 2, 50);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false, depthTest: false }));
  s.scale.set(height * c.width / c.height, height, 1);
  s.renderOrder = 10;
  return s;
}

// Стрелка направления синтеза с подписью «5'→3'».
export function arrowSprite(color, up, height = 1.4) {
  const c = document.createElement('canvas');
  c.width = 96; c.height = 256;
  const g = c.getContext('2d');
  g.translate(48, 128);
  if (!up) g.rotate(Math.PI);
  g.fillStyle = color; g.strokeStyle = 'rgba(6,10,16,.9)'; g.lineWidth = 6; g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(0, -120); g.lineTo(34, -64); g.lineTo(11, -64); g.lineTo(11, 118); g.lineTo(-11, 118); g.lineTo(-11, -64); g.lineTo(-34, -64);
  g.closePath(); g.stroke(); g.fill();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false, depthTest: false, transparent: true }));
  s.scale.set(height * 96 / 256, height, 1);
  s.renderOrder = 9;
  return s;
}

