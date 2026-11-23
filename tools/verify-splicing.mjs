import assert from 'node:assert/strict';
import { PRE_MRNA, SPLICING_INTRONS, basesAfterSplicing, markBoundary } from '../app/transcription-sequence.js';

assert.equal(PRE_MRNA.length, 65);
assert.deepEqual(SPLICING_INTRONS.map(({ first, last }) => [first, last]), [[12, 19], [26, 32]]);
assert.deepEqual(markBoundary(0, [], 15), { bonds: [], status: 'incorrect' });
assert.deepEqual(markBoundary(0, [], 19), { bonds: [19], status: 'partial' });
assert.deepEqual(markBoundary(0, [19], 19), { bonds: [19], status: 'already' });
assert.deepEqual(markBoundary(0, [19], 11), { bonds: [19, 11], status: 'ready' });
assert.deepEqual(markBoundary(1, [], 11), { bonds: [], status: 'incorrect' });
assert.equal(basesAfterSplicing(0).map(base => base.letter).join(''), PRE_MRNA);
assert.equal(basesAfterSplicing(1).length, 57);
assert.equal(basesAfterSplicing(2).map(base => base.letter).join(''), 'ГАГАУГЦГУГУАУАУГГУАЦУЦЦАУААГЦУААУАААГУЦУГГЦУГУАЦЦА');
assert.deepEqual(basesAfterSplicing(2).filter(({ part }) => part.startsWith('i')), []);
console.log('Границы, повтор выбора, оба стыка и цельная последовательность мРНК проверены.');
