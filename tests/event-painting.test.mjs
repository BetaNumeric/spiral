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
