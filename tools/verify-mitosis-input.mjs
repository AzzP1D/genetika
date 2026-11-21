import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { OrbitControls } from '../app/lib/addons/controls/OrbitControls.js';
import { bindLessonInput } from '../app/mitoinput.js';

// Минимальная доставка Pointer Events в том же порядке, что в браузере.
function target() {
  const capture = new EventTarget(), bubble = new EventTarget();
  return {
    addEventListener(type, fn, options) {
      (options === true || options?.capture ? capture : bubble).addEventListener(type, fn);
    },
    removeEventListener(type, fn, options) {
      (options === true || options?.capture ? capture : bubble).removeEventListener(type, fn);
    },
    capture, bubble,
  };
}
const owner = {...target(), defaultView: new EventTarget()};
const canvas = {...target(), ownerDocument: owner, getRootNode: () => owner,
  clientHeight: 700, style: {}, setPointerCapture() {}, releasePointerCapture() {},
};
const camera = new PerspectiveCamera(40, 1.3, .1, 60);
camera.position.set(0, 0, 10);
const controls = new OrbitControls(camera, canvas);
const actions = [];
let taps = 0;
bindLessonInput(canvas, controls, {
  drag(phase, event) {
    actions.push(phase);
    return phase === 'down' && event.clientX === 200;
  },
  tap() { taps++; },
});
function send(type, x, y, {id=1, button=0, touch=false, primary=true}={}) {
  const event = new Event(type, {cancelable:true});
  Object.assign(event, {pointerId:id, pointerType:touch?'touch':'mouse', isPrimary:primary,
    button, clientX:x, clientY:y, pageX:x, pageY:y,
  });
  Object.defineProperty(event, 'target', {value:canvas});
  for (const queue of [owner.capture, canvas.capture, canvas.bubble, owner.bubble]) queue.dispatchEvent(event);
}
function mouseDrag(button, x, y) {
  send('pointerdown', 200, 300, {button});
  send('pointermove', x, y, {button:-1});
  send('pointerup', x, y, {button});
}
const distance = () => camera.position.distanceTo(controls.target);
const near = (a, b) => Math.abs(a - b) < 1e-5;
const initialTarget = controls.target.clone();
mouseDrag(2, 265, 340);
assert(controls.target.distanceTo(initialTarget) > .1, 'ПКМ сдвигает даже при начале на объекте задания');
assert(near(distance(), 10));
let before = distance();
mouseDrag(1, 200, 350);
assert(!near(distance(), before), 'СКМ меняет масштаб');
assert.deepEqual(actions, []);
assert.equal(taps, 0);

const view = camera.position.clone();
send('pointerdown', 320, 300);
send('pointermove', 390, 300);
send('pointerup', 390, 300);
assert(camera.position.distanceTo(view) > .1, 'ЛКМ вращает сцену');
const single = {id:10, touch:true};
const second = {id:11, touch:true, primary:false};
const beforeTouch = camera.position.clone();
send('pointerdown', 320, 300, single);
send('pointermove', 390, 300, single);
send('pointerup', 390, 300, single);
assert(camera.position.distanceTo(beforeTouch) > .1, 'Один палец вращает сцену');

actions.length = 0;
send('pointerdown', 200, 300, single);
send('pointermove', 200, 305, single);
send('pointerdown', 340, 305, second);
const pan = controls.target.clone();
send('pointermove', 235, 340, single);
send('pointermove', 375, 340, second);
assert(controls.target.distanceTo(pan) > .1, 'Два пальца сдвигают камеру после начала жеста на объекте');
before = distance();
send('pointermove', 170, 340, single);
send('pointermove', 440, 340, second);
assert(distance() < before, 'Разведение пальцев приближает');
before = distance();
send('pointermove', 220, 340, single);
send('pointermove', 390, 340, second);
assert(distance() > before, 'Сведение пальцев отдаляет');
send('pointerup', 390, 340, second);
send('pointerup', 220, 340, single);
assert.deepEqual(actions, ['down', 'move', 'cancel']);
assert.equal(taps, 0, 'После двух пальцев карточка не открывается');
assert.equal(controls.enableRotate, true);

actions.length = 0;
mouseDrag(0, 205, 330);
assert.deepEqual(actions, ['down', 'move', 'up'], 'ЛКМ сохраняет перетаскивание задания');
actions.length = 0;
send('pointerdown', 200, 300, single);
send('pointercancel', 205, 320, single);
assert.deepEqual(actions, ['down', 'cancel']);
assert.equal(controls.enableRotate, true);
send('pointerdown', 350, 200);
send('pointerup', 350, 200);
assert.equal(taps, 1, 'Короткое нажатие открывает карточку');
console.log('PASS: mouse orbit, pan and dolly, touch orbit, pan and pinch, drag cancellation and tap');
