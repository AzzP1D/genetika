import * as THREE from 'three';
import { PARTS } from './organelles.js';
import { neon } from './style.js';
import { infoTag } from './mitoinfo.js';

const { lerp, smoothstep } = THREE.MathUtils;

// Время, когда край мембраны доходит до участка сферы. Формула та же, что в шейдере shell.
function arrival(direction, axis, pole) {
  const base = .46 + .38 * direction.dot(axis) + .055 * direction.y * direction.z;
  return lerp(base, .96, smoothstep(-direction.y * pole, .76, .98));
}

// Упрощённые плоские цистерны ЭПС. Ближняя к хроматину цистерна доходит
// до края оболочки, остальные остаются видимым продолжением сети.
function createCisternae(axis, radius, side) {
  const group = new THREE.Group();
  const towardER = axis.clone().negate();
  const tangent = new THREE.Vector3(towardER.y, -towardER.x, 0);
  const material = neon(PARTS.er_rough.color, { glass: true, glow: 1.5, power: 1.5, body: .52, strength: 0 });
  const point = new THREE.Vector3();
  const sheets = [0, 1, 2].map(i => {
    const geometry = new THREE.PlaneGeometry(1, 1, 18, 8);
    const uv = geometry.getAttribute('uv');
    const position = geometry.getAttribute('position');
    for (let j = 0; j < position.count; j++) {
      const u = uv.getX(j), v = 2 * uv.getY(j) - 1;
      const width = (.21 + .35 * Math.sin(Math.PI * (u * .86 + .06))) * (1 - .58 * u ** 4);
      point.copy(towardER).multiplyScalar(radius - .04 + i * .28 + u * (1.55 - i * .21) - .039 * v * v);
      point.addScaledVector(tangent, (i - 1) * .36 * Math.sin(Math.PI * u / 2) + width * v);
      point.z += side * (.24 * (1 - Math.cos(u * Math.PI * 1.25)) + .18 * i + .24 * v * u + .13 * Math.sin(v * 3 + u * 6) * u);
      position.setXYZ(j, point.x, point.y, point.z);
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
    return mesh;
  });
  const surface = sheets[0].geometry.getAttribute('position');
  return {
    group, anchor: new THREE.Vector3().fromBufferAttribute(surface, Math.floor(surface.count / 2)),
    update(progress) {
      group.position.copy(towardER).multiplyScalar(.74 * (1 - smoothstep(progress, .02, .30)));
      material.uniforms.strength.value = .64 * smoothstep(progress, 0, .16) * (1 - .67 * smoothstep(progress, .73, 1));
      group.visible = progress > 0;
    },
    dispose() {
      sheets.forEach(sheet => sheet.geometry.dispose());
      material.dispose();
      group.removeFromParent();
    },
  };
}

export function createDaughterEnvelope(source, side) {
  const shell = source.clone(true);
  const [outer, inner, pores] = shell.children;
  shell.position.set(0, side * 3.25, 0);
  shell.scale.setScalar(.65);
  const axis = new THREE.Vector3(side * .92, side * -.4, 0).normalize();
  for (const membrane of [outer, inner]) {
    membrane.material = membrane.material.clone();
    membrane.material.uniforms.uBreak.value = 0;
    membrane.material.uniforms.uBuildAxis.value.copy(axis);
    membrane.material.uniforms.uBuildPole.value = side;
  }
  const matrix = new THREE.Matrix4(), scale = new THREE.Vector3();
  const layout = Array.from({ length: pores.count }, (_, i) => {
    const point = new THREE.Vector3(), rotation = new THREE.Quaternion();
    pores.getMatrixAt(i, matrix);
    matrix.decompose(point, rotation, scale);
    const covered = arrival(point.clone().normalize(), axis, side);
    const start = covered + Math.min(.10, (1 - covered) * .42);
    return { point, rotation, start, end: Math.min(1, start + .14) };
  });
  const cisternae = createCisternae(axis, outer.geometry.parameters.radius, side);
  shell.add(cisternae.group);
  infoTag(cisternae.group, 'endoplasmicReticulum');
  infoTag(shell, 'nucleus');
  infoTag(pores, 'pores');
  const firstPore = Math.min(...layout.map(entry => entry.start));
  const frontPore = layout.filter(entry => entry.point.z > 1).sort((a, b) => a.start - b.start)[0];
  const membraneDirection = axis.clone().negate();
  membraneDirection.z = .2;
  membraneDirection.normalize();
  const membraneArrival = arrival(membraneDirection, axis, side);
  let k = 0;
  function update(progress) {
    k = smoothstep(progress, .16, 1);
    shell.visible = progress > 0;
    outer.material.uniforms.uRebuild.value = inner.material.uniforms.uRebuild.value = k;
    cisternae.update(progress);
    pores.visible = k > firstPore;
    for (let i = 0; i < layout.length; i++) {
      const { point, rotation, start, end } = layout[i];
      scale.setScalar(smoothstep(k, start, end));
      pores.setMatrixAt(i, matrix.compose(point, rotation, scale));
    }
    pores.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return {
    shell, update,
    labels: {
      er: { text: 'Мембраны ЭПС', object: cisternae.group, anchor: cisternae.anchor, ready: () => cisternae.group.visible },
      membrane: { text: 'Двойная мембрана', object: shell, anchor: membraneDirection.multiplyScalar(outer.geometry.parameters.radius), ready: () => k > membraneArrival },
      pore: { text: 'Ядерная пора', object: pores, anchor: frontPore.point, ready: () => k > lerp(frontPore.start, frontPore.end, .3) },
    },
    get progress() { return k; },
    dispose() {
      cisternae.dispose();
      outer.material.dispose();
      inner.material.dispose();
      pores.dispose();
      shell.removeFromParent();
    },
  };
}
