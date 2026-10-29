'use strict';

// Единый учебный путь «от молекулы к признаку»: порядок модулей и прогресс ученика.
// Подключается и в меню (index.html), и в 3D-модулях (cell.html).

const PATH = [
  { id: 'repl', title: 'Репликация ДНК', desc: 'Клетка → ядро → двойная спираль. Ведущая цепь, фрагменты Оказаки, хромосома', href: 'cell.html' },
  { id: 'mitosis', title: 'Митоз', desc: 'Как удвоенные хромосомы расходятся в дочерние клетки' },
  { id: 'transcr', title: 'Транскрипция', desc: 'Как с гена снимается копия — иРНК' },
  { id: 'transl', title: 'Трансляция и генетический код', desc: 'Как по иРНК собирается белок' },
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
