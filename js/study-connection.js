// Address handling shared by the optional phone and facilitator connections.
(function (root) {
  'use strict';
  const pageURL = () => new URL(root.location?.href || 'http://localhost/');
  const loopback = hostname => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  function normalize(value) {
    const page = pageURL();
    const url = new URL(String(value || '').trim() || page.origin);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('Enter only the service address, such as https://study.example.org.');
    }
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback(url.hostname) && loopback(page.hostname))) {
      throw new Error('Use an HTTPS service address. A phone cannot connect to the laptop through 127.0.0.1.');
    }
    return url.origin;
  }
  function defaultRelay() { return normalize(root.SPIRAL_STUDY_RELAY_URL || ''); }
  function apiURL(relay, path) {
    const origin = normalize(relay);
    return `${origin === pageURL().origin ? '' : origin}/study-api${path}`;
  }
  root.SpiralStudyConnection = Object.freeze({ normalize, defaultRelay, apiURL,
    pageOrigin: () => pageURL().origin, isLoopback: loopback });
})(window);
