import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { neon } from './style.js';
import { MEMBRANE_PARTS } from './membrane.js';
import { CYTO_PARTS } from './cytoskeleton.js';

// Модели органоидов из Blender и их стиль «био-неон» по именам материалов:
// цвет, стекло ли это (мембрана), сила свечения. Общие для образцов и собранной клетки.

export const PARTS = {
  mito_outer:     { color: 0xff5a00, glass: true, glow: 1.8, power: 4.5, body: 0.0, strength: 0.65 },
  mito_inner:     { color: 0xff8a00, glass: true, glow: 1.2, power: 5.0, body: 0.0, strength: 0.2 },
  mito_cristae:   { color: 0xffa300, glow: 2.2, power: 2.0, body: 0.35 },
  mito_ribosome:  { color: 0xfff200, glow: 2.5, body: 1.2 },
  mito_dna:       { color: 0x00e5ff, glow: 2.5, body: 1.0 },
  nuc_outer:      { color: 0xa040ff, glass: true, glow: 1.8, power: 4.0, body: 0.0, strength: 0.45 },
  nuc_inner:      { color: 0xc77dff, glass: true, glow: 1.2, power: 4.5, body: 0.0, strength: 0.2 },
  nuc_pore:       { color: 0xe8ff00, glow: 2.0, body: 0.45 },
  nuc_chromatin:  { color: 0x00e5ff, glow: 2.2, body: 0.5 },
  nuc_nucleolus:  { color: 0xff2bd6, glow: 2.0, power: 1.6, body: 0.7 },
  er_rough:       { color: 0x2f6bff, glow: 2.0, power: 2.2, body: 0.3 },
  er_ribosome:    { color: 0xffb000, glow: 2.2, body: 1.1 },
  er_lumen:       { color: 0x8fd3ff, glow: 1.4, power: 1.6, body: 0.8 },
  er_smooth:      { color: 0x00ffa3, glow: 2.2, power: 2.0, body: 0.3 },
  golgi_wall:     { color: 0xff1f8e, glow: 2.0, power: 2.2, body: 0.35 },
  golgi_lumen:    { color: 0xff8ad0, glow: 1.4, power: 2.5, body: 0.75 },
  golgi_rim:      { color: 0xffd6f0, glow: 1.5, body: 1.1 },
  golgi_cargo:    { color: 0xb44bff, glow: 2.0, body: 1.2 },
  er_vesicle:     { color: 0x2f6bff, glow: 2.2, power: 2.0, body: 0.35 },
  centriole_tube: { color: 0x7df9ff, glow: 2.2, power: 2.0, body: 0.3 },
  centriole_link: { color: 0x3d8bff, glow: 2.0, body: 0.6 },
  ribo_large:     { color: 0xffb000, glow: 1.8, power: 2.0, body: 0.3 },
  ribo_small:     { color: 0xffe14d, glow: 1.8, power: 2.0, body: 0.3 },
  ribo_mrna:      { color: 0xff2bd6, glow: 2.2, body: 0.7 },
  ribo_peptide:   { color: 0x39ff14, glow: 2.2, body: 0.6 },
  lyso_membrane:  { color: 0xc04bff, glass: true, glow: 1.8, power: 4.0, body: 0.0, strength: 0.5 },
  lyso_enzyme:    { color: 0xff2bd6, glow: 2.0, body: 0.5 },
  lyso_debris:    { color: 0x39ff14, glow: 1.6, body: 0.35 },
  // Нуклеосома по структуре PDB 1KX5: ДНК — циан, как везде; гистоны — пары родственных цветов.
  nucs_dna:       { color: 0x00e5ff, glow: 2.0, power: 2.0, body: 0.45 },
  nucs_h3:        { color: 0x9b4dff, glow: 1.9, power: 2.0, body: 0.5 },
  nucs_h4:        { color: 0xe06bff, glow: 1.9, power: 2.0, body: 0.5 },
  nucs_h2a:       { color: 0xb6ff3a, glow: 1.9, power: 2.0, body: 0.5 },
  nucs_h2b:       { color: 0xffc83d, glow: 1.9, power: 2.0, body: 0.5 },
  cell_membrane:     { color: 0x00e5ff, glass: true, glow: 1.6, power: 3.0, body: 0.0, strength: 0.2 },
  cell_membrane_rim: { color: 0x7ff9ff, glass: true, glow: 1.2, power: 1.5, body: 0.35, strength: 0.45 },
  ...MEMBRANE_PARTS,
  ...CYTO_PARTS,
};

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = {};
const VER = new URL(import.meta.url).search;   // «?v=…» из адреса модуля — чтобы и модели не брались из старого кэша
export const loadModel = name => (cache[name] ||= loader.loadAsync('models/' + name + '.glb' + VER).then(g => g.scene));

// Перекрашивает модель в био-неон. Материалы одинаковых частей общие —
// так копии органоида (например, пять митохондрий) рисуются дешевле.
const shared = {};
export function neonize(root) {
  const meshes = [];
  root.traverse(o => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) {
    const name = m.userData.part || m.material.name;
    const p = PARTS[name] || { color: 0xffffff };
    m.material = shared[name] ||= neon(p.color, p);
    m.userData.part = name;
    m.userData.base = p.strength ?? 1;
  }
  return meshes;
}

