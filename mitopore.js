// Учебная схема ядерного порового комплекса в разрезе. Все координаты условны.
function drawPore(canvas) {
  const g = canvas.getContext('2d');
  const scale = canvas.width / 720;
  g.setTransform(scale, 0, 0, scale, 0, 0);
  const glow = g.createRadialGradient(360, 246, 10, 360, 246, 304);
  glow.addColorStop(0, '#102938');
  glow.addColorStop(1, '#080d1800');
  g.fillStyle = glow;
  g.fillRect(0, 0, 720, 450);
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // Снаружи и изнутри мембраны соединены по краю канала. Справа тот же разрез.
  for (const side of [-1, 1]) {
    g.save();
    g.translate(360, 0);
    g.scale(side, 1);
    g.beginPath();
    g.moveTo(290, 192);
    g.bezierCurveTo(212, 192, 169, 185, 116, 195);
    g.bezierCurveTo(79, 202, 74, 219, 74, 243);
    g.bezierCurveTo(74, 273, 91, 285, 116, 289);
    g.bezierCurveTo(176, 298, 223, 287, 290, 292);
    g.lineTo(290, 192);
    const space = g.createLinearGradient(0, 190, 0, 294);
    space.addColorStop(0, '#503770');
    space.addColorStop(.53, '#222044');
    space.addColorStop(1, '#41285d');
    g.fillStyle = space;
    g.fill();
    g.beginPath();
    g.moveTo(290, 192);
    g.bezierCurveTo(212, 192, 169, 185, 116, 195);
    g.bezierCurveTo(79, 202, 74, 219, 74, 243);
    g.bezierCurveTo(74, 273, 91, 285, 116, 289);
    g.bezierCurveTo(176, 298, 223, 287, 290, 292);
    g.strokeStyle = '#8e57db';
    g.lineWidth = 13;
    g.shadowColor = '#9a62ef';
    g.shadowBlur = 10;
    g.stroke();
    g.shadowBlur = 0;
    g.strokeStyle = '#d0a2ff';
    g.lineWidth = 3;
    g.stroke();

    function ring(x, y, w, h) {
      const fill = g.createLinearGradient(0, y - h, 0, y + h);
      fill.addColorStop(0, '#ffeeac');
      fill.addColorStop(.5, '#d9a64f');
      fill.addColorStop(1, '#885325');
      g.beginPath();
      g.ellipse(x, y, w, h, -.12, 0, Math.PI * 2);
      g.fillStyle = fill;
      g.shadowColor = '#fecb6077';
      g.shadowBlur = 12;
      g.fill();
      g.shadowBlur = 0;
    }
    ring(100, 173, 42, 18);
    ring(78, 217, 24, 22);
    ring(77, 246, 24, 23);
    ring(78, 269, 24, 19);
    ring(100, 311, 42, 18);
    g.strokeStyle = '#caa5ff';
    g.globalAlpha = .48;
    g.lineWidth = 2;
    // Нити направлены в канал. Они показаны фрагментами, чтобы сохранить читаемость.
    for (let i = 0; i < 6; i++) {
      const y = 215 + i * 10;
      g.beginPath();
      g.moveTo(56, y);
      g.bezierCurveTo(43, y - 7, 33, y + 13, 18, y + (i % 2 ? -6 : 8));
      g.stroke();
    }
    g.restore();
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '600 26px system-ui';
  g.fillStyle = '#d7eafa';
  g.fillText('Цитоплазма', 360, 72);
  g.fillText('Ядро', 360, 405);

  function marker(n, x, y, color) {
    g.beginPath();
    g.arc(x, y, 15, 0, Math.PI * 2);
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.fillStyle = '#101727';
    g.fill();
    g.stroke();
    g.fillStyle = '#f1f7ff';
    g.font = '700 19px system-ui';
    g.fillText(n, x, y);
  }
  marker('1', 119, 190, '#b985ff');
  marker('2', 119, 292, '#b985ff');
  marker('3', 478, 171, '#f0c877');
  marker('4', 360, 244, '#68f3e7');
}

const routes = {
  protein: {
    x: 336, from: 130, to: 356, color: '#72f3e8', title: 'Белок входит в ядро',
    text: 'Транспортный белок распознаёт сигнал на грузе и помогает ему пройти через пору. Так в ядро попадают, например, белки, которые работают с ДНК.',
  },
  rna: {
    x: 384, from: 356, to: 130, color: '#ff91df', title: 'мРНК выходит в цитоплазму',
    text: 'Матричная РНК проходит через пору в комплексе с белками. В цитоплазме рибосомы считывают её и собирают белок.',
  },
};

function drawRoute(g, chosen, progress) {
  g.clearRect(0, 0, 720, 450);
  for (const [id, route] of Object.entries(routes)) {
    const { x, from, to, color } = route, sign = Math.sign(from - to);
    g.beginPath();
    g.moveTo(x, from);
    g.lineTo(x, to);
    g.moveTo(x - 8, to + 11 * sign);
    g.lineTo(x, to);
    g.lineTo(x + 8, to + 11 * sign);
    g.strokeStyle = id === chosen ? color : '#9fb3c04a';
    g.lineWidth = id === chosen ? 3.5 : 2;
    g.stroke();
  }
  const { x, from, to, color } = routes[chosen];
  const y = from + (to - from) * (.06 + progress * .88);
  g.save();
  g.translate(x, y);
  g.shadowColor = color;
  g.shadowBlur = 14;
  g.fillStyle = color;
  g.strokeStyle = color;
  g.beginPath();
  if (chosen === 'protein') {
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      const point = [Math.cos(angle) * 9, Math.sin(angle) * 9];
      if (i === 0) g.moveTo(...point); else g.lineTo(...point);
    }
    g.closePath();
    g.fill();
  } else {
    g.moveTo(-9, 4);
    g.bezierCurveTo(-2, -15, 1, 15, 9, -4);
    g.lineWidth = 4;
    g.stroke();
  }
  g.restore();
}

export function createPoreReader() {
  const view = document.getElementById('pore-reader');
  const back = document.getElementById('pore-reader-back');
  const olymp = document.getElementById('pore-reader-olymp');
  const routeTitle = document.getElementById('pore-route-title');
  const routeText = document.getElementById('pore-route-text');
  const routeButtons = [...view.querySelectorAll('[data-pore-route]')];
  const routeCanvas = document.getElementById('pore-figure-route');
  const routeContext = routeCanvas.getContext('2d');
  const scale = routeCanvas.width / 720;
  routeContext.setTransform(scale, 0, 0, scale, 0, 0);
  routeContext.lineCap = routeContext.lineJoin = 'round';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let drawn = false;
  let selected = 'protein', frame = 0;
  function choose(route, animate = true) {
    selected = route;
    view.dataset.route = route;
    for (const button of routeButtons) button.setAttribute('aria-pressed', String(button.dataset.poreRoute === route));
    routeTitle.textContent = routes[route].title;
    routeText.textContent = routes[route].text;
    cancelAnimationFrame(frame);
    drawRoute(routeContext, selected, reduceMotion.matches ? 1 : 0);
    if (!animate || reduceMotion.matches) return;
    const began = performance.now();
    const step = now => {
      const k = Math.min(1, (now - began) / 930);
      drawRoute(routeContext, selected, k * k * (3 - 2 * k));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }
  for (const button of routeButtons) button.onclick = () => choose(button.dataset.poreRoute);
  view.addEventListener('close', () => cancelAnimationFrame(frame));
  back.onclick = () => view.close();
  return {
    get open() { return view.open; },
    show(trigger) {
      if (view.open) return;
      if (!drawn) { drawPore(document.getElementById('pore-figure')); drawn = true; }
      const rect = trigger.closest('#inspect').getBoundingClientRect();
      const sides = [rect.top, innerWidth - rect.right, innerHeight - rect.bottom, rect.left];
      view.style.setProperty('--reader-card', sides.map(side => Math.max(0, side) + 'px').join(' '));
      olymp.hidden = !window.Level?.isOlymp();
      choose(selected, false);
      view.showModal();
      view.scrollTop = 0;
      back.focus();
    },
    close() { if (view.open) view.close(); },
  };
}
