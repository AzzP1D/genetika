'use strict';

// Единый учебный путь «от молекулы к признаку»: порядок модулей и прогресс ученика.
// Подключается и в меню (index.html), и в 3D-модулях (cell.html).

const PATH = [
  { id: 'repl', title: 'Репликация ДНК', desc: 'Клетка → ядро → двойная спираль. Ведущая цепь, фрагменты Оказаки, хромосома', href: 'cell.html' },
  { id: 'mitosis', title: 'Митоз', desc: 'Как удвоенные хромосомы расходятся в дочерние клетки', href: 'mitosis.html' },
  { id: 'transcr', title: 'Транскрипция', desc: 'От поиска гена в ядре до отделения пре-мРНК.',
    href: 'transcription-preview.html', olympDesc: 'Инициация. Сравни, как начинается синтез РНК в двух условиях.' },
  { id: 'transl', title: 'Трансляция и генетический код', desc: 'Зрелая мРНК в ядре', href: 'translation.html?from=map' },
  { id: 'meiosis', title: 'Мейоз', desc: 'Как образуются гаметы' },
  { id: 'mono', title: 'Моногибридное скрещивание', desc: 'Генотипы, гаметы, решётка Пеннета, расщепление', href: 'index.html#mono' },
  { id: 'di', title: 'Дигибридное скрещивание', desc: 'Независимое наследование двух признаков' },
  { id: 'sex', title: 'Наследование, сцепленное с полом', desc: 'Гены в X-хромосоме' },
  { id: 'blood', title: 'Группы крови', desc: 'Множественные аллели и кодоминирование' },
];

const Progress = {
  load() {
    try { return JSON.parse(localStorage.getItem('gen-path')) || {}; } catch (e) { return {}; }
  },
  isDone(id) { return !!this.load()[id]; },
  markDone(id) {
    const p = this.load();
    p[id] = true;
    try { localStorage.setItem('gen-path', JSON.stringify(p)); } catch (e) { /* без сохранения */ }
  },
  // Следующая по пути тема после id (готова она или ещё нет).
  nextAfter(id) {
    const i = PATH.findIndex(m => m.id === id);
    return PATH[i + 1] || null;
  },
  // Рекомендуемая тема: первая непройденная из готовых.
  current() {
    const p = this.load();
    return PATH.find(m => m.href && !p[m.id]) || null;
  },
};

window.PATH = PATH;
window.Progress = Progress;
