/* Offline support for the hosted/installed web app. Network first, so a reload always picks
   up a new release; the cache is only the fallback when the network is unavailable.
   The asset list is read from index.html at install time, so there is no list to maintain. */
'use strict';
const CACHE = 'smv-shell-v1';
const EXTRA = ['./', 'index.html', 'manifest.webmanifest', 'model-data.json', 'report-usage.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const html = await (await fetch('index.html', { cache: 'reload' })).text();
    const local = [...html.matchAll(/(?:src|href)=["']\.\/([^"']+)["']/g)].map(m => m[1]);
    await Promise.all([...new Set([...EXTRA, ...local])].map(url =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => { })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(caches.open(CACHE).then(async cache => {
      const hit = await cache.match(request);
      const fresh = fetch(request).then(response => { cache.put(request, response.clone()); return response; });
      return hit || fresh;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch (error) {
      const hit = await cache.match(request, { ignoreSearch: false }) ||
        (request.mode === 'navigate' ? await cache.match('index.html') : null);
      if (hit) return hit;
      throw error;
    }
  })());
});
