import * as THREE from 'three';

export function createRnaEnvironment() {
  const group = new THREE.Group();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      split: { value: 0 },
      nucleus: { value: new THREE.Color(0xb8b3df) },
      cytoplasm: { value: new THREE.Color(0xc3dedb) },
      light: { value: new THREE.Color(0xe1ecf4) },
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
        float haze = 0.24 + 0.18 * sin(positionInCell.y * 0.07 + 1.0);
        gl_FragColor = vec4(mix(mix(nucleus, cytoplasm, region), light, haze), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(43, 32, 20), material);
  dome.renderOrder = -20;
  group.add(dome);

  const chromatin = new THREE.Group();
  const fibre = new THREE.MeshBasicMaterial({ color: 0x57539d, opacity: 0.18, transparent: true, depthWrite: false });
  const bead = new THREE.SphereGeometry(0.095, 8, 6);
  const nucleosomes = new THREE.InstancedMesh(bead, fibre, 48);
  const pose = new THREE.Object3D();
  pose.scale.set(1.3, 1, 0.86);
  for (const [index, y] of [-2.7, -1.55, 1.9, 2.85].entries()) {
    const points = Array.from({ length: 11 }, (_, i) => new THREE.Vector3(
      -13 + i * 1.13,
      y + 0.57 * Math.sin(i * 0.9 + index) + 0.26 * Math.sin(i * 1.67 - index),
      -4.5 - index * 0.33 + 0.46 * Math.cos(i * 0.65 + index),
    ));
    const path = new THREE.CatmullRomCurve3(points);
    chromatin.add(new THREE.Mesh(new THREE.TubeGeometry(path, 32, 0.042, 5, false), fibre));
    for (let i = 0; i < 12; i++) {
      pose.position.copy(path.getPointAt((i + 0.5) / 12));
      pose.updateMatrix();
      nucleosomes.setMatrixAt(index * 12 + i, pose.matrix);
    }
  }
  chromatin.add(nucleosomes);
  const moreChromatin = chromatin.clone();
  moreChromatin.position.set(12, 0.4, -0.8);
  group.add(chromatin, moreChromatin);

  function setCompartment(showBoth) {
    material.uniforms.split.value = Number(showBoth);
    moreChromatin.visible = !showBoth;
  }
  setCompartment(false);
  return { group, setCompartment };
}
