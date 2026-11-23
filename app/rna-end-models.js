import * as THREE from 'three';
import { neon } from './style.js';

export function createRNAEndModels() {
  const group = new THREE.Group();
  const sphere = new THREE.IcosahedronGeometry(1, 2);
  const rod = new THREE.CylinderGeometry(1, 1, 1, 10);
  const green = neon(0x95e8ae, { body: 0.81, glow: 1.56 });
  const gold = neon(0xffce70, { body: 0.8, glow: 1.50 });
  const blue = neon(0x64cbdc, { body: 0.80, glow: 1.54 });
  const cap = new THREE.Mesh(sphere, green);
  const capBond = new THREE.Mesh(rod, green);
  const phosphates = Array.from({ length: 3 }, () => new THREE.Mesh(sphere, gold));
  const tail = Array.from({ length: 10 }, () => ({
    base: new THREE.Mesh(sphere, blue), bond: new THREE.Mesh(rod, blue),
  }));
  group.add(cap, capBond, ...phosphates, ...tail.flatMap(({ base, bond }) => [base, bond]));
  const direction = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  function connect(mesh, a, b, radius) {
    direction.subVectors(b, a);
    mesh.position.copy(a).lerp(b, 0.5);
    mesh.scale.set(radius, Math.max(direction.length(), 0.001), radius);
    mesh.quaternion.setFromUnitVectors(up, direction.normalize());
  }

  function draw(first, last, capping, additions, spacing = 1) {
    cap.visible = !!first && capping !== null;
    capBond.visible = cap.visible && capping >= 0.92;
    for (const node of phosphates) node.visible = capBond.visible;
    if (cap.visible) {
      cap.scale.setScalar(0.16 * spacing);
      cap.position.copy(first);
      cap.position.x -= 0.56 * spacing;
      cap.position.y += 0.74 * (1 - capping);
      cap.position.z += 0.12 * (1 - capping);
      if (capBond.visible) {
        connect(capBond, first, cap.position, 0.026 * spacing);
        phosphates.forEach((node, i) => {
          node.position.copy(first).lerp(cap.position, (i + 1) * 0.19);
          node.scale.setScalar(0.04 * spacing);
        });
      }
    }
    let previous = last;
    let tip = last;
    const count = additions * tail.length;
    for (const [i, { base, bond }] of tail.entries()) {
      base.visible = bond.visible = !!last && count > i;
      if (!base.visible) continue;
      const arrival = Math.min(1, count - i);
      base.position.copy(last);
      base.position.x += (i + 1) * 0.23 * spacing;
      base.position.y += -0.075 * (i + 1) * spacing + 0.37 * (1 - arrival);
      base.position.z += 0.06 * Math.sin(i * 0.65);
      base.scale.setScalar((0.055 + 0.05 * arrival) * spacing);
      connect(bond, previous, base.position, 0.040 * spacing);
      tip = previous = base.position;
    }
    return tip;
  }

  return { group, draw, cap, tailMidpoint: tail[4].base };
}
