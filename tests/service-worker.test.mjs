import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

test('offline installation caches every local script loaded by the main page', async () => {
  const listeners = new Map();
  let cached;
  const context = vm.createContext({ URL, location: new URL('https://example.test/spiral/service-worker.js'),
    addEventListener: (name, listener) => listeners.set(name, listener), skipWaiting() {},
    caches: { open: async () => ({ addAll: async urls => { cached = urls; } }) },
    importScripts: () => vm.runInContext(fs.readFileSync(new URL('../js/app-version.js', import.meta.url), 'utf8'), context)
  });
  vm.runInContext('self = globalThis', context);
  vm.runInContext(fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8'), context);
  let installation;
  listeners.get('install')({ waitUntil: promise => { installation = promise; } });
  await installation;
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const scripts = Array.from(html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g), match => match[1]);
  for (const script of scripts.filter(src => !/^https?:/.test(src))) {
    assert.ok(cached.includes(new URL(script, 'https://example.test/spiral/').toString()), script);
  }
});

test('activating a new Spiral cache preserves other applications on the same origin', async () => {
  const listeners = new Map();
  const deleted = [];
  let claimed = 0;
  const context = vm.createContext({ URL, location: new URL('https://example.test/spiral/service-worker.js'),
    clients: { claim: async () => { claimed++; } },
    addEventListener: (name, listener) => listeners.set(name, listener),
    caches: {
      keys: async () => ['spiral-v1.42.19', 'spiral-v1.42.20', context.APP_CACHE_NAME, 'another-app-v2', 'shared-assets'],
      delete: async key => { deleted.push(key); return true; }
    },
    importScripts: () => vm.runInContext(fs.readFileSync(new URL('../js/app-version.js', import.meta.url), 'utf8'), context)
  });
  vm.runInContext('self = globalThis', context);
  vm.runInContext(fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8'), context);
  let activation;
  listeners.get('activate')({ waitUntil: promise => { activation = promise; } });
  await activation;
  assert.deepEqual(deleted, ['spiral-v1.42.19', 'spiral-v1.42.20']);
  assert.equal(claimed, 1);
});
