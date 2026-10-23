// One installation flow for the banner, Settings, and shared installation links.
(function (global) {
  'use strict';

  const DISMISS_KEY = 'a2hsDismissed';
  const REMINDER_DELAY = 7 * 24 * 60 * 60 * 1000;
  const state = { ready: false, prompt: null, installing: false, installedHere: false,
    requestedOpen: false, platform: 'auto', feedback: '', previousFocus: null, dismissedAt: 0, qrUrl: '', qrExpanded: false,
    fallback: false, previousInert: false, previousAriaHidden: null };
  let elements;

  function isStandaloneDisplayMode() {
    return !!(global.navigator.standalone ||
      ['standalone', 'fullscreen', 'minimal-ui'].some(mode => global.matchMedia?.(`(display-mode: ${mode})`).matches));
  }

  function getEnvironment() {
    const nav = global.navigator;
    const ua = nav.userAgent || '';
    const ios = /iPhone|iPad|iPod/i.test(ua) ||
      (/Mac/i.test(nav.platform || ua) && nav.maxTouchPoints > 1);
    const platform = ios ? 'ios' : /Android/i.test(ua) ? 'android' : 'desktop';
    let browser = 'other';
    if (/Edg(?:e|A|iOS)?\//i.test(ua)) browser = 'edge';
    else if (/SamsungBrowser\//i.test(ua)) browser = 'samsung';
    else if (/Firefox\/|FxiOS\//i.test(ua)) browser = 'firefox';
    else if (/Chrome\/|CriOS\//i.test(ua)) browser = 'chrome';
    else if (/Safari\//i.test(ua)) browser = 'safari';
    // Only explicit embedded-browser signatures: other iOS browsers can install too.
    const inApp = /FBAN|FBAV|Instagram|MicroMessenger|Snapchat|TikTok|BytedanceWebview|\bLine\/|\bGSA\/|; wv\)/i.test(ua);
    return { platform, browser, inApp, standalone: isStandaloneDisplayMode() };
  }

  function getInstallUrl() {
    return new URL('install.html', global.location.href).href;
  }

  function isDismissed() {
    let dismissedAt = state.dismissedAt;
    try { dismissedAt = Math.max(dismissedAt, Number(global.localStorage.getItem(DISMISS_KEY)) || 0); } catch (_) {}
    const age = Date.now() - dismissedAt;
    return dismissedAt > 0 && age >= 0 && age < REMINDER_DELAY;
  }

  function dismissReminder() {
    state.dismissedAt = Date.now();
    try { global.localStorage.setItem(DISMISS_KEY, String(state.dismissedAt)); } catch (_) {}
  }

  function getCalendar() {
    try { return typeof spiralCalendar === 'undefined' ? null : spiralCalendar; } catch (_) { return null; }
  }

  function isOpen() {
    return !!(elements?.dialog.open || elements?.dialog.hasAttribute('open'));
  }

  function renderBanner() {
    if (!state.ready) return;
    const env = getEnvironment();
    elements.banner.hidden = isOpen() || env.standalone || state.installedHere || isDismissed() ||
      (env.platform === 'desktop' && !state.prompt);
  }

  function stepsFor(platform, browser, inApp) {
    if (inApp) {
      const target = platform === 'ios' ? 'Safari' : 'Chrome';
      return [['menu', `Open in ${target}`, `Use this app\u2019s menu, or copy the link below and paste it into ${target}.`]];
    }
    if (platform === 'ios') {
      const chrome = browser === 'chrome' || browser === 'edge' || browser === 'firefox';
      return [
        ['share', 'Tap Share', chrome ? 'In your browser\u2019s menu.' : 'In Safari, open the Page Menu first if needed.'],
        ['home', 'Choose Add to Home Screen', chrome ? 'If missing, open this link in Safari.' : ''],
        ['check', 'Tap Add', 'Keep Open as Web App on, if shown.']
      ];
    }
    if (platform === 'android') {
      const menu = browser === 'samsung' ? 'Open Samsung Internet\u2019s menu'
        : browser === 'firefox' ? 'Open Firefox\u2019s menu' : 'Open the three-dot menu';
      const action = browser === 'samsung' ? 'Add page to \u2192 Home screen'
        : browser === 'firefox' ? 'Choose Install or Add to Home screen' : 'Choose Install app or Add to Home screen';
      return [
        ['menu', menu, ''],
        ['home', action, ['chrome', 'samsung', 'firefox'].includes(browser) ? '' : 'If missing, open this link in Chrome.'],
        ['check', 'Confirm, then open Spiral', '']
      ];
    }
    return [['menu', 'Install on this computer', browser === 'safari'
      ? 'In Safari on Mac, choose Add to Dock.' : 'Look for Install in your browser\u2019s menu.']];
  }

  const icons = {
    share: '<path d="M12 16V3m-4 4 4-4 4 4M7 11H4v10h16V11h-3"/>',
    home: '<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',
    menu: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
    check: '<path d="m5 12 4 4L19 6"/>'
  };

  function renderSteps(platform, browser, inApp) {
    elements.steps.replaceChildren();
    for (const [icon, title, description] of stepsFor(platform, browser, inApp)) {
      const item = document.createElement('li');
      const picture = document.createElement('span');
      picture.className = 'install-step-icon';
      picture.setAttribute('aria-hidden', 'true');
      picture.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[icon]}</svg>`;
      const content = document.createElement('div');
      const heading = document.createElement('strong');
      heading.textContent = title;
      content.append(heading);
      if (description) {
        const text = document.createElement('p');
        text.textContent = description;
        content.append(text);
      }
      item.append(picture, content);
      elements.steps.append(item);
    }
  }

  function render() {
    if (!state.ready) return;
    const env = getEnvironment();
    const platform = state.platform === 'auto' ? env.platform : state.platform;
    const browser = platform === env.platform ? env.browser : 'other';
    const inApp = platform === env.platform && env.inApp;
    const alreadyOpen = env.standalone || state.installedHere;
    const nativeAvailable = !alreadyOpen && platform === env.platform && !!(state.prompt || state.installing);
    elements.entry.textContent = env.standalone ? 'Share Spiral' : 'Install Spiral';
    elements.title.textContent = env.standalone ? 'Share Spiral' : 'Install Spiral';
    elements.platform.hidden = alreadyOpen;
    elements.steps.hidden = alreadyOpen || nativeAvailable;
    elements.native.hidden = !nativeAvailable;
    elements.native.disabled = state.installing;
    elements.native.textContent = state.installing ? 'Opening installer\u2026' : 'Install Spiral';
    elements.native.setAttribute('aria-busy', String(state.installing));
    elements.platformAuto.textContent = { ios: 'iPhone / iPad', android: 'Android', desktop: 'Computer' }[env.platform] + ' (detected)';
    elements.status.textContent = env.standalone ? 'Share this link to install Spiral on another device.'
      : state.installedHere ? 'Spiral is installed. Open it from your Home Screen.' : state.feedback;
    elements.status.hidden = !elements.status.textContent;
    renderSteps(platform, browser, inApp);
    elements.link.value = getInstallUrl();
    elements.share.hidden = typeof global.navigator.share !== 'function';
    if (isOpen() && state.qrUrl !== getInstallUrl()) {
      try {
        elements.qr.innerHTML = global.SpiralInstallQR.toSvg(getInstallUrl());
        state.qrUrl = getInstallUrl();
      } catch (_) {
        elements.qrSection.hidden = true;
      }
    }
    const showQr = platform === 'desktop' || env.standalone || state.qrExpanded;
    elements.qrSection.hidden = !showQr || state.qrUrl !== getInstallUrl();
    elements.qrToggle.hidden = platform === 'desktop' || env.standalone || state.qrUrl !== getInstallUrl();
    elements.qrToggle.textContent = state.qrExpanded ? 'Hide QR code' : 'Show QR code';
    elements.qrToggle.setAttribute('aria-expanded', String(!elements.qrSection.hidden));
    renderBanner();
  }

  function open() {
    state.requestedOpen = true;
    if (!state.ready) return false;
    state.feedback = '';
    if (!isOpen()) {
      state.previousFocus = document.activeElement;
      if (typeof elements.dialog.showModal === 'function') elements.dialog.showModal();
      else {
        state.fallback = true;
        state.previousInert = elements.app.inert;
        state.previousAriaHidden = elements.app.getAttribute('aria-hidden');
        elements.app.inert = true;
        elements.app.setAttribute('aria-hidden', 'true');
        elements.backdrop.hidden = false;
        elements.dialog.setAttribute('open', '');
        elements.dialog.setAttribute('role', 'dialog');
        elements.dialog.setAttribute('aria-modal', 'true');
      }
    }
    const calendar = getCalendar();
    if (calendar?.keyboardState) {
      calendar.keyboardState.keys = {};
      calendar.stopKeyboardLoop();
    }
    render();
    elements.title.focus({ preventScroll: true });
    return true;
  }

  function close() {
    state.requestedOpen = false;
    if (!state.ready || !isOpen()) return;
    dismissReminder();
    if (state.fallback) {
      elements.dialog.removeAttribute('open');
      elements.dialog.removeAttribute('role');
      elements.dialog.removeAttribute('aria-modal');
      elements.backdrop.hidden = true;
      elements.app.inert = state.previousInert;
      if (state.previousAriaHidden === null) elements.app.removeAttribute('aria-hidden');
      else elements.app.setAttribute('aria-hidden', state.previousAriaHidden);
      state.fallback = false;
    } else elements.dialog.close();
    renderBanner();
    const target = state.previousFocus;
    if (target?.isConnected && target.getClientRects().length) target.focus({ preventScroll: true });
  }

  async function install() {
    if (!state.prompt || state.installing || getEnvironment().standalone) return false;
    const prompt = state.prompt;
    state.prompt = null; // A browser-provided prompt can only be used once.
    state.installing = true;
    state.feedback = '';
    render();
    let accepted = false;
    try {
      await prompt.prompt();
      accepted = (await prompt.userChoice)?.outcome === 'accepted';
      if (!state.prompt && !state.installedHere) state.feedback = accepted
        ? 'Installation requested. Open Spiral when its icon appears.' : '';
    } catch (_) {
      if (!state.prompt) state.feedback = 'Could not open the installer. Use the steps below.';
    } finally {
      state.installing = false;
      render();
    }
    return accepted;
  }

  async function copyLink() {
    let copied = false;
    try {
      if (global.navigator.clipboard?.writeText) {
        await global.navigator.clipboard.writeText(getInstallUrl());
        copied = true;
      }
    } catch (_) {}
    if (!copied) {
      elements.link.focus();
      elements.link.select();
      try { copied = !!document.execCommand?.('copy'); } catch (_) {}
    }
    elements.linkStatus.textContent = copied ? 'Link copied.' : 'Select and copy the link above.';
  }

  async function shareLink() {
    try {
      await global.navigator.share({ title: 'Install Spiral', text: 'Add Spiral to your Home Screen.', url: getInstallUrl() });
    } catch (error) {
      if (error?.name !== 'AbortError') {
        elements.linkStatus.textContent = 'Copy the link above to share it.';
        elements.link.focus();
        elements.link.select();
      }
    }
  }

  function initialize() {
    if (state.ready) return;
    const ids = { dialog: 'install-guide', app: 'app', backdrop: 'install-backdrop', title: 'install-title', platformAuto: 'install-platform-auto',
      status: 'install-status', platform: 'install-platform', steps: 'install-steps', native: 'install-native-btn',
      link: 'install-link', copy: 'install-copy-btn', share: 'install-share-btn', linkStatus: 'install-link-status',
      qr: 'install-qr', qrSection: 'install-qr-section', qrToggle: 'install-qr-toggle', banner: 'a2hs-banner', entry: 'installSpiralBtn' };
    elements = Object.fromEntries(Object.entries(ids).map(([name, id]) => [name, document.getElementById(id)]));
    if (Object.values(elements).some(element => !element)) return;
    state.ready = true;
    elements.entry.addEventListener('click', open);
    document.getElementById('a2hs-install-btn').addEventListener('click', open);
    document.getElementById('a2hs-close-btn').addEventListener('click', () => { dismissReminder(); renderBanner(); });
    document.getElementById('install-close-btn').addEventListener('click', close);
    document.getElementById('install-continue-btn').addEventListener('click', close);
    elements.native.addEventListener('click', install);
    elements.copy.addEventListener('click', copyLink);
    elements.share.addEventListener('click', shareLink);
    elements.qrToggle.addEventListener('click', () => { state.qrExpanded = !state.qrExpanded; render(); });
    elements.platform.addEventListener('change', () => { state.platform = elements.platform.value; state.feedback = ''; render(); });
    elements.dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    elements.backdrop.addEventListener('click', close);
    elements.dialog.addEventListener('click', event => {
      if (event.target !== elements.dialog) return;
      const rect = elements.dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    });
    elements.dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      else if (event.key === 'Tab') {
        const focusable = [...elements.dialog.querySelectorAll('button, input, select, a[href]')]
          .filter(element => !element.disabled && element.getClientRects().length);
        const first = focusable[0], last = focusable.at(-1);
        if (first && (event.shiftKey ? document.activeElement === first || document.activeElement === elements.title
          : document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    });
    elements.dialog.setAttribute('data-keyboard-dismiss', '');
    elements.dialog._dismissKeyboardLayer = close;
    const url = new URL(global.location.href);
    const requested = url.searchParams.get('install') === '1';
    if (requested) {
      url.searchParams.delete('install');
      global.history.replaceState(global.history.state, '', url.pathname + url.search + url.hash);
    }
    render();
    if ((requested || state.requestedOpen) && !getEnvironment().standalone) open();
    global.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', render);
  }

  // Capture capability events immediately, independent of banner cooldown or DOM readiness.
  global.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    state.prompt = event;
    state.feedback = '';
    render();
  });
  global.addEventListener('appinstalled', () => {
    state.prompt = null;
    state.installedHere = true;
    state.feedback = '';
    render();
  });
  global.SpiralInstall = Object.freeze({ initialize, open, close, install, getEnvironment, getInstallUrl });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})(window);
