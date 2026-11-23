import { candidates, codons, matchingBases, residues, stopIndex } from './rna-elongation.js';

export function bindCodonInspector(pauseLesson) {
  const byId = id => document.getElementById(id);
  const dialog = byId('codon-inspector');
  const trigger = byId('open-codon-inspector');
  const current = byId('schematic-current');
  const previous = byId('schematic-prev');
  const released = byId('schematic-release');
  const feedback = byId('codon-feedback');
  const options = byId('codon-options');
  const heading = byId('schematic-step');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set();
  const track = codons.map((codon, index) => {
    const item = document.createElement('li');
    item.textContent = codon;
    if (index === 0 || index === stopIndex) item.classList.add('signal');
    return item;
  });
  byId('schematic-track').append(...track);
  for (const lane of [previous, current]) lane.append(byId('schematic-lane-template').content.cloneNode(true));

  let index = 0;
  let stage = 'choose';
  let carrier;

  function animate(element, frames, duration = 420) {
    if (reducedMotion.matches) return Promise.resolve();
    const animation = element.animate(frames, { duration, easing: 'ease-in-out' });
    animations.add(animation);
    return animation.finished.catch(() => {}).finally(() => animations.delete(animation));
  }

  function clearAnimations() {
    for (const animation of animations) animation.cancel();
  }

  function fill(row, letters) {
    row.replaceChildren(...Array.from(letters, letter => {
      const cell = document.createElement('b');
      cell.textContent = letter;
      return cell;
    }));
  }

  function chain(container, items) {
    container.replaceChildren(...items.map(({ code, name, color }) => {
      const unit = document.createElement('span');
      unit.textContent = code;
      unit.title = name;
      unit.setAttribute('aria-label', name);
      unit.style.setProperty('--cargo-color', `#${color.toString(16).padStart(6, '0')}`);
      return unit;
    }));
  }

  function renderLane(lane, position, site, trna, cargo, matched) {
    const strand = lane.querySelector('.schematic-trna');
    strand.classList.toggle('unoccupied', !trna);
    strand.inert = !trna;
    lane.querySelector('.schematic-site').textContent = site;
    lane.querySelector('.schematic-stop').hidden = lane !== current || stage !== 'release';
    fill(lane.querySelector('.codon-bases'), codons[position] ?? '···');
    const anti = lane.querySelector('.anticodon-bases');
    fill(anti, trna?.anticodon ?? '···');
    chain(lane.querySelector('.schematic-cargo'), cargo);
    lane.dataset.result = trna ? matched ? 'fit' : 'miss' : 'idle';
    const matches = matched || !trna ? [true, true, true] : matchingBases(trna.anticodon, codons[position]);
    const contacts = lane.querySelectorAll('.schematic-contacts i');
    for (const [i, cell] of [...anti.children].entries()) {
      cell.classList.toggle('mismatch', !matches[i]);
      contacts[i].classList.toggle('mismatch', !matches[i]);
    }
  }

  function button(label, run, primary = false) {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = label;
    item.classList.toggle('primary', primary);
    item.onclick = run;
    return item;
  }

  function attempt(choice) {
    clearAnimations();
    carrier = choice;
    const matches = matchingBases(choice.anticodon, codons[index]);
    const firstMismatch = matches.indexOf(false);
    stage = firstMismatch < 0 ? 'paired' : 'choose';
    render();
    if (stage === 'choose') {
      feedback.textContent = `Пара ${codons[index][firstMismatch]}–${choice.anticodon[firstMismatch]} не совпала. Эта тРНК отходит. Попробуй другую.`;
    }
    animate(current.querySelector('.schematic-trna'), stage === 'paired'
      ? [{ transform: 'translateY(-26px)', opacity: 0.25 }, { transform: 'translateY(0)' }]
      : [{ transform: 'translateY(-26px)' }, { transform: 'translateY(0)', offset: 0.55 },
        { transform: 'translateY(-20px)', opacity: 0.55 }], 520);
  }

  function bond() {
    clearAnimations();
    const donorCargo = previous.querySelector('.schematic-cargo');
    const before = [...donorCargo.children].map(unit => unit.getBoundingClientRect());
    stage = 'bond';
    render();
    const cargo = current.querySelector('.schematic-cargo');
    before.forEach((origin, position) => {
      const unit = cargo.children[position];
      const target = unit.getBoundingClientRect();
      animate(unit, [
        { transform: `translate(${origin.left - target.left}px, ${origin.top - target.top}px)` },
        { transform: 'translate(0,0)' },
      ], 560);
    });
  }

  async function advance() {
    clearAnimations();
    const nextIndex = index + 1;
    const oldCurrent = current.querySelector('.schematic-trna').getBoundingClientRect();
    const hadDonor = index > 0;
    const empty = previous.querySelector('.schematic-trna');
    options.querySelectorAll('button').forEach(item => { item.disabled = true; });
    if (hadDonor) {
      previous.querySelector('.schematic-site').textContent = 'P → E · выход пустой тРНК';
      await animate(empty, [{ transform: 'translate(0,0)' }, { transform: 'translate(-35px,-25px)', opacity: 0 }], 380);
    }
    if (!dialog.open || index !== nextIndex - 1) return;
    index = nextIndex;
    carrier = undefined;
    stage = index === stopIndex ? 'stop' : 'choose';
    render();
    if (hadDonor) {
      const newPrevious = empty.getBoundingClientRect();
      animate(empty, [{ transform: `translateX(${oldCurrent.left - newPrevious.left}px)` }, { transform: 'translateX(0)' }]);
      const strip = byId('schematic-track');
      animate(strip, [{ transform: 'translateX(9px)' }, { transform: 'translateX(0)' }]);
      feedback.textContent = 'Пустая тРНК ушла через E. ТРНК с цепью теперь в P. ' + feedback.textContent;
    }
  }

  function restart() {
    clearAnimations();
    index = 0;
    carrier = undefined;
    stage = 'choose';
    render();
  }

  function render() {
    dialog.dataset.step = stage;
    track.forEach((triplet, position) => {
      if (position === index) triplet.setAttribute('aria-current', 'step');
      else triplet.removeAttribute('aria-current');
    });
    previous.hidden = index === 0;
    const priorSite = stage === 'bond' ? 'P · тРНК без груза' : stage === 'done' ? 'P · свободен' : 'P · держит цепь';
    const nextSite = index === 0 ? 'P · начало чтения' : index === stopIndex ? 'A · стоп-сигнал' : 'A · проверка кодона';
    renderLane(previous, index - 1, priorSite, index > 0 && stage !== 'done' ? residues[index - 1] : null,
      stage === 'bond' || stage === 'done' ? [] : residues.slice(0, index), true);
    renderLane(current, index, nextSite, carrier,
      stage === 'bond' ? residues.slice(0, index + 1) : carrier ? [carrier] : [], stage !== 'choose');
    released.hidden = stage !== 'done';
    if (stage === 'done') chain(released, residues);
    const actions = [];
    if (stage === 'choose') {
      heading.textContent = index === 0 ? 'Найди стартовую тРНК' : 'Подбери тРНК к следующему кодону';
      feedback.textContent = index === 0
        ? 'АУГ задаёт начало чтения. Стартовая тРНК приносит Met и занимает участок P. Сравни её антикодон с АУГ.'
        : `В участке A находится ${codons[index]}. К рибосоме подходят разные тРНК. Удерживается та, у которой подходят буквы антикодона.`;
      const variants = candidates(index);
      const alternate = variants.find(option => option.index !== index);
      for (const option of variants.filter(option => option.index === index || option === alternate)) {
        const choice = button(`${option.code} · 3′–${option.anticodon}–5′`, () => attempt(option));
        choice.setAttribute('aria-pressed', String(carrier === option));
        actions.push(choice);
      }
    } else if (stage === 'paired') {
      heading.textContent = 'Три пары совпали';
      feedback.textContent = index === 0
        ? 'УАЦ подходит к АУГ. Метионин остаётся на верхнем, акцепторном конце тРНК.'
        : `Антикодон удержался у ${codons[index]}. На другом конце тРНК находится ${carrier.name} (${carrier.code}).`;
      actions.push(index === 0 ? button('К следующему кодону →', advance, true) :
        button('Образовать пептидную связь', bond, true));
    } else if (stage === 'bond') {
      heading.textContent = 'Цепь стала на одну аминокислоту длиннее';
      feedback.textContent = 'Вся цепь перешла с тРНК в P на аминокислоту в A. В P осталась пустая тРНК.';
      actions.push(button('Сдвинуть на три буквы →', advance, true));
    } else if (stage === 'stop') {
      heading.textContent = 'УАА · стоп';
      feedback.textContent = 'УАА распознаёт фактор освобождения eRF1. Аминокислота здесь не добавляется.';
      actions.push(button('Подвести eRF1', () => {
        stage = 'release';
        render();
        animate(current.querySelector('.schematic-stop'), [{ transform: 'translateY(-24px)' }, { transform: 'translateY(0)' }]);
      }, true));
    } else if (stage === 'release') {
      heading.textContent = 'Освободи цепь';
      feedback.textContent = 'eRF1 помогает отделить готовый полипептид от последней тРНК.';
      actions.push(button('Освободить цепь', () => {
        stage = 'done';
        render();
        animate(released, [{ transform: 'translateY(28px)', opacity: 0.3 }, { transform: 'translateY(0)' }]);
      }, true));
    } else {
      heading.textContent = 'Первичная структура';
      feedback.textContent = 'От Met до Pro. Первичная структура — этот порядок аминокислот в полипептиде. При созревании цепь может сворачиваться и изменяться.';
    }
    if (index > 0 || carrier) actions.push(button('Начать схему заново', restart));
    const hadFocus = options.contains(document.activeElement);
    options.replaceChildren(...actions);
    if (hadFocus) options.firstElementChild?.focus({ preventScroll: true });
  }

  trigger.onclick = () => {
    pauseLesson();
    byId('schematic-legend').open = false;
    restart();
    dialog.showModal();
  };
  dialog.addEventListener('click', event => {
    const part = event.target.closest('[data-legend-part]');
    if (!part) return;
    byId('schematic-legend').open = true;
    byId(`schematic-${part.dataset.legendPart}`).scrollIntoView({ block: 'nearest' });
  });
  dialog.addEventListener('close', () => {
    clearAnimations();
    trigger.focus({ preventScroll: true });
  });
}
