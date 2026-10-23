import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36';
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

function fixture({ userAgent = ANDROID_CHROME, platform = 'Linux armv8l', maxTouchPoints = 5,
  href = 'https://example.test/team/spiral/index.html', displayMode = 'browser',
  standalone = false, dismissed = false, readyState = 'loading', storageBlocked = false, nativeDialog = true } = {}) {
  let now = Date.UTC(2026, 9, 23, 12);
  class ClockDate extends Date { static now() { return now; } }
  function eventTarget(object = {}) {
    const listeners = new Map();
    return Object.assign(object, {
      addEventListener(name, callback) {
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(callback);
      },
      removeEventListener(name, callback) {
        listeners.set(name, (listeners.get(name) || []).filter(listener => listener !== callback));
      },
      dispatchEvent(event) {
        event.target ||= this;
        for (const callback of [...(listeners.get(event.type) || [])]) callback.call(this, event);
        this[`on${event.type}`]?.(event);
        return !event.defaultPrevented;
      }
    });
  }
  const elements = new Map();
  const document = eventTarget({ readyState, activeElement: null });
  function element(tagName = 'div', id = '') {
    const attributes = new Map();
    const classes = new Set();
    const node = eventTarget({ tagName: tagName.toUpperCase(), id, style: {}, hidden: false,
      disabled: false, open: false, value: '', textContent: '', innerHTML: '', children: [], isConnected: true,
      classList: { add: (...values) => values.forEach(value => classes.add(value)),
        remove: (...values) => values.forEach(value => classes.delete(value)),
        contains: value => classes.has(value) },
      setAttribute(name, value) {
        attributes.set(name, String(value));
        if (name === 'open' && 'open' in this) this.open = true;
        if (name === 'inert') this.inert = true;
      },
      getAttribute(name) { return attributes.get(name) ?? null; },
      hasAttribute: name => attributes.has(name),
      removeAttribute(name) {
        attributes.delete(name);
        if (name === 'open' && 'open' in this) this.open = false;
        if (name === 'inert') this.inert = false;
      },
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      append(...children) { children.forEach(child => this.appendChild(child)); },
      replaceChildren(...children) { this.children = []; this.append(...children); },
      contains(target) { return target === this || this.children.some(child => child.contains?.(target)); },
      querySelectorAll(selector) {
        const descendants = this.children.flatMap(child => [child, ...child.querySelectorAll()]);
        return selector === 'button, input, select, a[href]'
          ? descendants.filter(child => ['BUTTON', 'INPUT', 'SELECT', 'A'].includes(child.tagName)) : descendants;
      },
      querySelector() { return this.querySelectorAll()[0] || null; },
      focus() { document.activeElement = this; },
      select() { this.selected = true; this.focus(); },
      setSelectionRange() { this.selected = true; },
      click() { this.dispatchEvent({ type: 'click', preventDefault() { this.defaultPrevented = true; } }); },
      showModal() { this.setAttribute('open', ''); },
      close() { this.removeAttribute('open'); this.dispatchEvent({ type: 'close' }); },
      getBoundingClientRect: () => ({ left: 100, top: 100, right: 900, bottom: 700 }),
      getClientRects() {
        return this.hidden || this.style.display === 'none' || this.tagName === 'DIALOG' && !(this.open || this.hasAttribute('open')) ||
          this.parentNode && !this.parentNode.getClientRects().length ? [] : [{}];
      }
    });
    if (id) elements.set(id, node);
    return node;
  }
  document.body = element('body');
  Object.assign(document, { createElement: element, createElementNS: (_, tag) => element(tag),
    getElementById: id => elements.get(id) || null,
    querySelector: selector => selector.startsWith('#') ? elements.get(selector.slice(1)) : null,
    querySelectorAll: () => [], execCommand(command) { this.commands ||= []; this.commands.push(command); return true; } });
  const ids = ['a2hs-banner', 'a2hs-text', 'a2hs-install-btn', 'a2hs-close-btn',
    'install-guide', 'install-platform', 'install-steps', 'install-status', 'install-native-btn',
    'install-copy-btn', 'install-share-btn', 'install-link', 'install-qr', 'installSpiralBtn',
    'install-close-btn', 'install-continue-btn', 'install-intro', 'install-title', 'install-device',
    'install-link-status', 'install-qr-section', 'app', 'install-backdrop'];
  for (const id of ids) {
    const tag = id === 'install-guide' ? 'dialog' : id === 'install-platform' ? 'select' :
      id === 'install-link' ? 'input' : /btn$/i.test(id) ? 'button' : 'div';
    element(tag, id);
  }
  for (const id of ['a2hs-banner', 'install-native-btn', 'install-share-btn', 'install-qr-section', 'install-backdrop']) elements.get(id).hidden = true;
  elements.get('app').inert = false;
  elements.get('app').appendChild(elements.get('installSpiralBtn'));
  if (!nativeDialog) {
    const dialog = elements.get('install-guide');
    delete dialog.showModal;
    delete dialog.close;
    delete dialog.open;
  }
  elements.get('install-platform').value = 'auto';
  for (const id of ['install-title', 'install-close-btn', 'install-platform', 'install-native-btn',
    'install-link', 'install-copy-btn', 'install-share-btn', 'install-continue-btn']) {
    elements.get('install-guide').appendChild(elements.get(id));
  }
  let location = new URL(href);
  const storage = new Map(dismissed ? [['a2hsDismissed', dismissed === true ? String(now - 60_000) : dismissed]] : []);
  const navigator = { userAgent, platform, maxTouchPoints, standalone,
    clipboard: { writeText: async value => { navigator.copied = value; } } };
  const window = eventTarget({ navigator, document, innerWidth: 1024,
    matchMedia: query => eventTarget({ matches: query.includes(`display-mode: ${displayMode}`) }),
    getComputedStyle: node => node.style });
  const history = { state: { calendar: 'unchanged' }, replaceState(state, _, url) {
    this.state = state;
    location = new URL(url, location);
  } };
  const localStorage = { getItem(key) { if (storageBlocked) throw new Error('storage denied'); return storage.get(key) ?? null; },
    setItem(key, value) { if (storageBlocked) throw new Error('storage denied'); storage.set(key, String(value)); },
    removeItem: key => storage.delete(key) };
  Object.defineProperty(window, 'location', { get: () => location });
  Object.assign(window, { history, localStorage });
  const context = vm.createContext({ window, navigator, document, URL, URLSearchParams, history, Date: ClockDate,
    localStorage, console, setTimeout: () => 1, clearTimeout() {},
    requestAnimationFrame: callback => callback(), isMobileDevice: () => maxTouchPoints > 0 });
  Object.defineProperty(context, 'location', { get: () => location });
  vm.runInContext(fs.readFileSync(new URL('../a2hs.js', import.meta.url), 'utf8'), context);
  return { api: window.SpiralInstall, window, document, navigator, history, storage, elements,
    advanceTime(milliseconds) { now += milliseconds; },
    initialize() { document.readyState = 'complete'; document.dispatchEvent({ type: 'DOMContentLoaded' }); },
    emit(type, event = {}) { window.dispatchEvent({ type, ...event }); },
    get location() { return location; } };
}

function installPrompt(choice = Promise.resolve({ outcome: 'dismissed' })) {
  return { type: 'beforeinstallprompt', calls: 0, prevented: false, userChoice: choice,
    preventDefault() { this.prevented = true; }, prompt() { this.calls++; return Promise.resolve(); } };
}

function visible(node) {
  return !node.hidden && node.style.display !== 'none';
}

function content(node) {
  return [node.textContent, ...node.children.map(content)].join(' ');
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

test('the shareable landing page opens its directory guide and preserves existing calendar context', () => {
  const html = fs.readFileSync(new URL('../install.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
  const anchor = {};
  let redirected;
  const context = vm.createContext({ URL,
    window: { location: { href: 'https://example.test/team/spiral/install.html?study=1&install=0#event42',
      replace: destination => { redirected = destination; } } },
    document: { getElementById: () => anchor } });
  for (const [, source] of scripts) vm.runInContext(source, context);
  assert.equal(redirected, 'https://example.test/team/spiral/?study=1&install=1#event42');
  assert.equal(anchor.href, redirected);
});

test('installation detects phone browsers and touch-enabled iPads without treating desktop Macs as iPads', () => {
  const cases = [
    { userAgent: IPHONE_SAFARI, platform: 'iPhone', expected: ['ios', 'safari'] },
    { userAgent: IPHONE_SAFARI.replace('Version/18.0', 'CriOS/130.0.0.0'), platform: 'iPhone', expected: ['ios', 'chrome'] },
    { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
      platform: 'MacIntel', maxTouchPoints: 5, expected: ['ios', 'safari'] },
    { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
      platform: 'MacIntel', maxTouchPoints: 0, expected: ['desktop', 'safari'] },
    { expected: ['android', 'chrome'] },
    { userAgent: `${ANDROID_CHROME} SamsungBrowser/27.0`, expected: ['android', 'samsung'] },
    { userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0', expected: ['android', 'firefox'] },
    { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      platform: 'Win32', maxTouchPoints: 0, expected: ['desktop', 'edge'] }
  ];
  for (const { expected, ...options } of cases) {
    const environment = fixture(options).api.getEnvironment();
    assert.deepEqual([environment.platform, environment.browser], expected, options.userAgent);
  }
});

test('in-app browsers are identified even when their user agent resembles mobile Safari', () => {
  for (const suffix of ['[FBAN/FBIOS;FBAV/487.0.0.0]', 'Instagram 355.0.0.0', 'Line/14.0.0']) {
    assert.equal(fixture({ userAgent: `${IPHONE_SAFARI} ${suffix}` }).api.getEnvironment().inApp, true, suffix);
  }
  assert.equal(fixture({ userAgent: IPHONE_SAFARI }).api.getEnvironment().inApp, false);
});

test('installation links stay in the deployed directory and discard calendar parameters and fragments', () => {
  for (const href of ['https://example.test/team/spiral/?date=2026-10-25#event-42',
    'https://example.test/team/spiral/index.html?install=1&study=1#settings']) {
    const { api } = fixture({ href });
    assert.equal(api.getInstallUrl(), 'https://example.test/team/spiral/install.html');
  }
});

test('an explicit installation link opens despite a dismissed banner and removes only its own flag', () => {
  const app = fixture({ dismissed: true,
    href: 'https://example.test/team/spiral/?study=1&install=1&date=2026-10-25#event-42' });
  app.initialize();
  assert.equal(app.elements.get('install-guide').open, true);
  assert.equal(app.location.searchParams.get('study'), '1');
  assert.equal(app.location.searchParams.get('date'), '2026-10-25');
  assert.equal(app.location.searchParams.has('install'), false);
  assert.equal(app.location.hash, '#event-42');
  assert.deepEqual(app.history.state, { calendar: 'unchanged' });
  assert.equal(visible(app.elements.get('a2hs-banner')), false);
});

test('installed displays suppress the automatic guide and banner, including iOS and fullscreen', () => {
  for (const options of [{ displayMode: 'standalone' }, { displayMode: 'fullscreen' },
    { standalone: true, userAgent: IPHONE_SAFARI }]) {
    const app = fixture({ ...options, href: 'https://example.test/team/spiral/?install=1' });
    app.initialize();
    assert.equal(app.api.getEnvironment().standalone, true);
    assert.equal(app.elements.get('install-guide').open, false);
    assert.equal(visible(app.elements.get('a2hs-banner')), false);
  }
});

test('native prompts are captured before DOM initialization and remain usable after banner dismissal', async () => {
  const app = fixture({ dismissed: true });
  const prompt = installPrompt();
  app.window.dispatchEvent(prompt);
  assert.equal(prompt.prevented, true);
  app.initialize();
  app.api.open();
  const button = app.elements.get('install-native-btn');
  assert.equal(visible(button), true);
  assert.equal(button.disabled, false);
  await app.api.install();
  assert.equal(prompt.calls, 1);
  assert.equal(visible(app.elements.get('a2hs-banner')), false);
});

test('a dismissed prompt is consumed once and a fresh browser prompt can enable installation again', async () => {
  const app = fixture();
  app.initialize();
  app.api.open();
  const first = installPrompt();
  app.window.dispatchEvent(first);
  assert.equal(visible(app.elements.get('install-native-btn')), true);
  await app.api.install();
  await app.api.install();
  assert.equal(first.calls, 1);
  const second = installPrompt();
  app.window.dispatchEvent(second);
  assert.equal(visible(app.elements.get('install-native-btn')), true);
  assert.equal(app.elements.get('install-native-btn').disabled, false);
  await app.api.install();
  assert.equal(second.calls, 1);
});

test('double clicking Install cannot invoke the same browser prompt while a choice is pending', async () => {
  const app = fixture();
  app.initialize();
  let resolveChoice;
  const prompt = installPrompt(new Promise(resolve => { resolveChoice = resolve; }));
  app.window.dispatchEvent(prompt);
  const first = app.api.install();
  const second = app.api.install();
  assert.equal(prompt.calls, 1);
  resolveChoice({ outcome: 'dismissed' });
  await Promise.all([first, second]);
});

test('installation completion clears any pending prompt and removes the promotion', async () => {
  const app = fixture();
  app.initialize();
  const prompt = installPrompt();
  app.window.dispatchEvent(prompt);
  app.emit('appinstalled');
  await app.api.install();
  assert.equal(prompt.calls, 0);
  assert.equal(visible(app.elements.get('a2hs-banner')), false);
});

test('manual device selection updates the guide without changing detection or the shared link', () => {
  const app = fixture({ userAgent: IPHONE_SAFARI, platform: 'iPhone' });
  app.initialize();
  app.api.open();
  const steps = app.elements.get('install-steps');
  assert.match(content(steps), /Share menu/);
  assert.match(content(steps), /Open as Web App/);
  const selector = app.elements.get('install-platform');
  selector.value = 'android';
  selector.dispatchEvent({ type: 'change' });
  assert.match(content(steps), /three-dot menu/);
  assert.doesNotMatch(content(steps), /Open as Web App/);
  assert.equal(app.api.getEnvironment().platform, 'ios');
  assert.equal(app.elements.get('install-link').value, app.api.getInstallUrl());
  selector.value = 'auto';
  selector.dispatchEvent({ type: 'change' });
  assert.match(content(steps), /Open as Web App/);
});

test('Android browser fallback and embedded-browser instructions match the actual browser', () => {
  for (const [userAgent, expected] of [
    [`${ANDROID_CHROME} SamsungBrowser/27.0`, /Samsung Internet/],
    ['Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0', /In Firefox/],
    [`${IPHONE_SAFARI} Instagram 355.0.0.0`, /Paste it into Safari/]
  ]) {
    const app = fixture({ userAgent });
    app.initialize();
    app.api.open();
    assert.match(content(app.elements.get('install-steps')), expected);
  }
});

test('Copy link uses a clean share URL and falls back to a selectable field when clipboard access is denied', async () => {
  const app = fixture({ href: 'https://example.test/team/spiral/?date=2026-10-25#event-42' });
  app.initialize();
  app.api.open();
  const button = app.elements.get('install-copy-btn');
  button.click();
  await flush();
  assert.equal(app.navigator.copied, 'https://example.test/team/spiral/install.html');
  assert.equal(app.elements.get('install-link-status').textContent, 'Link copied.');
  app.navigator.clipboard.writeText = async () => { throw new Error('clipboard denied'); };
  app.document.execCommand = () => false;
  button.click();
  await flush();
  const link = app.elements.get('install-link');
  assert.equal(app.document.activeElement, link);
  assert.equal(link.selected, true);
  assert.match(app.elements.get('install-link-status').textContent, /Select and copy/);
});

test('unavailable sharing falls back to the link, while cancelling native sharing stays quiet', async () => {
  const app = fixture();
  app.navigator.share = async data => { app.navigator.shared = data; };
  app.initialize();
  app.api.open();
  const share = app.elements.get('install-share-btn');
  assert.equal(visible(share), true);
  share.click();
  await flush();
  assert.equal(app.navigator.shared.url, app.api.getInstallUrl());
  app.navigator.share = async () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); };
  share.click();
  await flush();
  assert.equal(app.elements.get('install-link-status').textContent, '');
  app.navigator.share = async () => { throw new Error('sharing unavailable'); };
  share.click();
  await flush();
  assert.equal(app.document.activeElement, app.elements.get('install-link'));
  assert.equal(app.elements.get('install-link').selected, true);
  assert.match(app.elements.get('install-link-status').textContent, /Copy the link/);
});

test('guide keyboard trapping and Escape restore focus to the Settings entry', () => {
  const app = fixture();
  app.initialize();
  const entry = app.elements.get('installSpiralBtn');
  entry.focus();
  entry.click();
  const dialog = app.elements.get('install-guide');
  assert.equal(app.document.activeElement, app.elements.get('install-title'));
  function key(key, shiftKey = false) {
    const event = { type: 'keydown', key, shiftKey,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; } };
    dialog.dispatchEvent(event);
    return event;
  }
  assert.equal(key('Tab', true).defaultPrevented, true);
  assert.equal(app.document.activeElement, app.elements.get('install-continue-btn'));
  assert.equal(key('Tab').defaultPrevented, true);
  assert.equal(app.document.activeElement, app.elements.get('install-close-btn'));
  const escape = key('Escape');
  assert.equal(escape.defaultPrevented, true);
  assert.equal(escape.propagationStopped, true);
  assert.equal(dialog.open, false);
  assert.equal(app.document.activeElement, entry);
});

test('banner dismissal expires after seven days and never makes the guide inaccessible', () => {
  const app = fixture();
  app.initialize();
  const banner = app.elements.get('a2hs-banner');
  assert.equal(visible(banner), true);
  app.elements.get('a2hs-close-btn').click();
  assert.equal(visible(banner), false);
  app.advanceTime(6 * 24 * 60 * 60 * 1000);
  app.window.dispatchEvent(installPrompt());
  assert.equal(visible(banner), false);
  app.advanceTime(2 * 24 * 60 * 60 * 1000);
  app.window.dispatchEvent(installPrompt());
  assert.equal(visible(banner), true);
  app.elements.get('installSpiralBtn').click();
  assert.equal(app.elements.get('install-guide').open, true);
  assert.equal(visible(banner), false);
  const legacy = fixture({ dismissed: 'true' });
  legacy.initialize();
  assert.equal(visible(legacy.elements.get('a2hs-banner')), true);
});

test('blocked browser storage does not prevent guiding, dismissing, or native installation', async () => {
  const app = fixture({ storageBlocked: true });
  app.initialize();
  app.api.open();
  app.api.close();
  assert.equal(visible(app.elements.get('a2hs-banner')), false);
  const prompt = installPrompt();
  app.window.dispatchEvent(prompt);
  app.api.open();
  await app.api.install();
  assert.equal(prompt.calls, 1);
});

test('a fresh prompt received during an earlier choice survives that choice resolving', async () => {
  const app = fixture();
  app.initialize();
  app.api.open();
  let resolveChoice;
  const first = installPrompt(new Promise(resolve => { resolveChoice = resolve; }));
  app.window.dispatchEvent(first);
  const installing = app.api.install();
  const second = installPrompt();
  app.window.dispatchEvent(second);
  resolveChoice({ outcome: 'dismissed' });
  await installing;
  assert.equal(app.elements.get('install-native-btn').disabled, false);
  await app.api.install();
  assert.equal(first.calls, 1);
  assert.equal(second.calls, 1);
});

test('browsers without native dialog support restore the exact previous app accessibility state', () => {
  for (const [inert, ariaHidden] of [[false, null], [true, 'true'], [false, 'false']]) {
    const app = fixture({ nativeDialog: false });
    const background = app.elements.get('app');
    const dialog = app.elements.get('install-guide');
    background.inert = inert;
    if (ariaHidden !== null) background.setAttribute('aria-hidden', ariaHidden);
    app.initialize();
    const opener = app.elements.get('installSpiralBtn');
    if (!inert) opener.focus();
    app.api.open();
    app.api.open(); // Reopening an active guide must retain its original focus and accessibility state.
    assert.equal('open' in dialog, false);
    assert.equal(dialog.hasAttribute('open'), true);
    assert.equal(dialog.getAttribute('role'), 'dialog');
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.equal(background.inert, true);
    assert.equal(background.getAttribute('aria-hidden'), 'true');
    assert.equal(visible(app.elements.get('install-backdrop')), true);
    app.elements.get('install-continue-btn').click();
    assert.equal(dialog.hasAttribute('open'), false);
    assert.equal(dialog.hasAttribute('role'), false);
    assert.equal(dialog.hasAttribute('aria-modal'), false);
    assert.equal(background.inert, inert);
    assert.equal(background.getAttribute('aria-hidden'), ariaHidden);
    assert.equal(visible(app.elements.get('install-backdrop')), false);
    if (!inert) assert.equal(app.document.activeElement, opener);
  }
});

test('fallback guides close through their backdrop or Escape even with no dialog.open property', () => {
  const app = fixture({ nativeDialog: false });
  app.initialize();
  const dialog = app.elements.get('install-guide');
  app.api.open();
  app.elements.get('install-backdrop').click();
  assert.equal(dialog.hasAttribute('open'), false);
  app.api.open();
  dialog.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.equal(dialog.hasAttribute('open'), false);
  assert.equal(app.elements.get('app').inert, false);
});

test('native dialogs keep clicks inside their bounds open and close on the backdrop', () => {
  const app = fixture();
  app.initialize();
  app.api.open();
  const dialog = app.elements.get('install-guide');
  dialog.dispatchEvent({ type: 'click', clientX: 200, clientY: 200 });
  assert.equal(dialog.open, true);
  dialog.dispatchEvent({ type: 'click', clientX: 0, clientY: 0 });
  assert.equal(dialog.open, false);
});
