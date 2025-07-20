/// <reference path="../worker-configuration.d.ts" />
import { AutoRouter } from 'itty-router'
import Fuel from './fuel'
import { PriceNormalizer } from './price-normalizer'
import { CacheManager } from './cache-manager'
import { CacheInvalidator } from './cache-invalidator'

const router = AutoRouter()
const responseData = {
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
    }
}

// Cache TTL helper function
function getCacheTTL(env: any) {
    return {
        FUEL_DATA: parseInt(env.FUEL_DATA_TTL || '86400'), // 24 hours default
        MAPBOX_DATA: parseInt(env.MAPBOX_DATA_TTL || '43200'), // 12 hours default
        BASE_DATA: parseInt(env.BASE_DATA_TTL || '3600') // 1 hour default
    };
}

async function doSchedule(event:any, env: any) {
    // Smart cache invalidation before update
    const invalidationResult = await CacheInvalidator.smartInvalidation(env, 'scheduled-update');
    console.log(`Cache invalidation: ${invalidationResult.reason} (${invalidationResult.deleted} entries)`);
    
    // Fetch all our data and save it to KV
    let data: any = new Fuel;
    data = await data.getData(env);

    // Store main data
    await env.KV.put('fueldata', JSON.stringify(data))
    
    // Update cache timestamp for smart invalidation
    await env.KV.put('fueldata-updated', Date.now().toString(), { expirationTtl: 86400 });
    
    // Warm cache for popular regions
    const cacheManager = new CacheManager();
    await cacheManager.warmPopularRegions(env, data);
    
    // Clean up stale cache entries
    const cleanupResult = await CacheInvalidator.smartInvalidation(env, 'cleanup');
    console.log(`Cache cleanup: ${cleanupResult.reason} (${cleanupResult.deleted} entries)`);
    
    console.log('Scheduled update completed with cache warming and cleanup');
}

router.get('/api/data.json', async (request, env, context) => {
    const CACHE_TTL = getCacheTTL(env);
    const cacheManager = new CacheManager({
        defaultTtl: CACHE_TTL.FUEL_DATA,
        compressResponse: true,
        enableEdgeCache: true
    });
    
    // Check for cached compressed response first
    const cacheKey = cacheManager.generateCacheKey('json');
    const cachedResponse = await cacheManager.getCachedResponse(cacheKey, env);
    if (cachedResponse) {
        return cachedResponse;
    }
    
    // Check for If-None-Match header for ETag support
    const etag = request.headers.get('If-None-Match');
    const lastUpdated = await env.KV.get('fueldata-updated');
    
    if (etag && lastUpdated && etag === `"${lastUpdated}"`) {
        return new Response(null, { status: 304 });
    }
    
    let data: any = await env.KV.get("fueldata", 'json');
    if (data == null) {
        data = new Fuel;
        data = await data.getData(env);
        await env.KV.put("fueldata", JSON.stringify(data), { expirationTtl: CACHE_TTL.BASE_DATA });
        await env.KV.put('fueldata-updated', Date.now().toString(), { expirationTtl: 86400 });
    }
    
    // Store in compressed cache and return
    await cacheManager.storeResponse(cacheKey, data, env, CACHE_TTL.FUEL_DATA);
    
    const headers = {
        ...responseData.headers,
        ...cacheManager.createCacheHeaders(lastUpdated || Date.now().toString(), CACHE_TTL.FUEL_DATA)
    };
    
    return new Response(JSON.stringify(data), { headers });
})

router.get('/api/data.mapbox', async (request, env, context) => {
    const CACHE_TTL = getCacheTTL(env);
    const cacheManager = new CacheManager({
        defaultTtl: CACHE_TTL.MAPBOX_DATA,
        compressResponse: true,
        enableEdgeCache: true
    });
    
    // Parse bounding box parameters
    const url = new URL(request.url);
    const bbox = url.searchParams.get('bbox');
    let bounds: { west: number, south: number, east: number, north: number } | null = null;

    if (bbox) {
        const coords = bbox.split(',').map(Number);
        if (coords.length === 4 && coords.every(coord => !isNaN(coord))) {
            bounds = {
                west: coords[0],
                south: coords[1], 
                east: coords[2],
                north: coords[3]
            };
        }
    }

    // Try to get cached compressed response first
    const cacheKey = cacheManager.generateCacheKey('mapbox', bounds);
    const cachedResponse = await cacheManager.getCachedResponse(cacheKey, env);
    if (cachedResponse) {
        return cachedResponse;
    }

    // Get source data
    let d: any = await env.KV.get('fueldata', 'json')
    if (d == null) {
        d = new Fuel;
        d = await d.getData(env);
        await env.KV.put("fueldata", JSON.stringify(d), { expirationTtl: CACHE_TTL.BASE_DATA })
    }

    // Stream-optimized filtering with early exit
    const features: any[] = [];
    let stationCount = 0;
    const maxStations = bounds ? 5000 : 10000; // Lower limit for bbox requests
    
    for (let brand of Object.keys(d)) {
        for (let s of Object.keys(d[brand])) {
            if (stationCount >= maxStations) break;
            
            let stn: any = d[brand][s];
            
            // Quick validation and bounds check
            if (!stn.location || typeof stn.location.longitude !== 'number' || typeof stn.location.latitude !== 'number') {
                continue;
            }
            
            const lng = stn.location.longitude;
            const lat = stn.location.latitude;
            
            if (bounds && (lng < bounds.west || lng > bounds.east || lat < bounds.south || lat > bounds.north)) {
                continue;
            }
            
            // Build prices efficiently
            let prices: any = [];
            for (let fuel of Object.keys(stn.prices)) {
                let price = stn.prices[fuel];
                prices.push(PriceNormalizer.formatDisplayPrice(price, fuel));
            }
            
            features.push({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [lng, lat]
                },
                "properties": {
                    "title": `${stn.address.brand}, ${stn.address.postcode}`,
                    "description": prices.join("<br />"),
                    "updated": stn.updated
                }
            });
            
            stationCount++;
        }
        if (stationCount >= maxStations) break;
    }
    
    const resp = {
        "type": "FeatureCollection",
        "features": features
    };
    
    // Store in compressed cache
    await cacheManager.storeResponse(cacheKey, resp, env, CACHE_TTL.MAPBOX_DATA);
    
    const headers = {
        ...responseData.headers,
        ...cacheManager.createCacheHeaders(Date.now().toString(), CACHE_TTL.MAPBOX_DATA),
        'X-Station-Count': stationCount.toString(),
        'X-Cache-Key': cacheKey
    };
    
    return new Response(JSON.stringify(resp), { headers });
})

// Cache management endpoint
router.get('/api/cache/stats', async (request, env, context) => {
    const stats = await CacheInvalidator.getCacheStats(env);
    return new Response(JSON.stringify({
        ...stats,
        timestamp: new Date().toISOString()
    }), responseData);
})


export default {
    fetch: router.fetch,
    scheduled: doSchedule,
}