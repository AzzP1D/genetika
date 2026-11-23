import assert from 'node:assert/strict';
import { candidates, codons, matchingBases, readingState, residues, stopIndex } from '../app/rna-elongation.js';
import { initiationPose } from '../app/rna-initiation.js';

assert.deepEqual(codons, ['АУГ', 'ЦГУ', 'ГУА', 'УАУ', 'ГГУ', 'АЦУ', 'ЦЦА', 'УАА']);
assert.equal(residues.map(residue => residue.code).join('–'), 'Met–Arg–Val–Tyr–Gly–Thr–Pro');

for (let index = 1; index < stopIndex; index++) {
  assert.deepEqual(candidates(index).filter(({ anticodon }) =>
    matchingBases(anticodon, codons[index]).every(Boolean)), [residues[index]]);
  const start = readingState('cycle', index, 0);
  const beforeBond = readingState('cycle', index, 1.5);
  const afterBond = readingState('cycle', index, 3.2);
  const afterShift = readingState('cycle', index, 5.2);
  assert.equal(start.count, index);
  assert.equal(beforeBond.dock, 1);
  assert.equal(beforeBond.transfer, 0);
  assert.equal(afterBond.count, index + 1);
  assert.equal(afterBond.transfer, 1);
  assert.equal(afterBond.feed, index - 1);
  assert.equal(afterShift.feed, index);
  assert.equal(afterShift.exit, 1);
}

assert.equal(readingState('release', stopIndex, 4.3).count, stopIndex);
assert.equal(readingState('product', stopIndex, 0).release, 1);
assert.equal(initiationPose('scan', 1.8, true).scan, 0);
assert.equal(initiationPose('scan', 5, true).scan, 1);
console.log('Codon pairing, chain transfer, one-codon shift and stop verified.');
