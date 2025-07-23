/// <reference path="../worker-configuration.d.ts" />
import { AutoRouter } from 'itty-router'
import Fuel from './fuel'
import { CacheManager } from './cache-manager'
import { CacheInvalidator } from './cache-invalidator'
import { FuelCategorizer } from './fuel-categorizer'
import { BrandStandardizer } from './brand-standardizer'
import { PopupGenerator } from './popup-generator'
import { GeographicFilter } from './geographic-filter'
import { DynamicPricing } from './dynamic-pricing'
import { CACHE_TTL, STATION_LIMITS, PRICE_THRESHOLDS } from './constants'

const router = AutoRouter()
const responseData = {
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
    }
}

/**
 * Get cache TTL values from environment or use constants as fallbacks
 */
function getCacheTTL(env: any) {
    return {
        FUEL_DATA: parseInt(env.FUEL_DATA_TTL || CACHE_TTL.FUEL_DATA.toString()),
        MAPBOX_DATA: parseInt(env.MAPBOX_DATA_TTL || CACHE_TTL.MAPBOX_DATA.toString()),
        BASE_DATA: parseInt(env.BASE_DATA_TTL || CACHE_TTL.BASE_DATA.toString())
    };
}

/**
 * Get cached price thresholds from KV storage
 */
async function getCachedPriceThresholds(env: any) {
    const analysis: any = {};
    
    // Retrieve cached thresholds for each fuel type (updated for new categorization)
    const fuelTypes = ['unleaded', 'super_unleaded', 'diesel', 'super_diesel', 'lpg'];
    for (const fuelType of fuelTypes) {
        const cached = await env.KV.get(`price-threshold-${fuelType}`);
        if (cached) {
            try {
                analysis[fuelType] = JSON.parse(cached);
            } catch (error) {
                console.log(`Error parsing cached thresholds for ${fuelType}:`, error);
            }
        }
    }
    
    return analysis;
}

async function doSchedule(_event: any, env: any) {
    // Smart cache invalidation before update
    const invalidationResult = await CacheInvalidator.smartInvalidation(env, 'scheduled-update');
    console.log(`Cache invalidation: ${invalidationResult.reason} (${invalidationResult.deleted} entries)`);
    
    // Fetch all our data and save it to KV
    let data: any = new Fuel;
    data = await data.getData(env);

    // Store main data
    await env.KV.put('fueldata', JSON.stringify(data))
    
    // Calculate and store dynamic price thresholds for better API performance
    console.log('Calculating dynamic price thresholds...');
    const priceAnalysis = DynamicPricing.analyzePrices(data);
    
    // Store individual threshold values for quick lookup
    for (const [fuelType, thresholds] of Object.entries(priceAnalysis)) {
        if (thresholds) {
            await env.KV.put(`price-threshold-${fuelType}`, JSON.stringify(thresholds), { expirationTtl: CACHE_TTL.FUEL_DATA });
        }
    }
    
    // Update cache timestamp for smart invalidation
    await env.KV.put('fueldata-updated', Date.now().toString(), { expirationTtl: CACHE_TTL.FUEL_DATA });
    
    // Warm cache for popular regions using pre-calculated analysis
    const cacheManager = new CacheManager();
    await cacheManager.warmPopularRegions(env, data, priceAnalysis);
    
    // Clean up stale cache entries
    const cleanupResult = await CacheInvalidator.smartInvalidation(env, 'cleanup');
    console.log(`Cache cleanup: ${cleanupResult.reason} (${cleanupResult.deleted} entries)`);
    
    console.log('Scheduled update completed with cache warming and cleanup');
}

router.get('/api/data.json', async (request, env, _context) => {
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
        await env.KV.put('fueldata-updated', Date.now().toString(), { expirationTtl: CACHE_TTL.FUEL_DATA });
    }
    
    // Store in compressed cache and return
    await cacheManager.storeResponse(cacheKey, data, env, CACHE_TTL.FUEL_DATA);
    
    const headers = {
        ...responseData.headers,
        ...cacheManager.createCacheHeaders(lastUpdated || Date.now().toString(), CACHE_TTL.FUEL_DATA)
    };
    
    return new Response(JSON.stringify(data), { headers });
})

router.get('/api/data.mapbox', async (request, env, _context) => {
    const CACHE_TTL = getCacheTTL(env);
    const cacheManager = new CacheManager({
        defaultTtl: CACHE_TTL.MAPBOX_DATA,
        compressResponse: true,
        enableEdgeCache: true
    });
    
    // Parse query parameters and detect device capabilities
    const url = new URL(request.url);
    const bbox = url.searchParams.get('bbox');
    const limitParam = url.searchParams.get('limit');
    const centerParam = url.searchParams.get('center');
    
    // Parse bounding box using GeographicFilter
    const bounds = bbox ? GeographicFilter.parseBoundingBox(bbox) : null;
    
    // Detect device capabilities using Cloudflare request data
    const deviceCapabilities = GeographicFilter.detectDeviceCapabilities(request);
    
    // Override max stations if limit is explicitly requested
    let requestedLimit = limitParam ? parseInt(limitParam) : null;
    if (requestedLimit) {
        deviceCapabilities.maxStations = Math.min(requestedLimit, deviceCapabilities.maxStations);
    }
    
    // Parse center point for proximity sorting
    let centerLat: number | undefined;
    let centerLng: number | undefined;
    if (centerParam) {
        const [lng, lat] = centerParam.split(',').map(parseFloat);
        if (!isNaN(lng) && !isNaN(lat)) {
            centerLng = lng;
            centerLat = lat;
        }
    }

    // Try to get cached compressed response first (include limit in cache key)
    const cacheKey = cacheManager.generateCacheKey('mapbox', bounds ?? undefined, requestedLimit ?? undefined);
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

    // Note: Price analysis not needed for lightweight mapbox endpoint
    // Individual station details will fetch this when needed

    // First pass: collect all valid stations with price data
    const validStations: any[] = [];
    let stationCount = 0;
    // Use larger initial limits for server-side processing, then apply geographic filtering
    for (let brand of Object.keys(d)) {
        for (let s of Object.keys(d[brand])) {
            if (stationCount >= (bounds ? STATION_LIMITS.SERVER_PROCESSING : STATION_LIMITS.SERVER_NO_BOUNDS)) break;
            
            let stn: any = d[brand][s];
            
            // Quick validation - no bounds check here, we'll do it later with GeographicFilter
            if (!stn.location || typeof stn.location.longitude !== 'number' || typeof stn.location.latitude !== 'number') {
                continue;
            }
            
            const lng = stn.location.longitude;
            const lat = stn.location.latitude;
            
            // Process price data with fuel categorization
            let prices: any = [];
            let numericPrices: number[] = [];
            let fuelPrices: { [key: string]: number } = {};
            
            for (let fuel of Object.keys(stn.prices)) {
                let price = stn.prices[fuel];
                
                if (typeof price === 'number') {
                    const priceInPounds = price > PRICE_THRESHOLDS.PENCE_CONVERSION ? price / 100 : price;
                    numericPrices.push(priceInPounds);
                    fuelPrices[fuel] = priceInPounds;
                }
            }
            
            // Group fuels by category and create display strings in consistent order
            const groupedFuels = FuelCategorizer.groupFuelsByCategory(fuelPrices);
            const orderedFuels = FuelCategorizer.getOrderedFuelEntries(groupedFuels);
            for (const [category, data] of orderedFuels) {
                const displayText = FuelCategorizer.formatFuelDisplay(category, data.price, data.originalType, data.allPrices);
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
                fuelPrices,
                brandKey: brand, // Store original brand key
                stationKey: s    // Store original station key
            });
            
            stationCount++;
        }
        if (stationCount >= (bounds ? STATION_LIMITS.SERVER_PROCESSING : STATION_LIMITS.SERVER_NO_BOUNDS)) break;
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
    
    // Apply server-side geographic filtering and optimization
    const geoFilteredStations = GeographicFilter.filterAndOptimizeStations(
        validStations.map(station => ({
            geometry: {
                coordinates: [station.lng, station.lat]
            },
            properties: {
                lowest_price: station.lowestPrice,
                average_price: station.averagePrice,
                is_best_price: false // Will be calculated below
            },
            // Keep original station data
            _originalStation: station
        })),
        bounds ?? undefined,
        deviceCapabilities,
        centerLat,
        centerLng
    );
    
    // Extract the original station data back
    const filteredValidStations = geoFilteredStations.map(feature => feature._originalStation);
    
    console.log(`Server-side filtering: ${validStations.length} -> ${filteredValidStations.length} stations`);
    
    // Third pass: create features with highlighting flags
    const features: any[] = [];
    
    for (const station of filteredValidStations) {
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
        const location = station.stn.address.postcode;
        
        // Create lightweight feature for fast map loading
        features.push({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [station.lng, station.lat]
            },
            "properties": {
                "station_id": `${station.brandKey}-${station.stationKey}`, // Unique identifier for detail lookup
                "title": `${standardizedBrand}, ${location}`,
                "brand": standardizedBrand,
                "postcode": location,
                "lowest_price": station.lowestPrice,
                "average_price": station.averagePrice,
                "is_best_price": isBestPrice,
                "has_prices": station.prices.length > 0,
                "fuel_prices": station.fuelPrices, // Add structured price data for analytics
                "grouped_fuels": station.groupedFuels // Add categorized fuel data
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
        'X-Station-Count': features.length.toString(),
        'X-Filtered-Count': `${stationCount}->${features.length}`,
        'X-Device-Type': deviceCapabilities.isMobile ? (deviceCapabilities.isLowEndMobile ? 'low-mobile' : 'mobile') : 'desktop',
        'X-CF-Device': (request as any).cf?.deviceType || 'unknown',
        'X-Detection-Source': (request as any).cf?.deviceType ? 'cloudflare' : 'user-agent',
        'X-Cache-Key': cacheKey
    };
    
    return new Response(JSON.stringify(resp), { headers });
})

// Station detail endpoint for lazy loading
router.get('/api/station/:stationId', async (request, env, _context) => {
    const { stationId } = request.params;
    
    // Parse station ID (format: "brand-siteid")
    const [brand, siteId] = stationId.split('-', 2);
    if (!brand || !siteId) {
        return new Response(JSON.stringify({ error: 'Invalid station ID format' }), 
            { ...responseData, status: 400 });
    }
    
    // Get fuel data
    let d: any = await env.KV.get('fueldata', 'json')
    if (!d || !d[brand] || !d[brand][siteId]) {
        return new Response(JSON.stringify({ error: 'Station not found' }), 
            { ...responseData, status: 404 });
    }
    
    // Get cached price thresholds
    const priceAnalysis = await getCachedPriceThresholds(env);
    
    const station = d[brand][siteId];
    const standardizedBrand = BrandStandardizer.standardize(station.address.brand);
    
    // Process price data
    let prices: string[] = [];
    let numericPrices: number[] = [];
    let fuelPrices: { [key: string]: number } = {};
    
    for (let fuel of Object.keys(station.prices)) {
        let price = station.prices[fuel];
        
        if (typeof price === 'number') {
            const priceInPounds = price > PRICE_THRESHOLDS.PENCE_CONVERSION ? price / 100 : price;
            numericPrices.push(priceInPounds);
            fuelPrices[fuel] = priceInPounds;
        }
    }
    
    // Group fuels by category and create display strings in consistent order
    const groupedFuels = FuelCategorizer.groupFuelsByCategory(fuelPrices);
    const orderedFuels = FuelCategorizer.getOrderedFuelEntries(groupedFuels);
    for (const [category, data] of orderedFuels) {
        const displayText = FuelCategorizer.formatFuelDisplay(category, data.price, data.originalType, data.allPrices);
        prices.push(displayText);
    }
    
    const priceDescription = prices.join("<br />");
    const lowestPrice = numericPrices.length > 0 ? Math.min(...numericPrices) : null;
    
    // Generate server-side popup HTML with dynamic pricing
    const popupHTML = PopupGenerator.generatePopupHTML(
        standardizedBrand,
        station.address.postcode,
        priceDescription,
        false, // Individual station requests don't calculate best price
        station.updated,
        priceAnalysis
    );
    
    // Generate structured price data
    const structuredPrices = PopupGenerator.generateStructuredPrices(priceDescription);
    
    const response = {
        station_id: stationId,
        brand: standardizedBrand,
        postcode: station.address.postcode,
        popup_html: popupHTML,
        fuel_prices: structuredPrices,
        lowest_price: lowestPrice,
        updated: station.updated,
        price_count: prices.length
    };
    
    return new Response(JSON.stringify(response), responseData);
})

// Cache management endpoint
router.get('/api/cache/stats', async (_request, env, _context) => {
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