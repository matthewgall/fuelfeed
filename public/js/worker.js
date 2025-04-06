const static = "fuelfeed-v1"
const assets = [
  "/",
  "/index.html",
  "/js/app.js"
]

self.addEventListener("install", installEvent => {
    installEvent.waitUntil(
        caches.open(static).then(cache => {
            cache.addAll(assets)
        })
    )
})

self.addEventListener("fetch", fetchEvent => {
    fetchEvent.respondWith(
        caches.match(fetchEvent.request).then(res => {
            return res || fetch(fetchEvent.request)
        })
    )
})

self.addEventListener("periodicsync", (event) => {
    if (event.tag === "update-prices") {
      event.waitUntil(updateNews());
    }
});

async function registerPeriodicSync() {
    const swRegistration = await navigator.serviceWorker.ready;
    swRegistration.periodicSync.register("update-prices", {
      // try to update every 6 hours
      minInterval: 6 * 60 * 60 * 1000,
    });
  }