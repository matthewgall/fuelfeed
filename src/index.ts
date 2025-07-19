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
    let data: any = await env.KV.get("fueldata", 'json');
    if (data == null) {
        data = new Fuel;
        data = await data.getData(env);
        // Next, we cache it for 1 hour, but only if not run by the cron
        await env.KV.put("fueldata", JSON.stringify(data), { expirationTtl: 3600 })
    }
    return new Response(JSON.stringify(data), responseData);
})

router.get('/api/data.mapbox', async (request, env, context) => {
    // First, set some data storage areas
    let resp: any = {
        "type": "FeatureCollection",
        "features": []
    };
    let d: any = {}

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

    // Next, we try and grab our cached data
    d = await env.KV.get('fueldata', 'json')
    if (d == null) {
        d = new Fuel;
        d = await d.getData(env);
        // Cache this for 1 hour, only if it's not from the cron
        await env.KV.put("fueldata", JSON.stringify(d), { expirationTtl: 3600 })
    }

    for (let brand of Object.keys(d)) {
        for (let s of Object.keys(d[brand])) {
            let stn: any = d[brand][s];
            
            // Skip stations outside bounding box if bounds specified
            if (bounds && stn.location) {
                const lng = stn.location.longitude;
                const lat = stn.location.latitude;
                
                if (lng < bounds.west || lng > bounds.east || 
                    lat < bounds.south || lat > bounds.north) {
                    continue;
                }
            }
            
            let prices: any = [];
            for (let fuel of Object.keys(stn.prices)) {
                let price = stn.prices[fuel];
                prices.push(PriceNormalizer.formatDisplayPrice(price, fuel));
            }
            resp.features.push({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [stn.location.longitude, stn.location.latitude]
                },
                "properties": {
                    "title": `${stn.address.brand}, ${stn.address.postcode}`,
                    "description": prices.join("<br />"),
                    "updated": stn.updated
                }
            });
        }
    }

    return new Response(JSON.stringify(resp), responseData);
})

export default {
    fetch: router.fetch,
    scheduled: doSchedule,
}