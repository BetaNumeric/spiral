import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function loadQr() {
  const context = vm.createContext({ window: {} });
  for (const file of ['qrcodegen', 'install-qr']) {
    vm.runInContext(fs.readFileSync(new URL(`../js/vendor/${file}.js`, import.meta.url), 'utf8'), context);
  }
  return context;
}

function svgGrid(svg) {
  const [, width, height] = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  assert.equal(width, height);
  const grid = Array.from({ length: +height }, () => Array(+width).fill(false));
  const path = svg.match(/<path d="([^"]*)"/)[1];
  for (const [, x, y, length, closingLength] of path.matchAll(/M(\d+),(\d+)h(\d+)v1h-(\d+)z/g)) {
    assert.equal(length, closingLength);
    for (let offset = 0; offset < +length; offset++) grid[+y][+x + offset] = true;
  }
  return grid;
}

test('installation QR rendering preserves modules and a four-module quiet zone', () => {
  const context = loadQr();
  const url = 'https://example.org/spiral/?install=1';
  const svg = context.window.SpiralInstallQR.toSvg(url);
  const grid = svgGrid(svg);
  const qr = context.qrcodegen.QrCode.encodeText(url, context.qrcodegen.QrCode.Ecc.MEDIUM);
  assert.equal(grid.length, qr.size + 8);
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid.length; x++) {
      assert.equal(grid[y][x], qr.getModule(x - 4, y - 4), `Module at ${x},${y}`);
    }
  }
  assert.match(svg, /<rect width="100%" height="100%" fill="#fff"\/>/);
  assert.match(svg, /role="img" aria-label="Scan to open the Spiral installation guide"/);
});

test('international installation URLs explicitly identify their original UTF-8 payload', () => {
  const context = loadQr();
  const url = 'https://example.org/Gr\u00fc\u00dfe/\u65e5\u672c\u8a9e/\ud83c\udf00?install=1';
  const original = context.qrcodegen.QrCode.encodeSegments;
  let captured;
  context.qrcodegen.QrCode.encodeSegments = function (segments, ...args) {
    captured = segments;
    return original.call(this, segments, ...args);
  };
  context.window.SpiralInstallQR.toSvg(url);
  assert.equal(captured[0].mode.modeBits, 7, 'The first segment must identify the character encoding.');
  assert.deepEqual(Array.from(captured[0].getData()), [0, 0, 0, 1, 1, 0, 1, 0], 'ECI 26 means UTF-8.');
  assert.equal(captured[1].mode.modeBits, 4);
  const bits = Array.from(captured[1].getData());
  const bytes = Array.from({ length: bits.length / 8 }, (_, index) =>
    parseInt(bits.slice(index * 8, index * 8 + 8).join(''), 2));
  assert.deepEqual(bytes, Array.from(new TextEncoder().encode(url)));
});

test('QR SVG never interpolates URL markup and stays within its module grid', () => {
  const context = loadQr();
  const url = 'https://example.org/?install=1&x="/><script>alert(1)</script>';
  const svg = context.window.SpiralInstallQR.toSvg(url);
  assert.doesNotMatch(svg, /<script|alert\(|example\.org|href=|https:\/\//);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /);
  assert.match(svg, /<path d="(?:M\d+,\d+h\d+v1h-\d+z)+" fill="#000"\/><\/svg>$/);
  const grid = svgGrid(svg);
  assert.ok(grid.every(row => row.length === grid.length));
});

test('QR generation rejects empty payloads and URLs beyond QR capacity cleanly', () => {
  const { toSvg } = loadQr().window.SpiralInstallQR;
  assert.throws(() => toSvg(''), /non-empty installation URL/);
  assert.throws(() => toSvg(null), /non-empty installation URL/);
  assert.throws(() => toSvg(`https://example.org/${'x'.repeat(5000)}`), /Data too long/);
});
