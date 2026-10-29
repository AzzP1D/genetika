'use strict';

// Признаки для задач: буква гена, организм, доминантный и рецессивный признак.
const TRAITS = [
  { g: 'A', org: 'Горох', dom: 'жёлтые семена', rec: 'зелёные семена' },
  { g: 'B', org: 'Томат', dom: 'красные плоды', rec: 'жёлтые плоды' },
  { g: 'C', org: 'Морская свинка', dom: 'чёрная шерсть', rec: 'белая шерсть' },
  { g: 'D', org: 'Человек', dom: 'карие глаза', rec: 'голубые глаза' },
  { g: 'E', org: 'Дурман', dom: 'пурпурные цветки', rec: 'белые цветки' },
];

// Генотипы родителей. Внутри всегда пишем A/a, на экране заменяем буквой признака.
const CROSSES = [['AA', 'aa'], ['Aa', 'Aa'], ['Aa', 'aa'], ['AA', 'Aa']];


const STEPS = ['Генотипы родителей', 'Гаметы', 'Решётка Пеннета', 'Расщепление по генотипу', 'Расщепление по фенотипу'];

const app = document.getElementById('app');
let view = 'home';
let S = null;

// ---------- помощники ----------

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const gametes = gt => (gt[0] === gt[1] ? [gt[0]] : ['A', 'a']);
const child = (x, y) => (x === 'A' && y === 'A' ? 'AA' : x === 'A' || y === 'A' ? 'Aa' : 'aa');
const isDom = gt => gt.includes('A');

function show(s) {
  const G = S.t.g;
  return s.replace(/A/g, G).replace(/a/g, G.toLowerCase());
}

function loadStats() {
  try { return JSON.parse(localStorage.getItem('gen-stats')) || { solved: 0, clean: 0 }; }
  catch (e) { return { solved: 0, clean: 0 }; }
}
function saveStats(st) {
  try { localStorage.setItem('gen-stats', JSON.stringify(st)); } catch (e) { /* без сохранения */ }
}

// ---------- задача ----------

function newTask() {
  let P = pick(CROSSES);
  if (Math.random() < 0.5) P = [P[1], P[0]];
  S = {
    t: pick(TRAITS), P, step: 0, errors: 0, msg: null, notes: [],
    selP: [null, null], selG: [[], []], grid: {}, wrong: [], selGr: null, selPh: null,
  };
}

function rows() { return gametes(S.P[0]); }
function cols() { return gametes(S.P[1]); }

function offspring() {
  const out = [];
  rows().forEach(r => cols().forEach(c => out.push(child(r, c))));
  return out;
}

function genotypeRatio() {
  const list = offspring();
  const parts = ['AA', 'Aa', 'aa'].map(g => [list.filter(x => x === g).length, g]).filter(p => p[0]);
  const d = parts.map(p => p[0]).reduce(gcd);
  return parts.map(([n, g]) => n / d + g).join(':');
}

function phenotypeRatio() {
  const list = offspring();
  const dom = list.filter(isDom).length, rec = list.length - dom;
  const d = gcd(dom, rec) || 1;
  return dom / d + ':' + rec / d;
}

function genotypeLabel(key) {
  const parts = key.split(':').map(p => [p.slice(0, -2), p.slice(-2)]);
  if (parts.length === 1) return 'все ' + show(parts[0][1]) + ' (100%)';
  return parts.map(([n, g]) => n + ' ' + show(g)).join(' : ');
}

function phenotypeLabel(key) {
  const { dom, rec } = S.t;
  if (key === 'trap') return '1 : 2 : 1';
  const [d, r] = key.split(':');
  if (r === '0') return 'все — «' + dom + '»';
  if (d === '0') return 'все — «' + rec + '»';
  return d + ' «' + dom + '» : ' + r + ' «' + rec + '»';
}

const GENOTYPE_OPTIONS = ['1AA', '1Aa', '1aa', '1AA:1Aa', '1Aa:1aa', '1AA:2Aa:1aa'];
const PHENOTYPE_OPTIONS = ['1:0', '0:1', '3:1', '1:1', 'trap'];

// ---------- проверка и разбор ошибок ----------

function checkParents() {
  const who = ['♀ Мать', '♂ Отец'];
  const lines = [];
  S.P.forEach((right, i) => {
    const ch = S.selP[i];
    if (!ch) { lines.push(who[i] + ': выберите генотип.'); return; }
    if (ch === right) return;
    if (right === 'aa') lines.push(who[i] + ': признак «' + S.t.rec + '» рецессивный — он проявляется только у гомозиготы ' + show('aa') + '.');
    else if (ch === 'aa') lines.push(who[i] + ': генотип ' + show('aa') + ' дал бы признак «' + S.t.rec + '», а в условии — «' + S.t.dom + '».');
    else if (right === 'AA') lines.push(who[i] + ': «гомозигота» означает, что оба аллеля одинаковые.');
    else lines.push(who[i] + ': «гетерозигота» означает, что аллели разные.');
  });
  return lines;
}

function checkGametes() {
  const who = ['♀', '♂'];
  const lines = [];
  S.P.forEach((gt, i) => {
    const ch = S.selG[i], right = gametes(gt);
    const label = who[i] + ' ' + show(gt) + ': ';
    if (!ch.length) lines.push(label + 'выберите гаметы.');
    else if (ch.includes('Aa')) lines.push(label + 'гамета несёт только один аллель гена (закон чистоты гамет), поэтому «' + show('Aa') + '» гаметой быть не может.');
    else if (ch.some(x => !right.includes(x))) lines.push(label + 'гаметы содержат только те аллели, которые есть в генотипе.');
    else if (ch.length !== right.length) {
      if (right.length === 1) lines.push(label + 'гомозигота образует только один тип гамет — ' + show(right[0]) + '.');
      else lines.push(label + 'гетерозигота образует два типа гамет — ' + show('A') + ' и ' + show('a') + '.');
    }
  });
  return lines;
}

function checkGrid() {
  S.wrong = [];
  let empty = false;
  rows().forEach((r, i) => cols().forEach((c, j) => {
    const k = i + '-' + j, v = S.grid[k];
    if (!v) empty = true;
    else if (v !== child(r, c)) S.wrong.push(k);
  }));
  if (empty) return ['Заполните все клетки решётки.'];
  if (S.wrong.length) return ['Генотип потомка складывается из гаметы матери (строка) и гаметы отца (столбец). Проверьте клетки, отмеченные красным.'];
  return [];
}

function checkGenotypeRatio() {
  if (!S.selGr) return ['Выберите ответ.'];
  if (S.selGr === genotypeRatio()) return [];
  return ['Посчитайте клетки решётки: сколько получилось каждого генотипа?'];
}

function checkPhenotypeRatio() {
  if (!S.selPh) return ['Выберите ответ.'];
  if (S.selPh === phenotypeRatio()) return [];
  if (S.selPh === 'trap') return ['1 : 2 : 1 — это расщепление по генотипу. По фенотипу ' + show('AA') + ' и ' + show('Aa') + ' выглядят одинаково: у обоих проявляется доминантный признак.'];
  return ['Доминантный признак проявляется у ' + show('AA') + ' и ' + show('Aa') + ', рецессивный — только у ' + show('aa') + '.'];
}

const CHECKS = [checkParents, checkGametes, checkGrid, checkGenotypeRatio, checkPhenotypeRatio];

function noteFor(step) {
  switch (step) {
    case 0: return 'P: ♀ ' + show(S.P[0]) + ' × ♂ ' + show(S.P[1]);
    case 1: return 'G: ♀ ' + rows().map(show).join(', ') + '   ♂ ' + cols().map(show).join(', ');
    case 2: return 'F₁: ' + offspring().map(show).join(', ');
    case 3: return 'по генотипу: ' + genotypeLabel(genotypeRatio());
    case 4: return 'по фенотипу: ' + phenotypeLabel(phenotypeRatio());
  }
}

function check() {
  const lines = CHECKS[S.step]();
  if (lines.length) {
    S.errors++;
    S.msg = { type: 'err', lines };
  } else {
    S.notes.push(noteFor(S.step));
    S.step++;
    S.msg = null;
    if (S.step === STEPS.length) {
      const st = loadStats();
      st.solved++;
      if (!S.errors) st.clean++;
      saveStats(st);
      Progress.markDone('mono');
    }
  }
  // Переход из пути сразу к задаче: index.html#mono.
if (location.hash === '#mono') { newTask(); view = 'task'; history.replaceState(null, '', 'index.html'); }
render();
}

// ---------- экраны ----------

// Главный экран — карта пути: темы по порядку, пройденные отмечены, следующая подсвечена.
function homeView() {
  const st = loadStats();
  const cur = Progress.current();
  const lv = Level.get();
  return '<h1>Генетика</h1><p class="sub">Путь «от молекулы к признаку»</p>' +
    // Уровень: школьный или олимпиадный. Олимпиадный меняет оформление и (дальше) содержание.
    '<div class="level" role="group" aria-label="Уровень сложности">' +
    '<button data-act="level" data-v="school"' + (lv === 'school' ? ' class="on"' : '') + '>Школьный</button>' +
    '<button data-act="level" data-v="olymp"' + (lv === 'olymp' ? ' class="on"' : '') + '>Олимпиадный</button></div>' +
    // Справочник вне пути: открыт всегда, прохождение не отмечается.
    '<button class="module atlas" data-act="go" data-v="atlas.html"><em>Справочник · 3D</em><b>Атлас клетки</b>' +
    '<span>Органоиды животной клетки крупным планом: строение, функции, типичные ошибки</span></button>' +
    '<ol class="path">' + PATH.map((m, i) => {
      const done = Progress.isDone(m.id), soon = !m.href, next = cur && cur.id === m.id;
      const cls = done ? 'done' : next ? 'next' : soon ? 'soon' : '';
      return '<li class="' + cls + '"><span class="dot">' + (done ? '✓' : i + 1) + '</span>' +
        '<button class="module" data-act="open" data-v="' + m.id + '"' + (soon ? ' disabled' : '') + '>' +
        (next ? '<em>Следующий шаг</em>' : '') + '<b>' + m.title + '</b><span>' + (soon ? 'Скоро' : m.desc) + '</span></button></li>';
    }).join('') + '</ol>' +
    '<p class="stats">Все готовые темы открыты — можно начать с любой.<br>Решено задач по генетике: ' + st.solved + ' · без ошибок: ' + st.clean + '</p>';
}

function problemText() {
  const t = S.t;
  const note = gt => (gt === 'AA' ? ' (гомозигота)' : gt === 'Aa' ? ' (гетерозигота)' : '');
  const pheno = gt => (isDom(gt) ? t.dom : t.rec);
  return '<p><b>' + t.org + '.</b> Признак «' + t.dom + '» (' + show('A') + ') доминирует над признаком «' + t.rec + '» (' + show('a') + ').</p>' +
    '<p>Скрестили:<br>♀ — ' + pheno(S.P[0]) + note(S.P[0]) + '<br>♂ — ' + pheno(S.P[1]) + note(S.P[1]) + '</p>' +
    '<p>Определите генотипы родителей, их гаметы, генотипы и фенотипы потомства F₁.</p>';
}

function opt(act, v, label, sel, extra) {
  return '<button class="opt' + (sel ? ' sel' : '') + '" data-act="' + act + '" data-v="' + v + '"' + (extra || '') + '>' + label + '</button>';
}

function stepView() {
  switch (S.step) {
    case 0:
      return ['♀ Мать', '♂ Отец'].map((lbl, i) =>
        '<div class="row"><span class="lbl">' + lbl + '</span>' +
        ['AA', 'Aa', 'aa'].map(g => opt('p', g, show(g), S.selP[i] === g, ' data-i="' + i + '"')).join('') + '</div>').join('');
    case 1:
      return '<p class="hint">Выберите все типы гамет, которые образует каждый родитель.</p>' +
        ['♀', '♂'].map((s, i) =>
          '<div class="row"><span class="lbl">' + s + ' ' + show(S.P[i]) + '</span>' +
          ['A', 'a', 'Aa'].map(g => opt('g', g, show(g), S.selG[i].includes(g), ' data-i="' + i + '"')).join('') + '</div>').join('');
    case 2:
      return '<p class="hint">Нажимайте на клетку, чтобы сменить генотип.</p>' +
        '<table class="punnett"><tr><th>♀ \\ ♂</th>' + cols().map(c => '<th>' + show(c) + '</th>').join('') + '</tr>' +
        rows().map((r, i) => '<tr><th>' + show(r) + '</th>' + cols().map((c, j) => {
          const k = i + '-' + j, v = S.grid[k];
          return '<td><button class="cell' + (S.wrong.includes(k) ? ' wrong' : '') + '" data-act="cell" data-v="' + k + '">' + (v ? show(v) : '?') + '</button></td>';
        }).join('') + '</tr>').join('') + '</table>';
    case 3:
      return '<div class="opts-col">' + GENOTYPE_OPTIONS.map(k => opt('gr', k, genotypeLabel(k), S.selGr === k)).join('') + '</div>';
    case 4:
      return '<div class="opts-col">' + PHENOTYPE_OPTIONS.map(k => opt('ph', k, phenotypeLabel(k), S.selPh === k)).join('') + '</div>';
  }
}

function taskView() {
  const done = S.step === STEPS.length;
  let html = '<div class="top"><button class="back" data-act="home">← К карте пути</button>' +
    '<span class="stepno">' + (done ? 'Готово' : 'Шаг ' + (S.step + 1) + ' из ' + STEPS.length) + '</span></div>' +
    '<div class="card">' + problemText() + '</div>';
  if (S.notes.length) html += '<div class="card notebook">' + S.notes.map(n => '<div>' + n + '</div>').join('') + '</div>';
  if (done) {
    html += '<div class="msg ok"><p><b>Задача решена!</b> ' +
      (S.errors ? 'Ошибок по ходу решения: ' + S.errors + '.' : 'Без единой ошибки.') + '</p></div>' +
      '<button class="primary" data-act="new">Следующая задача</button>' + nextButton('mono') +
      '<button class="secondary" data-act="home">К карте пути</button>';
    return html;
  }
  html += '<div class="card"><h2>' + STEPS[S.step] + '</h2>' + stepView() + '</div>';
  if (S.msg) html += '<div class="msg ' + S.msg.type + '">' + S.msg.lines.map(l => '<p>' + l + '</p>').join('') + '</div>';
  html += '<button class="primary" data-act="check">Проверить</button>';
  return html;
}

// Кнопка перехода к следующей теме пути.
function nextButton(id) {
  const nx = Progress.nextAfter(id);
  if (!nx) return '';
  return nx.href
    ? '<button class="secondary" data-act="go" data-v="' + nx.href + '">Дальше: ' + nx.title + ' →</button>'
    : '<button class="secondary" disabled>Дальше: ' + nx.title + ' (скоро)</button>';
}

function render() {
  app.innerHTML = view === 'home' ? homeView() : taskView();
}

// ---------- переход на олимпиадный уровень ----------

// Заставка «смена протокола»: экран захватывают помехи, на панели расшифровывается
// «ОЛИМПИАДНЫЙ УРОВЕНЬ», печатается отчёт и заполняется полоса загрузки; вспышка —
// интерфейс уже красный, — и заставка схлопывается в линию, как выключенный кинескоп.
// Всё идёт по плану и заканчивается чисто, чтобы ученик понял: это не поломка, а «вход».
// Касание пропускает заставку.
let intro = null;
const NOISE = '01⬡АГЦТ<>/#%&';
const scramble = (from, to, k) => [...to].map((c, i) => c === ' ' ? ' ' :
  i < to.length * k ? c : Math.random() < 0.5 && from[i] ? from[i] : NOISE[Math.random() * NOISE.length | 0]).join('');

function olympIntro() {
  if (intro) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { Level.set('olymp'); render(); return; }
  const LINES = [
    ['› протокол', 'олимпиадный'],
    ['› глубина материала', 'повышенная'],
    ['› ловушки в заданиях', 'коварные'],
  ];
  const el = document.createElement('div');
  el.id = 'protocol';
  el.innerHTML = '<div class="bands">' + '<i></i>'.repeat(7) + '</div>' +
    '<div class="box"><div class="warn">⚠ ВНИМАНИЕ · СМЕНА ПРОТОКОЛА</div><div class="big"></div>' +
    '<div class="lines">' + LINES.map(() => '<div></div>').join('') + '</div>' +
    '<div class="bar"><i></i></div><div class="pct">0 %</div></div><div class="skip">коснитесь, чтобы пропустить</div>';
  el.querySelectorAll('.bands i').forEach(b => {
    b.style.setProperty('--y', Math.random() * 95 + '%');
    b.style.setProperty('--h', 4 + Math.random() * 40 + 'px');
    b.style.setProperty('--x', (Math.random() * 40 - 20) + 'px');
    b.style.animationDelay = -Math.random() + 's';
  });
  document.body.append(el);
  document.body.classList.add('breach');
  const big = el.querySelector('.big'), bar = el.querySelector('.bar i'), pct = el.querySelector('.pct');
  const rows = [...el.querySelectorAll('.lines div')];
  const t0 = performance.now(), SWITCH = 1500, END = 2700;
  let switched = false, raf = 0;
  const swap = () => {
    if (switched) return;
    switched = true;
    Level.set('olymp');
    render();
    el.classList.add('flash');
    document.body.classList.remove('breach');
  };
  const finish = () => {
    cancelAnimationFrame(raf);
    swap();
    el.classList.add('out');
    setTimeout(() => { el.remove(); intro = null; }, 480);
  };
  const step = () => {
    const t = performance.now() - t0;
    big.textContent = scramble('ШКОЛЬНЫЙ УРОВЕНЬ', 'ОЛИМПИАДНЫЙ УРОВЕНЬ', Math.max(0, (t - 200) / 900));
    rows.forEach((r, i) => {
      const k = Math.min(1, Math.max(0, (t - 450 - i * 250) / 300));
      const [a, b] = LINES[i];
      r.innerHTML = k ? a + ' '.repeat(Math.max(1, 22 - a.length)) + '<b>' + scramble('', b, k) + '</b>' : '';
    });
    const p = Math.min(1, t / SWITCH);
    bar.style.width = p * 100 + '%';
    pct.textContent = Math.round(p * 100) + ' %';
    if (t >= SWITCH) swap();
    if (t >= END) return finish();
    raf = requestAnimationFrame(step);
  };
  el.addEventListener('click', () => { if (!el.classList.contains('out')) finish(); });
  intro = el;
  step();
}

// ---------- действия ----------

app.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const { act, v } = b.dataset;
  const i = Number(b.dataset.i);
  switch (act) {
    case 'open': {
      if (v !== 'mono') { location.href = PATH.find(m => m.id === v).href; return; }
      newTask(); view = 'task'; break;
    }
    case 'go': location.href = v; return;
    case 'level': {
      if (v === Level.get()) return;
      if (v === 'olymp') { olympIntro(); return; }
      Level.set(v);
      // Переключение — короткий «сбой» всего экрана.
      document.body.classList.remove('switching');
      void document.body.offsetWidth;
      document.body.classList.add('switching');
      break;
    }
    case 'home': view = 'home'; break;
    case 'new': newTask(); break;
    case 'check': check(); return;
    case 'p': S.selP[i] = v; break;
    case 'g': {
      const list = S.selG[i];
      S.selG[i] = list.includes(v) ? list.filter(x => x !== v) : list.concat(v);
      break;
    }
    case 'cell': {
      const cycle = [undefined, 'AA', 'Aa', 'aa'];
      S.grid[v] = cycle[(cycle.indexOf(S.grid[v]) + 1) % cycle.length] || 'AA';
      S.wrong = S.wrong.filter(k => k !== v);
      break;
    }
    case 'gr': S.selGr = v; break;
    case 'ph': S.selPh = v; break;
  }
  render();
  if (act === 'open' || act === 'new' || act === 'home') window.scrollTo(0, 0);
});

render();
