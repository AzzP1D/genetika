import * as THREE from 'three';
import { PARTS } from './organelles.js';
import { nucleosomeGeometry } from './molecules.js';
import { bio, neon } from './style.js';

export function createRnaEnvironment(loadModel) {
  const group = new THREE.Group();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      split: { value: 0 },
      nucleus: { value: new THREE.Color(0x504977) },
      cytoplasm: { value: new THREE.Color(0x355e71) },
      light: { value: new THREE.Color(0x96c0c5) },
    },
    vertexShader: `
      varying vec3 positionInCell;
      void main() {
        positionInCell = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float split;
      uniform vec3 nucleus, cytoplasm, light;
      varying vec3 positionInCell;
      void main() {
        float region = split * smoothstep(-4.0, 4.0, positionInCell.x);
        float haze = 0.24 + 0.19 * sin(positionInCell.y * 0.083 + positionInCell.z * 0.062 + 1.0);
        gl_FragColor = vec4(mix(mix(nucleus, cytoplasm, region), light, haze), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(43, 32, 20), material);
  dome.renderOrder = -20;
  group.add(dome);

  const chromatin = new THREE.Group();
  const fibre = neon(0xb8a3eb, { glass: true, body: 0.55, glow: 1, strength: 0.55 });
  const beads = bio(0xe3daff, { vertexColors: true, neon: { body: 0.54, glow: 1.08 } });
  const nucleosomes = new THREE.InstancedMesh(nucleosomeGeometry(), beads, 26);
  const pose = new THREE.Object3D();
  pose.scale.setScalar(1.12);
  for (const [index, y] of [-1.42, 1.25].entries()) {
    const points = Array.from({ length: 11 }, (_, i) => new THREE.Vector3(
      -6.07 + i * 0.465,
      y + 0.52 * Math.sin(i * 0.7 + index * 2.2) + 0.29 * Math.sin(i * 1.48 - index),
      -1.45 - index * 0.38 + 0.63 * Math.cos(i * 0.74 + index * 2),
    ));
    const path = new THREE.CatmullRomCurve3(points);
    chromatin.add(new THREE.Mesh(new THREE.TubeGeometry(path, 32, 0.042, 5, false), fibre));
    for (let i = 0; i < 13; i++) {
      pose.position.copy(path.getPointAt((i + 0.5) / 13));
      pose.rotation.set(i * 1.1, i * 0.7, i * 0.31);
      pose.updateMatrix();
      nucleosomes.setMatrixAt(index * 13 + i, pose.matrix);
    }
  }
  chromatin.add(nucleosomes);
  const moreChromatin = chromatin.clone();
  moreChromatin.position.set(6.8, 0.4, -0.8);
  group.add(chromatin, moreChromatin);
  const cytoplasm = new THREE.Group();
  group.add(cytoplasm);
  const layout = [
    ['mito', 2.9, [4.9, 1.85, -3.8], [0.32, -0.4, -0.42]],
    ['mito', 2.1, [3.55, -2.2, -3.35], [-0.4, 0.6, 0.34]],
    ['golgi', 2.65, [7.25, -0.68, -4.8], [0.23, -0.49, 0.19]],
  ];
  let populated = false;

  function populateCytoplasm() {
    populated = true;
    const paints = new Map();
    for (const [name, diameter, at, rotation] of layout) {
      loadModel(name).then(source => {
        const model = source.clone(true);
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        model.position.sub(bounds.getCenter(new THREE.Vector3()));
        model.traverse(mesh => {
          if (!mesh.isMesh) return;
          const key = mesh.material.name;
          if (!paints.has(key)) paints.set(key, neon(PARTS[key]?.color ?? 0x89cedd,
            { glass: true, body: 0.53, glow: 0.79, strength: 0.39 }));
          mesh.material = paints.get(key);
        });
        const holder = new THREE.Group();
        holder.add(model);
        holder.scale.setScalar(diameter / Math.max(size.x, size.y, size.z));
        holder.position.set(...at);
        holder.rotation.set(...rotation);
        cytoplasm.add(holder);
      }).catch(error => console.warn('Фон клеточной сцены:', error));
    }
  }

  function setCompartment(showBoth, close = false) {
    material.uniforms.split.value = Number(showBoth);
    chromatin.visible = !close;
    moreChromatin.visible = !showBoth && !close;
    cytoplasm.visible = showBoth && !close;
    if (showBoth && !populated) populateCytoplasm();
  }
  setCompartment(false);
  return { group, setCompartment };
}
