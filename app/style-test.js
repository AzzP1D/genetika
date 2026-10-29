import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { toon, outline, addLights, neon, halo, motes } from './style.js';
import { createMembrane } from './membrane.js';
import { PARTS } from './organelles.js';

// Образцы органоидов из Blender в стиле «био-неон» и сравнение с прежним стилем.
// style-test.html?model=mito или ?model=nucleus


// Модели: файл, оболочка с ореолом, наклон, протяжённость для кольца сканирования и карточка.
const MODELS = {
  mito: { file: 'mito', fit: 3.8, shell: 'mito_outer', tilt: 0.25, len: 1.8, rad: 0.78,
    title: 'Митохондрия', text: 'Энергетическая станция клетки: здесь синтезируется АТФ. Внутренняя мембрана образует извилистые складки — кристы. В матриксе — собственные рибосомы и кольцевая ДНК.' },
  nucleus: { file: 'nucleus', fit: 3.9, shell: 'nuc_outer', tilt: 0, turn: -0.75, len: 1.05, rad: 1.05,
    title: 'Ядро', text: 'Хранит наследственную информацию. Оболочка двойная, её пронизывают ядерные поры. Внутри — хроматин (ДНК с белками) и ядрышко, где собираются субъединицы рибосом.' },
  er: { file: 'er', shell: null, tilt: 0, len: 1.4, rad: 1.3,
    title: 'Эндоплазматическая сеть', text: 'Шероховатая ЭПС — стопка плоских мешочков-цистерн, усеянных рибосомами: здесь синтезируются белки. Гладкая ЭПС — сеть трубочек без рибосом: синтез липидов и углеводов.' },
  golgi: { file: 'golgi', shell: null, tilt: 0, len: 1.2, rad: 0.8,
    title: 'Аппарат Гольджи', text: 'Стопка плоских изогнутых цистерн. С одной стороны (цис) принимает пузырьки с веществами от ЭПС, дорабатывает и сортирует их, а с другой (транс) упаковывает в пузырьки. Образует лизосомы.' },
  centrioles: { file: 'centrioles', shell: null, tilt: 0, turn: 0.5, len: 1.1, rad: 0.9,
    title: 'Центриоли', text: 'Пара полых цилиндров, расположенных под прямым углом. Стенка каждого — 9 триплетов микротрубочек (9×3). Участвуют в образовании веретена деления, ресничек и жгутиков.' },
};
MODELS.ribosome = { file: 'ribosome', shell: null, tilt: 0, turn: 0.3, len: 1.0, rad: 0.95,
  title: 'Рибосома', text: 'Немембранный органоид из двух субъединиц — большой и малой (рРНК и белки). Между ними проходит иРНК, а из большой субъединицы выходит растущая цепочка белка: здесь идёт трансляция.' };
MODELS.lysosome = { file: 'lysosome', shell: 'lyso_membrane', tilt: 0, turn: -0.75, fit: 3.9, len: 1.05, rad: 1.05,
  title: 'Лизосома', text: 'Пузырёк, окружённый одной мембраной, с пищеварительными (гидролитическими) ферментами внутри. Расщепляет вещества, попавшие в клетку, и старые органоиды. Образуется в аппарате Гольджи.' };
MODELS.membrane = { build: createMembrane, shell: null, tilt: 0, turn: -0.35, fit: innerWidth < innerHeight ? 3.1 : 4.6, len: 2.1, rad: 0.9,
  title: 'Плазматическая мембрана', text: 'Жидкостно-мозаичная модель: двойной слой липидов — гидрофильные головки наружу, гидрофобные хвосты внутрь. В слой встроены белки, в том числе белки-каналы; между хвостами — холестерин. Снаружи — гликокаликс из углеводных цепочек.' };
const M = MODELS[new URLSearchParams(location.search).get('model')] || MODELS.mito;
document.querySelector('#card h3').textContent = M.title;
document.querySelector('#card h3').nextSibling.textContent = ' ' + M.text;
document.querySelector('#hud').lastChild.textContent = M.title + '. Вращайте пальцем, нажмите на органоид.';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04060d);
scene.fog = new THREE.FogExp2(0x04060d, 0.06);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
camera.position.set(1.2, 1.4, innerWidth < innerHeight ? 9 : 6);

const dust = motes(400, 7);
scene.add(dust);
const lights = new THREE.Group();
addLights(lights);
scene.add(lights);

let model = null;
const meshes = [];
let built = null;
if (M.build) {
  // Модель строится в коде (мембрана) — загружать нечего.
  built = M.build();
  queueMicrotask(() => setup(built.group));   // после объявления остального кода страницы
} else new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load('models/' + M.file + '.glb', gltf => setup(gltf.scene));

function setup(root) {
  model = root;
  model.traverse(o => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) {
    const name = m.userData.part || m.material.name;
    const p = PARTS[name] || { color: 0xffffff };
    m.userData.neon = neon(p.color, p);
    m.userData.base = p.strength ?? 1;
    m.userData.toon = toon(p.color, p.glass ? { transparent: true, opacity: 0.3, depthWrite: false } : {});
    m.userData.halo = name === M.shell ? halo(m, p.color, 0.03, 0.45) : null;
    m.userData.line = p.glass ? null : outline(m, 0.0016);
  }
  // Подгоняем размер и ставим в центр, чтобы любой органоид помещался в кадр.
  const box = new THREE.Box3().setFromObject(model);
  const k = (M.fit || 3.6) / box.getSize(new THREE.Vector3()).length();
  model.scale.setScalar(k);
  model.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(k));
  model.userData.y = model.position.y;
  model.userData.k = k;
  model.rotation.z = M.tilt;
  model.rotation.y = M.turn || 0;   // вырез ядра — к зрителю
  scene.add(model);
  setMode('neon');
}

// Кольцо сканирования: пробегает вдоль органоида при нажатии.
const scan = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 8, 96),
  new THREE.MeshBasicMaterial({ color: 0x7ff7ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
scan.rotation.y = Math.PI / 2;
scan.visible = false;
scene.add(scan);
let scanT = -1;

let mode = 'neon';
function setMode(m) {
  mode = m;
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  for (const o of meshes) {
    o.material = o.userData[m];
    if (o.userData.halo) o.userData.halo.visible = m === 'neon';
    if (o.userData.line) o.userData.line.visible = m === 'toon';
  }
  scene.background.set(m === 'neon' ? 0x04060d : 0x0d1322);
  scene.fog.color.copy(scene.background);
  dust.visible = m === 'neon';
}
document.getElementById('modes').onclick = e => { if (e.target.dataset.m) setMode(e.target.dataset.m); };

const ray = new THREE.Raycaster();
let down = null;
renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!model || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) return;
  ray.setFromCamera(new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  const hit = ray.intersectObjects(meshes, false)[0];
  document.getElementById('card').style.display = hit ? 'block' : 'none';
  if (hit) scanT = 0;
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta(), t = clock.elapsedTime;
  dust.update(t);
  if (model) {
    model.position.y = model.userData.y + Math.sin(t * 0.7) * 0.06;
    // Мягкое «дыхание» свечения.
    for (const o of meshes) if (o.material.uniforms) o.material.uniforms.strength.value = o.userData.base * (0.88 + 0.12 * Math.sin(t * 1.6));
  }
  if (scanT >= 0) {
    scanT += dt / 1.3;
    scan.visible = scanT < 1;
    const len = M.len * model.userData.k, x = THREE.MathUtils.lerp(-len, len, scanT);
    const r = M.rad * model.userData.k * Math.sqrt(Math.max(0.05, 1 - (x / len) ** 2));
    scan.position.set(x, model.position.y, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), model.rotation.z);
    scan.rotation.set(0, Math.PI / 2, 0); scan.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), model.rotation.z);
    scan.scale.setScalar(r);
    scan.material.opacity = Math.sin(Math.PI * Math.min(scanT, 1));
    if (scanT >= 1) scanT = -1;
  }
  controls.update();
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});










