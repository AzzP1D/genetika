import * as THREE from 'three';
import { loadModel, PARTS } from './organelles.js';
import { infoTag } from './mitoinfo.js';
import { neon } from './style.js';

const Y = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const COLORS = { baf: 0xffa85d, spastin: 0xff6477, lem2: 0x5094ff, escrt: 0xe88aff };
const pairAt = (strands, i) => strands.map(strand => strand.at(i));
const midpoint = pair => pair[0].clone().lerp(pair[1], .5);

async function readCoordinates(name) {
  const url = new URL('./models/' + name + '.json', import.meta.url);
  url.search = new URL(import.meta.url).search;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Не загрузились координаты ' + name);
  return response.json();
}

function pairedBackbones(coords) {
  const [a, b] = coords.map(strand => strand.map(p => new THREE.Vector3(...p)));
  if (a[0].distanceTo(b.at(-1)) < a[0].distanceTo(b[0])) b.reverse();
  return [a, b];
}

// Учебный двойной спиральный линкер. Оба конца точно совмещены с исходными цепями.
function dnaLink(start, end, bends) {
  const a = midpoint(start), b = midpoint(end);
  const curve = new THREE.CatmullRomCurve3([a, ...bends, b]);
  const count = 44;
  const { normals, binormals } = curve.computeFrenetFrames(count, false);
  const from = start[0].clone().sub(a), to = end[0].clone().sub(b);
  const phase = Math.atan2(from.dot(binormals[0]), from.dot(normals[0]));
  const lastPhase = Math.atan2(to.dot(binormals[count]), to.dot(normals[count]));
  const turns = TAU * curve.getLength() / 3.4;
  const err = lastPhase - phase - turns;
  const twist = turns + Math.atan2(Math.sin(err), Math.cos(err));
  const strands = [[], []];
  for (let i = 1; i < count; i++) {
    const u = i / count, angle = phase + u * twist;
    const radius = THREE.MathUtils.lerp(from.length(), to.length(), u);
    const offset = normals[i].clone().multiplyScalar(Math.cos(angle) * radius)
      .addScaledVector(binormals[i], Math.sin(angle) * radius);
    const center = curve.getPointAt(u);
    strands[0].push(center.clone().add(offset));
    strands[1].push(center.sub(offset));
  }
  return strands;
}

// Части сжатых GLB хранят положение и масштаб в преобразовании узла.
function geometryOf(model, name) {
  const part = model.getObjectByName(name);
  if (!part?.isMesh) throw new Error('В модели отсутствует ' + name);
  const original = part.geometry;
  const position = original.getAttribute('position');
  const coords = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    coords[3 * i] = position.getX(i);
    coords[3 * i + 1] = position.getY(i);
    coords[3 * i + 2] = position.getZ(i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(original.index);
  geometry.setAttribute('position', new THREE.BufferAttribute(coords, 3));
  geometry.applyMatrix4(part.matrixWorld);
  geometry.computeVertexNormals();
  return geometry;
}

export async function createEnvelopeDetail() {
  const [proteins, tubulin, histoneModel, bafData, nucData] = await Promise.all([
    loadModel('telophase_pdb'), loadModel('kinetochore_pdb'), loadModel('cohesion_pdb'),
    readCoordinates('telophase_pdb'), readCoordinates('cohesion_pdb'),
  ]);
  proteins.updateMatrixWorld(true);
  tubulin.updateMatrixWorld(true);
  histoneModel.updateMatrixWorld(true);
  const group = new THREE.Group();
  group.scale.setScalar(.085);
  const pm = (color, strength = 1) => neon(color, { glow: 1.3, body: .76, strength });
  const mesh = (geo, mat) => new THREE.Mesh(geo, mat);
  const tube = (points, radius, mat, segments = 18) => mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), segments, radius, 6), mat);

  // Две мембраны с общим краем временного отверстия, видимые в разрезе и сверху.
  const patch = infoTag(new THREE.Group(), 'nucleus');
  const gapMarker = infoTag(new THREE.Object3D(), 'envelopeGap');
  patch.add(gapMarker);
  const membranes = [1, -1].map(side => {
    const geometry = new THREE.PlaneGeometry(1, 1, 64, 10);
    const color = side > 0 ? PARTS.nuc_outer.color : PARTS.nuc_inner.color;
    const material = neon(color, { glass: true, body: .18, power: 1.9, glow: 1.15, strength: .55 });
    // Край фрагмента гаснет, чтобы было видно, где начинаются и заканчиваются две мембраны.
    material.vertexShader = material.vertexShader.replace('void main() {', 'varying float patchU;\nvoid main() {\npatchU = uv.y;');
    material.fragmentShader = 'varying float patchU;\n' + material.fragmentShader
      .replace('c * strength', 'c * strength * (1.0 - smoothstep(0.76, 1.0, patchU))');
    const surface = mesh(geometry, material);
    surface.frustumCulled = false;
    patch.add(surface);
    return { geometry, side };
  });
  group.add(patch);

  function setOpening(gap, sealed) {
    for (const { geometry, side } of membranes) {
      const uv = geometry.getAttribute('uv'), p = geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const a = uv.getX(i) * TAU, u = uv.getY(i);
        const r = gap + (35 + 2.1 * Math.sin(a * 3) - gap) * u;
        const y = side * (2.1 * (1 - Math.exp(-(r - gap) * .44)) + 2.1 * sealed * Math.exp(-(r - gap) * .44));
        p.setXYZ(i, r * Math.cos(a), y + Math.sin(a * 2 + u * 2) * u * .75, r * Math.sin(a));
      }
      p.needsUpdate = true;
      geometry.computeVertexNormals();
    }
  }

  // Экспериментальная геометрия тубулина 3IZ0. Из одинаковых димеров складываются
  // 13 протофиламентов. Два отрезка расходятся в месте разрыва.
  const mtGeometries = ['kt_tub_alpha', 'kt_tub_beta'].map(name => geometryOf(tubulin, name));
  const mtMaterials = [PARTS.tub_alpha, PARTS.tub_beta].map(part => pm(part.color, .58));
  const mt = [-1, 1].map(side => {
    const bundle = infoTag(new THREE.Group(), 'microtubule');
    for (let sub = 0; sub < 2; sub++) {
      const instances = new THREE.InstancedMesh(mtGeometries[sub], mtMaterials[sub], 39);
      const matrix = new THREE.Matrix4(), point = new THREE.Vector3(), rotation = new THREE.Quaternion();
      const scale = new THREE.Vector3(1, 1, 1);
      for (let row = 0; row < 3; row++) for (let i = 0; i < 13; i++) {
        const a = TAU * i / 13;
        point.set(10.7 * Math.cos(a), (side > 0 ? 6.1 + 8.1 * row : -2 - 8.1 * row) + (i % 4) * .23, 10.7 * Math.sin(a));
        matrix.compose(point, rotation.setFromAxisAngle(Y, -a), scale);
        instances.setMatrixAt(13 * row + i, matrix);
      }
      bundle.add(instances);
    }
    group.add(bundle);
    return bundle;
  });

  const baf = infoTag(new THREE.Group(), 'baf');
  const chromatin = infoTag(new THREE.Group(), 'chromatin');
  chromatin.name = 'Хроматин у ядерной оболочки';
  const spastin = infoTag(new THREE.Group(), 'spastin');
  for (const name of ['te_baf_a', 'te_baf_b', 'te_baf_dna', ...Array.from({ length: 6 }, (_, i) => 'te_spastin_' + (i + 1))]) {
    const isBaf = name.startsWith('te_baf_');
    const dna = name === 'te_baf_dna';
    const part = mesh(geometryOf(proteins, name), pm(dna ? 0x00e5ff : isBaf ? COLORS.baf : COLORS.spastin));
    if (dna) infoTag(part, 'bafDna');
    (isBaf ? baf : spastin).add(part);
  }
  chromatin.position.set(-12, -7, 13);
  chromatin.rotation.set(0, .83, .12);
  chromatin.add(baf);

  const histoneGeometry = geometryOf(histoneModel, 'coh_histones');
  const histoneMaterial = pm(0xbd88ed, .54), dnaMaterial = pm(0x00e5ff, .76);
  const template = pairedBackbones(nucData.nucleosomeStrands);
  const nucTemplateEnd = midpoint(pairAt(template, -1)).normalize();
  const chromatinAnchor = new THREE.Vector3();
  bafData.bafBackbonesNm.forEach((site, i) => {
    const side = 2 * i - 1;
    const measured = pairedBackbones(site);
    const first = pairAt(measured, 0), last = pairAt(measured, -1);
    const firstMid = midpoint(first), lastMid = midpoint(last);
    const core = infoTag(mesh(histoneGeometry, histoneMaterial), 'histones');
    core.position.set(-4, -12, 11 * side);
    core.quaternion.setFromUnitVectors(nucTemplateEnd, firstMid.clone().sub(core.position).normalize());
    chromatin.add(core);
    if (side > 0) chromatinAnchor.copy(core.position);
    const wrapped = template.map(strand => strand.map(p => p.clone().applyQuaternion(core.quaternion).add(core.position)));
    const wrappedEnd = pairAt(wrapped, -1), wrappedMid = midpoint(wrappedEnd);
    const outFromNucleosome = wrappedMid.clone().sub(midpoint(pairAt(wrapped, -2))).normalize();
    const intoContact = firstMid.clone().sub(midpoint(pairAt(measured, 1))).normalize();
    const link = dnaLink(wrappedEnd, first, [
      wrappedMid.clone().addScaledVector(outFromNucleosome, 2.2),
      firstMid.clone().addScaledVector(intoContact, 2.2),
    ]);
    const awayFromContact = lastMid.clone().sub(midpoint(pairAt(measured, -2))).normalize();
    const deep = lastMid.clone().add(new THREE.Vector3(-7, -9, 13 * side));
    const across = new THREE.Vector3(side * .8, 0, .43);
    const tail = [deep.clone().add(across), deep.clone().sub(across)];
    const continuation = dnaLink(last, tail, [
      lastMid.clone().addScaledVector(awayFromContact, 2.3),
      lastMid.clone().lerp(deep, .55).add(new THREE.Vector3(0, 1.7, 0)),
    ]);
    for (let j = 0; j < 2; j++) {
      const points = [...wrapped[j], ...link[j], ...measured[j], ...continuation[j], tail[j]];
      const path = new THREE.CatmullRomCurve3(points);
      chromatin.add(infoTag(mesh(new THREE.TubeGeometry(path, 310, .19, 6), dnaMaterial), 'telophaseDna'));
    }
  });
  spastin.quaternion.setFromUnitVectors(Y, new THREE.Vector3(.8, .22, .55).normalize());
  group.add(chromatin, spastin);

  // Топология LEM2 у внутренней мембраны и сборка CHMP7/ESCRT показаны
  // как реконструкция, без атомных координат их полной сборки.
  const lem = infoTag(new THREE.Group(), 'lem2');
  const lemMaterial = pm(COLORS.lem2);
  for (let i = 0; i < 9; i++) {
    const a = TAU * i / 9;
    const connector = tube([[18, -.8, 0], [20, -2.3, 0], [20, -4, .7], [17.8, -5.8, 1.1]], .66, lemMaterial);
    connector.rotation.y = -a;
    lem.add(connector);
  }
  group.add(lem);

  const escrt = infoTag(new THREE.Group(), 'escrt');
  const strand = pm(COLORS.escrt);
  const coils = Array.from({ length: 16 }, (_, i) => {
    const a = .11 + i * .43;
    const helix = tube([0, .14, .29, .44].map((da, j) => {
      const r = 19 - .17 * i;
      const y = 3.4 + .17 * (i + j / 3);
      return [r * Math.cos(a + da), y, r * Math.sin(a + da)];
    }), .72, strand, 8);
    escrt.add(helix);
    return helix;
  });
  group.add(escrt);

  let lastSeal = -1;
  function set({ recruit = 0, sever = 0, seal = 0 } = {}) {
    for (let i = 0; i < coils.length; i++) coils[i].visible = recruit > i / coils.length && seal < 1;
    escrt.scale.set(1 - .86 * seal, 1, 1 - .86 * seal);
    lem.scale.set(1 - .77 * seal, 1, 1 - .77 * seal);
    lem.visible = seal < 1;
    gapMarker.visible = seal < .62;
    gapMarker.position.set(-9.4 * (1 - seal), 0, 15.1 * (1 - seal));
    spastin.visible = sever > 0 && seal < .4;
    const approach = THREE.MathUtils.smoothstep(sever, 0, .47);
    spastin.position.set(29 - 13.5 * approach + 13 * seal, 10 + 1.2 * approach, 14.5 - 5 * approach);
    const separation = THREE.MathUtils.smoothstep(sever, .48, 1);
    const withdrawal = 19 * THREE.MathUtils.smoothstep(seal, 0, .65);
    mt[0].position.y = -13 * separation - withdrawal;
    mt[1].position.y = 15 * separation + withdrawal;
    for (const material of mtMaterials) material.uniforms.strength.value = .58 * (1 - THREE.MathUtils.smoothstep(seal, .15, .65));
    mt.forEach(fragment => { fragment.visible = seal < .65; });
    if (seal !== lastSeal) {
      setOpening(17.8 * (1 - seal), THREE.MathUtils.smoothstep(seal, .85, 1));
      lastSeal = seal;
    }
  }
  set();
  const openingLabels = [
    { text: 'Временный разрыв', object: gapMarker, anchor: new THREE.Vector3(), ready: () => gapMarker.visible },
    { text: 'Микротрубочка', object: mt[1], anchor: new THREE.Vector3(0, 15, 11), ready: () => mt[1].visible },
  ];
  const withChromatin = [...openingLabels,
    { text: 'Хроматин', object: chromatin, anchor: chromatinAnchor, ready: () => gapMarker.visible }];
  const withSpastin = [...openingLabels,
    { text: 'Спастин', object: spastin, anchor: new THREE.Vector3(0, 0, 2), ready: () => spastin.visible }];
  return {
    group, set,
    get labels() { return spastin.visible ? withSpastin : withChromatin; },
    dispose() {
      const geometries = new Set(), materials = new Set();
      group.traverse(o => {
        if (!o.isMesh) return;
        if (o.isInstancedMesh) o.dispose();
        geometries.add(o.geometry);
        materials.add(o.material);
      });
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
      group.removeFromParent();
    },
  };
}
