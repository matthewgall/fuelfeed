/// <reference path="../worker-configuration.d.ts" />
import { AutoRouter } from 'itty-router'
import Fuel from './fuel'
import { PriceNormalizer } from './price-normalizer'

const router = AutoRouter()
const responseData = {
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
    }
}

async function doSchedule(event:any, env: any) {
    // So, in this function, we're going to fetch all our data and save it to KV
    let data: any = new Fuel;
    data = await data.getData(env);

    // Next, we're going to just dump it to KV (but later we will put it in D1)
    await env.KV.put('fueldata', JSON.stringify(data))
}

router.get('/api/data.json', async (request, env, context) => {
    // Check for If-None-Match header for ETag support
    const etag = request.headers.get('If-None-Match');
    const cacheKey = 'fueldata-etag';
    const currentEtag = await env.KV.get(cacheKey);
    
    if (etag && currentEtag && etag === `"${currentEtag}"`) {
        return new Response(null, { status: 304 });
    }
    
    let data: any = await env.KV.get("fueldata", 'json');
    if (data == null) {
        data = new Fuel;
        data = await data.getData(env);
        // Cache for 1 hour, but only if not run by the cron
        await env.KV.put("fueldata", JSON.stringify(data), { expirationTtl: 3600 });
        
        // Store new ETag
        const newEtag = Date.now().toString();
        await env.KV.put(cacheKey, newEtag, { expirationTtl: 3600 });
    }
    
    const lastModified = currentEtag || Date.now().toString();
    
    return new Response(JSON.stringify(data), {
        ...responseData,
        headers: {
            ...responseData.headers,
            'Cache-Control': 'public, max-age=1800', // 30 minutes
            'ETag': `"${lastModified}"`,
            'Last-Modified': new Date(parseInt(lastModified)).toUTCString()
        }
    });
})

router.get('/api/data.mapbox', async (request, env, context) => {
    // Parse bounding box parameters from query string
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

    // Try to get cached filtered data first
    const cacheKey = bounds ? `mapbox-bbox-${bounds.west},${bounds.south},${bounds.east},${bounds.north}` : 'mapbox-full';
    let cachedResponse = await env.KV.get(cacheKey);
    
    if (cachedResponse) {
        return new Response(cachedResponse, {
            ...responseData,
            headers: {
                ...responseData.headers,
                'Cache-Control': 'public, max-age=900', // 15 minutes
                'ETag': `"${Date.now()}"`,
            }
        });
    }

    // First, set response data structure
    let resp: any = {
        "type": "FeatureCollection",
        "features": []
    };
    let d: any = {}

    // Get our cached data
    d = await env.KV.get('fueldata', 'json')
    if (d == null) {
        d = new Fuel;
        d = await d.getData(env);
        // Cache this for 1 hour, only if it's not from the cron
        await env.KV.put("fueldata", JSON.stringify(d), { expirationTtl: 3600 })
    }

    // Optimized filtering: early exit and spatial indexing
    const features: any[] = [];
    let stationCount = 0;
    
    for (let brand of Object.keys(d)) {
        for (let s of Object.keys(d[brand])) {
            let stn: any = d[brand][s];
            
            // Quick location validation
            if (!stn.location || typeof stn.location.longitude !== 'number' || typeof stn.location.latitude !== 'number') {
                continue;
            }
            
            const lng = stn.location.longitude;
            const lat = stn.location.latitude;
            
            // Fast bounding box check with early exit
            if (bounds) {
                if (lng < bounds.west || lng > bounds.east || lat < bounds.south || lat > bounds.north) {
                    continue;
                }
            }
            
            // Build prices array only for stations in bounds
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
            // Limit results for very large datasets
            if (stationCount > 10000) break;
        }
        if (stationCount > 10000) break;
    }
    
    resp.features = features;
    const responseBody = JSON.stringify(resp);
    
    // Cache the filtered response for 15 minutes
    await env.KV.put(cacheKey, responseBody, { expirationTtl: 900 });
    
    return new Response(responseBody, {
        ...responseData,
        headers: {
            ...responseData.headers,
            'Cache-Control': 'public, max-age=900',
            'ETag': `"${Date.now()}"`,
            'X-Station-Count': stationCount.toString()
        }
    });
})

export default {
    fetch: router.fetch,
    scheduled: doSchedule,
}