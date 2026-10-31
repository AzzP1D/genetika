import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { neon, halo, motes } from './style.js';
import { loadModel, neonize, PARTS } from './organelles.js';
import { createCytoskeleton } from './cytoskeleton.js';

// Животная клетка в разрезе, собранная из собственных моделей органоидов.
// Мембрана — толстая светящаяся «стеклянная» оболочка; спереди сверху — вырез со скруглёнными углами.

export const CELL = new THREE.Vector3(4.3, 2.8, 3.2);     // полуоси клетки

// Где стоит каждый органоид: размер — диагональ габаритов модели, поворот — в радианах.
const LAYOUT = [
  { id: 'nucleus', model: 'nucleus', size: 3.7, at: [-0.5, 0.1, -0.4], rot: [0, -0.75, 0] },
  { id: 'golgi', model: 'golgi', size: 1.9, at: [1.95, 0.25, 0.4], rot: [0.1, -0.35, 0.3] },
  { id: 'centrioles', model: 'centrioles', size: 0.8, at: [0.95, 1.45, -0.7], rot: [0.4, 0.6, 0] },
  { id: 'mito', model: 'mito', size: 1.5, at: [2.4, -0.8, 0.35], rot: [0.2, 0.6, 0.5] },
  { id: 'mito', model: 'mito', size: 1.4, at: [-2.45, 1.0, -0.5], rot: [0.5, -0.4, -0.3] },
  { id: 'mito', model: 'mito', size: 1.3, at: [0.9, -1.75, -1.0], rot: [-0.3, 1.2, 0.1] },
  { id: 'mito', model: 'mito', size: 1.35, at: [-1.6, 1.65, 1.0], rot: [0.1, 0.3, 0.7] },
  { id: 'mito', model: 'mito', size: 1.4, at: [2.2, 1.2, -1.2], rot: [0.6, -0.9, 0.2] },
  { id: 'lysosomes', model: 'lysosome', size: 0.6, at: [1.25, -1.1, 1.45], rot: [0, -0.7, 0] },
  { id: 'lysosomes', model: 'lysosome', size: 0.5, at: [-2.2, -1.5, 1.3], rot: [0, 0.4, 0] },
  { id: 'lysosomes', model: 'lysosome', size: 0.55, at: [2.85, 0.2, -0.7], rot: [0, -1.2, 0] },
];

// Свободные рибосомы в цитоплазме — одна бугристая частица, нарисованная много раз.
function ribosomes(count, avoid) {
  const geo = mergeVertices(new THREE.IcosahedronGeometry(0.045, 1));
  const pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.multiplyScalar(1 + 0.18 * Math.sin(v.x * 60) * Math.sin(v.y * 50));
    pos.setXYZ(i, v.x, v.y * 0.8, v.z);
  }
  geo.computeVertexNormals();
  const p = PARTS.ribo_large;
  const mat = neon(p.color, { ...p, body: 0.6 });
  mat.userData.base = 1;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  let n = 0;
  while (n < count) {
    const r = new THREE.Vector3().randomDirection().multiplyScalar(Math.cbrt(Math.random()) * 0.85);
    r.multiply(CELL);
    if (avoid.some(([c, rad]) => r.distanceTo(c) < rad)) continue;
    mesh.setMatrixAt(n++, m4.compose(r, q.random(), one));
  }
  mesh.userData.part = 'ribosomes';
  return mesh;
}

export async function createCell() {
  const group = new THREE.Group();
  const parts = {};     // id → { objects, materials }
  const add = (id, obj) => {
    const p = parts[id] ||= { id, objects: [], materials: new Set() };
    p.objects.push(obj);
    obj.traverse(o => { if (o.isMesh) { o.userData.id = id; p.materials.add(o.material); } });
    obj.userData.base = obj.position.clone();
    obj.userData.phase = Math.random() * Math.PI * 2;
    group.add(obj);
  };

  const names = [...new Set(LAYOUT.map(l => l.model))];
  const models = Object.fromEntries(await Promise.all(names.map(async n => [n, await loadModel(n)])));

  for (const l of LAYOUT) {
    const src = models[l.model].clone(true);
    neonize(src);
    src.traverse(o => { if (o.isMesh && o.material.userData.base === undefined) o.material.userData.base = o.userData.base; });
    // Ставим модель в центр её габаритов и приводим к нужному размеру.
    const box = new THREE.Box3().setFromObject(src);
    src.position.sub(box.getCenter(new THREE.Vector3()));
    const holder = new THREE.Group();
    holder.add(src);
    holder.scale.setScalar(l.size / box.getSize(new THREE.Vector3()).length());
    holder.position.set(...l.at);
    holder.rotation.set(...l.rot);
    if (l.id === 'nucleus') src.traverse(o => { if (o.isMesh && o.userData.part === 'nuc_outer') { o.userData.halo = halo(o, PARTS.nuc_outer.color, 0.03, 0.4); o.userData.halo.material.userData.base = 0.4; } });
    add(l.id, holder);
  }

  // ЭПС из Blender построена вокруг ядра радиуса 1: берём масштаб и место ядра,
  // и она ложится точно по нему. Движется вместе с ядром — зазоры не «гуляют».
  const nucleus = parts.nucleus.objects[0];
  const Rn = nucleus.scale.x;
  const er = (await loadModel('er_nuclear')).clone(true);
  neonize(er);
  er.traverse(o => { if (o.isMesh) o.material.userData.base = o.userData.base; });
  er.scale.setScalar(Rn);
  er.position.copy(nucleus.position);
  add('er', er);
  er.userData.phase = nucleus.userData.phase;

  // Цитоскелет: микротрубочки от клеточного центра, актиновый кортекс, промежуточные филаменты вокруг ядра.
  const centrosome = new THREE.Vector3(...LAYOUT.find(l => l.id === 'centrioles').at);
  add('cytoskeleton', createCytoskeleton({
    cell: CELL, nucleus: { center: nucleus.position.clone(), r: Rn }, centrosome,
    inCut: p => Math.abs(p.x) < 2.6 && p.y > 0 && p.z > 0,   // вырез мембраны спереди сверху
  }));

  const golgi = LAYOUT.find(l => l.id === 'golgi');
  add('ribosomes', ribosomes(90, [[nucleus.position, Rn + 0.65], [new THREE.Vector3(...golgi.at), 0.9]]));
  // Мембрана — толстая стеклянная оболочка из Blender со скруглённым вырезом.
  const mem = (await loadModel('cellmembrane')).clone(true);
  neonize(mem);
  mem.traverse(o => { if (o.isMesh) o.material.userData.base = o.userData.base; });
  add('membrane', mem);

  // Цитоплазма: медленно плывущие светящиеся частицы.
  const dust = motes(450, 1, 0x9fefff);
  dust.scale.copy(CELL).multiplyScalar(0.92);
  dust.material.size = 0.05;
  group.add(dust);

  function update(t) {
    dust.update(t);
    for (const id in parts) {
      if (id === 'membrane' || id === 'ribosomes' || id === 'cytoskeleton') continue;
      for (const o of parts[id].objects) o.position.y = o.userData.base.y + Math.sin(t * 0.7 + o.userData.phase) * 0.03;
    }
  }
  return { group, parts, update };
}




