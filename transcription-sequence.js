const fragments = [
  ['e1', 'ГАГАУГЦГУГУА'],
  ['i1', 'ГУАЦЦУАГ'],
  ['e2', 'УАУГГУ'],
  ['i2', 'ГУУАЦАГ'],
  ['e3', 'АЦУЦЦАУААГЦУ'],
];
export const TRANSCRIPT = fragments.map(([, sequence]) => sequence).join('');
export const PAS = 'ААУААА';
const endOfLastExon = PAS + 'ГУЦУГГЦУГУАЦЦА';
export const PRE_MRNA = TRANSCRIPT + endOfLastExon;

export const RNA_BASES = [...fragments, ['e3', endOfLastExon]]
  .flatMap(([part, sequence]) => Array.from(sequence, letter => ({ part, letter })))
  .map((base, index) => ({ ...base, index }));

// The introns retain their coordinates in the original transcript.
export const SPLICING_INTRONS = fragments.filter(([part]) => part.startsWith('i')).map(([part]) => {
  const positions = RNA_BASES.filter(base => base.part === part);
  return { first: positions[0].index, last: positions.at(-1).index };
});

export function basesAfterSplicing(completed) {
  const removed = SPLICING_INTRONS.slice(0, completed);
  return RNA_BASES.filter(({ index }) => !removed.some(({ first, last }) => index >= first && index <= last));
}

export function markBoundary(intron, bonds, index) {
  const { first, last } = SPLICING_INTRONS[intron];
  if (index !== first - 1 && index !== last) return { bonds, status: 'incorrect' };
  if (bonds.includes(index)) return { bonds, status: 'already' };
  const updated = [...bonds, index];
  return { bonds: updated, status: updated.length === 2 ? 'ready' : 'partial' };
}
