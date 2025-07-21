/// <reference path="../worker-configuration.d.ts" />
import { AutoRouter } from 'itty-router'
import Fuel from './fuel'
import { PriceNormalizer } from './price-normalizer'
import { CacheManager } from './cache-manager'
import { CacheInvalidator } from './cache-invalidator'
import { FuelCategorizer } from './fuel-categorizer'
import { BrandStandardizer } from './brand-standardizer'

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
    
    // Parse bounding box and limit parameters
    const url = new URL(request.url);
    const bbox = url.searchParams.get('bbox');
    const limitParam = url.searchParams.get('limit');
    let bounds: { west: number, south: number, east: number, north: number } | null = null;
    let requestedLimit = limitParam ? parseInt(limitParam) : null;

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

    // Try to get cached compressed response first (include limit in cache key)
    const cacheKey = cacheManager.generateCacheKey('mapbox', bounds, requestedLimit);
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

    // First pass: collect all valid stations with price data
    const validStations: any[] = [];
    let stationCount = 0;
    const maxStations = requestedLimit || (bounds ? 5000 : 10000);
    
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
            
            // Process price data with fuel categorization
            let prices: any = [];
            let numericPrices: number[] = [];
            let fuelPrices: { [key: string]: number } = {};
            
            for (let fuel of Object.keys(stn.prices)) {
                let price = stn.prices[fuel];
                
                if (typeof price === 'number') {
                    const priceInPounds = price > 10 ? price / 100 : price;
                    numericPrices.push(priceInPounds);
                    fuelPrices[fuel] = priceInPounds;
                }
            }
            
            // Group fuels by category and create display strings
            const groupedFuels = FuelCategorizer.groupFuelsByCategory(fuelPrices);
            for (const [category, data] of Object.entries(groupedFuels)) {
                const displayText = FuelCategorizer.formatFuelDisplay(category, data.price, data.originalType);
                prices.push(displayText);
            }
            
            const lowestPrice = numericPrices.length > 0 ? Math.min(...numericPrices) : null;
            const averagePrice = numericPrices.length > 0 ? 
                numericPrices.reduce((a, b) => a + b, 0) / numericPrices.length : null;
            
            validStations.push({
                stn,
                lng,
                lat,
                prices,
                lowestPrice,
                averagePrice,
                fuelPrices
            });
            
            stationCount++;
        }
        if (stationCount >= maxStations) break;
    }
    
    // Second pass: find best prices for each fuel category
    const fuelCategories = new Set<string>();
    
    // Group fuel types by category for each station
    validStations.forEach(station => {
        const groupedFuels = FuelCategorizer.groupFuelsByCategory(station.fuelPrices);
        station.groupedFuels = groupedFuels;
        Object.keys(groupedFuels).forEach(category => fuelCategories.add(category));
    });
    
    const bestPrices: { [key: string]: { price: number, stations: any[], originalType: string } } = {};
    
    // Find lowest price for each fuel category
    for (const category of fuelCategories) {
        const stationsWithCategory = validStations.filter(station => 
            station.groupedFuels[category] !== undefined
        );
        
        if (stationsWithCategory.length > 0) {
            const minPrice = Math.min(...stationsWithCategory.map(s => s.groupedFuels[category].price));
            const bestStations = stationsWithCategory.filter(s => s.groupedFuels[category].price === minPrice);
            
            // Get the original fuel type for the best price
            const bestStation = bestStations[0];
            const originalType = bestStation.groupedFuels[category].originalType;
            
            bestPrices[category] = {
                price: minPrice,
                stations: bestStations,
                originalType
            };
        }
    }
    
    // Third pass: create features with highlighting flags
    const features: any[] = [];
    
    for (const station of validStations) {
        let isBestPrice = false;
        let bestFuelTypes: string[] = [];
        
        // Check if this station has the best price for any fuel category
        for (const [category, bestData] of Object.entries(bestPrices)) {
            if (station.groupedFuels[category] && station.groupedFuels[category].price === bestData.price) {
                if (bestData.stations.length === 1) {
                    // Single best station for this category
                    isBestPrice = true;
                    bestFuelTypes.push(FuelCategorizer.getCategoryDisplayName(category));
                } else {
                    // Multiple stations with same price - check average price
                    const bestByAverage = bestData.stations.reduce((best, current) => 
                        (current.averagePrice || Infinity) < (best.averagePrice || Infinity) ? current : best
                    );
                    
                    if (station === bestByAverage) {
                        isBestPrice = true;
                        bestFuelTypes.push(FuelCategorizer.getCategoryDisplayName(category));
                    }
                }
            }
        }
        
        const standardizedBrand = BrandStandardizer.standardize(station.stn.address.brand);
        
        features.push({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [station.lng, station.lat]
            },
            "properties": {
                "title": `${standardizedBrand}, ${station.stn.address.postcode}`,
                "description": station.prices.join("<br />"),
                "updated": station.stn.updated,
                "brand": standardizedBrand,
                "lowest_price": station.lowestPrice,
                "average_price": station.averagePrice,
                "is_best_price": isBestPrice,
                "best_fuel_types": bestFuelTypes
            }
        });
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