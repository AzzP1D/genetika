import assert from 'node:assert/strict';
import { EXPORT_FRAMES, RNA_EXPORT_SCALE, exportPose } from '../app/rna-export-scene.js';

const [start, dock, cross, release, finish] = EXPORT_FRAMES;
const cap = time => exportPose(time).rnaX + 5.35 * RNA_EXPORT_SCALE;
const tail = time => exportPose(time).rnaX - 6 * RNA_EXPORT_SCALE;

assert.ok(cap(start) < -0.6, 'The whole RNA starts inside the nucleus');
assert.ok(cap(dock) < -0.5, 'The RNA docks on the nuclear face of the pore');
assert.ok(cap(cross) > 0.6 && tail(cross) < -0.6, 'The molecule crosses rather than jumping over the envelope');
assert.ok(tail(release) > 0.6, 'The RNA clears the membrane before the helper is released');
assert.equal(exportPose(release).release, 0);
assert.equal(exportPose(finish).release, 1);
assert.deepEqual(exportPose(-100), exportPose(start));
assert.deepEqual(exportPose(100), exportPose(finish));

for (let time = start; time < finish; time += 0.025) {
  assert.ok(exportPose(time).rnaX <= exportPose(time + 0.025).rnaX);
}
console.log('RNA export stays continuous across docking, transit and cytoplasmic release.');
