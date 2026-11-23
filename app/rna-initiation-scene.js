import * as THREE from 'three';
import { neon } from './style.js';
import { createReadingView } from './rna-reading-view.js';

function sectionMaterial(source, center) {
  const material = source.clone();
  material.uniforms.sectionCenter = { value: center };
  material.uniforms.body.value *= 0.62;
  material.uniforms.glow.value *= 0.42;
  material.side = THREE.DoubleSide;
  material.vertexShader = 'varying vec3 cellPosition;\n' + material.vertexShader
    .replace('void main() {', 'void main() { cellPosition = (modelMatrix * vec4(position, 1.0)).xyz;');
  material.fragmentShader = 'varying vec3 cellPosition; uniform vec3 sectionCenter;\n' + material.fragmentShader
    .replace('void main() {', `void main() {
      vec3 towardCamera = cameraPosition - sectionCenter;
      towardCamera.y *= 0.12;
      if (dot(cellPosition - sectionCenter, normalize(towardCamera)) > -0.22) discard;
    `);
  return material;
}

export function createInitiationView(source, exportX) {
  const group = new THREE.Group();
  const model = source.clone(true);
  group.add(model);
  group.rotation.y = Math.PI;
  group.scale.setScalar(0.78);

  const mesh = name => model.getObjectByName(`GEO-${name}`);
  const small = mesh('40S');
  const large = mesh('60S');
  const trna = mesh('Initiator-tRNA');
  const met = mesh('Met-educational');
  for (const [object, color, target] of [
    [small, 0x55c5d8, '40s'], [large, 0x9b8ae8, '60s'],
    [trna, 0x78dba3, 'trna'], [met, 0xffca72, 'trna'],
  ]) {
    object.material = neon(color, { body: 0.77, glow: 1.4 });
    object.userData.object = target;
  }
  const solid = [small.material, large.material];
  const sectionCenter = new THREE.Vector3();
  const cutaway = solid.map(material => sectionMaterial(material, sectionCenter));
  const route = new Map();
  for (const object of model.children) {
    if (object.name.startsWith('mRNA-reference-')) {
      route.set(Number(object.name.slice('mRNA-reference-'.length)), object.position);
    }
  }
  const local = name => model.getObjectByName(name).position;
  const sites = Object.fromEntries(['A', 'P', 'E'].map(site => [site, local(`Site-${site}-codon`)]));
  const rings = Object.fromEntries(Object.entries(sites).map(([site, position]) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.021, 8, 20),
      neon({ A: 0xb4ff8a, P: 0x81dffb, E: 0xffbda9 }[site], { body: 0.8, glow: 0.9 }));
    ring.position.copy(position);
    ring.position.y += 0.045;
    ring.rotation.x = -Math.PI / 2.6;
    model.add(ring);
    return [site, ring];
  }));
  const reading = createReadingView(model, trna, met, sites);
  const center = object => new THREE.Box3().setFromObject(object, true).getCenter(new THREE.Vector3());
  const geometryCenter = object => {
    object.geometry.computeBoundingBox();
    return object.geometry.boundingBox.getCenter(new THREE.Vector3());
  };
  const centers = new Map([small, large, trna].map(object => [object, geometryCenter(object)]));
  const last = route.get(22);
  const tangent = last.clone().sub(route.get(21)).normalize();
  const templateTRNA = trna.position.clone();
  const templateMet = met.position.clone();
  const templateLarge = large.position.clone();
  const templateSmall = small.position.clone();
  const helpers = new Map();
  const nucleolus = new THREE.Mesh(new THREE.IcosahedronGeometry(0.67, 2),
    new THREE.MeshBasicMaterial({ color: 0xb697ee, transparent: true, opacity: 0.44, depthWrite: false }));
  // The nucleolus stays in cell coordinates while the two subunits move between compartments.
  group.add(nucleolus);

  function setHelper(key, source) {
    const helper = source.clone(true);
    const paint = neon(key === 'eif3' ? 0xe4a17f : 0x76cbb3, { body: 0.52, glow: 0.85 });
    const meshes = [];
    helper.traverse(object => { if (object.isMesh) meshes.push(object); });
    model.add(helper);
    const location = helper.worldToLocal(new THREE.Box3().setFromObject(helper).getCenter(new THREE.Vector3()));
    helpers.set(key, { helper, location, meshes, paint, section: sectionMaterial(paint, sectionCenter) });
    helper.visible = false;
  }

  function point(key) {
    if (key === 'nucleolus') return nucleolus.visible ? nucleolus.getWorldPosition(new THREE.Vector3()) : null;
    if (key === '40s') return small.localToWorld(centers.get(small).clone());
    if (key === '60s') return large.visible ? large.localToWorld(centers.get(large).clone()) : null;
    if (key === 'trna') return met.visible ? met.getWorldPosition(new THREE.Vector3()) : null;
    if (key === 'aug' || key === 'site-p') return model.localToWorld(local('Site-P-codon').clone());
    if (key === 'site-a') return model.localToWorld(local('Site-A-codon').clone());
    if (key === 'site-e') return model.localToWorld(local('Site-E-codon').clone());
    if (key.startsWith('codon-')) {
      const site = ['E', 'P', 'A'][Number(key.at(-1))];
      return model.localToWorld(local(`Site-${site}-codon`).clone());
    }
    const helper = helpers.get(key);
    if (helper?.helper.visible) return helper.helper.localToWorld(helper.location.clone());
    return reading.point(key);
  }

  function draw({ step, origin, helper, delivery, loading, scan, assembly, cut, focus, reading: state }) {
    const overview = step === 'origin';
    const zoom = overview ? 0.20 + 0.58 * THREE.MathUtils.smoothstep(origin, 0.72, 1) : 0.78;
    group.scale.setScalar(zoom);
    group.position.set(exportX + 1.45 - 0.68 * scan, 1.35 * (1 - loading), 0.17 - 0.28 * (1 - loading));
    small.position.copy(templateSmall);
    large.position.copy(templateLarge);
    if (overview) {
      const passage = fraction => THREE.MathUtils.smoothstep(fraction, 0, 1);
      group.position.set(0, 0, 0.2);
      small.position.x -= THREE.MathUtils.lerp(-2.45, exportX + 1.45, passage(origin * 1.3)) / zoom;
      small.position.y += THREE.MathUtils.lerp(-0.20, 1.35, passage((origin - 0.2) / 0.8)) / zoom;
      large.position.x -= THREE.MathUtils.lerp(-2.7, exportX + 2.2, passage((origin - 0.24) / 0.76)) / zoom;
      large.position.y += (0.18 + 2.15 * passage((origin - 0.46) / 0.54)) / zoom;
    } else {
      large.position.x += -1.65 * (1 - assembly) - 2.25 * (state?.release ?? 0);
      large.position.y += 2.10 * (1 - assembly) + 0.38 * (state?.release ?? 0);
      small.position.y -= 0.32 * (state?.release ?? 0);
    }
    nucleolus.visible = overview && origin < 0.6;
    if (nucleolus.visible) {
      nucleolus.position.set(2.64 / zoom, -0.04 / zoom, 0.74 / zoom);
      nucleolus.scale.setScalar(1 / zoom);
    }
    large.visible = ['origin', 'find', 'assemble', 'site', 'done'].includes(step) || Boolean(state);
    const approaches = 1 - THREE.MathUtils.smoothstep(delivery, 0, 1);
    trna.position.copy(templateTRNA).addScaledVector(new THREE.Vector3(1.30, 1.62, -0.68), approaches);
    met.position.copy(templateMet).addScaledVector(new THREE.Vector3(1.30, 1.62, -0.68), approaches);
    trna.visible = step === 'scan' || delivery > 0;
    met.visible = trna.visible;
    for (const [key, entry] of helpers) {
      const capHelper = key === 'eif3';
      const away = capHelper ? THREE.MathUtils.smoothstep(assembly, 0.02, 0.82) :
        THREE.MathUtils.smoothstep(scan, 0.63, 1);
      entry.helper.visible = away < 1 && (step === 'scan' ||
        (capHelper && ['codon', 'trna', 'assemble'].includes(step)));
      for (const mesh of entry.meshes) mesh.material = cut && loading > 0.75 ? entry.section : entry.paint;
      entry.helper.position.set(capHelper ? -2.1 * (1 - helper) - 3.2 * away : 1.3 * approaches + 2.7 * away,
        (capHelper ? 0.85 * (1 - helper) : 1.62 * approaches) + 1.4 * away, -0.68 * approaches - 0.5 * away);
    }
    [small.material, large.material] = cut ? cutaway : solid;
    for (const [site, ring] of Object.entries(rings)) {
      ring.visible = cut && (Boolean(state) || ['site', 'done', 'assemble'].includes(step));
      ring.scale.setScalar(focus === site ? 1.5 : 1);
    }
    reading.draw(step, state);
    group.updateMatrixWorld(true);
    model.localToWorld(sectionCenter.copy(sites.P));
  }

  function basePosition(index, out, shift) {
    const whole = Math.floor(index - shift);
    const pointAt = i => route.get(i < 3 ? i - 3 : i - 2) ??
      last.clone().addScaledVector(tangent, (i - 24) * 0.155);
    out.copy(pointAt(whole)).lerp(pointAt(whole + 1), index - shift - whole);
    return model.localToWorld(out);
  }

  function pick(ray) {
    return ray.intersectObjects([small, large, trna, met].filter(object => object.visible))[0]?.object.userData.object;
  }

  return { group, draw, point, basePosition, pick, setHelper, setFactor: reading.setFactor,
    bounds: () => center(small) };
}
