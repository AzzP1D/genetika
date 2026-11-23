import * as THREE from 'three';
import { neon } from './style.js';

export const EXPORT_FRAMES = [0, 1.5, 4, 6.4, 8];
export const RNA_EXPORT_SCALE = 0.44;

export function exportPose(time) {
  const [start, dock, , releaseAt, end] = EXPORT_FRAMES;
  const { lerp, smoothstep } = THREE.MathUtils;
  const release = smoothstep(time, releaseAt, end);
  const rnaX = time < dock
    ? lerp(-3.8, -3.12, smoothstep(time, start, dock))
    : lerp(-3.12, 3.65, smoothstep(time, dock, releaseAt)) + 0.32 * release;
  return { rnaX, release };
}

function membrane(x, color) {
  const radius = 3.65 + x;
  const opening = Math.asin(0.78 / radius);
  const points = [], indices = [];
  const sections = 32, arcs = 42;
  for (let row = 0; row <= sections; row++) {
    const u = row / sections;
    const theta = THREE.MathUtils.lerp(opening, Math.PI, u);
    const cut = 0.95 * Math.sin(Math.PI * u) ** 0.6;
    for (let column = 0; column <= arcs; column++) {
      const phi = THREE.MathUtils.lerp(Math.PI - cut, 2 * Math.PI + cut, column / arcs);
      points.push(-3.65 + radius * Math.cos(theta),
        radius * Math.sin(theta) * Math.cos(phi), radius * Math.sin(theta) * Math.sin(phi));
      if (row && column) {
        const a = row * (arcs + 1) + column;
        indices.push(a, a - 1, a - arcs - 2, a, a - arcs - 2, a - arcs - 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const surface = new THREE.Mesh(geometry, neon(color, { glass: true, body: 0.15, glow: 0.72, strength: 0.35 }));
  surface.material.side = THREE.DoubleSide;
  const edge = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.047, 8, 40), neon(color, { body: 0.58, glow: 1.2 }));
  edge.rotation.y = Math.PI / 2;
  edge.position.x = -3.65 + radius * Math.cos(opening);
  surface.add(edge);
  surface.userData.object = 'membrane';
  return surface;
}

export function createRnaExportScene(loadAsset) {
  const group = new THREE.Group();
  const membranes = [membrane(-0.31, 0x8373d8), membrane(0.31, 0x55bedb)];
  group.add(...membranes);

  const porePaint = neon(0x309c96, { body: 0.73, glow: 1.35 });
  const rimPaint = neon(0x52b391, { body: 0.83, glow: 1.2 });
  const rings = [-0.57, 0, 0.57].map((x, i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(i === 1 ? 0.65 : 0.78, 0.115, 10, 40), porePaint);
    ring.position.x = x;
    ring.rotation.y = Math.PI / 2;
    ring.userData.object = 'pore';
    group.add(ring);
    return ring;
  });
  const subunit = new THREE.IcosahedronGeometry(0.18, 2);
  for (const x of [-0.57, 0.57]) {
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const node = new THREE.Mesh(subunit, rimPaint);
      node.position.set(x, 0.78 * Math.cos(angle), 0.78 * Math.sin(angle));
      node.scale.set(1.12, 0.88, 0.88);
      node.userData.object = 'pore';
      group.add(node);
      rings.push(node);
    }
  }
  // A larger hidden target keeps the pore selectable through the opening.
  const passage = new THREE.Mesh(new THREE.CylinderGeometry(0.63, 0.63, 1.25, 20),
    new THREE.MeshBasicMaterial({ visible: false }));
  passage.rotation.z = Math.PI / 2;
  passage.userData.object = 'pore';
  group.add(passage);
  const targets = [passage, ...rings, ...membranes];
  loadAsset('nuclear_pore_specimen').then(source => {
    const model = source.clone(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    model.position.sub(bounds.getCenter(new THREE.Vector3()));
    const scaffold = new THREE.Group();
    scaffold.add(model);
    scaffold.rotation.z = Math.PI / 2;
    scaffold.scale.setScalar(2.42 / Math.max(size.x, size.z));
    const inner = neon(0x55cbb1, { body: 0.64, glow: 1.35 });
    const outer = neon(0x80aee9, { body: 0.64, glow: 1.28 });
    targets.splice(1, rings.length);
    model.traverse(mesh => {
      if (!mesh.isMesh) return;
      mesh.material = mesh.name.includes('Inner-ring') ? inner : outer;
      mesh.userData.object = 'pore';
      targets.push(mesh);
    });
    group.add(scaffold);
    rings.forEach(ring => { ring.visible = false; });
  }).catch(error => console.warn('7R5J:', error));

  const factor = new THREE.Group();
  const fallback = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 2), neon(0xf8c679, { body: 0.78 }));
  factor.add(fallback);
  group.add(factor);
  loadAsset('rna_export_factor').then(source => {
    const model = source.clone(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    model.position.sub(bounds.getCenter(new THREE.Vector3()));
    const surface = new THREE.Group();
    surface.add(model);
    surface.scale.setScalar(0.64 / Math.max(size.x, size.y, size.z));
    const paints = [neon(0xf8db96, { body: 0.76 }), neon(0xeaa05b, { body: 0.84 })];
    model.traverse(object => {
      if (object.isMesh) object.material = paints[object.name.includes('NXT1') ? 0 : 1];
    });
    factor.add(surface);
    fallback.visible = false;
  }).catch(error => console.warn('1JKG:', error));

  const enzyme = new THREE.Group();
  const enzymePaint = neon(0xe6608c, { body: 0.74, glow: 1.2 });
  const enzymePlaceholder = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 2), enzymePaint);
  enzyme.add(enzymePlaceholder);
  enzyme.position.set(1.2, -0.51, 0.49);
  enzyme.visible = false;
  group.add(enzyme);
  let enzymeRequested = false;

  const anchors = {
    nucleus: new THREE.Vector3(-3, 1.56, 0.75),
    cytoplasm: new THREE.Vector3(3, 1.56, 0.75),
    pore: new THREE.Vector3(0, -0.40, 0.85),
    membranes: new THREE.Vector3(0, 1.55, 1.55),
    factor: factor.position,
    ddx19: enzyme.position,
  };

  function update(time, rna, cap) {
    const { rnaX, release } = exportPose(time);
    rna.position.x = rnaX;
    const capPosition = cap.getWorldPosition(new THREE.Vector3());
    factor.position.copy(capPosition).add(new THREE.Vector3(-0.35 - 1.2 * release, 0.29 + 0.75 * release, 0.07));
    factor.rotation.set(0.13, 0.38 + release * 1.2, release * 0.58);
    enzyme.visible = time >= EXPORT_FRAMES[3];
    if (enzyme.visible && !enzymeRequested) {
      enzymeRequested = true;
      loadAsset('ddx19_specimen').then(source => {
        const mesh = source.getObjectByName('GEO-DDX19B')?.clone();
        if (!mesh) return;
        mesh.material = enzymePaint;
        mesh.scale.setScalar(0.26);
        enzymePlaceholder.visible = false;
        enzyme.add(mesh);
      }).catch(error => console.warn('3G0H:', error));
    }
  }

  return { group, anchors, update, targets };
}
