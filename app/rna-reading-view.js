import * as THREE from 'three';
import { neon } from './style.js';
import { residues } from './rna-elongation.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const up = v(0, 1, 0);
const ease = t => THREE.MathUtils.smoothstep(t, 0, 1);

export function createReadingView(model, donor, met, sites) {
  const carrier = new THREE.Group();
  const incoming = donor.clone();
  incoming.material = neon(0x78dbce, { body: 0.7, glow: 1.0 });
  carrier.add(incoming);
  model.add(carrier);
  const donorRest = donor.position.clone();
  const anchor = met.position.clone();
  const a = sites.A.clone().sub(sites.P);
  const e = sites.E.clone().sub(sites.P);
  const pool = a.clone().add(v(1.15, 1.6, -0.45));
  const sphere = new THREE.IcosahedronGeometry(0.091, 2);
  const cylinder = new THREE.CylinderGeometry(0.029, 0.029, 1, 8);
  const bondPaint = neon(0xdfb6d1, { body: 0.8, glow: 0.9 });
  const beads = residues.map(residue => new THREE.Mesh(sphere, neon(residue.color, { body: 0.85, glow: 1.15 })));
  const bonds = residues.slice(1).map(() => new THREE.Mesh(cylinder, bondPaint));
  model.add(...beads, ...bonds);
  const end = v(), delta = v(), donorShift = v(), positionA = v();
  let factor;

  function setFactor(source) {
    factor = source.clone(true);
    const paint = neon(0xe3a16e, { body: 0.7, glow: 0.9 });
    factor.traverse(object => { if (object.isMesh) object.material = paint; });
    model.add(factor);
    factor.visible = false;
  }

  function draw(step, state) {
    carrier.visible = step === 'cycle';
    if (factor) factor.visible = step === 'release' && state.release < 0.88;
    for (const bead of beads) bead.visible = false;
    for (const bond of bonds) bond.visible = false;
    if (!state) return;

    const dock = ease(state.dock ?? 0);
    const settle = ease(state.settle ?? 0);
    const shift = ease(state.shift ?? 0);
    const exit = ease(state.exit ?? 0);
    const release = ease(state.release ?? 0);
    const transfer = ease(state.transfer ?? 0);
    positionA.copy(pool).lerp(a, dock);
    positionA.y += dock * (1 - settle) * 0.31;
    positionA.addScaledVector(a, -shift);
    carrier.position.copy(positionA);
    donorShift.copy(e).multiplyScalar(shift).addScaledVector(v(-0.65, 0.85, -0.65), exit);
    donor.position.copy(donorRest).add(donorShift);
    donor.visible = exit < 0.995 && release < 0.995;
    met.visible = false;
    if (factor?.visible) {
      factor.position.copy(sites.A).addScaledVector(v(1.2, 1.9, -0.45), 1 - ease(state.releaseDock));
    }

    const lastLinked = state.count - 1;
    const transitionEnd = Math.min(1, transfer * 1.22);
    for (let i = 0; i < state.length; i++) {
      const bead = beads[i];
      bead.visible = true;
      if (i === state.index && carrier.visible) {
        bead.position.copy(anchor).add(positionA);
      } else {
        const distance = state.index - 1 - i;
        end.copy(donorShift).lerp(positionA, transitionEnd);
        bead.position.copy(anchor).add(end);
        if (carrier.visible) bead.position.lerp(anchor.clone().add(positionA), transfer * 0.14);
        bead.position.x += distance * 0.085 + transfer * 0.13;
        bead.position.y += distance * 0.225 + transfer * 0.19;
        bead.position.z -= distance * 0.08 + transfer * 0.09;
      }
      if (release > 0) {
        const freed = v(anchor.x + (lastLinked - i) * 0.36 - 0.95, anchor.y + 1.6, anchor.z - 0.85);
        bead.position.lerp(freed, release);
      }
      if (i === 0) continue;
      const bond = bonds[i - 1];
      bond.visible = i <= lastLinked;
      if (!bond.visible) continue;
      delta.subVectors(bead.position, beads[i - 1].position);
      bond.position.copy(bead.position).lerp(beads[i - 1].position, 0.5);
      bond.scale.y = delta.length();
      bond.quaternion.setFromUnitVectors(up, delta.normalize());
    }
  }

  function point(key) {
    if (key === 'erf1') return factor?.visible ? model.localToWorld(factor.position.clone().add(v(0, 0.65, 0))) : null;
    const bead = beads[Number(key.slice(4))];
    return bead?.visible ? bead.getWorldPosition(v()) : null;
  }

  return { draw, point, setFactor };
}
