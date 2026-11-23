import { SPLICING_INTRONS, basesAfterSplicing } from './transcription-sequence.js';

const complement = { А: 'У', У: 'А', Ц: 'Г', Г: 'Ц' };
const aminoAcids = {
  АУГ: ['Met', 'метионин', 0xffca72], ЦГУ: ['Arg', 'аргинин', 0xfb8d92],
  ГУА: ['Val', 'валин', 0x9bd9ff], УАУ: ['Tyr', 'тирозин', 0xcaacff],
  ГГУ: ['Gly', 'глицин', 0xc6df9b], АЦУ: ['Thr', 'треонин', 0xffb78c],
  ЦЦА: ['Pro', 'пролин', 0x8de0ce],
};
const bases = basesAfterSplicing(SPLICING_INTRONS.length).map(base => base.letter).join('');
const start = bases.indexOf('АУГ');
const reading = bases.slice(start).match(/.{3}/g);
export const stopIndex = reading.findIndex(codon => ['УАА', 'УАГ', 'УГА'].includes(codon));
export const codons = reading.slice(0, stopIndex + 1);
export const residues = codons.slice(0, -1).map((codon, index) => {
  const [code, name, color] = aminoAcids[codon];
  return { codon, code, name, color, index, anticodon: Array.from(codon, base => complement[base]).join('') };
});

export function candidates(index) {
  const available = residues.filter(({ index: candidate }) => candidate !== index && candidate !== 0);
  const similarity = candidate => matchingBases(candidate.anticodon, codons[index]).filter(Boolean).length;
  const near = available.sort((a, b) => similarity(b) - similarity(a));
  const choices = near.slice(0, 2);
  choices.splice(index % 3, 0, residues[index]);
  return choices;
}

export function matchingBases(anticodon, codon) {
  return Array.from(codon, (base, index) => complement[base] === anticodon[index]);
}

export const elongationFilms = {
  cycle: [
    [0, 'Подход к участку A', 'В цитоплазме тРНК с аминокислотой встречает рибосому.'],
    [1.5, 'Проверка кодона', 'Антикодон совпадает с кодоном. Конец тРНК с аминокислотой входит глубже.'],
    [2.7, 'Пептидная связь', 'Растущая цепь переходит с тРНК в P на аминокислоту тРНК в A.'],
    [4.1, 'Сдвиг на три буквы', 'Три буквы проходят через канал. ТРНК с цепью переходит из A в P, пустая — из P в E.'],
    [5.2, 'Пустая тРНК выходит', 'Из E уходит пустая тРНК. Следующий кодон занимает свободный участок A.'],
  ],
  release: [
    [0, 'УАА в участке A', 'Фактор освобождения eRF1 подходит к рибосоме.'],
    [1.3, 'Распознан стоп-кодон', 'eRF1 распознаёт УАА в участке A. Новая аминокислота не добавляется.'],
    [2.5, 'Цепь освобождается', 'Готовая цепь отделяется от последней тРНК и выходит из рибосомы.'],
    [4.3, 'Полипептид готов', 'Порядок аминокислот в цепи — её первичная структура.'],
  ],
};

export function readingState(step, index, time) {
  if (step === 'elong') return { index, feed: index - 1, active: 'A', count: index, length: index };
  if (step === 'cycle') {
    const progress = (from, to) => Math.min(1, Math.max(0, (time - from) / (to - from)));
    const shift = progress(3.55, 4.65);
    return {
      index, feed: index - 1 + shift, active: time < 3.55 ? 'A' : 'P',
      count: index + Number(time >= 2.7), length: index + 1,
      dock: progress(0, 1.5), settle: progress(1.5, 2.4), transfer: progress(2.42, 3.18),
      shift, exit: progress(4.55, 5.2),
    };
  }
  if (['stop', 'release', 'product'].includes(step)) return {
    index: stopIndex, feed: stopIndex - 1, active: 'A', count: stopIndex, length: stopIndex,
    releaseDock: step === 'release' ? Math.min(1, time / 1.3) : 0,
    release: step === 'product' ? 1 : step === 'release' ? Math.max(0, Math.min(1, (time - 2) / 2.3)) : 0,
  };
  return null;
}
