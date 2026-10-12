import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function fixture() {
  const elements = new Map();
  const layers = [];
  const listeners = new Map();
  const frames = new Map();
  let frameId = 0;
  const doc = { body: {}, activeElement: null,
    getElementById: id => elements.get(id), querySelectorAll: () => layers };
  const context = vm.createContext({ SpiralCalendar: class {}, document: doc,
    window: { getComputedStyle: element => element.style,
      addEventListener: (name, fn) => listeners.set(name, fn), innerHeight: 900 },
    setTimeout: fn => fn(), performance: { now: () => 0 },
    requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame: id => frames.delete(id) });
  vm.runInContext(fs.readFileSync(new URL('../js/ui-handlers.js', import.meta.url), 'utf8'), context);
  const app = new context.SpiralCalendar();
  Object.assign(app, { state: { detailViewDay: null, rotation: 0 }, draws: 0, closedDetails: 0,
    timeDisplayState: { pullUpOffset: 0 }, canvas: { clientHeight: 900 },
    drawSpiral() { this.draws++; }, closeDetailView() { this.closedDetails++; this.state.detailViewDay = null; },
    resetAutoActivatedSettings() {}, hideBottomEventList() { this.listHidden = true; },
    getEventListMaxHeight: () => 300, showBottomEventList() { this.listShown = true; },
    resetToCurrentTimeFromTap() { this.now = true; } });
  function element(id, visible = true, zIndex = '0') {
    const result = { visible, style: { zIndex }, isConnected: true,
      getClientRects() { return this.visible && this.isConnected ? [{}] : []; },
      setAttribute() { layers.push(this); }, contains: target => target === result,
      focus() { doc.activeElement = this; },
      click() { this.clicked = true; }, scrollIntoView() { this.scrolled = true; } };
    if (id) elements.set(id, result);
    return result;
  }
  function key(key, options = {}) {
    const event = { key, target: {}, preventDefault() { this.defaultPrevented = true; }, ...options };
    app.handleKeyboardShortcut(event);
    return event;
  }
  function frame(now) {
    const [id, callback] = frames.entries().next().value;
    frames.delete(id);
    callback(now);
  }
  return { app, doc, element, key, listeners, frame };
}

test('Escape closes panels even when an input, select, or button has focus', () => {
  for (const panelId of ['settingsPanel', 'eventInputPanel']) {
    for (const tag of ['input', 'select', 'button']) {
      const { app, element, key } = fixture();
      const panel = element(panelId);
      const close = element(panelId === 'settingsPanel' ? 'closeSettingsPanelBtn' : 'closeEventPanelBtn');
      close.click = () => { panel.visible = false; };
      app.state.detailViewDay = 1;
      const event = key('Escape', { target: { tagName: tag, closest: () => ({}) } });
      assert.equal(panel.visible, false);
      assert.equal(app.closedDetails, 0);
      assert.equal(event.defaultPrevented, true);
    }
  }
});

test('Escape dismisses only the highest visible popup before its underlying panel', () => {
  const { app, element, key } = fixture();
  const panel = element('eventInputPanel');
  element('closeEventPanelBtn').click = () => { panel.visible = false; };
  const low = element(null, true, '1000');
  const high = element(null, true, '10000');
  const hidden = element(null, false, '20000');
  for (const layer of [low, high, hidden]) app.registerKeyboardDismissal(layer, () => { layer.isConnected = false; });
  key('Escape');
  assert.equal(high.isConnected, false);
  assert.equal(low.isConnected, true);
  assert.equal(hidden.isConnected, true);
  assert.equal(panel.visible, true);
  key('Escape');
  assert.equal(low.isConnected, false);
  assert.equal(panel.visible, true);
  key('Escape');
  assert.equal(panel.visible, false);
});

test('the most recently appended popup wins when layers have the same height', () => {
  const { app, element, key } = fixture();
  const first = element(null, true, '1000'), second = element(null, true, '1000');
  for (const layer of [first, second]) app.registerKeyboardDismissal(layer, () => { layer.isConnected = false; });
  key('Escape');
  assert.equal(first.isConnected, true);
  assert.equal(second.isConnected, false);
});

test('Escape already consumed by text cancel or search clear leaves the view open', () => {
  const { app, element, key } = fixture();
  element('settingsPanel');
  const close = element('closeSettingsPanelBtn');
  app.state.detailViewDay = 1;
  key('Escape', { defaultPrevented: true });
  assert.equal(close.clicked, undefined);
  assert.equal(app.closedDetails, 0);
});

test('held Escape and composition keys never dismiss successive layers', () => {
  const { element, key } = fixture();
  element('settingsPanel');
  const close = element('closeSettingsPanelBtn');
  key('Escape', { repeat: true });
  key('Escape', { isComposing: true });
  assert.equal(close.clicked, undefined);
});

test('Escape closes the event list before closing the selected event', () => {
  const { app, key } = fixture();
  app.timeDisplayState.pullUpOffset = 200;
  app.state.detailViewDay = 1;
  key('Escape');
  assert.equal(app.listHidden, true);
  assert.equal(app.closedDetails, 0);
  key('Escape');
  assert.equal(app.closedDetails, 1);
});

test('canceling a popup restores focus to the connected control that opened it', () => {
  const { app, doc, element, key } = fixture();
  const opener = element();
  opener.focus();
  const popup = element();
  app.registerKeyboardDismissal(popup, () => { popup.isConnected = false; doc.activeElement = doc.body; });
  popup.focus();
  key('Escape');
  assert.equal(doc.activeElement, opener);
});

test('S opens Settings and question mark opens its expanded shortcut guide', () => {
  const { element, key } = fixture();
  const panel = element('settingsPanel', false), button = element('settingsPanelBtn');
  const help = element('keyboardShortcutsHelp');
  button.click = () => { button.clicks = (button.clicks || 0) + 1; panel.visible = !panel.visible; };
  assert.equal(key('s').defaultPrevented, true);
  assert.equal(panel.visible, true);
  key('?');
  assert.equal(button.clicks, 1);
  assert.equal(help.open, true);
  assert.equal(help.scrolled, true);
  panel.visible = false;
  key('?');
  assert.equal(panel.visible, true);
});

test('Left and Right cycle a selected event and never rotate the calendar', () => {
  const { app, key } = fixture();
  const directions = [];
  app.cycleDetailViewEvent = direction => { directions.push(direction); return true; };
  key('ArrowRight');
  assert.deepEqual(directions, []);
  app.state.detailViewDay = 1;
  assert.equal(key('ArrowLeft').defaultPrevented, true);
  assert.equal(key('ArrowRight').defaultPrevented, true);
  assert.deepEqual(directions, [-1, 1]);
  assert.equal(app.draws, 2);
});

test('form controls, modifiers, composition, and popups keep their own shortcuts', () => {
  const { app, element, key } = fixture();
  const button = element('settingsPanelBtn');
  for (const options of [{ ctrlKey: true }, { metaKey: true }, { altKey: true },
    { isComposing: true }, { repeat: true }, { target: { closest: () => ({}) } },
    { target: { isContentEditable: true } }]) {
    assert.equal(key('s', options).defaultPrevented, undefined);
    assert.equal(button.clicked, undefined);
  }
  const popup = element();
  app.registerKeyboardDismissal(popup, () => {});
  key('s');
  assert.equal(button.clicked, undefined);
});

test('navigation does not intercept Ctrl/Command shortcuts or keys behind a popup', () => {
  const { app, listeners, element } = fixture();
  app.startKeyboardLoop = () => { throw new Error('Must not start navigation'); };
  app.setupKeyboardNavigation();
  const navigation = listeners.get('keydown');
  for (const options of [{ ctrlKey: true }, { metaKey: true }, { isComposing: true }]) {
    navigation({ key: 'a', target: {}, ...options });
    assert.equal(app.keyboardState.keys.a, undefined);
  }
  app.registerKeyboardDismissal(element(), () => {});
  navigation({ key: 'ArrowLeft', target: {} });
  assert.equal(app.keyboardState.keys.arrowleft, undefined);
});

test('search finishes a closing transition before expanding and focusing the event list', () => {
  const { app, element, key, doc } = fixture();
  const search = element('eventListSearchBottom');
  search.id = 'eventListSearchBottom';
  app.completeModeTransitionImmediately = () => { app.timeDisplayState.pullUpOffset = 0; };
  key('f');
  assert.equal(app.timeDisplayState.pullUpOffset, 300);
  assert.equal(doc.activeElement, search);
});

test('Escape cancels an opening detail transition before it can reactivate the view', () => {
  const { app, key } = fixture();
  app.isDetailViewOpeningTransitionActive = () => true;
  app.completeModeTransitionImmediately = () => { app.state.detailViewDay = 1; };
  key('Escape');
  assert.equal(app.closedDetails, 1);
  assert.equal(app.state.detailViewDay, null);
});

test('search focuses the current field when showing the list replaces its header', () => {
  const { app, element, key, doc } = fixture();
  const oldSearch = element('eventListSearchBottom');
  oldSearch.id = 'eventListSearchBottom';
  let replacement;
  app.showBottomEventList = () => {
    oldSearch.isConnected = false;
    replacement = element('eventListSearchBottom');
    replacement.id = 'eventListSearchBottom';
  };
  key('f');
  assert.equal(doc.activeElement, replacement);
});

test('shortcut help works when a keyboard layout requires AltGr or Option', () => {
  const { element, key } = fixture();
  const help = element('keyboardShortcutsHelp');
  element('settingsPanel');
  key('?', { ctrlKey: true, altKey: true, getModifierState: name => name === 'AltGraph' });
  assert.equal(help.open, true);
  help.open = false;
  key('?', { altKey: true });
  assert.equal(help.open, true);
});

test('S opens Settings without starting the old backward navigation action', () => {
  const { app, element, key, listeners } = fixture();
  const settings = element('settingsPanelBtn');
  app.setupKeyboardNavigation();
  const event = key('s');
  listeners.get('keydown')(event);
  assert.equal(settings.clicked, true);
  assert.equal(app.keyboardState.keys.s, undefined);
  assert.equal(app.state.rotation, 0);
  listeners.get('keydown')({ key: 's', target: {} });
  assert.equal(app.keyboardState.keys.s, undefined);
});

test('single-event views reserve Left/Right and held arrows cycle rather than rotate', () => {
  const { app, key, listeners } = fixture();
  app.setupKeyboardNavigation();
  app.state.detailViewDay = 1;
  app.cycleDetailViewEvent = () => false;
  for (const name of ['ArrowLeft', 'ArrowRight']) {
    const event = key(name);
    listeners.get('keydown')(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(app.keyboardState.keys[name.toLowerCase()], undefined);
  }
  const directions = [];
  app.cycleDetailViewEvent = direction => { directions.push(direction); return true; };
  const held = key('ArrowRight', { repeat: true });
  listeners.get('keydown')(held);
  assert.deepEqual(directions, [1]);
  assert.equal(app.state.rotation, 0);
});

test('Left/Right rotate when closed, stop rotating when details open, and Down still steps days', () => {
  const { app, key, listeners, frame } = fixture();
  app.setupKeyboardNavigation();
  listeners.get('keydown')(key('ArrowRight'));
  frame(100); frame(200);
  const rotation = app.state.rotation;
  assert.ok(rotation > 0);
  app.state.detailViewDay = 1;
  frame(300);
  assert.equal(app.state.rotation, rotation); // A key held before opening also respects the context.
  listeners.get('keydown')(key('ArrowDown'));
  frame(400);
  assert.equal(app.state.rotation, rotation - 2 * Math.PI);
});

test('Left/Right can select during the opening transition without starting navigation', () => {
  const { app, key, listeners } = fixture();
  app.setupKeyboardNavigation();
  app.isDetailViewOpeningTransitionActive = () => true;
  app.completeModeTransitionImmediately = () => { app.state.detailViewDay = 1; };
  let direction;
  app.cycleDetailViewEvent = value => { direction = value; return true; };
  const event = key('ArrowLeft');
  listeners.get('keydown')(event);
  assert.equal(direction, -1);
  assert.equal(app.keyboardState.keys.arrowleft, undefined);
});

test('comma, brackets, and slash no longer act as shortcut aliases', () => {
  const { app, element, key, doc } = fixture();
  const settings = element('settingsPanelBtn');
  const search = element('eventListSearchBottom');
  search.id = 'eventListSearchBottom';
  app.state.detailViewDay = 1;
  app.cycleDetailViewEvent = () => { throw new Error('Removed aliases must not cycle'); };
  for (const name of [',', '[', ']', '/']) assert.equal(key(name).defaultPrevented, undefined);
  assert.equal(settings.clicked, undefined);
  assert.equal(doc.activeElement, null);
  assert.equal(key('F').defaultPrevented, true);
  assert.equal(doc.activeElement, search);
});
