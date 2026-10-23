/* Guitar Freak Service Worker
 * 画面と教材をすべて端末に保存し、オフラインでも開けるようにする。
 * 同期（Google Apps Script への送信）は扱わない（store.js が送信待ちとして保存する）。
 */
var VERSION = 'gf-v1';
var FILES = ['./', './index.html', './style.css', './js/curriculum.js', './js/diagrams.js', './js/audio.js', './js/store.js', './js/app.js',
  './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// 同じサイトのファイル：保存版をすぐ返し、裏で最新版を取りにいく（次に開いた時に反映）
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSION).then(function (cache) {
    return cache.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});
