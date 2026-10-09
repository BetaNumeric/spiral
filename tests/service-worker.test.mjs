import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

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
