import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { loadModel } from './organelles.js';
import { neon, motes } from './style.js';
import { bindLessonInput } from './mitoinput.js';
import { createRnaExportScene, exportPose, EXPORT_FRAMES, RNA_EXPORT_SCALE } from './rna-export-scene.js';
import { createRnaEnvironment } from './rna-environment.js';
import { createRNAEndModels } from './rna-end-models.js';
import { createInitiationView } from './rna-initiation-scene.js';
import { RNA_BASES, SPLICING_INTRONS, basesAfterSplicing } from './transcription-sequence.js';

const COLORS = { e1: 0xf67eb7, i1: 0xf4c16f, e2: 0xd476e5, i2: 0xf4c16f, e3: 0xff8cab };
const vector = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = THREE.MathUtils.smoothstep;
const matureRNA = basesAfterSplicing(SPLICING_INTRONS.length);
export const REACTION = { loop: 1.48, join: 2.53 };

export function createSplicingScene(stage, updateLabels, selectBase, { glowButton, selectObject, onContextLost } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  stage.prepend(renderer.domElement);
  const space = new THREE.Scene();
  space.background = new THREE.Color(0x060c16);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.06, 95);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = Boolean(selectObject);
  controls.dampingFactor = 0.09;
  const dust = motes(78, 7.8, 0x456f93);
  dust.position.z = -3.8;
  dust.material.opacity = 0.46;
  space.add(dust);
  const environment = selectObject ? createRnaEnvironment(loadModel) : null;
  if (environment) space.add(environment.group);

  const ribbon = new THREE.Group();
  const proteins = new THREE.Group();
  const experiment = new THREE.Group();
  experiment.visible = false;
  space.add(ribbon, proteins, experiment);
  const globe = new THREE.IcosahedronGeometry(1, 2);
  const rod = new THREE.CylinderGeometry(1, 1, 1, 9);
  const paints = Object.fromEntries(Object.entries(COLORS).map(([id, color]) =>
    [id, neon(color, { body: 0.76, glow: 1.85 })]));
  const junctionPaint = neon(0x74f8f0, { body: 0.80, glow: 1.65 });
  const branchPaint = neon(0xffd857, { body: 0.80, glow: 1.65 });
  const beads = RNA_BASES.map(({ index, part }) => {
    const mesh = new THREE.Mesh(globe, paints[part]);
    mesh.userData.base = index;
    ribbon.add(mesh);
    return mesh;
  });
  const bonds = RNA_BASES.map(() => {
    const mesh = new THREE.Mesh(rod);
    ribbon.add(mesh);
    return mesh;
  });
  const extraBond = new THREE.Mesh(rod, branchPaint);
  const loopTube = new THREE.InstancedMesh(rod, paints.i1, 42);
  loopTube.frustumCulled = false;
  const tubeJoint = new THREE.Object3D();
  const branch = new THREE.Mesh(globe, branchPaint);
  const join = new THREE.Mesh(globe, junctionPaint);
  const freeEnd = new THREE.Mesh(globe, junctionPaint);
  ribbon.add(extraBond, loopTube, branch, join, freeEnd);
  const ends = createRNAEndModels();
  ribbon.add(ends.group);

  let detailsMode = false;
  let structurePromise;
  let proteinModel;
  let structureSize;
  let sceneLayout;
  let viewSize = 12;
  let viewHeight = 3;
  let viewCenter = vector(0, 0.03, 0);
  let cameraMove;
  let exportView;
  let exportFocus;
  let initiation;
  let initiationLoad;
  let initiationState;
  let initiationRest;
  let initiationFramed = false;
  let specimen;
  let composer;
  let glowing = false;
  let probe;

  function showGlow() {
    glowButton.textContent = glowing ? '✦' : '✧';
    glowButton.setAttribute('aria-pressed', String(glowing));
    glowButton.title = glowing ? 'Выключить свечение' : 'Включить свечение';
  }

  if (glowButton) {
    const gl = renderer.getContext();
    const supported = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');
    if (supported) {
      try { glowing = localStorage.getItem('gen-glow') !== 'off'; } catch { glowing = true; }
      glowButton.hidden = false;
      showGlow();
      if (glowing) probe = { start: performance.now(), frames: 0 };
      glowButton.onclick = () => {
        glowing = !glowing;
        probe = null;
        try { localStorage.setItem('gen-glow', glowing ? 'on' : 'off'); } catch { /* preference unavailable */ }
        showGlow();
      };
    }
  }

  if (onContextLost) renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    renderer.setAnimationLoop(null);
    onContextLost();
  });

  function fit(animated = false) {
    const distance = Math.max(viewSize / camera.aspect, viewHeight) /
      (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.12;
    const offset = specimen?.viewpoint
      ? vector(...specimen.viewpoint).normalize().multiplyScalar(distance)
      : vector(exportFocus && !specimen ? distance * 0.19 : 0, 0.38, distance);
    const end = viewCenter.clone().add(offset);
    controls.minDistance = Math.max(1.8, distance * 0.43);
    controls.maxDistance = Math.max(12, distance * 1.9);
    if (animated) {
      cameraMove = { start: performance.now(), from: camera.position.clone(), target: controls.target.clone(), end };
    } else {
      cameraMove = null;
      camera.position.copy(end);
      controls.target.copy(viewCenter);
      controls.update();
    }
  }

  new ResizeObserver(() => {
    const { clientWidth: w, clientHeight: h } = stage;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer?.setSize(w, h);
    fit(Boolean(cameraMove && exportFocus));
  }).observe(stage);
  fit();

  function connect(mesh, a, b, radius) {
    const direction = new THREE.Vector3().subVectors(b, a);
    mesh.position.copy(a).lerp(b, 0.5);
    mesh.quaternion.setFromUnitVectors(vector(0, 1, 0), direction.clone().normalize());
    mesh.scale.set(radius, Math.max(0.001, direction.length()), radius);
    mesh.visible = true;
  }

  function renderLoop(first, last, radius) {
    const knots = beads.slice(first, last + 1).map(bead => bead.position);
    const path = new THREE.CatmullRomCurve3(knots);
    const points = path.getPoints(loopTube.count);
    for (let i = 0; i < loopTube.count; i++) {
      connect(tubeJoint, points[i], points[i + 1], radius);
      tubeJoint.updateMatrix();
      loopTube.setMatrixAt(i, tubeJoint.matrix);
    }
    loopTube.instanceMatrix.needsUpdate = true;
  }

  function render(layout) {
    const { completed, intron, progress, marked } = layout;
    const focused = intron !== null;
    const focusChanged = sceneLayout?.intron !== intron
      || (sceneLayout?.completed !== completed && !focused);
    sceneLayout = layout;
    const selected = focused ? SPLICING_INTRONS[intron] : null;
    const visible = basesAfterSplicing(completed).filter(({ index }) =>
      !focused || (index >= selected.first - 5 && index <= selected.last + 6));
    const distance = focused ? 0.29 : 0.19;
    const baseRadius = focused ? 0.102 : 0.070;
    const inView = new Set(visible.map(base => base.index));
    const links = [];
    const shown = [];
    for (const mesh of [...beads, ...bonds, extraBond, branch, join, freeEnd]) mesh.visible = false;
    const curled = ease(progress, 1.14, 2);
    const finished = ease(progress, 2.05, 2.88);
    const detached = ease(progress, 2.52, 3);
    const firstAt = focused ? visible.findIndex(base => base.index === selected.first) : 0;
    const lastAt = focused ? visible.findIndex(base => base.index === selected.last) : 0;
    const lastRing = Math.max(3, lastAt - firstAt - 2);
    const xMid = focused ? ((firstAt + lastAt) * 0.5 - (visible.length - 1) * 0.5) * distance : 0;
    loopTube.visible = focused && curled > 0.62;

    for (const [i, { index, part }] of visible.entries()) {
      const inside = focused && index >= selected.first && index <= selected.last;
      const x = (i - (visible.length - 1) * 0.5) * distance - (focused ? 0 : 0.35);
      const after = focused && index > selected.last;
      const shift = after ? (lastAt - firstAt + 1) * distance * finished : 0;
      const position = vector(x - shift, Math.sin(i * 0.48) * (focused ? 0.06 : 0.13), Math.cos(i * 0.38) * 0.11);
      if (inside) {
        const knot = i - firstAt;
        const turn = Math.min(knot / lastRing, 1) * Math.PI * 2;
        const tail = Math.max(0, knot - lastRing);
        const loop = vector(xMid + Math.sin(turn) * 0.64 + tail * 0.23 - detached * 0.34,
          1.46 - Math.cos(turn) * 0.57 - tail * 0.23 + detached * 0.36, 0.53 + Math.sin(turn) * 0.06);
        if (knot === 0) loop.x -= 0.18;
        position.lerp(loop, curled);
      }
      const bead = beads[index];
      bead.visible = true;
      bead.position.copy(position);
      bead.scale.setScalar(baseRadius * (inside && curled > 0.5 ? 0.94 : 1));
      shown.push({ index, part, inside });
    }

    for (let i = 1; i < shown.length; i++) {
      const a = shown[i - 1], b = shown[i];
      if (focused && a.index === selected.first - 1 && progress >= REACTION.loop) continue;
      if (focused && a.index === selected.last && progress >= REACTION.join) continue;
      if (loopTube.visible && a.inside && b.inside) continue;
      links.push({ a, b, join: b.index !== a.index + 1 });
    }
    if (loopTube.visible) renderLoop(selected.first, selected.last, baseRadius * 0.44);
    if (focused && progress >= REACTION.join) {
      const left = shown.find(base => base.index === selected.first - 1);
      const right = shown.find(base => base.index === selected.last + 1);
      links.push({ a: left, b: right, join: true });
      join.visible = true;
      join.position.copy(beads[left.index].position).lerp(beads[right.index].position, 0.5);
      join.scale.setScalar(0.066);
    }
    for (const [i, { a, b, join: newBond }] of links.entries()) {
      const bond = bonds[i];
      const kept = focused && a.index === selected.last && !newBond && progress >= REACTION.loop;
      bond.material = kept ? branchPaint :
        newBond || marked.includes(a.index) && progress < REACTION.loop ? junctionPaint : paints[a.part];
      connect(bond, beads[a.index].position, beads[b.index].position, newBond || kept ? 0.052 : baseRadius * 0.44);
    }
    if (focused && progress >= REACTION.loop && inView.has(selected.first + lastRing)) {
      const first = beads[selected.first].position;
      branch.position.copy(beads[selected.first + lastRing].position);
      branch.visible = true;
      branch.scale.setScalar(0.113);
      connect(extraBond, first, branch.position, 0.048);
      if (progress < REACTION.join) {
        freeEnd.position.copy(beads[selected.first - 1].position).add(vector(0, 0, 0.12));
        freeEnd.scale.setScalar(0.063);
        freeEnd.visible = true;
      }
    }
    proteins.visible = focused && progress > 0.12 && progress < 2.86;
    if (proteins.visible) {
      proteins.position.set(xMid, -1.35 + 0.79 * ease(progress, 0.12, 1) - 0.62 * detached, -0.76);
      proteins.scale.setScalar(0.52 + 0.13 * ease(progress, 0.12, 1) - 0.18 * detached);
    }
    ends.group.visible = !focused;
    if (!focused) ends.draw(beads[0].position, beads[RNA_BASES.length - 1].position, 1, 1, 0.66);
    if (focusChanged && !detailsMode) {
      viewSize = focused ? Math.max(5.1, visible.length * distance + 0.25) : RNA_BASES.length * distance + 2.4;
      viewHeight = focused ? 5.24 : 3.2;
      viewCenter = vector(0, focused ? 0.34 : 0.05, 0);
      fit(!!camera.position.z);
    }
  }

  function renderExport(time, focus) {
    if (initiationState) {
      leaveInitiation();
    }
    if (!exportView) {
      exportView = createRnaExportScene(loadModel);
      space.add(exportView.group);
    }
    environment?.setCompartment(true);
    exportView.group.visible = true;
    ribbon.scale.setScalar(RNA_EXPORT_SCALE);
    ribbon.rotation.y = Math.PI;
    if (!exportFocus) {
      for (const bead of beads) bead.scale.multiplyScalar(1.38);
    }
    exportView.update(time, ribbon, ends.cap);
    if (exportFocus === focus) return;
    exportFocus = focus;
    viewSize = focus === 'find' ? 16.4 : 14.8;
    viewHeight = focus === 'find' ? 8 : 7.05;
    viewCenter = vector(focus === 'find' ? -0.55 : -0.24, 0.11, 0);
    fit(!matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function leaveExport() {
    if (!exportFocus) return;
    exportView.group.visible = false;
    exportFocus = null;
    environment?.setCompartment(false);
    ribbon.position.set(0, 0, 0);
    ribbon.rotation.y = 0;
    ribbon.scale.setScalar(1);
    const saved = sceneLayout;
    sceneLayout = null;
    render(saved);
  }

  function loadInitiation() {
    initiationLoad ??= loadModel('translation_initiation').then(source => {
      initiation = createInitiationView(source, exportPose(EXPORT_FRAMES.at(-1)).rnaX);
      initiation.group.visible = false;
      space.add(initiation.group);
      for (const key of ['eif3', 'eif2', 'erf1']) {
        const asset = key === 'erf1' ? 'rna_erf1_specimen' : `translation_${key}_specimen`;
        loadModel(asset).then(model => {
          if (key === 'erf1') initiation.setFactor(model);
          else initiation.setHelper(key, model);
          if (initiationState && !specimen) initiation.draw(initiationState);
        }).catch(() => { /* the lesson also explains the factor in text */ });
      }
    }).catch(error => {
      initiationLoad = null;
      throw error;
    });
    return initiationLoad;
  }

  function renderInitiation(state) {
    const previous = initiationState;
    if (!previous) {
      renderExport(EXPORT_FRAMES.at(-1), 'ready');
      initiationRest = beads.map(bead => bead.position.clone());
    }
    initiationState = state;
    if (!initiation) return;
    const overview = ['origin', 'find', 'cap'].includes(state.step);
    initiation.group.visible = true;
    exportView.group.visible = overview;
    if (overview) exportView.hideExportProteins();
    ribbon.visible = state.step !== 'origin';
    if (previous?.step !== state.step) environment?.setCompartment(true, state.step !== 'find');
    initiation.draw(state);
    const goal = vector();
    const blend = ease(state.loading, 0, 1);
    const shift = state.reading ? state.reading.feed * 3 : (state.scan - 1) * 3;
    for (const [i, base] of matureRNA.entries()) {
      initiation.basePosition(i, goal, shift);
      ribbon.worldToLocal(goal);
      beads[base.index].position.copy(initiationRest[base.index]).lerp(goal, blend);
      if (i === 0) continue;
      const prior = matureRNA[i - 1].index;
      connect(bonds[i - 1], beads[prior].position, beads[base.index].position,
        base.index - prior > 1 ? 0.052 : 0.031);
    }
    ends.draw(beads[matureRNA[0].index].position, beads[matureRNA.at(-1).index].position, 1, 1, 0.66);
    if (previous?.step === state.step && previous.focus === state.focus &&
        previous.cut === state.cut && initiationFramed) return;
    initiationFramed = true;
    viewSize = state.step === 'origin' ? 12.6 : overview ? 9.6 : state.focus ? 3.2 : state.reading ? 5.4 : 6.2;
    viewHeight = state.focus ? 3.4 : state.step === 'origin' || state.step === 'scan' ? 6.6 : 5.7;
    const point = state.focus ? initiation.point(`site-${state.focus.toLowerCase()}`) : initiation.point('aug');
    viewCenter = state.step === 'origin' ? vector(2.8, 0.7, 0) :
      overview ? initiation.bounds().lerp(ribbon.position, 0.38) :
        state.step === 'scan' ? vector(ribbon.position.x + 1.05, 0.27, 0.1) :
        point.add(vector(0, state.step === 'assemble' ? 0.82 : state.reading ? 0.85 : 0.45, 0));
    fit(!matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function leaveInitiation() {
    if (initiation) initiation.group.visible = false;
    ribbon.visible = true;
    initiationState = null;
    initiationFramed = false;
    leaveExport();
  }

  function showSpecimen(source, { parts, viewpoint }) {
    const model = source.clone(true);
    const paints = new Map(parts.map(part => [part.mesh, neon(part.color, { body: 0.7, glow: 1.3 })]));
    const anchors = new Map();
    model.traverse(object => {
      if (!object.isMesh) return;
      const part = parts.find(entry => object.name.startsWith(`GEO-${entry.mesh}`));
      if (!part) return;
      object.material = paints.get(part.mesh);
      if (part.offset && !anchors.has(part.mesh)) {
        object.geometry.computeBoundingBox();
        anchors.set(part.mesh, { object, center: object.geometry.boundingBox.getCenter(vector()) });
      }
    });
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(vector());
    model.position.sub(bounds.getCenter(vector()));
    const hiddenObjects = [ribbon, exportView?.group, environment?.group, initiation?.group].filter(Boolean);
    specimen = {
      model, paints, anchors, viewpoint, viewSize, viewHeight, viewCenter,
      visibility: hiddenObjects.map(object => [object, object.visible]),
      position: camera.position.clone(), target: controls.target.clone(),
      minDistance: controls.minDistance, maxDistance: controls.maxDistance,
    };
    space.add(model);
    hiddenObjects.forEach(object => { object.visible = false; });
    viewSize = Math.max(size.x, size.z) * 1.16;
    viewHeight = Math.max(size.y, size.z) * 1.16;
    viewCenter = vector(0, 0, 0);
    fit();
  }

  function closeSpecimen() {
    if (!specimen) return;
    const previous = specimen;
    specimen = null;
    space.remove(previous.model);
    for (const paint of previous.paints.values()) paint.dispose();
    for (const [object, visible] of previous.visibility) object.visible = visible;
    ({ viewSize, viewHeight, viewCenter } = previous);
    cameraMove = null;
    controls.target.copy(previous.target);
    camera.position.copy(previous.position);
    controls.minDistance = previous.minDistance;
    controls.maxDistance = previous.maxDistance;
    controls.update();
  }

  function getStructure() {
    structurePromise ??= loadModel('spliceosome-5yzg').then(source => {
      const model = source.clone(true);
      const materials = {
        'GEO-Splice-Shell': neon(0x796ac9, { body: 0.64, glow: 1.35, strength: 0.62 }),
        'GEO-Splice-Prp8': neon(0xb997f5, { body: 0.74, glow: 1.43 }),
        'GEO-Splice-snRNA': neon(0x6ce7f5, { body: 0.75, glow: 1.65 }),
        'GEO-Splice-Substrate': neon(0xf767bb, { body: 0.78, glow: 1.72 }),
      };
      model.traverse(object => {
        if (object.isMesh && materials[object.name]) object.material = materials[object.name];
      });
      const bounds = new THREE.Box3().setFromObject(model);
      structureSize = bounds.getSize(vector());
      model.position.sub(bounds.getCenter(vector()));
      experiment.add(model);
      proteinModel = model.clone(true);
      proteinModel.getObjectByName('GEO-Splice-Substrate').visible = false;
      proteinModel.getObjectByName('GEO-Splice-snRNA').visible = false;
      proteins.add(proteinModel);
      return model;
    }).catch(error => {
      structurePromise = null;
      throw error;
    });
    return structurePromise;
  }

  function showStructure(shown, layer = 'all') {
    const entering = shown && !detailsMode;
    detailsMode = shown;
    ribbon.visible = !shown;
    if (proteinModel) proteinModel.visible = !shown;
    experiment.visible = shown;
    if (!shown) {
      const saved = sceneLayout;
      sceneLayout = null;
      render(saved);
      return;
    }
    experiment.getObjectByName('GEO-Splice-Shell').visible = layer === 'all';
    experiment.getObjectByName('GEO-Splice-Prp8').visible = layer === 'all';
    experiment.getObjectByName('GEO-Splice-Substrate').visible = layer !== 'helpers';
    experiment.getObjectByName('GEO-Splice-snRNA').visible = layer !== 'substrate';
    if (entering) {
      viewSize = structureSize.x + structureSize.z * 0.35;
      viewHeight = structureSize.y + structureSize.z * 0.35;
      viewCenter = vector(0, 0, 0);
      fit(true);
    }
  }

  function screenPoint(where) {
    let at;
    if (specimen) {
      const anchor = specimen.anchors.get(where);
      if (!anchor) return null;
      at = anchor.object.localToWorld(anchor.center.clone());
    } else if (initiationState && where === 'origin-pore') at = exportView.anchors.pore;
    else if (initiationState && !['cap', 'tail'].includes(where)) at = initiation?.point(where);
    else if (exportFocus && Object.hasOwn(exportView.anchors, where)) at = exportView.anchors[where];
    else if (where === 'protein') at = proteins.position;
    else if (where === 'branch') at = branch.position;
    else if (where === 'cap') at = ends.cap.position;
    else if (where === 'tail') at = ends.tailMidpoint.position;
    else if (typeof where === 'number') at = beads[where]?.position;
    else if (Array.isArray(where)) {
      const [a, b] = where.map(i => beads[i].position);
      at = a.clone().lerp(b, 0.5);
    }
    if (!at) return null;
    const world = at.clone();
    if (exportFocus && (typeof where === 'number' || where === 'cap' || where === 'tail')) ribbon.localToWorld(world);
    const point = world.project(camera);
    return point.z < -1 || point.z > 1 ? null : [(1 + point.x) * 0.5 * stage.clientWidth, (1 - point.y) * 0.5 * stage.clientHeight];
  }

  const ray = new THREE.Raycaster();
  function pick(event) {
    if (detailsMode || specimen) return;
    const rect = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
      1 - (event.clientY - rect.top) / rect.height * 2), camera);
    if (initiationState) {
      let target = initiation?.pick(ray);
      if (initiationState.step === 'cap') {
        const hit = ray.intersectObjects([ends.cap, ends.tailMidpoint])[0];
        if (hit) target = hit.object === ends.cap ? 'cap' : 'tail';
      }
      if (initiationState.step === 'codon') {
        const first = matureRNA.slice(0, 9);
        const hit = ray.intersectObjects(first.map(base => beads[base.index]))[0];
        if (hit) target = `codon-${Math.floor(first.findIndex(base => base.index === hit.object.userData.base) / 3)}`;
      }
      selectObject(target);
      return;
    }
    if (exportFocus) {
      selectObject(ray.intersectObjects(exportView.targets)[0]?.object.userData.object);
      return;
    }
    const hit = ray.intersectObjects(beads.filter(bead => bead.visible))[0];
    if (hit) selectBase(hit.object.userData.base);
  }
  if (selectObject) {
    bindLessonInput(renderer.domElement, controls, { drag: () => false, tap: pick });
    controls.addEventListener('start', () => { cameraMove = null; });
  } else {
    let down;
    renderer.domElement.addEventListener('pointerdown', event => { down = [event.clientX, event.clientY]; });
    renderer.domElement.addEventListener('pointerup', event => {
      if (down && Math.hypot(event.clientX - down[0], event.clientY - down[1]) <= 8) pick(event);
    });
  }

  renderer.setAnimationLoop(now => {
    if (cameraMove) {
      const step = ease(now - cameraMove.start, 0, 490);
      camera.position.lerpVectors(cameraMove.from, cameraMove.end, step);
      controls.target.lerpVectors(cameraMove.target, viewCenter, step);
      if (step >= 1) cameraMove = null;
    }
    dust.update(now / 1000);
    controls.update();
    camera.updateMatrixWorld();
    if (!detailsMode) updateLabels();
    if (probe) {
      const seconds = (now - probe.start) / 1000;
      if (seconds > 1) probe.frames++;
      if (seconds > 3.5) {
        if (probe.frames / (seconds - 1) < 24) { glowing = false; showGlow(); }
        probe = null;
      }
    }
    if (glowing) {
      if (!composer) {
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(space, camera));
        composer.addPass(new UnrealBloomPass(new THREE.Vector2(stage.clientWidth, stage.clientHeight), 0.17, 0.22, 0.9));
        composer.addPass(new OutputPass());
      }
      composer.render();
    } else renderer.render(space, camera);
  });

  return {
    render, renderExport, leaveExport, screenPoint, getStructure, showStructure,
    loadInitiation, renderInitiation, leaveInitiation,
    getSpecimen: loadModel, showSpecimen, closeSpecimen, resetView: () => fit(true),
  };
}
