/**
 * Service Worker - placeholder for now
 */

const CACHE_VERSION = "fuelfeed-v5.0";
const STATIC_CACHE = `${CACHE_VERSION}-static`;

self.addEventListener('install', (event: ExtendableEvent) => {
  console.log('Service Worker installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  console.log('Service Worker activating...');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event: FetchEvent) => {
  // Basic fetch handler - will be enhanced later
  event.respondWith(fetch(event.request));
});

export {};