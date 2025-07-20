// Enhanced Service Worker for FuelFeed
// Version with comprehensive offline data caching

const CACHE_VERSION = "fuelfeed-v3.0";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const FUEL_DATA_CACHE = `${CACHE_VERSION}-fuel-data`;
const MAP_TILES_CACHE = `${CACHE_VERSION}-map-tiles`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Cache durations (in milliseconds)
const CACHE_DURATIONS = {
    STATIC: 7 * 24 * 60 * 60 * 1000,    // 7 days
    FUEL_DATA: 6 * 60 * 60 * 1000,      // 6 hours
    MAP_TILES: 30 * 24 * 60 * 60 * 1000, // 30 days
    API_RESPONSES: 2 * 60 * 60 * 1000    // 2 hours
};

// Static assets to cache on install
const STATIC_ASSETS = [
    "/",
    "/index.html",
    "/js/app.js",
    "/js/station-cache.js",
    "/js/worker.js",
    "/favicon.ico",
    "/icons/android-chrome-192x192.png",
    "/icons/android-chrome-512x512.png",
    "/icons/apple-touch-icon.png",
    "/site.webmanifest"
];

// API endpoints that should be cached for offline use
const CACHEABLE_API_PATTERNS = [
    /\/api\/data\.json/,
    /\/api\/data\.mapbox/
];

// MapTiler domains for tile caching
const MAP_TILE_PATTERNS = [
    /https:\/\/api\.maptiler\.com\/maps/,
    /https:\/\/api\.maptiler\.com\/tiles/,
    /https:\/\/cdn\.maptiler\.com/
];

/**
 * Enhanced cache management with metadata
 */
class CacheManager {
    static async addToCache(cacheName, request, response, maxAge = null) {
        try {
            const cache = await caches.open(cacheName);
            
            // Clone response and add timestamp metadata
            const responseClone = response.clone();
            const responseWithMetadata = new Response(responseClone.body, {
                status: responseClone.status,
                statusText: responseClone.statusText,
                headers: {
                    ...Object.fromEntries(responseClone.headers.entries()),
                    'sw-cached-at': Date.now().toString(),
                    'sw-max-age': maxAge ? maxAge.toString() : ''
                }
            });
            
            await cache.put(request, responseWithMetadata);
            console.log(`[SW] Cached: ${request.url}`);
        } catch (error) {
            console.error(`[SW] Cache error for ${request.url}:`, error);
        }
    }
    
    static async isStale(cachedResponse, maxAge) {
        if (!cachedResponse || !maxAge) return false;
        
        const cachedAt = cachedResponse.headers.get('sw-cached-at');
        if (!cachedAt) return true;
        
        const age = Date.now() - parseInt(cachedAt);
        return age > maxAge;
    }
    
    static async cleanExpiredCache(cacheName, maxAge) {
        try {
            const cache = await caches.open(cacheName);
            const requests = await cache.keys();
            
            for (const request of requests) {
                const response = await cache.match(request);
                if (response && await this.isStale(response, maxAge)) {
                    await cache.delete(request);
                    console.log(`[SW] Expired cache removed: ${request.url}`);
                }
            }
        } catch (error) {
            console.error(`[SW] Cache cleanup error:`, error);
        }
    }
}

/**
 * Offline fuel data manager
 */
class OfflineFuelData {
    static async cacheFuelData(request, response) {
        // Cache fuel data with special handling for geographic queries
        const url = new URL(request.url);
        const bbox = url.searchParams.get('bbox');
        
        if (bbox) {
            // Store geographic-specific data
            const geoKey = `fuel-data-${bbox}`;
            await CacheManager.addToCache(FUEL_DATA_CACHE, 
                new Request(geoKey), response, CACHE_DURATIONS.FUEL_DATA);
        } else {
            // Store full dataset
            await CacheManager.addToCache(FUEL_DATA_CACHE, 
                request, response, CACHE_DURATIONS.FUEL_DATA);
        }
    }
    
    static async getOfflineFuelData(request) {
        const cache = await caches.open(FUEL_DATA_CACHE);
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse && !await CacheManager.isStale(cachedResponse, CACHE_DURATIONS.FUEL_DATA)) {
            console.log(`[SW] Serving cached fuel data: ${request.url}`);
            return cachedResponse;
        }
        
        // Try to find regional data if specific bbox request fails
        const url = new URL(request.url);
        if (url.searchParams.get('bbox')) {
            const allRequests = await cache.keys();
            for (const req of allRequests) {
                const response = await cache.match(req);
                if (response && !await CacheManager.isStale(response, CACHE_DURATIONS.FUEL_DATA)) {
                    console.log(`[SW] Serving regional fuel data offline`);
                    return response;
                }
            }
        }
        
        return null;
    }
}

// Install event - cache static assets
self.addEventListener("install", event => {
    console.log(`[SW] Installing service worker ${CACHE_VERSION}`);
    
    event.waitUntil(
        (async () => {
            try {
                const staticCache = await caches.open(STATIC_CACHE);
                await staticCache.addAll(STATIC_ASSETS);
                console.log(`[SW] Static assets cached`);
                
                // Immediately activate new service worker
                await self.skipWaiting();
            } catch (error) {
                console.error(`[SW] Install error:`, error);
            }
        })()
    );
});

// Activate event - cleanup old caches
self.addEventListener("activate", event => {
    console.log(`[SW] Activating service worker ${CACHE_VERSION}`);
    
    event.waitUntil(
        (async () => {
            try {
                // Take control of all pages immediately
                await self.clients.claim();
                
                // Delete old caches
                const cacheNames = await caches.keys();
                await Promise.all(
                    cacheNames
                        .filter(name => name.startsWith('fuelfeed-') && !name.includes(CACHE_VERSION))
                        .map(name => {
                            console.log(`[SW] Deleting old cache: ${name}`);
                            return caches.delete(name);
                        })
                );
                
                // Schedule cache cleanup
                setTimeout(() => {
                    CacheManager.cleanExpiredCache(FUEL_DATA_CACHE, CACHE_DURATIONS.FUEL_DATA);
                    CacheManager.cleanExpiredCache(MAP_TILES_CACHE, CACHE_DURATIONS.MAP_TILES);
                    CacheManager.cleanExpiredCache(API_CACHE, CACHE_DURATIONS.API_RESPONSES);
                }, 5000);
                
                console.log(`[SW] Service worker activated successfully`);
            } catch (error) {
                console.error(`[SW] Activation error:`, error);
            }
        })()
    );
});

// Fetch event - intelligent request handling
self.addEventListener("fetch", event => {
    const request = event.request;
    const url = new URL(request.url);
    
    // Skip non-HTTP requests
    if (!request.url.startsWith('http')) return;
    
    event.respondWith(
        (async () => {
            try {
                // 1. Static assets - cache first
                if (STATIC_ASSETS.some(asset => url.pathname === asset || url.pathname.endsWith(asset))) {
                    const cached = await caches.match(request, { cacheName: STATIC_CACHE });
                    if (cached) {
                        console.log(`[SW] Static cache hit: ${request.url}`);
                        return cached;
                    }
                }
                
                // 2. Fuel data API - network first with offline fallback
                if (CACHEABLE_API_PATTERNS.some(pattern => pattern.test(request.url))) {
                    try {
                        const networkResponse = await fetch(request);
                        if (networkResponse.ok) {
                            // Cache successful response
                            await OfflineFuelData.cacheFuelData(request, networkResponse.clone());
                            console.log(`[SW] Fresh fuel data served: ${request.url}`);
                            return networkResponse;
                        }
                    } catch (networkError) {
                        console.log(`[SW] Network failed, trying offline data: ${request.url}`);
                    }
                    
                    // Fallback to cached data
                    const offlineData = await OfflineFuelData.getOfflineFuelData(request);
                    if (offlineData) {
                        // Add offline header
                        const offlineResponse = new Response(offlineData.body, {
                            status: offlineData.status,
                            statusText: offlineData.statusText,
                            headers: {
                                ...Object.fromEntries(offlineData.headers.entries()),
                                'X-Served-By': 'ServiceWorker-Offline'
                            }
                        });
                        return offlineResponse;
                    }
                }
                
                // 3. Map tiles - cache first with long TTL
                if (MAP_TILE_PATTERNS.some(pattern => pattern.test(request.url))) {
                    const cached = await caches.match(request, { cacheName: MAP_TILES_CACHE });
                    if (cached && !await CacheManager.isStale(cached, CACHE_DURATIONS.MAP_TILES)) {
                        return cached;
                    }
                    
                    try {
                        const networkResponse = await fetch(request);
                        if (networkResponse.ok) {
                            await CacheManager.addToCache(MAP_TILES_CACHE, request, 
                                networkResponse.clone(), CACHE_DURATIONS.MAP_TILES);
                        }
                        return networkResponse;
                    } catch (error) {
                        if (cached) {
                            console.log(`[SW] Serving stale map tile: ${request.url}`);
                            return cached;
                        }
                    }
                }
                
                // 4. Other API requests - network first with short cache
                if (url.pathname.startsWith('/api/')) {
                    try {
                        const networkResponse = await fetch(request);
                        if (networkResponse.ok) {
                            await CacheManager.addToCache(API_CACHE, request, 
                                networkResponse.clone(), CACHE_DURATIONS.API_RESPONSES);
                        }
                        return networkResponse;
                    } catch (error) {
                        const cached = await caches.match(request, { cacheName: API_CACHE });
                        if (cached) {
                            console.log(`[SW] Offline API response: ${request.url}`);
                            return cached;
                        }
                    }
                }
                
                // 5. Everything else - network first
                return await fetch(request);
                
            } catch (error) {
                console.error(`[SW] Fetch error for ${request.url}:`, error);
                
                // Ultimate fallback for navigation requests
                if (request.mode === 'navigate') {
                    const cached = await caches.match('/index.html', { cacheName: STATIC_CACHE });
                    if (cached) return cached;
                }
                
                throw error;
            }
        })()
    );
});

// Background sync for fuel data updates
self.addEventListener("sync", event => {
    if (event.tag === "fuel-data-sync") {
        event.waitUntil(updateFuelDataInBackground());
    }
});

// Periodic background sync (when supported)
self.addEventListener("periodicsync", event => {
    if (event.tag === "update-fuel-prices") {
        event.waitUntil(updateFuelDataInBackground());
    }
});

// Background fuel data update
async function updateFuelDataInBackground() {
    try {
        console.log(`[SW] Background sync: updating fuel data`);
        
        // Update main fuel data
        const mainDataResponse = await fetch('/api/data.json');
        if (mainDataResponse.ok) {
            await CacheManager.addToCache(FUEL_DATA_CACHE, 
                new Request('/api/data.json'), mainDataResponse, CACHE_DURATIONS.FUEL_DATA);
        }
        
        // Update mapbox data
        const mapboxDataResponse = await fetch('/api/data.mapbox');
        if (mapboxDataResponse.ok) {
            await CacheManager.addToCache(FUEL_DATA_CACHE, 
                new Request('/api/data.mapbox'), mapboxDataResponse, CACHE_DURATIONS.FUEL_DATA);
        }
        
        console.log(`[SW] Background fuel data update completed`);
        
        // Notify all clients about data update
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'FUEL_DATA_UPDATED',
                timestamp: Date.now()
            });
        });
        
    } catch (error) {
        console.error(`[SW] Background sync error:`, error);
    }
}

// Message handling for communication with main app
self.addEventListener("message", event => {
    const { type, data } = event.data;
    
    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
            
        case 'GET_CACHE_STATUS':
            getCacheStatus().then(status => {
                event.ports[0]?.postMessage(status);
            });
            break;
            
        case 'CLEAR_FUEL_CACHE':
            caches.delete(FUEL_DATA_CACHE).then(() => {
                event.ports[0]?.postMessage({ success: true });
            });
            break;
            
        case 'FORCE_FUEL_UPDATE':
            updateFuelDataInBackground().then(() => {
                event.ports[0]?.postMessage({ success: true });
            });
            break;
    }
});

// Get comprehensive cache status
async function getCacheStatus() {
    try {
        const [staticCache, fuelCache, mapCache, apiCache] = await Promise.all([
            caches.open(STATIC_CACHE),
            caches.open(FUEL_DATA_CACHE),
            caches.open(MAP_TILES_CACHE),
            caches.open(API_CACHE)
        ]);
        
        const [staticKeys, fuelKeys, mapKeys, apiKeys] = await Promise.all([
            staticCache.keys(),
            fuelCache.keys(),
            mapCache.keys(),
            apiCache.keys()
        ]);
        
        return {
            static: staticKeys.length,
            fuelData: fuelKeys.length,
            mapTiles: mapKeys.length,
            apiResponses: apiKeys.length,
            version: CACHE_VERSION,
            lastUpdated: Date.now()
        };
    } catch (error) {
        console.error(`[SW] Cache status error:`, error);
        return { error: error.message };
    }
}

console.log(`[SW] Service Worker ${CACHE_VERSION} loaded and ready`);