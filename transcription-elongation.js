import * as THREE from 'three';

const SHOTS = [
  { id: 'film-promoter', duration: 4.8, end: 1, width: 6.4, height: 2.8, yaw: -0.16 },
  { id: 'film-entry', duration: 4.9, end: 2, width: 3.5, height: 2.5, yaw: 0.18, landmark: 'dna-entry' },
  { id: 'film-active', duration: 6.7, end: 4, width: 3.3, height: 2.4, yaw: 0.10, landmark: 'active' },
  { id: 'film-exit', duration: 12.8, width: 4, height: 2.8, yaw: -0.17, landmark: 'rna-exit' },
];
const DURATION = SHOTS.reduce((sum, shot) => sum + shot.duration, 0);

export function createElongation({ molecule, camera, controls, fit, frame, onShot, onFinished }) {
  const arrivalPosition = new THREE.Vector3(), arrivalTarget = new THREE.Vector3();
  const eye = new THREE.Vector3(), target = new THREE.Vector3(), left = new THREE.Vector3();
  const blendedTarget = new THREE.Vector3(), blendedPosition = new THREE.Vector3();
  let first = 0, last = SHOTS.length - 1, shotIndex, time, elapsed, resumed, running = false;

  function captureCamera() {
    arrivalPosition.copy(camera.position);
    arrivalTarget.copy(controls.target);
  }

  function selectShot(index) {
    shotIndex = index;
    time = 0;
    captureCamera();
    const shot = SHOTS[index];
    onShot(shot.id, () => molecule.filmLandmark(shot.landmark));
  }

  function draw(cut = false) {
    const shot = SHOTS[shotIndex];
    const previous = SHOTS[shotIndex - 1]?.end ?? 0;
    const end = shot.end ?? molecule.movieLength;
    const interval = Math.min(1, time / shot.duration);
    const finalShot = shotIndex === SHOTS.length - 1;
    const pace = finalShot ? interval * (0.16 + 0.84 * interval) : interval;
    const wide = finalShot ? THREE.MathUtils.smoothstep(interval, 0.13, 0.83) : 0;
    molecule.elongate(THREE.MathUtils.lerp(previous, end, pace), wide);

    target.copy(molecule.filmLandmark(shot.landmark));
    if (!shot.landmark) target.x -= 1.27;
    const close = fit(shot.width, shot.height, 1.14);
    let distance = close;
    if (wide > 0) {
      left.copy(molecule.rnaEnd(true));
      const right = molecule.filmLandmark('dna-entry');
      const length = right.x - left.x + 3.0;
      const wideShot = fit(length, 4.8, 1.02);
      target.x = THREE.MathUtils.lerp(target.x, (right.x + left.x) / 2 + 0.23, wide);
      target.y = THREE.MathUtils.lerp(target.y, -0.88, wide);
      target.z = THREE.MathUtils.lerp(target.z, 0.12, wide);
      distance = THREE.MathUtils.lerp(close, wideShot, wide);
    }
    const yaw = THREE.MathUtils.lerp(shot.yaw, 0.52, wide);
    eye.set(distance * yaw, distance * (0.14 + 0.08 * wide), distance).add(target);
    const blend = cut ? 1 : THREE.MathUtils.smoothstep(Math.min(time, resumed), 0, shotIndex === first ? 1.25 : 1.65);
    blendedTarget.lerpVectors(arrivalTarget, target, blend);
    blendedPosition.lerpVectors(arrivalPosition, eye, blend);
    frame(blendedTarget, blendedPosition, 0.7, Math.max(distance * 2.1, blendedPosition.distanceTo(blendedTarget) * 1.4));
  }

  function start(from = 0, to = SHOTS.length - 1) {
    const expected = molecule.practiceLength + (SHOTS[from - 1]?.end ?? 0);
    const cut = molecule.opening.copied !== expected;
    first = from;
    last = to;
    elapsed = 0;
    resumed = Infinity;
    controls.enabled = false;
    running = true;
    selectShot(first);
    draw(cut);
    if (cut) captureCamera();
  }

  function tick(dt) {
    if (!running) return;
    const shot = SHOTS[shotIndex];
    elapsed += dt;
    time = Math.min(shot.duration, time + dt);
    resumed += dt;
    draw();
    if (time < shot.duration) return;
    if (shotIndex < last) {
      selectShot(shotIndex + 1);
      return;
    }
    pause();
    onFinished();
  }

  function pause() {
    running = false;
    controls.enabled = true;
  }

  function resume() {
    captureCamera();
    resumed = 0;
    running = true;
    controls.enabled = false;
    onShot(SHOTS[shotIndex].id, () => molecule.filmLandmark(SHOTS[shotIndex].landmark));
  }

  return { start, tick, pause, resume,
    get running() { return running; },
    get progress() { return Math.min(1, elapsed / (first === last ? SHOTS[first].duration : DURATION)); },
  };
}
