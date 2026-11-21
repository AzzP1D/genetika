import * as THREE from 'three';
import { neon, letterSprite, textSprite, motes, PALETTE, BASE_COLORS } from './style.js';

// Экзоны и интроны учебного примера из «Кода жизни».
const TRANSCRIPT = ['ГАГАУГЦГУГУА', 'ГУАЦЦУАГ', 'УАУГГУ', 'ГУУАЦАГ', 'АЦУЦЦАУААГЦУ'].join('');
// Учебное продолжение за последним экзоном. Сигнал, участок до разреза и хвост.
const PAS = 'ААУААА';
const BEFORE_CUT = TRANSCRIPT + PAS + 'ГУЦУГГЦУГУАЦЦА';
const RNA = BEFORE_CUT + 'УГУГУЦУУГУГУЦУГУУЦУУГУГ';
export const TERMINATION = {
  signal: TRANSCRIPT.length,
  cut: BEFORE_CUT.length,
  initial: BEFORE_CUT.length + 11,
  release: BEFORE_CUT.length + 19,
};
const PRACTICE_LENGTH = 8;
const UPSTREAM = 'ТАЦАЦ';
const DOWNSTREAM = 'ТГАЦА';
const CODING = UPSTREAM + RNA.replaceAll('У', 'Т') + DOWNSTREAM;
const COMPLEMENT = { 'А': 'Т', 'Т': 'А', 'Г': 'Ц', 'Ц': 'Г' };
const STRIDE = 0.43;
const SUBSTEPS = 6;
const COUNT = CODING.length;
const START = UPSTREAM.length;
const INTRO_END = START + 12;
const NUCLEOTIDES = ['А', 'У', 'Г', 'Ц'];
const UP = new THREE.Vector3(0, 1, 0);
const OFFSET = (INTRO_END - 1) / 2;
const position = index => (index - OFFSET) * STRIDE;

export function createMolecule(model, { showDirections = true } = {}) {
  const group = new THREE.Group();
  const dust = motes(90, 5.7, 0x405b8a);
  dust.material.size = 0.035;
  dust.material.opacity = 0.42;
  dust.position.z = -2.4;
  group.add(dust);

  const dnaPaint = neon(PALETTE.dna, { glow: 1.78, body: 0.73 });
  const copyPaint = dnaPaint.clone();
  const pairedPaint = neon(0x90a8ba, { glow: 0.45, body: 0.65 });
  const factorPaint = neon(0xc4a36e, { glow: 1.3, body: 0.76 });
  const rnaPaint = neon(PALETTE.primer, { glow: 1.95, body: 0.72 });
  const atom = new THREE.IcosahedronGeometry(1, 1);
  const rod = new THREE.CylinderGeometry(1, 1, 1, 8);
  const sampleCount = (COUNT - 1) * SUBSTEPS + 1;
  const strands = [copyPaint, dnaPaint].map(paint => new THREE.InstancedMesh(rod, paint, sampleCount - 1));
  const rungs = new THREE.InstancedMesh(rod, pairedPaint, COUNT);
  const basePaint = neon(0xffffff, { glow: 1.16, body: 0.62 });
  const signalPaint = neon(0xffcf74, { glow: 1.95, body: 0.77 });
  const bases = [0, 1].map(() => new THREE.InstancedMesh(atom, basePaint, COUNT));
  for (let i = 0; i < COUNT; i++) {
    bases[0].setColorAt(i, new THREE.Color(BASE_COLORS[CODING[i]]));
    bases[1].setColorAt(i, new THREE.Color(BASE_COLORS[COMPLEMENT[CODING[i]]]));
  }
  for (const mesh of [...strands, rungs, ...bases]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  const polymerase = new THREE.Group();
  model.rotation.x = Math.PI / 2;
  model.scale.setScalar(0.50);
  const shell = neon(0xff6379, { glow: 1.5, body: 0.79, power: 2.3 });
  const clampPaint = neon(0xff9b99, { glow: 1.52, body: 0.80, power: 2.4 });
  model.traverse(part => { if (part.isMesh) part.material = part.name.includes('зажим') ? clampPaint : shell; });
  polymerase.add(model);
  group.add(polymerase);
  const activeAnchor = model.getObjectByName('Активный_центр');
  const entryAnchor = model.getObjectByName('Вход_ДНК');
  const exitAnchor = model.getObjectByName('Выход_РНК');
  if (!activeAnchor || !entryAnchor || !exitAnchor) throw new Error('В модели полимеразы отсутствуют точки привязки ДНК или РНК');
  const activeOffset = activeAnchor.getWorldPosition(new THREE.Vector3());
  const entryOffset = entryAnchor.getWorldPosition(new THREE.Vector3()).sub(activeOffset);
  const activeSite = new THREE.Vector3(position(START), -0.72, 0.30);
  const templateOffset = new THREE.Vector3(0, 0.24, -0.15);
  const factors = new THREE.Group();
  [[0, 0, 0, 0.18], [0.19, -0.10, -0.04, 0.13], [-0.12, -0.10, 0.04, 0.11]].forEach(([x, y, z, size]) => {
    const shape = new THREE.Mesh(atom, factorPaint);
    shape.position.set(x, y, z);
    shape.scale.set(size, size * 0.83, size);
    factors.add(shape);
  });
  group.add(factors);

  const rnaBases = [...RNA].map(base => makeNucleotide(base));
  const candidates = NUCLEOTIDES.map(base => makeNucleotide(base));
  const rnaLinks = new THREE.InstancedMesh(rod, rnaPaint, rnaBases.length - 1);
  const hybrid = new THREE.InstancedMesh(rod, pairedPaint, rnaBases.length);
  rnaLinks.frustumCulled = false;
  hybrid.frustumCulled = false;
  group.add(rnaLinks, hybrid);

  const register = [textSprite('5′', '#bfefff', 0.29), textSprite('3′', '#bfefff', 0.29),
    textSprite('3′', '#bfefff', 0.29), textSprite('5′', '#bfefff', 0.29)];
  const rnaEnds = [textSprite('5′', '#ffbdec', 0.29), textSprite('3′', '#ffbdec', 0.29)];
  const basesAtSite = [letterSprite('', 0.39), letterSprite('', 0.39)];
  const glyphs = [...new Set(CODING)].map(base => [base, letterSprite(base, 0.39).material.map]);
  const glyph = Object.fromEntries(glyphs);
  const direction = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-2.65, 1.40, 0.6), 3.3, 0x5edbe8, 0.20, 0.15);
  group.add(...register, ...rnaEnds, ...basesAtSite, direction);

  const positionAt = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const noRotation = new THREE.Quaternion();
  const transform = new THREE.Matrix4();
  const size = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const samples = [0, 1].map(() => Array.from({ length: sampleCount }, () => new THREE.Vector3()));
  const factorStart = new THREE.Vector3(-2.47, -1.53, 0.65);
  const factorEnd = new THREE.Vector3(position(2), -0.22, 0.36);
  const polStart = new THREE.Vector3(1.45, -1.95, 0.38);
  const polEnd = activeSite.clone().sub(activeOffset);
  const opening = { value: 0, cursor: START, copied: 0, bound: 0 };
  const exitOffset = exitAnchor.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0, 0.38));
  const exit = new THREE.Vector3(), tail = new THREE.Vector3();
  const feed = new THREE.Vector3();
  let separated = null;
  let visibleBases = INTRO_END;

  function makeNucleotide(base) {
    const nucleotide = new THREE.Group();
    const bead = new THREE.Mesh(atom, rnaPaint);
    bead.scale.set(0.16, 0.135, 0.13);
    nucleotide.add(bead);
    const name = letterSprite(base, 0.35);
    name.position.z = 0.15;
    nucleotide.add(name);
    nucleotide.userData.base = base;
    group.add(nucleotide);
    nucleotide.visible = false;
    return nucleotide;
  }

  function segment(mesh, index, a, b, radius, fraction = 1) {
    axis.subVectors(b, a);
    const length = axis.length();
    rotation.setFromUnitVectors(UP, axis.normalize());
    positionAt.copy(a).addScaledVector(axis, length * fraction / 2);
    size.set(radius, Math.max(0.001, length * fraction), radius);
    mesh.setMatrixAt(index, transform.compose(positionAt, rotation, size));
  }

  function layout(amount, cursor, inspectedBase = cursor, bound = opening.bound) {
    opening.value = amount;
    opening.cursor = cursor;
    opening.bound = bound;
    const entryX = position(cursor) + entryOffset.x;
    const entryY = activeSite.y + entryOffset.y;
    const entryZ = activeSite.z + entryOffset.z;
    const lastSample = (visibleBases - 1) * SUBSTEPS;
    rungs.count = visibleBases;
    for (let row = 0; row < 2; row++) {
      const sign = row === 0 ? 1 : -1;
      const openY = row ? activeSite.y + templateOffset.y : 0.70;
      const openZ = row ? activeSite.z + templateOffset.z : 0.05;
      const points = samples[row];
      strands[row].count = lastSample;
      bases[row].count = visibleBases;
      for (let i = 0; i <= lastSample; i++) {
        const p = points[i];
        const index = i / SUBSTEPS;
        const x = position(index);
        const angle = (index - START) * 0.66;
        const entrance = bound * Math.exp(-Math.pow((x - entryX) / 0.47, 4));
        const gap = amount * Math.exp(-Math.pow((index - cursor) / 2.5, 4)) * (1 - entrance);
        const y = sign * Math.cos(angle) * 0.31;
        const z = sign * Math.sin(angle) * 0.31;
        p.set(x, THREE.MathUtils.lerp(THREE.MathUtils.lerp(y, openY, gap), entryY + y, entrance),
          THREE.MathUtils.lerp(THREE.MathUtils.lerp(z, openZ, gap), entryZ + z, entrance));
        if (i) segment(strands[row], i - 1, points[i - 1], p, row ? 0.056 : 0.051);
        if (i % SUBSTEPS === 0) {
          const base = i / SUBSTEPS;
          size.setScalar(gap > 0.5 ? 0.108 : 0.082);
          bases[row].setMatrixAt(base, transform.compose(p, noRotation, size));
          if (row) {
            const pairedLength = 1 - Math.min(1, gap * 1.35) * 0.997;
            segment(rungs, base, samples[0][i], p, 0.024 * Math.max(0.015, pairedLength), pairedLength);
          }
        }
      }
      strands[row].instanceMatrix.needsUpdate = bases[row].instanceMatrix.needsUpdate = true;
      const left = register[row * 2];
      const right = register[row * 2 + 1];
      left.position.set(position(cursor) - 1.27, sign * 0.94, 0.57);
      right.position.set(position(cursor) + 1.25, sign * 0.94, 0.57);
      left.visible = right.visible = showDirections && amount > 0.7;

      const baseLabel = basesAtSite[row];
      const current = Math.min(visibleBases - 1, Math.round(inspectedBase));
      baseLabel.material.map = glyph[row ? COMPLEMENT[CODING[current]] : CODING[current]];
      baseLabel.position.copy(points[current * SUBSTEPS]);
      baseLabel.position.y += 0.14;
      baseLabel.position.z += 0.21;
      baseLabel.visible = amount > 0.75;
    }
    rungs.instanceMatrix.needsUpdate = true;
    for (const mesh of [...strands, ...bases]) mesh.boundingSphere = null;
    direction.position.x = position(cursor) - 1.36;
    direction.visible = showDirections && amount > 0.6;
  }

  function rnaPoint(index, target) {
    return target.copy(samples[1][index * SUBSTEPS]).sub(templateOffset);
  }

  function grow(count, movieWeight = 0, wide = 0, ending = null) {
    opening.copied = count;
    hybrid.count = 0;
    exit.copy(polymerase.position).add(exitOffset);
    const eaten = ending?.eaten ?? 0;
    const firstRemaining = TERMINATION.cut + Math.floor(eaten);
    rnaBases.forEach((nucleotide, i) => {
      const removed = i >= TERMINATION.cut && i < firstRemaining;
      nucleotide.visible = i < count && !removed;
      if (!nucleotide.visible) return;
      nucleotide.scale.setScalar(i === firstRemaining && eaten ? 1 - (eaten % 1) * 0.95 : 1);
      const base = START + i;
      const retreat = Math.max(0, opening.cursor - base - 1);
      // Older RNA separates from the template as the bubble moves away.
      rnaPoint(base, nucleotide.position);
      nucleotide.position.y -= Math.min(1, retreat) * 0.50 + Math.max(0, retreat - 1) * 0.24;
      nucleotide.position.z += Math.min(1, retreat) * 0.60;
      if (movieWeight && retreat > 0) {
        const passed = Math.max(0, retreat - 2);
        tail.copy(exit);
        tail.x -= (retreat - 2) * STRIDE;
        tail.y -= (1 - Math.exp(-passed * 0.44)) * (0.71 + 0.49 * Math.sin(passed * 0.48));
        tail.z += (1 - Math.exp(-passed * 0.44)) * (0.68 + 0.32 * Math.sin(passed * 0.38));
        nucleotide.position.lerp(tail, movieWeight * THREE.MathUtils.smoothstep(retreat, 0, 2));
      }
      const product = separated && i < TERMINATION.cut;
      if (product) {
        const lift = ending?.separation ?? 0;
        nucleotide.position.copy(separated[i]);
        nucleotide.position.x -= lift * 0.64;
        nucleotide.position.y -= lift * 1.15;
        nucleotide.position.z += lift * 0.36;
      }
      nucleotide.children[1].visible = !movieWeight || (wide < 0.40 && i >= count - 4)
        || !!ending?.showSignal && i >= TERMINATION.signal && i < TERMINATION.signal + PAS.length;
      nucleotide.children[0].material = ending?.showSignal && i >= TERMINATION.signal && i < TERMINATION.signal + PAS.length
        ? signalPaint : rnaPaint;
      nucleotide.children[0].scale.set(0.16 + 0.03 * wide, 0.135 + 0.035 * wide, 0.13 + 0.035 * wide);
      const paired = 1 - Math.min(1, retreat);
      if (paired > 0 && !product) {
        segment(hybrid, hybrid.count++, samples[1][base * SUBSTEPS], nucleotide.position, paired * 0.016);
      }
    });
    rnaLinks.count = 0;
    for (let i = 1; i < count; i++) {
      if ((separated && i === TERMINATION.cut) || !rnaBases[i - 1].visible || !rnaBases[i].visible) continue;
      segment(rnaLinks, rnaLinks.count++, rnaBases[i - 1].position, rnaBases[i].position, 0.043 + 0.027 * wide);
    }
    rnaLinks.instanceMatrix.needsUpdate = hybrid.instanceMatrix.needsUpdate = true;
  }

  function setCandidates(index, active = true) {
    candidates.forEach((nucleotide, i) => {
      nucleotide.visible = active;
      nucleotide.position.set(position(index) + (i - 1.5) * 0.82, -2.17, 1.13);
      nucleotide.scale.setScalar(1);
      nucleotide.children[1].visible = true;
    });
  }

  function reset() {
    separated = null;
    visibleBases = INTRO_END;
    factorEnd.z = 0.36;
    factors.position.copy(factorStart);
    polymerase.position.copy(polStart);
    polymerase.rotation.y = -0.35;
    copyPaint.uniforms.strength.value = 1;
    factors.visible = polymerase.visible = false;
    for (const label of rnaEnds) label.visible = false;
    layout(0, START, START, 0);
    grow(0);
    setCandidates(START, false);
  }
  reset();

  function showEnds(scale = 1) {
    const first = rnaBases[0].position, last = rnaBases[opening.copied - 1].position;
    rnaEnds[0].position.copy(first).add(new THREE.Vector3(-0.21, -0.30, 0.23).multiplyScalar(scale));
    rnaEnds[1].position.copy(last).add(new THREE.Vector3(0.23, -0.30, 0.23).multiplyScalar(scale));
    for (const label of rnaEnds) {
      label.visible = true;
      label.scale.x = label.material.map.image.width / label.material.map.image.height * 0.29 * scale;
      label.scale.y = 0.29 * scale;
    }
  }

  function synthesize(progress, wide, first, limit, ending = null) {
    visibleBases = COUNT;
    const count = Math.min(limit, first + Math.floor(progress));
    const fraction = progress % 1;
    const move = THREE.MathUtils.smoothstep(fraction, 0.06, 0.51);
    const next = START + count;
    const cursor = next - 2 + move;
    polymerase.position.copy(polEnd);
    polymerase.position.x += position(cursor) - position(START);
    polymerase.rotation.y = 0;
    copyPaint.uniforms.strength.value = THREE.MathUtils.lerp(0.45, 0.86, wide);
    const departure = ending?.departure ?? 0;
    layout(1 - departure, cursor, next - (move < 0.5 ? 1 : 0), 1 - departure);
    grow(count, ending ? 1 : THREE.MathUtils.smoothstep(progress, 0, 1.2), wide, ending);
    polymerase.position.x += departure * 0.44;
    polymerase.position.y -= departure * 1.55;
    polymerase.position.z += departure * 0.68;
    polymerase.rotation.y = -departure * 0.55;
    for (const label of [...register, ...basesAtSite]) label.visible = false;
    direction.visible = false;
    if (ending) {
      for (const label of rnaEnds) label.visible = false;
    } else {
      showEnds(1 + 1.7 * wide);
    }
    for (const nucleotide of candidates) nucleotide.visible = false;
    if (count < limit && fraction > 0.48) {
      const nucleotide = candidates.find(item => item.userData.base === RNA[count]);
      feed.set(position(next) + 0.24, activeSite.y - 0.77, 1.48);
      rnaPoint(next, tmp);
      nucleotide.position.lerpVectors(feed, tmp, THREE.MathUtils.smoothstep(fraction, 0.48, 0.98));
      nucleotide.scale.setScalar(THREE.MathUtils.smoothstep(fraction, 0.48, 0.59));
      nucleotide.children[1].visible = wide < 0.35;
      nucleotide.visible = true;
    }
  }

  return { group, dust, polymerase, factors, candidates, factorStart, factorEnd, polStart, polEnd, opening, START,
    practiceLength: PRACTICE_LENGTH,
    movieLength: TRANSCRIPT.length - PRACTICE_LENGTH,
    practiceSequence: RNA.slice(0, PRACTICE_LENGTH),
    frameTranscript() {
      for (const label of register) label.visible = false;
      showEnds();
      const bounds = new THREE.Box3().setFromObject(polymerase);
      for (const label of rnaEnds) bounds.expandByPoint(label.position);
      for (const nucleotide of rnaBases) if (nucleotide.visible) bounds.expandByPoint(nucleotide.position);
      for (const strand of samples) bounds.expandByPoint(strand[(visibleBases - 1) * SUBSTEPS]);
      return bounds.expandByScalar(0.45);
    },
    promoter: new THREE.Vector3(position(2), 0.22, 0.45),
    startSite: new THREE.Vector3(position(START), 0.15, 0.4),
    downstream: new THREE.Vector3(position(START + 4), 0.2, 0.45),
    factorLift: new THREE.Vector3(0, 0.29, 0.29),
    strand(row, index, lift = 0) { return samples[row][index * SUBSTEPS].clone().add(new THREE.Vector3(0, lift, 0.46)); },
    rnaSite(index) { return rnaPoint(index, new THREE.Vector3()); },
    center(index) { return position(index); },
    rnaEnd(fivePrime) { return rnaBases[fivePrime ? 0 : opening.copied - 1].position.clone(); },
    filmLandmark(id) {
      const x = position(opening.cursor);
      if (id === 'dna-entry') return new THREE.Vector3(x + entryOffset.x, 0.02, 0.25);
      if (id === 'rna-exit') return polymerase.position.clone().add(exitOffset);
      return new THREE.Vector3(x + STRIDE, activeSite.y, activeSite.z);
    },
    setFilmEndLabels(visible) { for (const label of rnaEnds) label.visible = visible; },
    elongate(progress, wide) { synthesize(progress, wide, PRACTICE_LENGTH, TRANSCRIPT.length); },
    beginTermination() { separated = null; },
    drawTermination(count, ending) { synthesize(count - TRANSCRIPT.length, 0.41, TRANSCRIPT.length, RNA.length, ending); },
    splitTranscript() { separated = rnaBases.slice(0, TERMINATION.cut).map(nucleotide => nucleotide.position.clone()); },
    rnaBase(index) { return rnaBases[index].position.clone(); },
    expected(index) { return RNA[index - START]; },
    templateBase(index) { return COMPLEMENT[CODING[index]]; },
    highlightTemplate() { copyPaint.uniforms.strength.value = 0.45; },
    inspect(ray, templateKnown) {
      const actors = [factors, polymerase, ...candidates, ...rnaBases].filter(obj => obj.visible);
      const hit = ray.intersectObjects([...actors, ...strands, ...bases], true)[0];
      if (!hit) return null;
      const obj = hit.object;
      const actor = actors.find(candidate => candidate.children.includes(obj) || candidate === obj.parent?.parent);
      if (actor === factors) return { id: 'factors', at: () => factors.position.clone() };
      if (actor === polymerase) return { id: obj.name.includes('зажим') ? 'clamp' : 'pol', at: () => obj.getWorldPosition(new THREE.Vector3()) };
      if (candidates.includes(actor) || rnaBases.includes(actor)) {
        return { id: candidates.includes(actor) ? 'nucleotide' : 'rna', at: () => actor.position.clone() };
      }
      const row = bases.includes(obj) ? bases.indexOf(obj) : strands.indexOf(obj);
      const id = templateKnown && row >= 0 ? (row ? 'template' : 'other') : 'dna';
      return { id, at: hit.point };
    },
    attachPreview(nucleotide, from, index, progress) {
      rnaPoint(index, tmp);
      nucleotide.position.lerpVectors(from, tmp, progress);
      nucleotide.position.z += Math.sin(Math.PI * progress) * 0.60;
    },
    layout, grow, setCandidates, reset,
  };
}
