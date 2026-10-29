'use strict';

// Уровень сложности: 'school' или 'olymp'. Подключается в <head> каждой страницы до её
// оформления, чтобы страница сразу открывалась в нужных цветах. Выбор запоминается.

const Level = {
  get() { return document.documentElement.dataset.level; },
  isOlymp() { return this.get() === 'olymp'; },
  set(v) {
    document.documentElement.dataset.level = v === 'olymp' ? 'olymp' : 'school';
    try { localStorage.setItem('gen-level', this.get()); } catch (e) { /* без сохранения */ }
  },
};
{
  let v = null;
  try { v = localStorage.getItem('gen-level'); } catch (e) { /* без сохранения */ }
  document.documentElement.dataset.level = v === 'olymp' ? 'olymp' : 'school';
}
window.Level = Level;
