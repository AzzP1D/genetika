// OrbitControls получает оба касания, даже если первое началось на объекте задания.
export function bindLessonInput(canvas, controls, {drag, tap}) {
  const touches = new Set();
  let grabbed = null, down = null;

  function finishDrag(phase, event) {
    if (grabbed === null) return;
    grabbed = null;
    controls.enableRotate = true;
    drag(phase, event);
  }

  function cancel() {
    down = null;
    finishDrag('cancel');
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') {
      touches.add(event.pointerId);
      if (touches.size > 1) {
        cancel();
        return;
      }
    }
    if (!event.isPrimary || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
    down = {id:event.pointerId, x:event.clientX, y:event.clientY};
    if (drag('down', event)) {
      grabbed = event.pointerId;
      controls.enableRotate = false;
    }
  }, true);

  canvas.addEventListener('pointermove', event => {
    if (event.pointerId === down?.id && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 8) down = null;
    if (event.pointerId === grabbed) drag('move', event);
  });

  const owner = canvas.ownerDocument;
  owner.addEventListener('pointerup', event => {
    touches.delete(event.pointerId);
    if (event.pointerId === grabbed) {
      down = null;
      finishDrag('up', event);
      return;
    }
    if (event.pointerId !== down?.id) return;
    const start = down;
    down = null;
    if (event.target === canvas && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 8) tap(event);
  }, true);

  function cancelPointer(event) {
    touches.delete(event.pointerId);
    if (event.pointerId === grabbed || event.pointerId === down?.id) cancel();
  }
  owner.addEventListener('pointercancel', cancelPointer, true);
  canvas.addEventListener('lostpointercapture', cancelPointer);
  owner.defaultView.addEventListener('blur', () => {
    touches.clear();
    cancel();
  });
  return cancel;
}
