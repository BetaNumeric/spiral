import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source = fs.readFileSync(new URL('../js/study-connection.js', import.meta.url), 'utf8');
function connection(page = 'https://betanumeric.github.io/spiral/') {
  const window = { location: { href: page } };
  vm.runInContext(source, vm.createContext({ window, URL }));
  return window.SpiralStudyConnection;
}
test('GitHub Pages retains its repository path while API requests use the separate service', () => {
  const config = connection();
  assert.equal(config.pageOrigin(), 'https://betanumeric.github.io');
  assert.equal(config.defaultRelay(), 'https://betanumeric.github.io');
  assert.equal(config.apiURL('https://relay.example/', '/pair'), 'https://relay.example/study-api/pair');
  assert.equal(config.apiURL('', '/pair'), '/study-api/pair');
});
test('public app connections require an HTTPS origin without credentials or hidden URL state', () => {
  const config = connection();
  for (const value of ['http://127.0.0.1:8080', 'http://192.168.1.10:8080', 'https://name:secret@relay.example',
    'https://relay.example/facilitator.html', 'https://relay.example/?token=secret', 'https://relay.example/#secret', 'javascript:alert(1)']) {
    assert.throws(() => config.normalize(value), undefined, value);
  }
});
test('desktop local tests can connect to a second loopback service without allowing network HTTP', () => {
  const config = connection('http://127.0.0.1:8000/spiral/');
  assert.equal(config.normalize('http://127.0.0.1:8080/'), 'http://127.0.0.1:8080');
  assert.throws(() => config.normalize('http://192.168.1.10:8080'));
});
