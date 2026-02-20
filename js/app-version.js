// Shared app version constants for window and service worker contexts.
(function (globalScope) {
  'use strict';

  const APP_VERSION = '1.34';
  const APP_CACHE_PREFIX = 'spiral-v';
  const APP_CACHE_NAME = `${APP_CACHE_PREFIX}${APP_VERSION}`;

  globalScope.APP_VERSION = APP_VERSION;
  globalScope.APP_CACHE_PREFIX = APP_CACHE_PREFIX;
  globalScope.APP_CACHE_NAME = APP_CACHE_NAME;
})(typeof self !== 'undefined' ? self : window);
