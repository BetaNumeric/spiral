import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const context = vm.createContext({ console, SpiralCalendar: class {} });
for (const file of ['config-utils', 'render-geometry', 'render-circle', 'render-spiral']) {
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context);
}
const eventEdgeWidth = vm.runInContext('CONFIG.EVENT_EDGE_STROKE_WIDTH', context);

function canvasContext() {
  const styles = ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'globalAlpha'];
  const ctx = { fillStyle: '#abcdef', strokeStyle: '#fedcba', lineWidth: 7, lineCap: 'round',
    lineJoin: 'bevel', globalAlpha: 0.75, stack: [], paints: [], scopes: 0, path: [] };
  ctx.styles = () => Object.fromEntries(styles.map(key => [key, ctx[key]]));
  ctx.save = () => { ctx.scopes++; ctx.stack.push(ctx.styles()); };
  ctx.restore = () => { assert.ok(ctx.stack.length); Object.assign(ctx, ctx.stack.pop()); };
  ctx.beginPath = () => { ctx.path = []; };
  for (const method of ['moveTo', 'lineTo', 'arc', 'closePath']) {
    ctx[method] = (...args) => ctx.path.push([method, ...args]);
  }
  for (const method of ['fill', 'stroke']) {
    ctx[method] = () => ctx.paints.push({ method, path: ctx.path.slice(), ...ctx.styles() });
  }
  return ctx;
}

function calendar() {
  const app = new context.SpiralCalendar();
  app.ctx = canvasContext();
  app.state = { showEventBoundaryStrokes: true, showAllEventBoundaryStrokes: true, showArcLines: false };
  app.eventSegments = [];
  return app;
}

function piece(circle, color, options = {}) {
  return { isCircleMode: circle, color, timeStartTheta: 0.5, timeEndTheta: 0.6,
    innerRadius: 100, outerRadius: 200, edgeInnerRadius: 100, edgeOuterRadius: 150,
    originalRadiusFunction: theta => 100 + theta * 10,
    eventSliceStart: 0, eventSliceEnd: 1, edgeSliceStart: 0, edgeSliceEnd: 0.5,
    coverStartEdge: true, coverEndEdge: true, ...options };
}

test('event painting preserves color order, inherited caps, deferred boundaries, and caller styles', () => {
  const app = calendar(), before = app.ctx.styles();
  app.eventSegments = [piece(true, '#ff0000', { dividerStroke: true }),
    piece(true, '#00ff00', { drawStartEdge: true }),
    piece(false, '#0000ff', { dividerStroke: true }), piece(false, '#ff00ff', { drawEndEdge: true })];
  app.drawEventSegments();
  assert.deepEqual(app.ctx.styles(), before);
  assert.equal(app.ctx.stack.length, 0);
  assert.deepEqual(app.ctx.paints.filter(p => p.method === 'fill').map(p => p.fillStyle),
    ['#ff0000', '#00ff00', '#0000ff', '#ff00ff']);
  const strokes = app.ctx.paints.filter(p => p.method === 'stroke');
  const caps = strokes.filter(p => p.strokeStyle !== '#000');
  assert.equal(caps.length, 8);
  for (const paint of caps) {
    assert.equal(paint.lineCap, before.lineCap);
    assert.equal(paint.lineWidth, eventEdgeWidth);
  }
  assert.ok(strokes.some(p => p.strokeStyle === '#000' && p.lineCap === 'square'));
  assert.ok(strokes.some(p => p.strokeStyle === '#000' && p.lineCap === 'round'));
  const lastFill = app.ctx.paints.findLastIndex(p => p.method === 'fill');
  assert.equal(app.ctx.paints.at(-1).strokeStyle, '#000');
  assert.equal(app.ctx.paints.at(-1).lineCap, 'square');
  assert.ok(app.ctx.paints.length - lastFill > 2);
  assert.ok(app.ctx.scopes <= 2, 'Drawing event pieces should not create a Canvas scope per piece.');
});

test('shared curve samples refresh between frames and distinguish ranges and radius functions', () => {
  const app = calendar();
  app.state.showAllEventBoundaryStrokes = false;
  let base = 100, samplings = 0;
  const radius = theta => base + theta * 10;
  const adaptive = app.adaptiveThetaSamples.bind(app);
  app.adaptiveThetaSamples = (...args) => { samplings++; return adaptive(...args); };
  app.eventSegments = Array.from({ length: 20 }, (_, i) => piece(false, '#123456', {
    originalRadiusFunction: radius, eventSliceStart: i / 20,
    edgeSliceStart: i / 20, edgeSliceEnd: (i + 1) / 20
  }));
  app.drawEventSegments();
  assert.equal(samplings, 1);
  const first = app.ctx.paints.find(p => p.method === 'fill').path[0].slice(1);
  app.ctx.paints = [];
  base = 200;
  app.eventSegments.push(piece(false, '#123456', { timeEndTheta: 0.7, originalRadiusFunction: radius }));
  app.eventSegments.push(piece(false, '#123456', { originalRadiusFunction: theta => radius(theta) + 20 }));
  app.drawEventSegments();
  assert.equal(samplings, 4);
  const next = app.ctx.paints.find(p => p.method === 'fill').path[0].slice(1);
  assert.ok(Math.abs(Math.hypot(...next) - Math.hypot(...first) - 100) < 1e-8);
  assert.equal(app._eventSpiralSamples, null);
});

test('a painting error restores Canvas styles and releases samples before the next frame', () => {
  const app = calendar(), before = app.ctx.styles();
  app.eventSegments = [piece(false, '#123456')];
  const fill = app.ctx.fill;
  app.ctx.fill = () => { throw new Error('Paint failed'); };
  assert.throws(() => app.drawEventSegments(), /Paint failed/);
  assert.deepEqual(app.ctx.styles(), before);
  assert.equal(app.ctx.stack.length, 0);
  assert.equal(app._eventSpiralSamples, null);
  app.ctx.fill = fill;
  app.drawEventSegments();
  assert.equal(app.ctx.paints.filter(p => p.method === 'fill').length, 1);
  assert.deepEqual(app.ctx.styles(), before);
});

test('spiral slivers retain the existing minimum thickness while normal pieces still paint', () => {
  const app = calendar();
  app.eventSegments = [piece(false, '#ff0000', { eventSliceEnd: 0.005 }), piece(false, '#00ff00')];
  app.drawEventSegments();
  assert.deepEqual(app.ctx.paints.filter(p => p.method === 'fill').map(p => p.fillStyle), ['#00ff00']);
});

test('both themes paint original event colors and preserve painter state', () => {
  for (const darkMode of [false, true]) {
    const app = calendar(), before = app.ctx.styles();
    app.state.darkMode = darkMode;
    app.eventSegments = [piece(true, '#ffffff'), piece(false, '#9fe5df'),
      piece(true, '#263448'), piece(false, '#efbd85')];
    const original = JSON.stringify(app.eventSegments);
    app.drawEventSegments();
    assert.deepEqual(app.ctx.paints.filter(p => p.method === 'fill').map(p => p.fillStyle),
      ['#ffffff', '#9fe5df', '#263448', '#efbd85']);
    assert.deepEqual(app.ctx.styles(), before);
    assert.equal(JSON.stringify(app.eventSegments), original);
  }
});

test('dark clock surfaces do not replace white event bands in either view', () => {
  for (const circle of [false, true]) for (const darkMode of [false, true]) {
    const app = calendar();
    app.state.darkMode = darkMode;
    for (const isEvent of [false, true]) {
      if (circle) {
        app.drawCircleSegment(100, 200, -0.6, -0.5, '#fff', false, false, false,
          false, null, null, false, false, isEvent);
      } else {
        app.drawSegment(0.5, 0.6, theta => 100 + theta * 10, '#fff', false, false,
          false, false, false, null, null, false, null, null, false, isEvent);
      }
      const fill = app.ctx.paints.filter(p => p.method === 'fill').at(-1).fillStyle;
      assert.equal(fill === '#fff', isEvent || !darkMode);
    }
  }
});

test('labels choose readable contrast over pale, bright, midtone and dark events', () => {
  const luminance = color => {
    const hex = color.slice(1);
    const channels = (hex.length === 3 ? [...hex].map(char => char + char) : hex.match(/../g))
      .map(channel => parseInt(channel, 16) / 255)
      .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  for (const color of ['#ffffff', '#9fe5df', '#efbd85', '#bda2e8', '#ff0000', '#00ff00',
    '#0000ff', '#777777', '#263448', '#000000', '#abc', '#123']) {
    const text = context.getContrastingCanvasText(color);
    const values = [luminance(color), luminance(text)].sort((a, b) => a - b);
    assert.ok((values[1] + 0.05) / (values[0] + 0.05) >= 4.5, `${color} against ${text}`);
  }
});

test('curved date labels change contrast as their letters cross into an event', () => {
  for (const circle of [false, true]) {
    const app = calendar(), glyphs = [];
    app.state.darkMode = true;
    app.state.showDayNumbers = true;
    app.ctx.translate = app.ctx.rotate = () => {};
    app.ctx.measureText = text => ({ width: text.length * 20 });
    app.ctx.fillText = text => glyphs.push([text, app.ctx.fillStyle]);
    const radius = theta => theta < 2 * Math.PI ? 100 : 200;
    app.dayNumbers = [{ day: 0, segment: 2, text: 'ABCD', centerTheta: 0.6,
      centerRadius: 150, fontSize: 20, isCircleMode: circle, radiusFunction: radius }];
    app.eventSegments = [piece(circle, '#9fe5df', { day: 0, segment: 0,
      timeStartTheta: 0, timeEndTheta: 2 * Math.PI / 24, originalRadiusFunction: radius })];
    app.drawDayNumbers();
    const softLabel = vm.runInContext('getCanvasTheme(true).label', context);
    assert.deepEqual(glyphs, [['A', softLabel], ['B', softLabel], ['C', softLabel], ['D', '#000000']]);
    glyphs.length = 0;
    app.state.darkMode = false;
    app.drawDayNumbers();
    assert.deepEqual(glyphs.map(([, color]) => color), Array(4).fill('#000000'));
  }
});
